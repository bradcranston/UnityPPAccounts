// FCB Locations tab — edits the Address table that FCB (acct 22860) orders ship to.
// `process data - individual` matches each order's "Please select which location you would
// like your items delivered to:" answer against it:
//   - answers containing "(IFC)":  the text before the first bracket, minus the word "Office",
//                                  must equal Center Name on a Type = IFC row (case-sensitive)
//   - every other answer:          the text inside the first brackets, e.g. "Bloomfield (Red)" -> Red,
//                                  must equal Color on a Type = Color row (case-insensitive)
// The matched row supplies the ship-to address. The delivery line and the second PrintSmith job come
// from its Center Name: IFC rows -> IFC, a name containing "Greensburg" -> Greensburg storeroom,
// "Indiana" -> Indiana storeroom, anything else -> a CHECK DELIVERY note and no delivery job.
// resolveAnswer() repeats that logic exactly. Keep the two in step if the script changes.
//
// FileMaker round trips all go through "Manage: Accounts":
//   locationLoad   -> window.setLocationData(locations, orders, meta)
//   locationSave   -> window.setLocationResult({ ok, action:'save', saved, errors })
//   locationDelete -> window.setLocationResult({ ok, action:'delete', id, errors, cancelled })

const ROUTES = {
  GREENSBURG: {
    label: 'Greensburg storeroom',
    job: 'PS-SKU-4 · Greensburg Storeroom Delivery',
    cls: 'route-gb'
  },
  INDIANA: { label: 'Indiana storeroom', job: 'PS-SKU-5 · Indiana Storeroom Shipping', cls: 'route-in' },
  IFC: { label: 'IFC shipping', job: 'PS-SKU-5 · IFC Shipping, billed monthly to FCB', cls: 'route-ifc' },
  NONE: {
    label: 'Not recognized',
    job: 'No delivery job - order notes say CHECK DELIVERY',
    cls: 'route-none'
  }
};

// FileMaker Trim only strips spaces
const fmTrim = (s) => String(s == null ? '' : s).replace(/^ +| +$/g, '');
const hasText = (s, part) =>
  String(s || '')
    .toLowerCase()
    .indexOf(part.toLowerCase()) >= 0;

export class LocationManager {
  constructor(host) {
    this.host = host; // AccountListManager: callFileMakerScript, escapeHtml, showToast, formatStamp
    this.rows = [];
    this.orders = [];
    this.answers = [];
    this.days = 90;
    this.view = 'storerooms';
    this.search = '';
    this.loaded = false;
    this.busy = false;
    this.form = null;
    const $ = (id) => document.getElementById(id);
    this.el = {
      panel: $('locationsPanel'),
      stats: $('locationStats'),
      body: $('locationBody'),
      search: $('locationSearchInput'),
      clear: $('locationClearBtn'),
      days: $('locationDaysSelect'),
      refresh: $('locationRefreshBtn'),
      add: $('locationAddBtn'),
      views: $('locationViews'),
      statStorerooms: $('locStatStorerooms'),
      statColors: $('locStatColors'),
      statIfc: $('locStatIfc'),
      statProblems: $('locStatProblems'),
      modal: $('locationModal'),
      modalTitle: $('locationModalTitle'),
      modalClose: $('closeLocationModal'),
      modalBody: $('locationForm'),
      modalError: $('locationFormError'),
      modalSave: $('locationFormSave')
    };
    this.attach();
  }

  attach() {
    let timer = null;
    this.el.search.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.search = e.target.value.trim().toLowerCase();
        this.render();
      }, 120);
    });
    this.el.clear.addEventListener('click', () => {
      this.search = '';
      this.el.search.value = '';
      this.render();
    });
    this.el.days.addEventListener('change', (e) => {
      this.days = Number(e.target.value) || 90;
      this.load();
    });
    this.el.refresh.addEventListener('click', () => this.load());
    this.el.add.addEventListener('click', () =>
      this.openForm({ kind: this.view === 'ifc' ? 'IFC' : 'Color' })
    );
    this.el.views.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-view]');
      if (b) {
        this.view = b.getAttribute('data-view');
        this.render();
      }
    });
    this.el.body.addEventListener('click', (e) => this.onBodyClick(e));
    this.el.body.addEventListener('input', (e) => {
      if (e.target.id === 'locTestInput') this.renderTest();
    });
    this.el.modalClose.addEventListener('click', () => this.closeForm());
    this.el.modal.addEventListener('click', (e) => {
      if (e.target === this.el.modal) this.closeForm();
    });
    this.el.modalSave.addEventListener('click', () => this.saveForm());
    this.el.modalBody.addEventListener('input', () => this.renderFormPreview());
    this.el.modalBody.addEventListener('change', (e) => {
      if (e.target.name === 'kind' || e.target.name === 'storeroom') {
        this.readForm();
        this.renderForm();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.el.modal.style.display === 'block') this.closeForm();
    });
  }

  // ---------- data

  onShow() {
    this.loaded ? this.render() : this.load();
  }

  load() {
    if (this.busy) return;
    this.setBusy(true);
    this.message('Loading locations and the last ' + this.days + ' days of FCB orders…', true);
    this.host.callFileMakerScript(
      'Manage: Accounts',
      JSON.stringify({ mode: 'locationLoad', days: this.days })
    );
  }

  setData(locations, orders, meta) {
    this.setBusy(false);
    const parse = (v, d) => {
      if (typeof v !== 'string') return v;
      try {
        return JSON.parse(v || d);
      } catch (e) {
        return null;
      }
    };
    const locs = parse(locations, '[]');
    const ords = parse(orders, '[]');
    const m = parse(meta, '{}') || {};
    if (m.sqlError) {
      this.message(m.sqlError);
      return;
    }
    if (!Array.isArray(locs)) {
      this.message('FileMaker did not return readable location data.');
      return;
    }
    if (m.days) {
      this.days = Number(m.days);
      this.el.days.value = String(this.days);
    }
    this.rows = locs.map((r) => ({
      id: String(r.id || ''),
      type: r.type || '',
      center: r.center || '',
      rc: r.rc || '',
      color: r.color || '',
      address: r.address || '',
      address2: r.address2 || '',
      city: r.city || '',
      state: r.state || '',
      zip: r.zip || '',
      modified: r.modified || '',
      modifiedBy: r.modifiedBy || ''
    }));
    this.orders = Array.isArray(ords) ? ords.filter((o) => o && o.loc) : [];
    this.loaded = true;
    this.analyse();
    this.render();
  }

  setResult(r) {
    let res = r;
    if (typeof res === 'string') {
      try {
        res = JSON.parse(res);
      } catch (e) {
        res = null;
      }
    }
    this.setBusy(false);
    if (!res || res.cancelled) return;
    if (!res.ok) {
      const errs = (res.errors || 'Save failed.').split(/\r\n|\r|\n/).filter(Boolean);
      if (this.el.modal.style.display === 'block') this.showFormError(errs);
      else this.host.showToast(errs.join(' · '), 'error');
      if (res.saved > 0) this.load();
      return;
    }
    if (res.action === 'save') {
      this.closeForm();
      this.host.showToast(res.saved === 1 ? 'Location saved.' : res.saved + ' locations saved.', 'ok');
    } else if (res.action === 'delete') {
      this.host.showToast('Location deleted.', 'ok');
    }
    this.load();
  }

  // ---------- matching (mirror of process data - individual)

  resolveAnswer(answer, rows) {
    rows = rows || this.rows;
    const loc = String(answer || '');
    const isIfc = hasText(loc, '(IFC)');
    let key, matches;
    if (isIfc) {
      key = fmTrim(loc.split('(')[0].split('Office').join(''));
      matches = rows.filter((r) => r.type === 'IFC' && r.center === key);
    } else {
      key = fmTrim(loc.replace(/[()]/g, '\n').split('\n')[1] || '');
      matches = key
        ? rows.filter((r) => r.type === 'Color' && r.color.toLowerCase() === key.toLowerCase())
        : [];
    }
    const hit = matches[0];
    // older store format "0106 - Pleasant Valley - Brown": color is after the last dash
    const tail = fmTrim(loc.slice(loc.lastIndexOf('-') + 1));
    let center = hit ? hit.center : '';
    if (!center) {
      const t = rows.find((r) => r.type === 'Color' && r.color.toLowerCase() === tail.toLowerCase());
      center = t ? t.center : '';
    }
    const route =
      (hit && hit.type === 'IFC') || isIfc || tail.toUpperCase() === 'IFC'
        ? 'IFC'
        : hasText(center, 'Greensburg')
        ? 'GREENSBURG'
        : hasText(center, 'Indiana')
        ? 'INDIANA'
        : 'NONE';
    return { answer: loc, kind: isIfc ? 'IFC' : 'Color', key, matches, route };
  }

  routeForStoreroom(name) {
    return hasText(name, 'Greensburg') ? 'GREENSBURG' : hasText(name, 'Indiana') ? 'INDIANA' : 'NONE';
  }

  // why a row can never be matched by an order, or "" if it can
  unreachable(r) {
    if (r.type === 'IFC') {
      if (r.center.indexOf('(') >= 0) return 'Name has a bracket - orders only match the text before it.';
      if (r.center.indexOf('Office') >= 0)
        return 'Name contains "Office", which is removed from the order\'s answer.';
    } else if (r.type === 'Color') {
      if (!r.color) return 'No color - no order can match it.';
      if (/[()]/.test(r.color)) return 'Color has a bracket - orders match the text inside the brackets.';
    } else {
      return 'Type is "' + r.type + '" - orders only look at IFC and Color rows.';
    }
    return '';
  }

  analyse() {
    const byAnswer = new Map();
    this.orders.forEach((o) => {
      const a = byAnswer.get(o.loc) || { answer: o.loc, count: 0, last: '', nums: [] };
      a.count++;
      if (!a.last || o.date > a.last) a.last = o.date;
      if (o.num && a.nums.length < 5) a.nums.push(o.num);
      byAnswer.set(o.loc, a);
    });
    this.usage = new Map();
    this.answers = Array.from(byAnswer.values()).map((a) => {
      const r = this.resolveAnswer(a.answer);
      r.matches.forEach((m) => this.usage.set(m.id, (this.usage.get(m.id) || 0) + a.count));
      return Object.assign(a, r, { problem: this.problemOf(r) });
    });
    // fixable problems first, then answers that ship fine, then old-format answers nothing can match
    const rank = (a) => (!a.problem ? 1 : a.problem === 'legacy' ? 2 : 0);
    this.answers.sort((a, b) => rank(a) - rank(b) || b.count - a.count);
  }

  problemOf(r) {
    // before 8/17/26 the store sent "0106 - Pleasant Valley - Brown" / "... - IFC": no brackets, so no
    // lookup in the script can ever find an address for it. Only matters if such an order is re-run.
    if (!r.matches.length && r.answer.indexOf('(') < 0) return 'legacy';
    if (!r.matches.length) return 'none';
    if (r.matches.length > 1) return 'dup';
    if (r.route === 'NONE') return 'route';
    return '';
  }

  // ---------- render

  storerooms() {
    const groups = new Map();
    this.rows
      .filter((r) => r.type === 'Color')
      .forEach((r) => {
        if (!groups.has(r.center)) groups.set(r.center, []);
        groups.get(r.center).push(r);
      });
    return Array.from(groups.entries())
      .map(([name, colors]) => ({ name, colors: colors.sort((a, b) => a.color.localeCompare(b.color)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  render() {
    if (!this.loaded) return;
    const stores = this.storerooms();
    const ifc = this.rows.filter((r) => r.type === 'IFC');
    const problems = this.answers.filter((a) => a.problem && a.problem !== 'legacy');
    this.el.statStorerooms.textContent = String(stores.length);
    this.el.statColors.textContent = String(this.rows.filter((r) => r.type === 'Color').length);
    this.el.statIfc.textContent = String(ifc.length);
    this.el.statProblems.textContent = String(problems.length);
    this.el.statProblems.parentNode.classList.toggle('stat-warn', problems.length > 0);
    this.el.views.querySelectorAll('button[data-view]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-view') === this.view);
    });
    const ordersBtn = this.el.views.querySelector('[data-view="orders"] .loc-badge');
    if (ordersBtn) {
      ordersBtn.textContent = String(problems.length);
      ordersBtn.hidden = !problems.length;
    }
    this.el.add.textContent =
      this.view === 'ifc' ? 'Add IFC office' : this.view === 'orders' ? 'Add location' : 'Add color';
    if (this.view === 'ifc') this.renderIfc(ifc);
    else if (this.view === 'orders') this.renderAnswers();
    else this.renderStorerooms(stores);
  }

  matchesSearch(...parts) {
    return (
      !this.search ||
      parts.some(
        (p) =>
          String(p || '')
            .toLowerCase()
            .indexOf(this.search) >= 0
      )
    );
  }

  addressLines(r) {
    const e = (t) => this.host.escapeHtml(t);
    return (
      e(r.address) +
      (r.address2 ? '<br>' + e(r.address2) : '') +
      '<br>' +
      e(r.city) +
      ', ' +
      e(r.state) +
      ' ' +
      e(r.zip)
    );
  }

  routePill(route) {
    const r = ROUTES[route];
    return (
      '<span class="route-pill ' +
      r.cls +
      '" title="' +
      this.host.escapeHtml(r.job) +
      '">' +
      this.host.escapeHtml(r.label) +
      '</span>'
    );
  }

  usageText(id) {
    const n = this.usage.get(id) || 0;
    return n ? n + (n === 1 ? ' order' : ' orders') : 'no orders';
  }

  renderStorerooms(stores) {
    const e = (t) => this.host.escapeHtml(t);
    const shown = stores.filter((s) =>
      this.matchesSearch(s.name, s.colors[0] && s.colors[0].city, ...s.colors.map((c) => c.color))
    );
    if (!shown.length) {
      this.message(
        stores.length ? 'No storerooms match the search.' : 'No storeroom colors yet. Use Add color.',
        true
      );
      return;
    }
    const intro =
      '<p class="loc-help">Branches pick a color in the store, e.g. <code>Bloomfield (Red)</code>. ' +
      'The color decides which storeroom the order ships to. Colors seen in orders over the last ' +
      this.days +
      ' days show their count.</p>';
    this.el.body.innerHTML =
      intro +
      '<div class="loc-cards">' +
      shown
        .map((s) => {
          const first = s.colors[0];
          const route = this.routeForStoreroom(s.name);
          const mixed = s.colors.some(
            (c) =>
              c.address !== first.address ||
              c.address2 !== first.address2 ||
              c.city !== first.city ||
              c.state !== first.state ||
              c.zip !== first.zip
          );
          const chips = s.colors
            .map((c) => {
              const why = this.unreachable(c);
              const n = this.usage.get(c.id) || 0;
              return (
                '<span class="loc-chip' +
                (why ? ' is-bad' : '') +
                '" title="' +
                e(why || this.usageText(c.id) + ' in the last ' + this.days + ' days') +
                '">' +
                '<span class="loc-swatch" style="background:' +
                e(this.swatch(c.color)) +
                '"></span>' +
                e(c.color) +
                (n ? '<span class="loc-count">' + n + '</span>' : '') +
                '<button class="loc-chip-btn" data-act="edit" data-id="' +
                e(c.id) +
                '" title="Edit or move this color">Edit</button>' +
                '<button class="loc-chip-btn loc-chip-del" data-act="delete" data-id="' +
                e(c.id) +
                '" title="Remove this color">&times;</button></span>'
              );
            })
            .join('');
          return (
            '<div class="loc-card">' +
            '<div class="loc-card-head"><div><h3>' +
            e(s.name) +
            '</h3>' +
            this.routePill(route) +
            '</div>' +
            '<div><button class="row-btn" data-act="edit-storeroom" data-name="' +
            e(s.name) +
            '">Edit storeroom</button>' +
            '<button class="row-btn" data-act="add-color" data-name="' +
            e(s.name) +
            '">+ Color</button></div></div>' +
            '<div class="loc-address">' +
            this.addressLines(first) +
            '</div>' +
            (route === 'NONE'
              ? '<div class="loc-warn-text">The name needs "Greensburg" or "Indiana" in it. Otherwise orders get a CHECK DELIVERY note and no delivery job in PrintSmith.</div>'
              : '') +
            (mixed
              ? '<div class="loc-warn-text">These colors do not all have the same address. Use Edit storeroom to line them up.</div>'
              : '') +
            '<div class="loc-chips">' +
            chips +
            '</div></div>'
          );
        })
        .join('') +
      '</div>';
  }

  renderIfc(ifc) {
    const e = (t) => this.host.escapeHtml(t);
    const shown = ifc
      .filter((r) => this.matchesSearch(r.center, r.rc, r.city, r.address))
      .sort((a, b) => a.center.localeCompare(b.center));
    const dupNames = new Set(ifc.map((r) => r.center).filter((n, i, a) => a.indexOf(n) !== i));
    const intro =
      '<p class="loc-help">Offices pick <code>Name (IFC)</code> in the store, e.g. <code>Anderson (IFC)</code>. The name before the bracket has to match exactly, capitals included.</p>';
    if (!shown.length) {
      this.el.body.innerHTML =
        intro +
        this.emptyBlock(
          ifc.length ? 'No IFC offices match the search.' : 'No IFC offices yet. Use Add IFC office.'
        );
      return;
    }
    const rows = shown
      .map((r) => {
        const why =
          this.unreachable(r) ||
          (dupNames.has(r.center)
            ? 'Two offices share this name - orders get both addresses run together.'
            : '');
        return (
          '<tr class="price-row"><td><strong>' +
          e(r.center) +
          '</strong>' +
          (why
            ? '<div><span class="pill pill-off" title="' +
              e(why) +
              '">' +
              (dupNames.has(r.center) ? 'duplicate' : 'can never match') +
              '</span></div>'
            : '') +
          '</td><td class="col-num">' +
          e(r.rc) +
          '</td><td class="loc-addr-cell">' +
          this.addressLines(r) +
          '</td><td class="col-num">' +
          e(this.usageText(r.id)) +
          '</td><td class="col-mod" title="' +
          e(r.modifiedBy) +
          '">' +
          e(this.host.formatStamp(r.modified)) +
          (r.modifiedBy ? '<div class="muted">' + e(r.modifiedBy) + '</div>' : '') +
          '</td><td class="col-actions"><button class="row-btn" data-act="edit" data-id="' +
          e(r.id) +
          '">Edit</button>' +
          '<button class="row-btn row-btn-danger" data-act="delete" data-id="' +
          e(r.id) +
          '">Delete</button></td></tr>'
        );
      })
      .join('');
    this.el.body.innerHTML =
      intro +
      '<div class="log-wrap"><table class="log-table price-table"><thead><tr>' +
      '<th>Office name (as the store sends it)</th><th class="col-num">RC</th><th>Ships to</th>' +
      '<th class="col-num">Last ' +
      this.days +
      ' days</th><th class="col-mod">Last changed</th><th class="col-actions"></th>' +
      '</tr></thead><tbody>' +
      rows +
      '</tbody></table></div>';
  }

  renderAnswers() {
    const e = (t) => this.host.escapeHtml(t);
    const test =
      '<div class="loc-test"><label for="locTestInput">Try a store answer</label>' +
      '<input type="text" id="locTestInput" autocomplete="off" spellcheck="false" placeholder="e.g. Bloomfield (Red) or Anderson (IFC)" value="' +
      e(this.testValue || '') +
      '">' +
      '<div id="locTestResult" class="loc-test-result"></div></div>';
    const shown = this.answers.filter((a) => this.matchesSearch(a.answer, a.key, ...a.nums));
    const rows = shown
      .map((a) => {
        const pill =
          a.problem === 'legacy'
            ? '<span class="pill loc-pill-old">Old format</span>'
            : a.problem === 'none'
            ? '<span class="pill pill-off">No location</span>'
            : a.problem === 'dup'
            ? '<span class="pill pill-off">' + a.matches.length + ' locations</span>'
            : a.problem === 'route'
            ? '<span class="pill pill-off">Not recognized</span>'
            : '<span class="pill pill-on">OK</span>';
        const hit = a.matches[0];
        const where =
          a.problem === 'legacy'
            ? '<span class="muted">The store\'s format before 8/17/26 - no brackets, so it can\'t be matched to a location. Only matters if this order is re-run.</span>'
            : !a.matches.length
            ? '<span class="muted">No ' +
              (a.kind === 'IFC'
                ? 'IFC office named <code>' + e(a.key) + '</code>'
                : a.key
                ? 'storeroom has the color <code>' + e(a.key) + '</code>'
                : 'color in brackets') +
              '. PrintSmith gets no ship-to address.</span>'
            : a.matches.length > 1
            ? '<span class="muted">Matches ' +
              a.matches.map((m) => e(m.center + (m.color ? ' / ' + m.color : ''))).join(' and ') +
              '. The ship-to address gets both run together.</span>'
            : e(hit.center) + (hit.color ? ' <span class="muted">· ' + e(hit.color) + '</span>' : '');
        const fix =
          a.problem === 'none'
            ? '<button class="row-btn row-btn-primary" data-act="add-from-answer" data-answer="' +
              e(a.answer) +
              '">Add location</button>'
            : a.matches.length
            ? '<button class="row-btn" data-act="edit" data-id="' + e(a.matches[0].id) + '">Edit</button>'
            : '';
        return (
          '<tr class="price-row' +
          (a.problem && a.problem !== 'legacy' ? ' loc-problem' : '') +
          '"><td><code class="loc-answer">' +
          e(a.answer) +
          '</code>' +
          (a.nums.length
            ? '<div class="muted" title="' +
              e(a.nums.join(', ')) +
              '">' +
              e(a.nums.slice(0, 2).join(', ')) +
              (a.count > 2 ? ' …' : '') +
              '</div>'
            : '') +
          '</td><td class="col-num">' +
          a.count +
          '</td><td class="col-date">' +
          e(this.host.formatStamp(a.last)) +
          '</td><td>' +
          pill +
          '</td><td>' +
          where +
          '</td><td>' +
          this.routePill(a.route) +
          '</td><td class="col-actions">' +
          fix +
          '</td></tr>'
        );
      })
      .join('');
    const table = shown.length
      ? '<div class="log-wrap"><table class="log-table price-table"><thead><tr><th>Store answer</th><th class="col-num">Orders</th>' +
        '<th class="col-date">Last order</th><th>Status</th><th>Ships to</th><th>Delivery</th><th class="col-actions"></th></tr></thead><tbody>' +
        rows +
        '</tbody></table></div>'
      : this.emptyBlock(
          this.answers.length
            ? 'No answers match the search.'
            : 'No FCB orders with a delivery answer in the last ' + this.days + ' days.'
        );
    this.el.body.innerHTML =
      '<p class="loc-help">Every delivery answer FCB orders sent in the last ' +
      this.days +
      ' days, and the location each one ships to. Problems are listed first. Fix them here before the next order.</p>' +
      test +
      table;
    this.renderTest();
  }

  renderTest() {
    const input = document.getElementById('locTestInput');
    const out = document.getElementById('locTestResult');
    if (!input || !out) return;
    this.testValue = input.value;
    if (!input.value.trim()) {
      out.innerHTML = '';
      return;
    }
    out.innerHTML = this.describeAnswer(this.resolveAnswer(input.value));
  }

  describeAnswer(r) {
    const e = (t) => this.host.escapeHtml(t);
    const looks =
      r.kind === 'IFC'
        ? 'IFC office named <code>' + e(r.key) + '</code>'
        : 'storeroom color <code>' + e(r.key || '(none in brackets)') + '</code>';
    let what;
    if (!r.matches.length)
      what = '<span class="loc-bad">No match.</span> PrintSmith gets no ship-to address.';
    else if (r.matches.length > 1)
      what = '<span class="loc-bad">' + r.matches.length + ' matches.</span> The addresses get run together.';
    else
      what =
        'Ships to <strong>' +
        e(r.matches[0].center) +
        '</strong>, ' +
        e(r.matches[0].address) +
        ', ' +
        e(r.matches[0].city) +
        '.';
    return (
      'Looks for an ' +
      looks +
      '. ' +
      what +
      ' ' +
      this.routePill(r.route) +
      ' <span class="muted">' +
      e(ROUTES[r.route].job) +
      '</span>'
    );
  }

  emptyBlock(text) {
    return '<div class="empty-state empty-state-muted"><h3>' + this.host.escapeHtml(text) + '</h3></div>';
  }

  message(text, muted) {
    this.el.body.innerHTML =
      '<div class="empty-state' +
      (muted ? ' empty-state-muted' : '') +
      '"><h3>' +
      this.host.escapeHtml(text) +
      '</h3></div>';
  }

  swatch(color) {
    const c = String(color || '')
      .split('/')[0]
      .trim()
      .toLowerCase();
    const map = {
      tan: '#d2b48c',
      yellow: '#f4d03f',
      green: '#27ae60',
      red: '#e74c3c',
      orange: '#e67e22',
      blue: '#3498db',
      black: '#2c3e50',
      brown: '#8d6e63',
      pink: '#f06292',
      white: '#fff',
      purple: '#8e44ad',
      gray: '#95a5a6',
      grey: '#95a5a6'
    };
    return map[c] || '#bdc3c7';
  }

  // ---------- actions

  onBodyClick(ev) {
    const b = ev.target.closest('button[data-act]');
    if (!b || this.busy) return;
    const act = b.getAttribute('data-act');
    const id = b.getAttribute('data-id');
    const row = id ? this.rows.find((r) => r.id === id) : null;
    if (act === 'edit' && row) this.openForm({ kind: row.type === 'IFC' ? 'IFC' : 'Color', row });
    else if (act === 'delete' && row) this.remove(row);
    else if (act === 'add-color') this.openForm({ kind: 'Color', storeroom: b.getAttribute('data-name') });
    else if (act === 'edit-storeroom')
      this.openForm({ kind: 'Storeroom', storeroom: b.getAttribute('data-name') });
    else if (act === 'add-from-answer') {
      const r = this.resolveAnswer(b.getAttribute('data-answer'));
      this.openForm(
        r.kind === 'IFC'
          ? { kind: 'IFC', center: r.key, answer: r.answer }
          : { kind: 'Color', color: r.key, answer: r.answer }
      );
    }
  }

  remove(row) {
    const n = this.usage.get(row.id) || 0;
    const label =
      (row.type === 'IFC' ? 'IFC office: ' + row.center : 'Color ' + row.color + ' → ' + row.center) +
      '\n' +
      row.address +
      ', ' +
      row.city +
      ', ' +
      row.state +
      ' ' +
      row.zip +
      '\n' +
      (n
        ? n + (n === 1 ? ' order' : ' orders') + ' in the last ' + this.days + ' days used it.'
        : 'No orders used it in the last ' + this.days + ' days.');
    this.setBusy(true);
    this.host.callFileMakerScript(
      'Manage: Accounts',
      JSON.stringify({ mode: 'locationDelete', id: row.id, label })
    );
  }

  send(rows) {
    if (this.busy) return;
    this.setBusy(true);
    this.host.callFileMakerScript('Manage: Accounts', JSON.stringify({ mode: 'locationSave', rows }));
  }

  // ---------- add / edit form
  // kinds: IFC (one office), Color (one color, picks a storeroom), Storeroom (name + address for every color in it)

  openForm(opts) {
    const row = opts.row || null;
    const stores = this.storerooms();
    let f = {
      kind: opts.kind,
      id: row ? row.id : '',
      original: row,
      answer: opts.answer || '',
      center: '',
      rc: '',
      color: '',
      address: '',
      address2: '',
      city: '',
      state: '',
      zip: '',
      storeroom: '',
      newName: ''
    };
    if (row)
      Object.assign(f, {
        center: row.center,
        rc: row.rc,
        color: row.color,
        address: row.address,
        address2: row.address2,
        city: row.city,
        state: row.state,
        zip: row.zip
      });
    if (opts.center) f.center = opts.center;
    if (opts.color) f.color = opts.color;
    if (f.kind === 'Color') f.storeroom = row ? row.center : opts.storeroom || (stores[0] ? '' : '__new');
    if (f.kind === 'Storeroom') {
      const s = stores.find((x) => x.name === opts.storeroom);
      const c = s.colors[0];
      Object.assign(f, {
        storeroom: s.name,
        center: s.name,
        address: c.address,
        address2: c.address2,
        city: c.city,
        state: c.state,
        zip: c.zip
      });
    }
    this.form = f;
    this.formTouched = false;
    this.el.modalTitle.textContent =
      f.kind === 'Storeroom'
        ? 'Edit storeroom'
        : row
        ? f.kind === 'IFC'
          ? 'Edit IFC office'
          : 'Edit color'
        : 'Add location';
    this.hideFormError();
    this.renderForm();
    this.el.modal.style.display = 'block';
    setTimeout(() => {
      const i = this.el.modalBody.querySelector('input:not([readonly]), select');
      i && i.focus();
    }, 50);
  }

  closeForm() {
    this.el.modal.style.display = 'none';
    this.form = null;
  }

  renderForm() {
    const f = this.form;
    const e = (t) => this.host.escapeHtml(t);
    const input = (name, label, value, attrs) =>
      '<label class="field"><span>' +
      label +
      '</span>' +
      '<input type="text" name="' +
      name +
      '" value="' +
      e(value) +
      '" autocomplete="off" spellcheck="false" ' +
      (attrs || '') +
      '></label>';
    const stores = this.storerooms();
    const pickedStore =
      f.kind === 'Color' && f.storeroom && f.storeroom !== '__new'
        ? stores.find((s) => s.name === f.storeroom)
        : null;
    const lockAddress = !!pickedStore;
    if (pickedStore) {
      const c = pickedStore.colors[0];
      Object.assign(f, {
        address: c.address,
        address2: c.address2,
        city: c.city,
        state: c.state,
        zip: c.zip
      });
    }
    let html = '';
    if (f.answer)
      html += '<div class="rpt-note loc-from">From the store answer <code>' + e(f.answer) + '</code></div>';
    if (!f.id && f.kind !== 'Storeroom') {
      html +=
        '<div class="loc-kind"><label><input type="radio" name="kind" value="Color"' +
        (f.kind === 'Color' ? ' checked' : '') +
        '> Storeroom color <span class="muted">branch answers like <code>Bloomfield (Red)</code></span></label>' +
        '<label><input type="radio" name="kind" value="IFC"' +
        (f.kind === 'IFC' ? ' checked' : '') +
        '> IFC office <span class="muted">answers like <code>Anderson (IFC)</code></span></label></div>';
    }
    if (f.kind === 'Color') {
      html += input('color', 'Color', f.color, 'placeholder="as it appears in brackets, e.g. Red"');
      html +=
        '<label class="field"><span>Ships to storeroom</span><select name="storeroom">' +
        '<option value=""' +
        (f.storeroom ? '' : ' selected') +
        ' disabled>Pick a storeroom…</option>' +
        stores
          .map(
            (s) =>
              '<option value="' +
              e(s.name) +
              '"' +
              (s.name === f.storeroom ? ' selected' : '') +
              '>' +
              e(s.name) +
              '</option>'
          )
          .join('') +
        '<option value="__new"' +
        (f.storeroom === '__new' ? ' selected' : '') +
        '>New storeroom…</option></select></label>';
      if (f.storeroom === '__new')
        html += input(
          'newName',
          'New storeroom name',
          f.newName,
          'placeholder="e.g. First Commonwealth Storeroom (Greensburg)"'
        );
    } else if (f.kind === 'IFC') {
      html +=
        '<div class="loc-two">' +
        input('center', 'Office name', f.center, 'placeholder="exactly as before the bracket in the store"') +
        input('rc', 'RC', f.rc, 'inputmode="numeric" placeholder="optional"') +
        '</div>';
    } else {
      html +=
        input('center', 'Storeroom name', f.center, '') +
        '<p class="muted loc-note">Saves the name and address on all ' +
        stores.find((s) => s.name === f.storeroom).colors.length +
        ' colors in this storeroom.</p>';
    }
    if (f.kind !== 'Color' || f.storeroom) {
      const ro = lockAddress ? ' readonly' : '';
      html +=
        '<div class="loc-address-fields' +
        (lockAddress ? ' is-locked' : '') +
        '">' +
        (lockAddress
          ? '<p class="muted loc-note">Address comes from the storeroom. Change it with Edit storeroom.</p>'
          : '') +
        input('address', 'Street', f.address, ro) +
        input('address2', 'Street line 2', f.address2, ro + ' placeholder="optional"') +
        '<div class="loc-three">' +
        input('city', 'City', f.city, ro) +
        input('state', 'State', f.state, ro + ' maxlength="2"') +
        input('zip', 'ZIP', f.zip, ro) +
        '</div></div>';
    }
    html += '<div class="loc-preview" id="locFormPreview"></div>';
    this.el.modalBody.innerHTML = html;
    this.renderFormPreview();
  }

  readForm() {
    const f = this.form;
    this.el.modalBody.querySelectorAll('input[name], select[name]').forEach((i) => {
      if (i.type === 'radio') {
        if (i.checked) f[i.name] = i.value;
      } else f[i.name] = i.value;
    });
    if (f.kind === 'IFC') f.storeroom = '';
    return f;
  }

  // the rows this form would save, as process data - individual will see them
  formRows() {
    const f = this.form;
    const addr = {
      address: fmTrim(f.address),
      address2: fmTrim(f.address2),
      city: fmTrim(f.city),
      state: fmTrim(f.state).toUpperCase(),
      zip: fmTrim(f.zip)
    };
    if (f.kind === 'Storeroom') {
      const s = this.storerooms().find((x) => x.name === f.storeroom);
      return s.colors.map((c) =>
        Object.assign({ id: c.id, type: 'Color', center: fmTrim(f.center), rc: c.rc, color: c.color }, addr)
      );
    }
    if (f.kind === 'IFC')
      return [
        Object.assign({ id: f.id, type: 'IFC', center: fmTrim(f.center), rc: fmTrim(f.rc), color: '' }, addr)
      ];
    const center = f.storeroom === '__new' ? fmTrim(f.newName) : f.storeroom;
    return [
      Object.assign(
        { id: f.id, type: 'Color', center, rc: f.original ? f.original.rc : '', color: fmTrim(f.color) },
        addr
      )
    ];
  }

  checkForm(rows) {
    const errs = [];
    const f = this.form;
    rows.forEach((r) => {
      const label = r.type === 'Color' ? r.color || 'Color' : r.center || 'Office';
      if (r.type === 'Color' && !r.color) errs.push('Enter the color.');
      if (r.type === 'Color' && /[()]/.test(r.color))
        errs.push(label + ': enter the color without brackets.');
      if (!r.center) errs.push(f.kind === 'IFC' ? 'Enter the office name.' : 'Pick or name the storeroom.');
      if (r.type === 'IFC' && r.center.indexOf('(') >= 0)
        errs.push('Leave the bracket off the office name - orders only match the text before it.');
      if (r.type === 'IFC' && r.center.indexOf('Office') >= 0)
        errs.push('Leave "Office" off the name - it is removed from the store\'s answer before matching.');
      if (r.rc && !/^\d+$/.test(r.rc)) errs.push('RC must be a number.');
      if (!r.address || !r.city || !r.state || !r.zip)
        errs.push(label + ': street, city, state and ZIP are required.');
      const clash = this.rows.find(
        (o) =>
          o.id !== r.id &&
          o.type === r.type &&
          (r.type === 'IFC' ? o.center === r.center : o.color.toLowerCase() === r.color.toLowerCase())
      );
      if (clash && f.kind !== 'Storeroom')
        errs.push(
          r.type === 'IFC'
            ? 'There is already an IFC office called ' + r.center + '.'
            : r.color + ' already ships to ' + clash.center + '. Edit that color to move it.'
        );
    });
    return Array.from(new Set(errs));
  }

  renderFormPreview() {
    if (!this.form) return;
    this.readForm();
    const box = document.getElementById('locFormPreview');
    if (!box) return;
    const e = (t) => this.host.escapeHtml(t);
    const f = this.form;
    const rows = this.formRows();
    const r = rows[0];
    const notes = [];
    if (f.kind === 'IFC' && r.center) {
      notes.push(
        'Matches store answers like <code>' + e(r.center) + ' (IFC)</code>. ' + this.routePill('IFC')
      );
    } else if (f.kind === 'Color' && r.color && r.center) {
      notes.push(
        'Branch answers ending <code>(' +
          e(r.color) +
          ')</code> ship to <strong>' +
          e(r.center) +
          '</strong>. ' +
          this.routePill(this.routeForStoreroom(r.center))
      );
    } else if (f.kind === 'Storeroom' && r.center) {
      notes.push(rows.length + ' colors ship here. ' + this.routePill(this.routeForStoreroom(r.center)));
    }
    if (f.kind !== 'IFC' && r.center && this.routeForStoreroom(r.center) === 'NONE') {
      notes.push(
        '<span class="loc-bad">The storeroom name needs "Greensburg" or "Indiana" in it.</span> Otherwise these orders get a CHECK DELIVERY note and no delivery job in PrintSmith.'
      );
    }
    // what this change does to answers recent orders actually sent
    if (this.answers.length) {
      const others = this.rows.filter((o) => !rows.some((n) => n.id && n.id === o.id));
      const after = others.concat(rows.map((n) => Object.assign({}, n, { id: n.id || '__new' })));
      const fixed = this.answers.filter(
        (a) => a.problem && !this.problemOf(this.resolveAnswer(a.answer, after))
      );
      const broken = this.answers.filter(
        (a) => !a.problem && this.problemOf(this.resolveAnswer(a.answer, after))
      );
      if (fixed.length)
        notes.push(
          '<span class="loc-good">Fixes ' +
            fixed.length +
            (fixed.length === 1 ? ' answer' : ' answers') +
            '</span> from recent orders: ' +
            fixed
              .slice(0, 4)
              .map((a) => '<code>' + e(a.answer) + '</code>')
              .join(', ') +
            (fixed.length > 4 ? ' …' : '')
        );
      const list = (arr) =>
        arr
          .slice(0, 4)
          .map((a) => '<code>' + e(a.answer) + '</code>')
          .join(', ') + (arr.length > 4 ? ' …' : '');
      const total = (arr) => arr.reduce((t, a) => t + a.count, 0);
      const unmatched = broken.filter((a) => this.problemOf(this.resolveAnswer(a.answer, after)) !== 'route');
      const misrouted = broken.filter((a) => unmatched.indexOf(a) < 0);
      if (unmatched.length)
        notes.push(
          '<span class="loc-bad">Stops matching ' +
            total(unmatched) +
            ' recent orders</span>: ' +
            list(unmatched) +
            ". Only do this if the store's dropdown changed too."
        );
      if (misrouted.length)
        notes.push(
          '<span class="loc-bad">' +
            total(misrouted) +
            ' recent orders would get CHECK DELIVERY</span> instead of a delivery job: ' +
            list(misrouted) +
            '.'
        );
    }
    const errs = this.checkForm(rows);
    box.innerHTML =
      notes.map((n) => '<p>' + n + '</p>').join('') +
      (errs.length && this.formTouched ? '<p class="loc-bad">' + errs.map(e).join('<br>') + '</p>' : '');
  }

  saveForm() {
    if (!this.form || this.busy) return;
    this.readForm();
    this.formTouched = true;
    const rows = this.formRows();
    const errs = this.checkForm(rows);
    if (errs.length) {
      this.showFormError(errs);
      return;
    }
    this.hideFormError();
    this.send(rows);
  }

  showFormError(errs) {
    this.el.modalError.innerHTML = errs.map((t) => this.host.escapeHtml(t)).join('<br>');
    this.el.modalError.hidden = false;
  }

  hideFormError() {
    this.el.modalError.hidden = true;
    this.el.modalError.textContent = '';
  }

  setBusy(b) {
    this.busy = b;
    [this.el.refresh, this.el.add, this.el.modalSave, this.el.days].forEach((x) => {
      if (x) x.disabled = b;
    });
    this.el.panel.classList.toggle('is-busy', b);
  }
}
