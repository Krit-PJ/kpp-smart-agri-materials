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
  ContentService: { MimeType: { JSON: 1 }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
  Logger: { log() { } } };
vm.createContext(ctx);
const dir = path.join(__dirname, '..', 'apps-script');
vm.runInContext(fs.readFileSync(dir + '/Lib.gs', 'utf8') + '\n' + fs.readFileSync(dir + '/Code.gs', 'utf8'), ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).t);
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
console.log('✓ Apps Script tests passed');
