// Reports tab — builds the FCB monthly detail + promo code workbook.
//
// FileMaker round trips, all through "Manage: Accounts":
//   reportLoad {month, skip, top} -> window.setReportData(rowsJson, metaJson)
//   reportSave {fileName, base64} -> window.setReportResult({ok, path, errors})
// Prices come from the same priceLoad the FCB Prices tab uses.

import { shapeOrder, priceIndex, buildWorkbook, findGaps, fileName, monthLabel } from './report-core.js';
import { toBase64 } from './xlsx-writer.js';

const PAGE = 40; // orders per round trip; messageClean is bulky

export class ReportManager {
  constructor(host) {
    this.host = host;
    this.month = defaultMonth();
    this.raw = [];
    this.orders = [];
    this.busy = false;
    this.loaded = false;

    this.el = {
      panel: document.getElementById('reportPanel'),
      month: document.getElementById('reportMonth'),
      load: document.getElementById('reportLoadBtn'),
      credit: document.getElementById('reportCredit'),
      generate: document.getElementById('reportGenerateBtn'),
      status: document.getElementById('reportStatus'),
      cards: document.getElementById('reportCards'),
      warnings: document.getElementById('reportWarnings'),
      body: document.getElementById('reportBody'),
      stats: document.getElementById('reportStats'),
      count: document.getElementById('reportCount')
    };

    this.fillMonths();
    this.attach();
  }

  attach() {
    this.el.month.addEventListener('change', (e) => {
      this.month = e.target.value;
      this.loaded = false;
      this.reset('Click Load to pull ' + monthLabel(this.month) + '.');
    });
    this.el.load.addEventListener('click', () => this.load());
    this.el.generate.addEventListener('click', () => this.generate());

    this.el.warnings.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      if (btn.getAttribute('data-act') === 'copy-gaps') this.copyGaps(btn);
      if (btn.getAttribute('data-act') === 'add-aliases') this.addAliases();
    });
  }

  fillMonths() {
    const now = new Date();
    const opts = [];
    for (let i = 1; i <= 13; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      opts.push('<option value="' + ym + '">' + d.toLocaleString('en-US', { month: 'long' }) + ' ' + d.getFullYear() + '</option>');
    }
    this.el.month.innerHTML = opts.join('');
    this.el.month.value = this.month;
  }

  onShow() {
    if (!this.loaded && !this.busy) this.load();
  }

  // ---------------------------------------------------------------- loading

  load() {
    if (this.busy) return;
    this.raw = [];
    this.orders = [];
    this.setBusy(true);
    this.reset('Loading ' + monthLabel(this.month) + '...');
    if (!this.host.prices.loaded) this.host.prices.load();   // prices arrive on their own callback
    this.requestPage(0);
  }

  requestPage(skip) {
    this.host.callFileMakerScript('Manage: Accounts', JSON.stringify({
      mode: 'reportLoad', month: this.month, skip: skip, top: PAGE
    }));
  }

  setData(rowsData, metaData) {
    let rows = rowsData, meta = metaData;
    if (typeof rows === 'string') { try { rows = JSON.parse(rows || '[]'); } catch (e) { rows = null; } }
    if (typeof meta === 'string') { try { meta = JSON.parse(meta || '{}'); } catch (e) { meta = {}; } }
    meta = meta || {};

    if (meta.sqlError) { this.setBusy(false); this.reset(meta.sqlError); return; }
    if (!Array.isArray(rows)) { this.setBusy(false); this.reset('FileMaker did not return readable order data.'); return; }

    this.raw = this.raw.concat(rows);
    const total = Number(meta.total || this.raw.length);
    this.el.status.textContent = 'Loading ' + monthLabel(this.month) + ' - ' + this.raw.length + ' of ' + total + ' orders...';

    if (this.raw.length < total && rows.length) {
      this.requestPage(this.raw.length);
      return;
    }
    this.setBusy(false);
    this.loaded = true;
    this.shape();
  }

  shape() {
    const idx = priceIndex((this.host.prices.rows || []).map((r) =>
      ({ sku: r.sku, tier: r.tier, price: r.price, description: r.description })));
    this.orders = this.raw.map((r) => shapeOrder(r, idx)).filter((o) => {
      if (o.error) console.warn('skipped', o.num, o.error);
      return !o.error && o.date;
    });

    // item numbers the store and the chart spell differently, rolled up for review
    const aliases = new Map();
    const unclear = new Map();
    this.orders.forEach((o) => {
      (o.matched || []).forEach((m) => {
        const key = m.store + '|' + m.chart + '|' + m.tier;
        const row = aliases.get(key) || { ...m, count: 0 };
        row.count += 1;
        aliases.set(key, row);
      });
      (o.unclear || []).forEach((u) => {
        const key = u.store + '|' + u.candidates.join(',');
        const row = unclear.get(key) || { ...u, count: 0 };
        row.count += 1;
        unclear.set(key, row);
      });
    });
    this.aliases = [...aliases.values()].sort((a, b) => b.count - a.count);
    this.unclear = [...unclear.values()].sort((a, b) => b.count - a.count);
    this.gaps = findGaps(this.orders);
    this.render();
  }

  // ----------------------------------------------------------------- output

  generate() {
    if (this.busy || !this.orders.length) return;
    this.setBusy(true);
    this.el.status.textContent = 'Building the workbook...';
    let bytes;
    try {
      bytes = buildWorkbook(this.orders, { credit: this.el.credit.value.replace(/[$,\s]/g, '') });
    } catch (err) {
      this.setBusy(false);
      this.host.showToast('Could not build the workbook: ' + err.message, 'error');
      return;
    }
    this.host.callFileMakerScript('Manage: Accounts', JSON.stringify({
      mode: 'reportSave', fileName: fileName(this.month), base64: toBase64(bytes)
    }));
  }

  setResult(data) {
    let res = data;
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch (e) { res = null; } }
    this.setBusy(false);
    this.el.status.textContent = '';
    if (!res) return;
    if (res.cancelled) return;
    if (!res.ok) { this.host.showToast(res.errors || 'The file could not be saved.', 'error'); return; }
    this.host.showToast('Saved ' + (res.path || fileName(this.month)), 'ok');
  }

  // ------------------------------------------------------------------- view

  reset(message) {
    this.el.cards.innerHTML = '';
    this.el.warnings.innerHTML = '';
    this.el.body.innerHTML = '<tr class="log-empty-row"><td colspan="6"><div class="empty-state empty-state-muted"><h3>' +
      this.host.escapeHtml(message) + '</h3></div></td></tr>';
    this.el.count.textContent = '0';
    this.el.generate.disabled = true;
  }

  render() {
    const e = (v) => this.host.escapeHtml(v);
    const orders = this.orders;
    const promo = orders.filter((o) => o.code);
    const codes = {};
    promo.forEach((o) => { codes[o.code] = (codes[o.code] || 0) + 1; });
    const unpricedOrders = orders.filter((o) => o.unpriced.length);
    const skus = {};
    unpricedOrders.forEach((o) => o.unpriced.forEach((s) => { skus[s] = (skus[s] || 0) + 1; }));
    const gaps = this.gaps || [];
    const marketing = orders.reduce((s, o) => s + o.marketing, 0);
    const discount = orders.reduce((s, o) => s + o.disc, 0);

    this.el.status.textContent = '';
    this.el.count.textContent = String(orders.length);
    this.el.generate.disabled = !orders.length;

    const card = (label, value, tone) =>
      '<div class="rpt-card' + (tone ? ' rpt-card-' + tone : '') + '"><span class="rpt-card-value">' +
      e(value) + '</span><span class="rpt-card-label">' + e(label) + '</span></div>';

    this.el.cards.innerHTML =
      card('Orders', orders.length) +
      card('With a promo code', promo.length + ' (' + Object.keys(codes).length + ' codes)') +
      card('Marketing contribution', this.money(marketing)) +
      card('Promo discount', this.money(discount)) +
      card('Balance before credit', this.money(marketing - discount)) +
      card('Orders needing a price', unpricedOrders.length, unpricedOrders.length ? 'warn' : 'ok') +
      card('Matched by item name', (this.aliases || []).length, (this.aliases || []).length ? 'info' : 'ok') +
      card('Missing tracking numbers', gaps.length, gaps.length ? 'warn' : 'ok');

    let warn = '';
    if (unpricedOrders.length) {
      const list = Object.keys(skus).sort((a, b) => skus[b] - skus[a])
        .map((s) => '<li><code>' + e(s) + '</code> &times; ' + skus[s] + '</li>').join('');
      warn += '<div class="rpt-warn"><h4>' + unpricedOrders.length +
        ' orders contain an item with no price in FCBPrice</h4>' +
        '<p>Their marketing contribution is understated by whatever those items cost. Add them on the FCB Prices tab, then load the month again.</p>' +
        '<ul class="rpt-sku-list">' + list + '</ul></div>';
    }
    if ((this.aliases || []).length) {
      const list = this.aliases.map((m) =>
        '<li><code>' + e(m.store) + '</code> &rarr; <code>' + e(m.chart) + '</code> ' +
        '<span class="muted">' + e(m.tier === 'BASE' ? 'S-XL' : m.tier === 'ONE' ? 'one size' : m.tier) +
        ' &middot; ' + e(this.money(m.price)) + ' &middot; ' + e(m.how) + ' &middot; ' + m.count +
        (m.count === 1 ? ' order' : ' orders') + '</span></li>').join('');
      warn += '<div class="rpt-note"><h4>' + this.aliases.length +
        ' item numbers matched by name</h4>' +
        '<p>The store spells these differently from the price chart, so they were matched on the item number and title. Check they look right.</p>' +
        '<ul class="rpt-sku-list rpt-alias-list">' + list + '</ul>' +
        '<button class="row-btn" data-act="add-aliases">Add the store\'s spelling to FCBPrice</button>' +
        '<span class="muted rpt-hint">Adds a price row under the store\'s own item number, so PrintSmith notes match them too.</span>' +
        '</div>';
    }

    if ((this.unclear || []).length) {
      const list = this.unclear.map((u) =>
        '<li><code>' + e(u.store) + '</code> <span class="muted">could be ' +
        u.candidates.map((c) => '<code>' + e(c) + '</code>').join(' or ') + '</span></li>').join('');
      warn += '<div class="rpt-warn"><h4>' + this.unclear.length +
        ' item numbers match more than one chart item</h4>' +
        '<p>Nothing was guessed. Add the right price on the FCB Prices tab under the store\'s own item number.</p>' +
        '<ul class="rpt-sku-list">' + list + '</ul></div>';
    }

    if (gaps.length) {
      const shown = gaps.map((g) => '<code>' + e(g) + '</code>').join(' ');
      warn += '<div class="rpt-warn"><h4>' + gaps.length + ' tracking numbers in this range never reached FileMaker</h4>' +
        '<p>The store numbers orders in sequence, so these are orders the report cannot include. They have to be added to the workbook by hand.</p>' +
        '<div class="rpt-gaps">' + shown + '</div>' +
        '<button class="row-btn" data-act="copy-gaps">Copy all ' + gaps.length + '</button></div>';
    }
    this.el.warnings.innerHTML = warn;

    const rows = orders.slice().sort((a, b) => a.date - b.date).map((o) =>
      '<tr class="price-row">' +
        '<td class="col-date">' + e(this.stamp(o.date)) + '</td>' +
        '<td>' + e(o.num) + '</td>' +
        '<td class="col-price">' + e(this.money(o.sub)) + '</td>' +
        '<td>' + (o.code ? '<span class="tier-pill">' + e(o.code) + '</span>' : '') + '</td>' +
        '<td class="col-price">' + e(this.money(o.marketing)) + '</td>' +
        '<td class="col-desc"><span title="' + e(o.items) + '">' + e(o.items.split('\n')[0]) +
          (o.items.split('\n').length > 1 ? ' <span class="muted">+' + (o.items.split('\n').length - 1) + ' more</span>' : '') +
          (o.unpriced.length ? ' <span class="pill pill-off">needs a price</span>' : '') + '</td>' +
      '</tr>').join('');
    this.el.body.innerHTML = rows;
  }

  stamp(d) {
    if (!d) return '';
    const p = (n) => String(n).padStart(2, '0');
    let h = d.getHours();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + p(d.getFullYear() % 100) +
      ' ' + h + ':' + p(d.getMinutes()) + ampm;
  }

  copyGaps(btn) {
    const text = (this.gaps || []).join('\n');
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    btn.textContent = ok ? 'Copied' : 'Select them and copy';
    if (!ok) this.host.showToast('Copying is blocked here - the list is selectable in the panel.', 'error');
    setTimeout(() => { btn.textContent = 'Copy all ' + (this.gaps || []).length; }, 2500);
  }

  // Write the store's own item numbers into FCBPrice, so the exact lookup in
  // "process data - individual" finds them too and the notes stop saying PRICE CHECK.
  addAliases() {
    if (this.busy || !(this.aliases || []).length) return;
    const rows = this.aliases.map((m) => ({
      id: '', sku: m.store, tier: m.tier, price: String(m.price),
      description: m.title || ('same as ' + m.chart)
    }));
    this.setBusy(true);
    this.host.showToast('Adding ' + rows.length + ' price ' + (rows.length === 1 ? 'row' : 'rows') + '...');
    this.host.callFileMakerScript('Manage: Accounts', JSON.stringify({ mode: 'priceSave', rows: rows }));
  }

  money(v) {
    const n = Number(v) || 0;
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
  }

  setBusy(on) {
    this.busy = on;
    [this.el.load, this.el.generate, this.el.month].forEach((x) => { if (x) x.disabled = on; });
    if (!on && this.orders.length) this.el.generate.disabled = false;
    this.el.panel.classList.toggle('is-busy', on);
  }
}

function defaultMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);          // last month is what gets reported
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
