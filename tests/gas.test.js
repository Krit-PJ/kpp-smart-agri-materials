// ทดสอบ Code.gs (SheetStore + setup + API) กับ Google Sheets จำลอง: node tests/gas.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), crypto = require('crypto');
class Range { constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.d[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? '' : v); } o.push(row); } return o; }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { const R = this.r - 1 + i; this.sh.d[R] = this.sh.d[R] || [];
    if (typeof x === 'string' && x.startsWith("'")) x = x.slice(1);
    else if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !this.sh.text) x = new Date(x + 'T00:00:00+07:00');
    else if (typeof x === 'string' && /^\d+$/.test(x) && !this.sh.text) x = Number(x);
    this.sh.d[R][this.c - 1 + j] = x; })); return this; }
  setValue(x) { return this.setValues([[x]]); } setFontWeight() { return this; } setBackground() { return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) { const R = this.r - 1 + i; if (!this.sh.d[R]) continue; for (let j = 0; j < this.nc; j++) this.sh.d[R][this.c - 1 + j] = ''; } return this; }
  setNumberFormat() { this.sh.text = true; return this; } }
class Sheet { constructor(n) { this.n = n; this.d = []; }
  getRange(a, b, c, d) { if (typeof a === 'string') return new Range(this, 1, 1, 1000, 30); return new Range(this, a, b, c || 1, d || 1); }
  getLastRow() { let k = 0; this.d.forEach((r, i) => { if (r && r.some(x => x !== '' && x !== undefined)) k = i + 1; }); return k; }
  getLastColumn() { return Math.max(0, ...this.d.map(r => r ? r.length : 0)); } getMaxRows() { return 1000; }
  appendRow(r) { new Range(this, this.getLastRow() + 1, 1, 1, r.length).setValues([r]); }
  deleteRow(n) { this.d.splice(n - 1, 1); } setFrozenRows() { } setFrozenColumns() { } setColumnWidth() { } clear() { this.d = []; } }
const ss = { sheets: {}, getSheetByName(n) { return this.sheets[n] || null; }, insertSheet(n) { return this.sheets[n] = new Sheet(n); }, getSheets() { return Object.values(this.sheets); }, deleteSheet() { }, getUrl() { return 'url'; } };
const props = { SUPER_USERNAME: 'Krit', SUPER_PASSWORD: 'pw123456', SEASON_START: '2026-10-22' }, cache = {};
const ctx = { console, Date, Math, JSON, String, Number, Object, Array, Error, isFinite, unescape, encodeURIComponent,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
  Utilities: {
    formatDate: (d, tz, f) => { const b = new Date(d.getTime() + 7 * 3600e3), p = n => String(n).padStart(2, '0');
      const s = `${b.getUTCFullYear()}-${p(b.getUTCMonth() + 1)}-${p(b.getUTCDate())}`; return f === 'HH:mm:ss' ? `${p(b.getUTCHours())}:${p(b.getUTCMinutes())}:${p(b.getUTCSeconds())}` : f.length > 10 ? s + ` ${p(b.getUTCHours())}:${p(b.getUTCMinutes())}:${p(b.getUTCSeconds())}` : s; },
    computeDigest: (a, s) => [...crypto.createHash('sha256').update(s, 'utf8').digest()].map(b => b > 127 ? b - 256 : b),
    computeHmacSha256Signature: (s, k) => [...crypto.createHmac('sha256', k).update(s).digest()].map(b => b > 127 ? b - 256 : b),
    getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => props[k] = v, deleteProperty: k => delete props[k] }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => cache[k] = v }) },
  LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
  ContentService: { MimeType: { JSON: 'json', CSV: 'csv', JAVASCRIPT: 'js' }, createTextOutput: t => ({ t, setMimeType(m) { this.m = m; return this; } }) },
  Logger: { log() { } } };
vm.createContext(ctx);
const dir = path.join(__dirname, '..', 'apps-script');
vm.runInContext(fs.readFileSync(dir + '/KPP-AllInOne.gs', 'utf8'), ctx); // ไฟล์เดียวกับที่ติดตั้งในระบบจริง
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).t);
const AG_LEN = vm.runInContext('AG_ITEMS.length', ctx);
ctx.setup(); ctx.setup();
assert(!props.SUPER_PASSWORD, 'ลบรหัสผ่านออกจาก properties');
let r = JSON.parse(ctx.doGet({ parameter: { action: 'public.bootstrap' } }).t);
assert(r.ok, r.error); assert.strictEqual(r.data.districts.length, 11); assert.strictEqual(r.data.rounds.length, 27);
assert.strictEqual(r.data.rounds[1].start, '2026-10-22'); assert.strictEqual(r.data.rounds[1].open, true);
const su = post({ action: 'auth.login', username: 'krit', password: 'pw123456' }); assert(su.ok, su.error);
const reg = post({ action: 'auth.register', phone: '0812345678', name: 'สมชาย ใจดี', position: 'นวก.', district: 'D03' }); assert(reg.ok, reg.error);
assert.strictEqual(ss.sheets.Users.d[2][5], '0812345678', 'เบอร์โทรคง 0 นำหน้า');
const lg = post({ action: 'auth.login', phone: '0812345678' }); assert(lg.ok, lg.error);
let s = post({ action: 'data.save', token: lg.data.token, round: 1, district: 'D03', mode: 'submit', values: { R31: { v: 120.5 }, R32: { t: 'อัดฟาง', v: 40, u: 'ไร่' } }, sec4: [{ id: 'a1', t: 'กิจกรรม', v: 1, u: 'แห่ง' }], sec5: 'ไม่มี' });
assert(s.ok, s.error);
s = post({ action: 'data.save', token: lg.data.token, round: 1, district: 'D03', mode: 'submit', values: { R31: { v: 130 } } }); assert(s.ok, s.error);
assert.strictEqual(ss.sheets.Data.getLastRow(), 2, 'แทนที่แถวเดิม');
const recs = post({ action: 'data.records', token: su.data.token }); assert(recs.ok, recs.error);
assert.strictEqual(recs.data[0].values.R31.v, 130); assert.strictEqual(recs.data[0].status, 'submitted');
const u = post({ action: 'admin.users.create', token: su.data.token, role: 'mini', username: 'mini1', password: 'abcdef', name: 'มินิ ทดสอบ' }); assert(u.ok, u.error);
const del = post({ action: 'admin.users.delete', token: su.data.token, id: u.data.id }); assert(del.ok, del.error);
assert.strictEqual(ss.sheets.Users.getLastRow(), 3);
const logs = post({ action: 'admin.logs', token: su.data.token }); assert(logs.ok && logs.data.length >= 6, JSON.stringify(logs).slice(0, 200));
ctx.writeProvinceSummary(1); assert(ss.sheets['สรุปจังหวัด'].getLastRow() > 50);
// Data API ผ่าน GET (ชีต ApiKeys ถูกสร้างอัตโนมัติ)
delete ss.sheets.ApiKeys;
const get = q => ctx.doGet({ parameter: q });
let g = JSON.parse(get({ api: 'v1', endpoint: 'summary' }).t);
assert.strictEqual(g.ok, false); assert.strictEqual(g.code, 'key_required');
const k = post({ action: 'admin.apikeys.create', token: su.data.token, label: 'ทดสอบ' }); assert(k.ok, k.error);
assert(ss.sheets.ApiKeys, 'สร้างชีต ApiKeys อัตโนมัติ');
g = JSON.parse(get({ api: 'v1', endpoint: 'summary', key: k.data.key, round: '1' }).t);
assert(g.ok, g.error); assert.strictEqual(g.data.items.find(i => i.id === 'R31').cumulative, 130);
const csv = get({ api: 'v1', endpoint: 'districts', key: k.data.key, round: '1', format: 'csv' });
assert.strictEqual(csv.m, 'csv'); assert(csv.t.includes('D03,คลองลาน,submitted,R31,ไร่,130,130'));
const jp = get({ api: 'v1', endpoint: 'meta', key: k.data.key, callback: 'show' });
assert.strictEqual(jp.m, 'js'); assert(jp.t.startsWith('show({"ok":true'));
assert.strictEqual(JSON.parse(get({ api: 'v2', endpoint: 'meta', key: k.data.key }).t).code, 'bad_version');
console.log('✓ Apps Script tests passed');

// ระบบที่ติดตั้งก่อนเวอร์ชันนี้ (ไม่มีชีต Items): สร้างชีตอัตโนมัติ
delete ss.sheets.Items;
let pc = JSON.parse(get({ action: 'public.bootstrap' }).t); assert(pc.ok && pc.data.items === null, 'ไม่มีชีต Items = แบบฟอร์มต้นฉบับ');
assert(ss.sheets.Items, 'สร้างชีต Items อัตโนมัติ');
// แก้ไขแบบฟอร์มผ่าน Apps Script: เขียนชีต Items ครั้งเดียว (replaceAll) และคอลัมน์ข้อใหม่ในชีต Data
let fi = post({ action: 'admin.items.get', token: su.data.token }); assert(fi.ok, fi.error);
const L2 = fi.data.items.slice(); L2.splice(L2.findIndex(i => i.id === 'R32') + 1, 0, { label: 'อัดฟางก้อน', type: 'num', unit: 'ตัน', code: '2.2', level: 2 });
fi = post({ action: 'admin.items.save', token: su.data.token, items: L2 }); assert(fi.ok, fi.error);
assert.strictEqual(ss.sheets.Items.getLastRow(), AG_LEN + 2);
s = post({ action: 'data.save', token: lg.data.token, round: 1, district: 'D03', mode: 'submit', values: { R31: { v: 130 }, N1: { v: 9 } } }); assert(s.ok, s.error);
assert(ss.sheets.Data.d[0].includes('N1_v'), 'เพิ่มคอลัมน์ N1_v ในชีต Data');
const recs2 = post({ action: 'data.records', token: su.data.token }); assert.strictEqual(recs2.data[0].values.N1.v, 9);
pc = JSON.parse(get({ action: 'public.bootstrap' }).t); assert.strictEqual(pc.data.items.find(i => i.id === 'N1').unit, 'ตัน');
ctx.writeProvinceSummary(1); assert(ss.sheets['สรุปจังหวัด'].d.some(r => r && r[1] === '- อัดฟางก้อน'), 'สรุปจังหวัดใช้แบบฟอร์มที่แก้ไข');
fi = post({ action: 'admin.items.reset', token: su.data.token }); assert(fi.ok, fi.error);
assert(fi.data.items.find(i => i.id === 'N1').retired, 'คืนค่าแล้วคงข้อที่มีข้อมูลไว้แบบยกเลิกใช้');
console.log('✓ Apps Script editable form tests passed');
