// FCB monthly report — data shaping. Kept separate from the UI so it can be tested.
import { makeXlsx } from './xlsx-writer.js';

const DETAIL_HEAD = ['Date Ordered', 'Message Tracking Number', 'Subtotal', 'Promo Code', 'Promo Order Discount',
  'Total', 'Item (Qty)', 'Marketing Contribution', 'Promo Order Discount',
  'Total Balance Owed by FCB to Unity Printing'];
const PROMO_HEAD = ['Date Ordered', 'Message Tracking Number', ' First Name ', 'Last Name', 'Subtotal', 'Promo Code',
  'Promo Order Discount', 'Total', 'Item (Qty)', 'Marketing Contribution', 'Promo Order Discount',
  'Total Balance Owed by FCB to Unity Printing'];
const DETAIL_W = [12.3, 22.3, 8, 17.2, 19.2, 5.2, 138.8, 20, 62.3, 37];
const PROMO_W = [12.3, 22.3, 10.7, 9.7, 8, 11, 19.2, 5.2, 97.7, 20, 19.2, 37];
const TIERS_NUM = '23456789';

// The bank does not use special characters, so the item text goes out as plain ASCII.
export function clean(s) {
  if (!s) return '';
  return String(s)
    .replace(/[\u00ae\u2122\u2120\u00a9]/g, '')   // (R) (TM) (SM) (C) - dropped, not spelled out
    .normalize('NFKD')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Same rules as the FCB block in "process data - individual".
export function sizeTier(size) {
  let s = String(size || '');
  const p = s.indexOf('(');           // "2XL (add $3.00)"
  if (p >= 0) s = s.slice(0, p);
  s = s.trim().toUpperCase()
    .replace(/EXTRA/g, 'X').replace(/LARGE/g, 'L').replace(/SMALL/g, 'S').replace(/MEDIUM/g, 'M')
    .replace(/[-\s.]/g, '');
  const alias = { XXL: '2XL', '2X': '2XL', XXXL: '3XL', '3X': '3XL', XXXXL: '4XL', '4X': '4XL', '5X': '5XL', '6X': '6XL' };
  s = alias[s] || s;
  if (!s || s === 'OS' || s === 'O/S' || s === 'ONESIZE' || s === 'OSFA') return 'ONE';
  if (s.length === 3 && TIERS_NUM.indexOf(s[0]) >= 0 && s.slice(1) === 'XL') return s;
  return 'BASE';
}

const SEP = /[^A-Z0-9]/;
const STOP = new Set(['WITH', 'THE', 'AND', 'FOR', 'FROM', 'SIZE', 'LOGO', 'SALE', 'DESIGN', 'COLOR', 'COLOUR']);

// letters and digits only, with leading zeros inside digit runs dropped,
// so FCB-06 and FCB-006 land on the same string
function normSku(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(^|[A-Z])0+(?=\d)/g, '$1');
}

function words(s) {
  return new Set(String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w)));
}

export function priceIndex(rows) {
  const map = new Map();          // "SKU|TIER" -> price
  const skus = new Map();         // "SKU" -> { sku, norm, desc }
  (rows || []).forEach((r) => {
    const sku = String(r.sku || '').toUpperCase();
    const key = sku + '|' + String(r.tier || '').toUpperCase();
    if (!map.has(key)) map.set(key, Number(r.price));
    if (!skus.has(sku)) skus.set(sku, { sku: sku, norm: normSku(sku), desc: r.description || '' });
  });
  return { map: map, skus: skus, resolved: new Map() };
}

// Store item numbers do not always match the chart: FCB-06 vs FCB-006,
// LTM763 vs FCB-LTM763, "ERG Sticker Pack" vs "ERG - Sticker Pack (5 stickers/pack)".
// Each rule below has to land on exactly one chart SKU, and the looser rules
// also need the store's item title to share a real word with the chart's
// description — that is what stops bare "INVENTORY" matching "4400-INVENTORY".
export function resolveSku(idx, storeSku, title) {
  const raw = String(storeSku || '').toUpperCase();
  if (!raw) return null;
  const cacheKey = raw + '||' + String(title || '');
  if (idx.resolved.has(cacheKey)) return idx.resolved.get(cacheKey);

  const remember = (v) => { idx.resolved.set(cacheKey, v); return v; };
  if (idx.skus.has(raw)) return remember({ sku: raw, how: 'exact' });

  const n = normSku(raw);
  const all = [...idx.skus.values()];
  const titleWords = words(title);
  const corroborates = (entry) => {
    const dw = words(entry.desc);
    if (!dw.size) return true;                       // nothing to check against
    for (const w of titleWords) if (dw.has(w)) return true;
    return false;
  };
  let ambiguous = null;
  const only = (list) => {
    const uniq = [...new Set(list.map((e) => e.sku))];
    if (uniq.length === 1) return uniq[0];
    if (uniq.length > 1 && !ambiguous) ambiguous = uniq;   // report, never guess
    return null;
  };

  // 1. same item number once punctuation and leading zeros are ignored
  let hit = only(all.filter((e) => e.norm === n));
  if (hit) return remember({ sku: hit, how: 'same number, different punctuation' });

  // 2. the chart item number starts with the store's, ignoring punctuation
  //    ("ERG Sticker Pack" -> "ERG - Sticker Pack (5 stickers/pack)")
  const starts = all.filter((e) =>
    n.length >= 5 && e.norm.length > n.length && e.norm.indexOf(n) === 0).filter(corroborates);
  hit = only(starts);
  if (hit) return remember({ sku: hit, how: 'chart item number starts with the store\'s' });

  // 3. one is the other plus a prefix or suffix at a separator (FCB-LTM763, DT6000-SUMMER)
  const edge = all.filter((e) => {
    const a = e.sku, b = raw;
    const pair = (long, short) =>
      long.length > short.length &&
      ((long.startsWith(short) && SEP.test(long[short.length])) ||
       (long.endsWith(short) && SEP.test(long[long.length - short.length - 1])));
    return pair(a, b) || pair(b, a);
  }).filter(corroborates);
  hit = only(edge);
  if (hit) return remember({ sku: hit, how: 'item number with a prefix or suffix' });

  // 4. one contains the other once punctuation is ignored, six characters or more
  const inside = all.filter((e) =>
    n.length >= 6 && e.norm.length >= 6 &&
    (e.norm.indexOf(n) >= 0 || n.indexOf(e.norm) >= 0)).filter(corroborates);
  hit = only(inside);
  if (hit) return remember({ sku: hit, how: 'item number contained in the other' });

  return remember(ambiguous ? { sku: null, how: 'ambiguous', candidates: ambiguous } : null);
}

function lookup(idx, sku, tier) {
  const k = (t) => String(sku || '').toUpperCase() + '|' + t;
  let p = idx.map.get(k(tier));
  if (p === undefined && tier !== 'ONE') p = idx.map.get(k('ONE'));
  if (p === undefined && tier === 'ONE') p = idx.map.get(k('BASE'));
  return p;
}

function splitName(full) {
  const parts = clean(full).split(/\s+/).filter(Boolean);
  if (!parts.length) return ['', ''];
  return [parts[0], parts.slice(1).join(' ')];
}

// FileMaker sends orderDate (UTC) and zzCreatedTimestamp (server local); the
// difference gives the offset, so the sheet shows the store's local time.
function localDate(orderDateUtc, createdLocal) {
  const utc = new Date(String(orderDateUtc).replace(' ', 'T') + 'Z');
  if (isNaN(utc)) return null;
  const loc = new Date(String(createdLocal).replace(' ', 'T') + 'Z');
  const offset = isNaN(loc) ? 0 : Math.round((loc - utc) / 3600000);
  const shifted = new Date(utc.getTime() + offset * 3600000);
  return new Date(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(),
    shifted.getUTCHours(), shifted.getUTCMinutes(), shifted.getUTCSeconds());
}

export function shapeOrder(rec, idx) {
  let payload;
  try { payload = JSON.parse(String(rec.message).replace(/\r/g, '\n')).payload; }
  catch (err) { return { num: rec.num, error: 'could not read the order data' }; }
  const pricing = payload.pricing || {};
  const promo = ((payload.promo_code || {}).promo_code || {}).promo_code || '';
  const items = [];
  let firm = 0;
  const unpriced = [];
  const matched = [];               // store item numbers resolved by name, for review
  const unclear = [];               // more than one chart item could be meant
  ((payload.items || {}).data || []).forEach((it) => {
    const qty = it.quantity || 0;
    const sku = String(it.sku || '').trim();
    const size = ((it.attributes || {}).fields || {}).size || '';
    const tier = sizeTier(size);
    items.push(clean(it.title) + ' (' + qty + ')');

    let price = lookup(idx, sku, tier);
    if (price === undefined) {
      const alias = resolveSku(idx, sku, it.title);
      if (alias && alias.how === 'ambiguous') {
        unclear.push({ store: sku, title: clean(it.title), candidates: alias.candidates });
      } else if (alias && alias.sku && alias.how !== 'exact') {
        const aliasPrice = lookup(idx, alias.sku, tier);
        if (aliasPrice !== undefined) {
          price = aliasPrice;
          matched.push({ store: sku, chart: alias.sku, how: alias.how, tier: tier,
                         price: aliasPrice, title: clean(it.title) });
        }
      }
    }
    if (price === undefined) unpriced.push((sku || '(no SKU)') + (size ? ' ' + clean(size) : ''));
    else firm += price * qty;
  });
  const paid = (payload.amount_paid || 0) / 100;
  const [first, last] = splitName(rec.name);
  return {
    num: rec.num,
    date: localDate(rec.orderDate, rec.created),
    first, last,
    sub: (pricing.subtotal || 0) / 100,
    code: promo,
    disc: (pricing.subtotal_discount || 0) / 100,
    tot: (pricing.total || 0) / 100,
    items: items.join('\n'),
    marketing: Math.round((firm - paid) * 100) / 100,
    unpriced,
    matched,
    unclear
  };
}

function detailRows(orders) {
  const rows = [DETAIL_HEAD.map((h, i) => ({ v: h, s: i >= 7 ? 'cur' : null }))];
  orders.forEach((o, i) => {
    const r = i + 2;
    rows.push([
      { v: o.date, s: 'date' }, o.num, o.sub || 0, o.code || '', o.disc || '', o.tot || 0,
      { v: o.items, s: 'wrap' }, { v: o.marketing, s: 'cur' },
      { f: 'E' + r, s: 'cur' }, { f: 'H' + r + '-I' + r, s: 'cur' }
    ]);
  });
  return rows;
}

function promoRows(orders) {
  const rows = [PROMO_HEAD.map((h, i) => ({ v: h, s: i >= 9 ? 'cur' : null }))];
  orders.forEach((o, i) => {
    const r = i + 2;
    rows.push([
      { v: o.date, s: 'date' }, o.num, o.first, o.last, o.sub || 0, o.code, o.disc || 0, o.tot || 0,
      { v: o.items, s: 'wrap' }, { v: o.marketing, s: 'cur' },
      { f: 'G' + r, s: 'cur' }, { f: 'J' + r + '-K' + r, s: 'cur' }
    ]);
  });
  return rows;
}

function sheetName(code) {
  return String(code).replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || 'CODE';
}

export function buildWorkbook(orders, opts) {
  opts = opts || {};
  const byDate = orders.slice().sort((a, b) => a.date - b.date);
  const promo = orders.filter((o) => o.code)
    .sort((a, b) => (a.code.toUpperCase() < b.code.toUpperCase() ? -1
      : a.code.toUpperCase() > b.code.toUpperCase() ? 1 : a.date - b.date));

  const sheets = [];

  const pr = promoRows(promo);
  pr.push([]);
  pr[pr.length - 1][8] = 'TOTAL';
  pr[pr.length - 1][10] = { f: 'SUM(K2:K' + promo.length + 1 + ')', s: 'cur' };
  // (row index maths below is clearer than inline)
  pr[pr.length - 1][10] = { f: 'SUM(K2:K' + (promo.length + 1) + ')', s: 'cur' };
  sheets.push({ name: 'PROMO CODE REPORT', cols: PROMO_W, rows: pr });

  const dr = detailRows(byDate);
  const lastData = byDate.length + 1;
  const total = [], credit = [], balance = [];
  total[8] = 'TOTAL'; total[9] = { f: 'SUM(J2:J' + lastData + ')', s: 'cur' };
  credit[8] = 'CREDIT (for prepaid inventory)';
  credit[9] = opts.credit === undefined || opts.credit === null || opts.credit === ''
    ? null : { v: Number(opts.credit), s: 'cur' };
  balance[8] = 'BALANCE OWED TO UNITY PRINTING FROM FIRST COMMONWEALTH BANK';
  balance[9] = { f: 'J' + (lastData + 1) + '-J' + (lastData + 2), s: 'cur' };
  dr.push(total, credit, balance);
  sheets.push({ name: 'DETAIL REPORT', cols: DETAIL_W, rows: dr });

  const codes = [];
  promo.forEach((o) => { if (codes.indexOf(o.code) < 0) codes.push(o.code); });
  codes.sort((a, b) => (a.toUpperCase() < b.toUpperCase() ? -1 : 1));
  codes.forEach((code) => {
    const rows = promoRows(promo.filter((o) => o.code === code));
    const t = [];
    t[8] = 'TOTAL';
    t[10] = { f: 'SUM(K2:K' + (rows.length) + ')', s: 'cur' };
    rows.push(t);
    sheets.push({ name: sheetName(code), cols: PROMO_W, rows });
  });

  return makeXlsx(sheets);
}

// Tracking numbers run in sequence, so a gap means an order never reached FileMaker.
export function findGaps(orders) {
  const nums = orders.map((o) => {
    const m = /^([A-Za-z]+)(\d+)$/.exec(o.num || '');
    return m ? { prefix: m[1], n: Number(m[2]), width: m[2].length } : null;
  }).filter(Boolean);
  if (nums.length < 2) return [];
  const prefix = nums[0].prefix, width = nums[0].width;
  const have = new Set(nums.map((x) => x.n));
  const lo = Math.min(...have), hi = Math.max(...have);
  const gaps = [];
  for (let n = lo; n <= hi; n++) {
    if (!have.has(n)) gaps.push(prefix + String(n).padStart(width, '0'));
  }
  return gaps;
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const p = (n) => String(n).padStart(2, '0');
  const yy = p(y % 100);
  return p(m) + '.01.' + yy + ' - ' + p(m) + '.' + p(last) + '.' + yy;
}

export function fileName(ym) {
  return monthLabel(ym) + ' - FCB Online Store.xlsx';
}
