// FCB Prices tab — edits the FCBPrice table that `process data - individual`
// reads for First Commonwealth (acct 22860) order notes.
//
// FileMaker round trips all go through "Manage: Accounts":
//   priceLoad   -> window.setPriceData(rows, meta)
//   priceSave   -> window.setPriceResult({ ok, action:'save', saved, errors })
//   priceDelete -> window.setPriceResult({ ok, action:'delete', id, errors, cancelled })

const TIERS = ['BASE', '2XL', '3XL', '4XL', '5XL', '6XL', 'ONE'];
const TIER_LABEL = { BASE: 'S – XL', ONE: 'One size' };

export class PriceManager {
  constructor(host) {
    this.host = host; // AccountListManager: callFileMakerScript, escapeHtml, showToast
    this.rows = [];
    this.loaded = false;
    this.busy = false;
    this.editingId = null;
    this.filters = { search: '', tier: 'all' };

    this.el = {
      panel: document.getElementById('pricesPanel'),
      stats: document.getElementById('priceStats'),
      body: document.getElementById('priceBody'),
      search: document.getElementById('priceSearchInput'),
      tier: document.getElementById('priceTierSelect'),
      clear: document.getElementById('priceClearBtn'),
      refresh: document.getElementById('priceRefreshBtn'),
      add: document.getElementById('priceAddBtn'),
      shown: document.getElementById('priceShown'),
      items: document.getElementById('priceItems'),
      total: document.getElementById('priceTotal'),
      modal: document.getElementById('priceModal'),
      modalClose: document.getElementById('closePriceModal'),
      modalSku: document.getElementById('priceNewSku'),
      modalDesc: document.getElementById('priceNewDesc'),
      modalGrid: document.getElementById('priceNewGrid'),
      modalError: document.getElementById('priceNewError'),
      modalSave: document.getElementById('priceNewSave'),
      modalHint: document.getElementById('priceNewHint')
    };

    this.buildModalGrid();
    this.attach();
  }

  // ------------------------------------------------------------------ events

  attach() {
    let timer = null;
    this.el.search.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.filters.search = e.target.value.trim().toLowerCase();
        this.render();
      }, 120);
    });
    this.el.tier.addEventListener('change', (e) => {
      this.filters.tier = e.target.value;
      this.render();
    });
    this.el.clear.addEventListener('click', () => {
      this.filters = { search: '', tier: 'all' };
      this.el.search.value = '';
      this.el.tier.value = 'all';
      this.render();
    });
    this.el.refresh.addEventListener('click', () => this.load());
    this.el.add.addEventListener('click', () => this.openModal());

    this.el.body.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const act = btn.getAttribute('data-act');
      if (act === 'edit') this.startEdit(id);
      else if (act === 'cancel') this.cancelEdit();
      else if (act === 'save') this.saveEdit(id);
      else if (act === 'delete') this.remove(id);
      else if (act === 'addsize') this.openModal(this.rows.find((r) => r.id === id));
    });
    this.el.body.addEventListener('keydown', (e) => {
      if (!this.editingId) return;
      if (e.key === 'Enter') { e.preventDefault(); this.saveEdit(this.editingId); }
      if (e.key === 'Escape') { e.preventDefault(); this.cancelEdit(); }
    });

    this.el.modalClose.addEventListener('click', () => this.closeModal());
    this.el.modal.addEventListener('click', (e) => { if (e.target === this.el.modal) this.closeModal(); });
    this.el.modalSave.addEventListener('click', () => this.saveNew());
    this.el.modalSku.addEventListener('input', () => this.updateModalHint());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.el.modal.style.display === 'block') this.closeModal();
    });
  }

  // ---------------------------------------------------------------- FileMaker

  onShow() {
    if (!this.loaded) this.load();
    else this.render();
  }

  load() {
    if (this.busy) return;
    this.setBusy(true);
    this.editingId = null;
    this.message('Loading prices…', true);
    this.host.callFileMakerScript('Manage: Accounts', JSON.stringify({ mode: 'priceLoad' }));
  }

  setData(rowsData, metaData) {
    this.setBusy(false);
    let rows = rowsData;
    let meta = metaData;
    if (typeof rows === 'string') {
      try { rows = JSON.parse(rows || '[]'); } catch (err) { rows = null; }
    }
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta || '{}'); } catch (err) { meta = {}; }
    }
    if (meta && meta.sqlError) { this.message(meta.sqlError); return; }
    if (!Array.isArray(rows)) { this.message('FileMaker did not return readable price data.'); return; }

    this.rows = rows.map((r) => ({
      id: String(r.id || ''),
      sku: r.sku || '',
      tier: (r.tier || '').toUpperCase(),
      price: r.price === '' || r.price === null || r.price === undefined ? '' : String(r.price),
      description: r.description || '',
      modified: r.modified || '',
      modifiedBy: r.modifiedBy || ''
    }));
    this.sortRows();
    this.loaded = true;
    this.render();
    // the Reports tab prices its orders from these rows
    if (this.host.report && this.host.report.loaded) this.host.report.shape();
  }

  setResult(data) {
    let res = data;
    if (typeof res === 'string') {
      try { res = JSON.parse(res); } catch (err) { res = null; }
    }
    this.setBusy(false);
    if (!res) return;

    if (res.cancelled) return;

    if (!res.ok) {
      const msg = (res.errors || 'Save failed.').split(/\r\n|\r|\n/).filter(Boolean);
      if (this.el.modal.style.display === 'block') this.showModalError(msg);
      else this.host.showToast(msg.join(' · '), 'error');
      // a partial save still changed data, so pull it fresh
      if (res.saved > 0) this.load();
      return;
    }

    if (res.action === 'save') {
      this.closeModal();
      this.host.showToast(res.saved === 1 ? 'Price saved.' : res.saved + ' prices saved.', 'ok');
    } else if (res.action === 'delete') {
      this.host.showToast('Price deleted.', 'ok');
    }
    this.load();
  }

  // ------------------------------------------------------------------ editing

  startEdit(id) {
    if (this.busy) return;
    this.editingId = id;
    this.render();
    const input = this.el.body.querySelector('tr.is-editing input[name="price"]');
    if (input) { input.focus(); input.select(); }
  }

  cancelEdit() {
    this.editingId = null;
    this.render();
  }

  saveEdit(id) {
    const tr = this.el.body.querySelector('tr.is-editing');
    if (!tr) return;
    const val = (n) => (tr.querySelector('[name="' + n + '"]') || {}).value || '';
    const row = {
      id: id,
      sku: val('sku').trim(),
      tier: val('tier').trim().toUpperCase(),
      price: this.cleanPrice(val('price')),
      description: val('description').trim()
    };
    const problem = this.checkRow(row);
    if (problem) { this.host.showToast(problem, 'error'); return; }
    this.send([row]);
  }

  remove(id) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || this.busy) return;
    this.setBusy(true);
    const label = r.sku + ' — ' + this.tierLabel(r.tier) + ' — ' + this.money(r.price) +
      (r.description ? '\n' + r.description : '');
    this.host.callFileMakerScript('Manage: Accounts', JSON.stringify({ mode: 'priceDelete', id: id, label: label }));
  }

  send(rows) {
    if (this.busy) return;
    this.setBusy(true);
    this.host.callFileMakerScript('Manage: Accounts', JSON.stringify({ mode: 'priceSave', rows: rows }));
  }

  // ---------------------------------------------------------------- add modal

  buildModalGrid() {
    this.el.modalGrid.innerHTML = TIERS.map((t) =>
      '<label class="tier-cell"><span>' + this.tierLabel(t) + '</span>' +
      '<input type="text" inputmode="decimal" data-tier="' + t + '" placeholder="—" autocomplete="off" /></label>'
    ).join('');
  }

  openModal(fromRow) {
    this.el.modalSku.value = fromRow ? fromRow.sku : '';
    this.el.modalDesc.value = fromRow ? fromRow.description : '';
    this.el.modalGrid.querySelectorAll('input').forEach((i) => { i.value = ''; });
    this.hideModalError();
    this.updateModalHint();
    this.el.modal.style.display = 'block';
    const focus = fromRow ? this.el.modalGrid.querySelector('input:not(:disabled)') : this.el.modalSku;
    setTimeout(() => focus && focus.focus(), 50);
  }

  closeModal() {
    this.el.modal.style.display = 'none';
  }

  updateModalHint() {
    const sku = this.el.modalSku.value.trim().toUpperCase();
    const existing = this.rows.filter((r) => r.sku.toUpperCase() === sku);
    const have = new Set(existing.map((r) => r.tier));
    this.el.modalGrid.querySelectorAll('input').forEach((i) => {
      const taken = have.has(i.getAttribute('data-tier'));
      i.disabled = taken;
      i.placeholder = taken ? 'exists' : '—';
      if (taken) i.value = '';
    });
    this.el.modalHint.textContent = !sku
      ? 'Use the SKU exactly as the online store sends it.'
      : existing.length
        ? sku + ' already has ' + existing.map((r) => this.tierLabel(r.tier) + ' ' + this.money(r.price)).join(', ') +
          '. Fill in the sizes it is missing; edit existing ones in the table.'
        : 'New SKU. Fill in a price for each size tier it comes in.';
  }

  saveNew() {
    const sku = this.el.modalSku.value.trim();
    const description = this.el.modalDesc.value.trim();
    const rows = [];
    this.el.modalGrid.querySelectorAll('input').forEach((i) => {
      if (i.disabled || !i.value.trim()) return;
      rows.push({ id: '', sku: sku, tier: i.getAttribute('data-tier'), price: this.cleanPrice(i.value), description: description });
    });
    if (!sku) { this.showModalError(['Enter the SKU.']); return; }
    if (!rows.length) { this.showModalError(['Enter at least one price.']); return; }
    const problems = rows.map((r) => this.checkRow(r)).filter(Boolean);
    if (problems.length) { this.showModalError(problems); return; }
    this.hideModalError();
    this.send(rows);
  }

  showModalError(lines) {
    this.el.modalError.innerHTML = lines.map((l) => this.host.escapeHtml(l)).join('<br>');
    this.el.modalError.hidden = false;
  }

  hideModalError() {
    this.el.modalError.hidden = true;
    this.el.modalError.textContent = '';
  }

  // --------------------------------------------------------------- validation

  cleanPrice(v) {
    return String(v || '').replace(/[$,\s]/g, '');
  }

  checkRow(r) {
    const label = (r.sku || 'Row') + ' ' + this.tierLabel(r.tier);
    if (!r.sku) return 'SKU is required.';
    if (TIERS.indexOf(r.tier) < 0) return label + ': pick a size tier.';
    if (!/^\d+(\.\d{1,2})?$/.test(r.price)) return label + ': price must be a number like 45 or 45.50.';
    const clash = this.rows.find((x) => x.id !== r.id &&
      x.sku.toUpperCase() === r.sku.toUpperCase() && x.tier === r.tier);
    if (clash) return label + ' is already in the table at ' + this.money(clash.price) + '.';
    return '';
  }

  // -------------------------------------------------------------------- view

  sortRows() {
    const rank = (t) => { const i = TIERS.indexOf(t); return i < 0 ? 99 : i; };
    this.rows.sort((a, b) =>
      a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }) || rank(a.tier) - rank(b.tier));
  }

  filtered() {
    const q = this.filters.search;
    const t = this.filters.tier;
    return this.rows.filter((r) =>
      (t === 'all' || r.tier === t) &&
      (!q || r.sku.toLowerCase().indexOf(q) >= 0 || r.description.toLowerCase().indexOf(q) >= 0));
  }

  render() {
    if (!this.loaded) return;
    const list = this.filtered();
    this.el.shown.textContent = String(list.length);
    this.el.total.textContent = String(this.rows.length);
    this.el.items.textContent = String(new Set(this.rows.map((r) => r.sku.toUpperCase())).size);

    if (!list.length) {
      this.message(this.rows.length ? 'No prices match these filters.' : 'The price table is empty. Use Add item.', true);
      return;
    }

    let prevSku = null;
    this.el.body.innerHTML = list.map((r) => {
      const first = r.sku.toUpperCase() !== prevSku;
      prevSku = r.sku.toUpperCase();
      return r.id === this.editingId ? this.editRow(r) : this.viewRow(r, first);
    }).join('');
  }

  viewRow(r, first) {
    const e = (v) => this.host.escapeHtml(v);
    const id = e(r.id);
    return '<tr class="price-row' + (first ? ' sku-first' : '') + '">' +
      '<td class="col-sku">' + (first ? '<span class="sku">' + e(r.sku) + '</span>' : '') + '</td>' +
      '<td class="col-desc">' + (first ? '<span title="' + e(r.description) + '">' + e(r.description) + '</span>' : '') + '</td>' +
      '<td class="col-tier"><span class="tier-pill tier-' + e(r.tier.toLowerCase()) + '">' + e(this.tierLabel(r.tier)) + '</span></td>' +
      '<td class="col-price">' + e(this.money(r.price)) + '</td>' +
      '<td class="col-mod" title="' + e(r.modifiedBy) + '">' + e(this.host.formatStamp ? this.host.formatStamp(r.modified) : r.modified) +
        (r.modifiedBy ? '<div class="muted">' + e(r.modifiedBy) + '</div>' : '') + '</td>' +
      '<td class="col-actions">' +
        '<button class="row-btn" data-act="edit" data-id="' + id + '">Edit</button>' +
        '<button class="row-btn" data-act="addsize" data-id="' + id + '" title="Add another size tier for this SKU">+ Size</button>' +
        '<button class="row-btn row-btn-danger" data-act="delete" data-id="' + id + '">Delete</button>' +
      '</td></tr>';
  }

  editRow(r) {
    const e = (v) => this.host.escapeHtml(v);
    const id = e(r.id);
    const opts = TIERS.map((t) => '<option value="' + t + '"' + (t === r.tier ? ' selected' : '') + '>' +
      e(this.tierLabel(t)) + '</option>').join('');
    return '<tr class="price-row is-editing">' +
      '<td class="col-sku"><input name="sku" value="' + e(r.sku) + '" autocomplete="off" /></td>' +
      '<td class="col-desc"><input name="description" value="' + e(r.description) + '" autocomplete="off" /></td>' +
      '<td class="col-tier"><select name="tier">' + opts + '</select></td>' +
      '<td class="col-price"><input name="price" inputmode="decimal" value="' + e(r.price) + '" autocomplete="off" /></td>' +
      '<td class="col-mod muted">Enter saves · Esc cancels</td>' +
      '<td class="col-actions">' +
        '<button class="row-btn row-btn-primary" data-act="save" data-id="' + id + '">Save</button>' +
        '<button class="row-btn" data-act="cancel" data-id="' + id + '">Cancel</button>' +
      '</td></tr>';
  }

  message(text, muted) {
    this.el.body.innerHTML = '<tr class="log-empty-row"><td colspan="6"><div class="empty-state' +
      (muted ? ' empty-state-muted' : '') + '"><h3>' + this.host.escapeHtml(text) + '</h3></div></td></tr>';
  }

  setBusy(on) {
    this.busy = on;
    [this.el.refresh, this.el.add, this.el.modalSave].forEach((b) => { if (b) b.disabled = on; });
    this.el.panel.classList.toggle('is-busy', on);
  }

  tierLabel(t) {
    return TIER_LABEL[t] || t || '?';
  }

  money(v) {
    if (v === '' || v === null || v === undefined || isNaN(Number(v))) return '—';
    return '$' + Number(v).toFixed(2);
  }
}
