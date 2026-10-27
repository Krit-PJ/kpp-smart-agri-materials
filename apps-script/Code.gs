/**
 * KPP Smart Agri-Materials — Backend (Google Apps Script + Google Sheets)
 * ระบบรายงานการจัดการเศษวัสดุทางการเกษตร แบบสะสมรายสัปดาห์ จังหวัดกำแพงเพชร
 *
 * ไฟล์ในโปรเจกต์ Apps Script
 *   Code.gs  — ไฟล์นี้: เชื่อม Google Sheets (SheetStore), Web API, setup
 *   Lib.gs   — รายการตัวชี้วัด + ตรรกะยอดสะสม + กฎของระบบ (สร้างจาก docs/assets/js ด้วย tools/build-gs.js)
 *
 * การทำให้ใช้งานได้: Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone
 */

/** ID ของ Google Sheet ที่ใช้เป็นฐานข้อมูล (เว้นว่างได้ถ้าสคริปต์ผูกกับชีตโดยตรง) */
var SHEET_ID = '1MjD6vY_FDOiS_EiaMhWEDbcnWNwJfzmTACsTmoHVnis';

/* ═════════════════════════ Web API ═════════════════════════ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.action) return json_({ ok: true, data: { service: 'KPP Smart Agri-Materials API', time: new Date().toISOString() } });
  if (p.action !== 'public.bootstrap' && p.action !== 'public.summary') return json_({ ok: false, error: 'ใช้ POST สำหรับคำสั่งนี้' });
  return run_(p.action, {});
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }); }
  return run_(body.action, body);
}

function run_(action, payload) {
  try {
    var server = AGServer.create(new SheetStore_(), AG_ITEMS);
    return json_({ ok: true, data: server.handle(action, payload) });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err), code: err && err.code || 'error' });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ═════════════════════════ SheetStore ═════════════════════════ */

function ss_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }

/** ที่เก็บข้อมูลบน Google Sheets: 1 ชีต = 1 ตาราง, แถวที่ 1 = ชื่อคอลัมน์ */
function SheetStore_() {
  this.ss = ss_();
  this.tables = {};
}
SheetStore_.prototype.sheet_ = function (name) {
  var sh = this.ss.getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต "' + name + '" — กรุณารันฟังก์ชัน setup ก่อน');
  return sh;
};
SheetStore_.prototype.table_ = function (name) {
  if (this.tables[name]) return this.tables[name];
  var sh = this.sheet_(name), lr = sh.getLastRow(), lc = sh.getLastColumn();
  var header = lc ? sh.getRange(1, 1, 1, lc).getValues()[0].map(String) : [];
  var data = lr > 1 && lc ? sh.getRange(2, 1, lr - 1, lc).getValues() : [];
  var rows = data.map(function (r, i) {
    var o = { __row: i + 2 };
    header.forEach(function (h, j) { if (h) o[h] = cell_(r[j]); });
    return o;
  });
  return (this.tables[name] = { sh: sh, header: header, rows: rows });
};
function cell_(v) {
  if (v instanceof Date) {
    var t = Utilities.formatDate(v, 'Asia/Bangkok', 'HH:mm:ss');
    return Utilities.formatDate(v, 'Asia/Bangkok', 'yyyy-MM-dd') + (t === '00:00:00' ? '' : ' ' + t);
  }
  return v;
}
function strip_(o) { var c = {}; for (var k in o) if (k !== '__row') c[k] = o[k]; return c; }
SheetStore_.prototype.ensureCols_ = function (t, obj) {
  var add = Object.keys(obj).filter(function (k) { return k !== '__row' && t.header.indexOf(k) < 0; });
  if (!add.length) return;
  t.sh.getRange(1, t.header.length + 1, 1, add.length).setValues([add]).setFontWeight('bold');
  t.header = t.header.concat(add);
};
SheetStore_.prototype.toRow_ = function (t, obj) {
  return t.header.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'string' && /^0\d+$/.test(v)) return "'" + v; // คงเลข 0 นำหน้า (เบอร์โทร)
    return v;
  });
};
SheetStore_.prototype.rows = function (name) { return this.table_(name).rows.map(strip_); };
SheetStore_.prototype.insert = function (name, obj) {
  var t = this.table_(name);
  this.ensureCols_(t, obj);
  var row = this.toRow_(t, obj);
  t.sh.appendRow(row);
  var o = strip_(obj); o.__row = t.sh.getLastRow();
  t.rows.push(o);
};
SheetStore_.prototype.update = function (name, pred, patch) {
  var t = this.table_(name), self = this, n = 0;
  this.ensureCols_(t, patch);
  t.rows.forEach(function (r) {
    if (!pred(strip_(r))) return;
    for (var k in patch) r[k] = patch[k];
    t.sh.getRange(r.__row, 1, 1, t.header.length).setValues([self.toRow_(t, r)]);
    n++;
  });
  return n;
};
SheetStore_.prototype.remove = function (name, pred) {
  var t = this.table_(name);
  var hit = t.rows.filter(function (r) { return pred(strip_(r)); }).map(function (r) { return r.__row; }).sort(function (a, b) { return b - a; });
  hit.forEach(function (rn) { t.sh.deleteRow(rn); });
  delete this.tables[name];
  return hit.length;
};
SheetStore_.prototype.now = function () { return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'); };
SheetStore_.prototype.today = function () { return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'); };
SheetStore_.prototype.sha256 = function (s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); };
SheetStore_.prototype.hmac = function (s) { return hex_(Utilities.computeHmacSha256Signature(s, secret_())); };
SheetStore_.prototype.uuid = function () { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); };
SheetStore_.prototype.cacheGet = function (k) { return CacheService.getScriptCache().get(k); };
SheetStore_.prototype.cachePut = function (k, v, sec) { CacheService.getScriptCache().put(k, String(v), sec); };
SheetStore_.prototype.lock = function (fn) {
  var l = LockService.getScriptLock();
  l.waitLock(25000);
  try { this.tables = {}; return fn(); } finally { l.releaseLock(); }
};
function hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function secret_() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('TOKEN_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('TOKEN_SECRET', s); }
  return s;
}

/* ═════════════════════════ ติดตั้ง / ดูแลระบบ ═════════════════════════ */

/**
 * สร้างชีตและข้อมูลตั้งต้น (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
 * สร้าง Super Admin คนแรก: ตั้ง Script Properties ชื่อ SUPER_USERNAME และ SUPER_PASSWORD ก่อนรัน
 * (Project Settings → Script Properties) ระบบจะลบ SUPER_PASSWORD ทิ้งหลังสร้างบัญชี
 */
function setup() {
  var ss = ss_();
  var cols = AGServer.COLS, T = AGServer.T;
  var defs = {};
  defs[T.SETTINGS] = cols.Settings;
  defs[T.DISTRICTS] = cols.Districts;
  defs[T.USERS] = cols.Users;
  defs[T.ROUNDS] = cols.Rounds;
  defs[T.DATA] = AGServer.dataColumns(AG_ITEMS);
  defs[T.LOG] = cols.AccessLog;
  Object.keys(defs).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var lc = sh.getLastColumn();
    var have = lc ? sh.getRange(1, 1, 1, lc).getValues()[0].map(String) : [];
    var add = defs[name].filter(function (c) { return have.indexOf(c) < 0; });
    if (add.length) sh.getRange(1, have.length + 1, 1, add.length).setValues([add]);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#dafbe1');
    sh.setFrozenRows(1);
  });
  // คอลัมน์ข้อความ (กันเบอร์โทร/วันที่ถูกแปลงรูปแบบ)
  ss.getSheetByName(T.USERS).getRange('A:Q').setNumberFormat('@');
  ss.getSheetByName(T.ROUNDS).getRange('B:E').setNumberFormat('@');
  ss.getSheetByName(T.LOG).getRange('A:I').setNumberFormat('@');
  ss.getSheetByName(T.DATA).getRange(1, 1, ss.getSheetByName(T.DATA).getMaxRows(), AGServer.COLS.DataMeta.length).setNumberFormat('@');
  ss.getSheetByName(T.DATA).setFrozenColumns(3);
  ss.getSheetByName(T.SETTINGS).getRange('B:B').setNumberFormat('@');

  var props = PropertiesService.getScriptProperties();
  var su = props.getProperty('SUPER_USERNAME'), sp = props.getProperty('SUPER_PASSWORD');
  var store = new SheetStore_();
  AGServer.create(store, AG_ITEMS).seed({
    start: props.getProperty('SEASON_START') || store.today(), count: 26, openFirst: 1,
    superUser: su && sp ? { username: su, password: sp, name: props.getProperty('SUPER_NAME') || 'Super Admin' } : null
  });
  if (sp) props.deleteProperty('SUPER_PASSWORD');
  secret_();
  ['Sheet1', 'ชีต1', 'แผ่น1'].forEach(function (n) { var s = ss.getSheetByName(n); if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s); });
  Logger.log('ตั้งค่าเสร็จ: ' + ss.getUrl());
}

/** สรุปยอดสะสมระดับจังหวัดลงชีต "สรุปจังหวัด" — round = ครั้งที่ */
function writeProvinceSummary(round) {
  round = Number(round) || 1;
  var store = new SheetStore_();
  var server = AGServer.create(store, AG_ITEMS);
  var boot = server.handle('public.bootstrap', {});
  var p = AGCore.computeProvince(AG_ITEMS, server.records(), boot.districts, round);
  var ss = ss_(), sh = ss.getSheetByName('สรุปจังหวัด') || ss.insertSheet('สรุปจังหวัด');
  sh.clear();
  var head = ['ข้อ', 'มาตรการ', 'หน่วยนับ', 'รวม (ครั้งนี้)', 'รวมสะสม'].concat(boot.districts.map(function (d) { return d.name; }));
  var out = [head];
  AG_ITEMS.forEach(function (it) {
    if (it.type === 'header') { out.push([it.code, it.printLabel].concat(new Array(head.length - 2).fill(''))); return; }
    var x = p.items[it.id];
    out.push([it.code, it.printLabel, x.unit, x.week === null ? '' : x.week, x.cum === null ? '' : x.cum]
      .concat(boot.districts.map(function (d) { var c = x.byDistrict[d.code].cum; return c === null ? '' : c; })));
  });
  sh.getRange(1, 1).setValue('สรุปยอดสะสมระดับจังหวัด ณ ครั้งที่ ' + round + ' (ส่งแล้ว ' + p.reported.length + '/' + boot.districts.length + ' อำเภอ)').setFontWeight('bold');
  sh.getRange(2, 1, out.length, head.length).setValues(out);
  sh.getRange(2, 1, 1, head.length).setFontWeight('bold').setBackground('#dafbe1');
  sh.setFrozenRows(2);
  sh.setColumnWidth(2, 460);
}
