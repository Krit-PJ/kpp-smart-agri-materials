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


/**
 * Lib.gs — สร้างอัตโนมัติจาก docs/assets/js/{items,core,server}.js (ห้ามแก้ไขไฟล์นี้โดยตรง)
 * รันคำสั่ง: node tools/build-gs.js
 */

/* ───────── items.js ───────── */
/* รายการตัวชี้วัดตามแบบฟอร์ม (สร้างจาก template.xlsx) — row = แถวในไฟล์ Excel */
var AG_ITEMS = [
{"id":"R6","row":6,"section":"1","code":"","label":"1. การเตรียมความพร้อม","printLabel":"1. การเตรียมความพร้อม","unit":"","type":"header","agg":"sum","level":0,"print":"section","h":24.75},
{"id":"R7","row":7,"section":"1","code":"1.1","label":"มีการเฝ้าระวัง ติดตาม และประเมินสถานการณ์ที่ส่งผลต่อการเกิดปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5)","printLabel":"มีการเฝ้าระวัง ติดตาม และประเมินสถานการณ์ที่ส่งผลต่อการเกิดปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5)","unit":"","type":"header","agg":"sum","level":1,"print":"gray","h":24.75},
{"id":"R8","row":8,"section":"1","code":"1.1","label":"จัดชุดเวรปฏิบัติการ เพื่อเฝ้าระวัง ติดตามสถานการณ์ฯ ประจำวัน","printLabel":"- จัดชุดเวรปฏิบัติการ เพื่อเฝ้าระวัง ติดตามสถานการณ์ฯ ประจำวัน","unit":"","type":"check","agg":"sum","level":2,"print":"gray","h":24.75},
{"id":"R9","row":9,"section":"1","code":"1.1","label":"จัดทำข้อมูลสถานการณ์ประจำวัน อาทิ ข้อมูลคุณภาพอากาศ ข้อมูลจุดความร้อน พื้นที่เผาไหม้ สถานการณ์ไฟป่า เป็นต้น","printLabel":"- จัดทำข้อมูลสถานการณ์ประจำวัน อาทิ ข้อมูลคุณภาพอากาศ ข้อมูลจุดความร้อน พื้นที่เผาไหม้ สถานการณ์ไฟป่า เป็นต้น","unit":"","type":"check","agg":"sum","level":2,"print":"gray","h":24.75},
{"id":"R10","row":10,"section":"1","code":"1.1","label":"มีการจัดตั้งคณะกรรมการ/คณะอนุกรรมการ/คณะทำงาน ทำหน้าที่เกี่ยวกับการเฝ้าระวัง ติดตาม และประเมินสถานการณ์ไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5)","printLabel":"- มีการจัดตั้งคณะกรรมการ/คณะอนุกรรมการ/คณะทำงาน ทำหน้าที่เกี่ยวกับการเฝ้าระวัง ติดตาม และประเมินสถานการณ์ไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5)","unit":"","type":"check","agg":"sum","level":2,"print":"gray","h":64.8},
{"id":"R11","row":11,"section":"1","code":"1.1","label":"จัดการประชุมกองอำนวยการป้องกันและบรรเทาสาธารณภัยจังหวัด/คณะกรรมการ/คณะอนุกรรมการ/คณะทำงานที่เกี่ยวข้อง เพื่อติดตามสถานการณ์ วิเคราะห์ข้อมูล ประเมินสถานการณ์ และเสนอแนวทางการป้องกันและแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5)","printLabel":"- จัดการประชุมกองอำนวยการป้องกันและบรรเทาสาธารณภัยจังหวัด/คณะกรรมการ/คณะอนุกรรมการ/คณะทำงานที่เกี่ยวข้อง \nเพื่อติดตามสถานการณ์ วิเคราะห์ข้อมูล ประเมินสถานการณ์ และเสนอแนวทางการป้องกันและแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5)","unit":"ครั้ง","type":"num","agg":"sum","level":2,"print":"","h":102.0},
{"id":"R12","row":12,"section":"1","code":"1.1","label":"ร่วมประชุมกับศูนย์ปฏิบัติการฯ/คณะกรรมการ/คณะทำงาน/หน่วยงานที่เกี่ยวข้อง ในการป้องกันและแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5) อาทิ ศูนย์ปฏิบัติการแก้ไขปัญหาไฟป่าและหมอกควันระดับภาค ฯลฯ","printLabel":"- ร่วมประชุมกับศูนย์ปฏิบัติการฯ/คณะกรรมการ/คณะทำงาน/หน่วยงานที่เกี่ยวข้อง ในการป้องกันและแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5) อาทิ ศูนย์ปฏิบัติการแก้ไขปัญหาไฟป่าและหมอกควันระดับภาค ฯลฯ","unit":"ครั้ง","type":"num","agg":"sum","level":2,"print":"","h":64.8},
{"id":"R13","row":13,"section":"1","code":"1.2","label":"มีการแจ้งข้อมูล/แจ้งเตือน ให้ประชาชนได้ทราบเกี่ยวกับสถานการณ์/ผลกระทบ/แนวทางการปฏิบัติตน ผ่านช่องทางต่าง ๆ อาทิ หนังสือราชการ ประกาศแจ้งเตือน ช่องทางไลน์ สื่อสังคมออนไลน์ หอกระจายข่าว ระบบ cell broadcast ฯลฯ","printLabel":"มีการแจ้งข้อมูล/แจ้งเตือน ให้ประชาชนได้ทราบเกี่ยวกับสถานการณ์/ผลกระทบ/แนวทางการปฏิบัติตน ผ่านช่องทางต่าง ๆ อาทิ หนังสือราชการ ประกาศแจ้งเตือน ช่องทางไลน์ สื่อสังคมออนไลน์ หอกระจายข่าว ระบบ cell broadcast ฯลฯ","unit":"ครั้ง","type":"num","agg":"sum","level":1,"print":"","h":61.2},
{"id":"R14","row":14,"section":"1","code":"1.3","label":"จัดทำแผนเผชิญเหตุ/แผนปฏิบัติการ ในการป้องกันและแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5) จังหวัด","printLabel":"จัดทำแผนเผชิญเหตุ/แผนปฏิบัติการ ในการป้องกันและแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5) จังหวัด","unit":"","type":"check","agg":"sum","level":1,"print":"gray","h":24.75},
{"id":"R15","row":15,"section":"1","code":"1.4","label":"เตรียมความพร้อมกำลังเจ้าหน้าที่ อาสาสมัคร ประชาชนจิตอาสา เพื่อร่วมปฏิบัติภารกิจในการป้องกัและแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5) อาทิ การแจ้งเตือน การลาดตะเวน ป้องปรามการลักลอบเผาการดับไฟป่า ฯลฯ","printLabel":"เตรียมความพร้อมกำลังเจ้าหน้าที่ อาสาสมัคร ประชาชนจิตอาสา เพื่อร่วมปฏิบัติภารกิจในการป้องกัและแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5) อาทิ การแจ้งเตือน การลาดตะเวน ป้องปรามการลักลอบเผาการดับไฟป่า ฯลฯ","unit":"","type":"header","agg":"sum","level":1,"print":"gray","h":85.2},
{"id":"R16","row":16,"section":"1","code":"1.4","label":"กำลังเจ้าหน้าที่หน่วยงานภาครัฐ","printLabel":"- กำลังเจ้าหน้าที่หน่วยงานภาครัฐ","unit":"คน","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R17","row":17,"section":"1","code":"1.4","label":"ประชาชนจิตอาสา","printLabel":"- ประชาชนจิตอาสา","unit":"คน","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R18","row":18,"section":"1","code":"1.4","label":"อาสาสมัครอื่น ๆ อาทิ อาสาสมัครท้องถิ่นรักษ์โลก (อถล.) อปพร. อส.อส.","printLabel":"- อาสาสมัครอื่น ๆ อาทิ อาสาสมัครท้องถิ่นรักษ์โลก (อถล.) อปพร. อส.อส.","unit":"คน","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R19","row":19,"section":"1","code":"1.5","label":"จัดตั้งจุดเฝ้าระวัง/จุดตรวจ/จุดสกัด","printLabel":"จัดตั้งจุดเฝ้าระวัง/จุดตรวจ/จุดสกัด","unit":"จุด","type":"num","agg":"sum","level":1,"print":"","h":24.75},
{"id":"R20","row":20,"section":"1","code":"1.6","label":"รณรงค์ ประชาสัมพันธ์ เพื่อสร้างการรับรู้ให้กับประชาชน อาทิ จัดกิจกรรม Kick off การเคาะประตูบ้าน ฯลฯ","printLabel":"รณรงค์ ประชาสัมพันธ์ เพื่อสร้างการรับรู้ให้กับประชาชน อาทิ จัดกิจกรรม Kick off การเคาะประตูบ้าน ฯลฯ","unit":"ครั้ง","type":"num","agg":"sum","level":1,"print":"","h":24.75},
{"id":"R21","row":21,"section":"1","code":"1.7","label":"มีการจัดทำ MOU/กำหนดกฎกติกา/ข้อตกลงร่วมกันของประชาชนในชุมชน หรือระหว่างหน่วยงานในพื้นที่ เพื่อแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5)","printLabel":"มีการจัดทำ MOU/กำหนดกฎกติกา/ข้อตกลงร่วมกันของประชาชนในชุมชน หรือระหว่างหน่วยงานในพื้นที่\nเพื่อแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5)","unit":"","type":"check","agg":"sum","level":1,"print":"gray","h":64.8},
{"id":"R22","row":22,"section":"2","code":"","label":"2. การเพิ่มประสิทธิภาพการบริหารจัดการเชิงพื้นที่","printLabel":"2. การเพิ่มประสิทธิภาพการบริหารจัดการเชิงพื้นที่","unit":"","type":"header","agg":"sum","level":0,"print":"section","h":24.75},
{"id":"R23","row":23,"section":"2","code":"2.1","label":"พื้นที่ป่า","printLabel":"พื้นที่ป่า","unit":"","type":"header","agg":"sum","level":1,"print":"band","h":24.75},
{"id":"R24","row":24,"section":"2","code":"2.1","label":"ออกประกาศในการจำกัดการเข้าถึงพื้นที่ป่า","printLabel":"- ออกประกาศในการจำกัดการเข้าถึงพื้นที่ป่า","unit":"ฉบับ","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R25","row":25,"section":"2","code":"2.1","label":"ลาดตระเวนดับไฟป่า","printLabel":"- ลาดตระเวนดับไฟป่า","unit":"ครั้ง","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R26","row":26,"section":"2","code":"2.1","label":"จัดทำแนวกันไฟ ลดปริมาณเชื้อเพลิง","printLabel":"- จัดทำแนวกันไฟ ลดปริมาณเชื้อเพลิง","unit":"กิโลเมตร","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R27","row":27,"section":"2","code":"2.1","label":"การดำเนินการอื่น ๆ (ถ้ามี) โปรดระบุ","printLabel":"- การดำเนินการอื่น ๆ (ถ้ามี) โปรดระบุ...........","unit":"","type":"other","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R28","row":28,"section":"2","code":"2.2","label":"พื้นที่เกษตร","printLabel":"พื้นที่เกษตร","unit":"","type":"header","agg":"sum","level":1,"print":"band","h":24.75},
{"id":"R29","row":29,"section":"2","code":"2.2","label":"ส่งเสริมการนำเศษวัสดุเหลือใช้ทางการเกษตรไปแปรรูปหรือเพิ่มมูลค่าแทนการเผา อาทิ การจัดอบรมให้ความรู้ การประชาสัมพันธ์สร้างการรับรู้ให้แก่เกษตรกรในพื้นที่ ฯลฯ","printLabel":"- ส่งเสริมการนำเศษวัสดุเหลือใช้ทางการเกษตรไปแปรรูปหรือเพิ่มมูลค่าแทนการเผา อาทิ การจัดอบรมให้ความรู้ \nการประชาสัมพันธ์สร้างการรับรู้ให้แก่เกษตรกรในพื้นที่ ฯลฯ","unit":"ครั้ง","type":"num","agg":"sum","level":2,"print":"","h":61.2},
{"id":"R30","row":30,"section":"2","code":"2.2","label":"ทำการแปรรูปวัสดุการเกษตรเพื่อเพิ่มมูลค่า (เช่น การทำสารชีวมวล ปุ๋ย การทำอาหารสัตว์ หรืออื่น ๆ)","printLabel":"- ทำการแปรรูปวัสดุการเกษตรเพื่อเพิ่มมูลค่า \n(เช่น การทำสารชีวมวล ปุ๋ย การทำอาหารสัตว์ หรืออื่น ๆ)","unit":"หมู่บ้าน/ชุมชน","type":"num","agg":"sum","level":2,"print":"","h":40.8},
{"id":"R31","row":31,"section":"2","code":"2.2","label":"ไถกลบตอซัง/การใช้สารย่อยสลาย","printLabel":"- ไถกลบตอซัง/การใช้สารย่อยสลาย","unit":"ไร่","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R32","row":32,"section":"2","code":"2.2","label":"การดำเนินการอื่น ๆ (ถ้ามี) โปรดระบุ","printLabel":"- การดำเนินการอื่น ๆ (ถ้ามี) โปรดระบุ...........","unit":"","type":"other","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R33","row":33,"section":"2","code":"2.3","label":"พื้นที่ชุมชน/ในเขตเมือง","printLabel":"พื้นที่ชุมชน/ในเขตเมือง","unit":"","type":"header","agg":"sum","level":1,"print":"band","h":24.75},
{"id":"R34","row":34,"section":"2","code":"2.3","label":"ตรวจจับรถควันดำ","printLabel":"- ตรวจจับรถควันดำ","unit":"คัน","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R35","row":35,"section":"2","code":"2.3","label":"มีคำสั่งห้ามใช้รถที่มีควันดำเกินมาตรฐาน","printLabel":"- มีคำสั่งห้ามใช้รถที่มีควันดำเกินมาตรฐาน","unit":"คัน","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R36","row":36,"section":"2","code":"2.3","label":"ฉีดล้างทำความสะอาดถนน","printLabel":"- ฉีดล้างทำความสะอาดถนน","unit":"ครั้ง","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R37","row":37,"section":"2","code":"2.3","label":"ตรวจสอบโรงงานอุตสาหกรรม","printLabel":"- ตรวจสอบโรงงานอุตสาหกรรม","unit":"แห่ง","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R38","row":38,"section":"2","code":"2.3","label":"ตรวจสอบโครงการก่อสร้างต่าง ๆ","printLabel":"- ตรวจสอบโครงการก่อสร้างต่าง ๆ","unit":"แห่ง","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R39","row":39,"section":"2","code":"2.3","label":"ควบคุมการเผาในพื้นที่ทางหลวง/ถนนอื่น ๆ อาทิ การตัดหญ้า ฝังกลบขยะ","printLabel":"- ควบคุมการเผาในพื้นที่ทางหลวง/ถนนอื่น ๆ อาทิ การตัดหญ้า ฝังกลบขยะ","unit":"กิโลเมตร","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R40","row":40,"section":"2","code":"2.3","label":"การดำเนินการอื่น ๆ (ถ้ามี) โปรดระบุ","printLabel":"- การดำเนินการอื่น ๆ (ถ้ามี) โปรดระบุ...........","unit":"","type":"other","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R41","row":41,"section":"3","code":"","label":"3. การเผชิญเหตุและการบริหารจัดการภาพรวม","printLabel":"3. การเผชิญเหตุและการบริหารจัดการภาพรวม","unit":"","type":"header","agg":"sum","level":0,"print":"section","h":24.75},
{"id":"R42","row":42,"section":"3","code":"3.1","label":"จัดตั้งศูนย์บัญชาการเหตุการณ์ระดับจังหวัด","printLabel":"- จัดตั้งศูนย์บัญชาการเหตุการณ์ระดับจังหวัด","unit":"","type":"check","agg":"sum","level":1,"print":"gray","h":24.75},
{"id":"R43","row":43,"section":"3","code":"3.1","label":"ประชุมศูนย์บัญชาการเหตุการณ์จังหวัด","printLabel":"- ประชุมศูนย์บัญชาการเหตุการณ์จังหวัด","unit":"ครั้ง","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R44","row":44,"section":"3","code":"3.1","label":"จัดตั้งศูนย์บัญชาการเหตุการณ์ระดับอำเภอ","printLabel":"- จัดตั้งศูนย์บัญชาการเหตุการณ์ระดับอำเภอ","unit":"แห่ง","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R45","row":45,"section":"3","code":"3.1","label":"ประชุมศูนย์บัญชาการเหตุการณ์อำเภอ","printLabel":"- ประชุมศูนย์บัญชาการเหตุการณ์อำเภอ","unit":"ครั้ง","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R46","row":46,"section":"3","code":"3.1","label":"จัดตั้งศูนย์ปฏิบัติการฉุกเฉินท้องถิ่น","printLabel":"- จัดตั้งศูนย์ปฏิบัติการฉุกเฉินท้องถิ่น","unit":"แห่ง","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R47","row":47,"section":"3","code":"3.1","label":"ประชุมศูนย์ปฏิบัติการฉุกเฉินท้องถิ่น","printLabel":"- ประชุมศูนย์ปฏิบัติการฉุกเฉินท้องถิ่น","unit":"ครั้ง","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R48","row":48,"section":"3","code":"3.2","label":"ประกาศจังหวัด","printLabel":"ประกาศจังหวัด","unit":"","type":"header","agg":"sum","level":1,"print":"gray","h":24.75},
{"id":"R49","row":49,"section":"3","code":"3.2","label":"กำหนดเขตควบคุมการเผา/ห้ามเผา","printLabel":"- กำหนดเขตควบคุมการเผา/ห้ามเผา","unit":"ฉบับ","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R50","row":50,"section":"3","code":"3.2","label":"ประกาศพื้นที่ประสบสาธารณภัย/ประกาศเขตการให้ความช่วยเหลือผู้ประสบภัยพิบัติกรณีฉุกเฉิน (กรณีอัคคีภัย ไฟป่า)","printLabel":"- ประกาศพื้นที่ประสบสาธารณภัย/ประกาศเขตการให้ความช่วยเหลือผู้ประสบภัยพิบัติกรณีฉุกเฉิน (กรณีอัคคีภัย ไฟป่า)","unit":"ฉบับ","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R51","row":51,"section":"3","code":"3.2","label":"ประกาศพื้นที่ประสบสาธารณภัย/ประกาศเขตการให้ความช่วยเหลือผู้ประสบภัยพิบัติกรณีฉุกเฉิน (กรณีฝุ่นละอองขนาดเล็ก (PM2.5))","printLabel":"- ประกาศพื้นที่ประสบสาธารณภัย/ประกาศเขตการให้ความช่วยเหลือผู้ประสบภัยพิบัติกรณีฉุกเฉิน \n(กรณีฝุ่นละอองขนาดเล็ก (PM2.5))","unit":"ฉบับ","type":"num","agg":"sum","level":2,"print":"","h":64.8},
{"id":"R52","row":52,"section":"3","code":"3.2","label":"ประกาศใช้มาตรการทำงานที่บ้าน (Work From Home)","printLabel":"- ประกาศใช้มาตรการทำงานที่บ้าน (Work From Home)","unit":"ฉบับ","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R53","row":53,"section":"3","code":"3.2","label":"ประกาศเรื่องอื่น ๆ ที่เกี่ยวข้อง อาทิ ประกาศกำหนดมาตรการดำเนินงาน ประกาศวาระจังหวัด","printLabel":"- ประกาศเรื่องอื่น ๆ ที่เกี่ยวข้อง อาทิ ประกาศกำหนดมาตรการดำเนินงาน ประกาศวาระจังหวัด","unit":"ฉบับ","type":"num","agg":"sum","level":2,"print":"","h":24.75},
{"id":"R54","row":54,"section":"3","code":"3.3","label":"มีข้อสั่งการจังหวัด ให้อำเภอ อปท. และหน่วยงานที่เกี่ยวข้อง ดำเนินการเกี่ยวกับการป้องกันและแก้ไขปัญหาไฟป่าหมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5)","printLabel":"มีข้อสั่งการจังหวัด ให้อำเภอ อปท. และหน่วยงานที่เกี่ยวข้อง ดำเนินการเกี่ยวกับการป้องกันและแก้ไขปัญหาไฟป่าหมอกควัน\nและฝุ่นละอองขนาดเล็ก (PM2.5)","unit":"ครั้ง","type":"num","agg":"sum","level":1,"print":"","h":64.8},
{"id":"R55","row":55,"section":"3","code":"3.4","label":"จับกุมผู้กระทำผิด ทั้งที่ดำเนินคดีหรือทำการปรับ (กรณีเผา)","printLabel":"จับกุมผู้กระทำผิด ทั้งที่ดำเนินคดีหรือทำการปรับ (กรณีเผา)","unit":"คน","type":"num","agg":"sum","level":1,"print":"","h":24.75},
{"id":"R56","row":56,"section":"3","code":"3.5","label":"กำหนดพื้นที่ปลอดภัย (Safety Zone) หรือห้องปลอดฝุ่น","printLabel":"- กำหนดพื้นที่ปลอดภัย (Safety Zone) หรือห้องปลอดฝุ่น","unit":"แห่ง","type":"num","agg":"sum","level":1,"print":"","h":24.75},
{"id":"R57","row":57,"section":"3","code":"3.5","label":"เปิดให้บริการ (ณ ครั้งที่รายงาน)","printLabel":"- เปิดให้บริการ (ณ ครั้งที่รายงาน)","unit":"แห่ง","type":"num","agg":"latest","level":2,"print":"","h":24.75},
{"id":"R58","row":58,"section":"3","code":"3.6","label":"กำหนดจัดตั้งคลินิกมลพิษ","printLabel":"- กำหนดจัดตั้งคลินิกมลพิษ","unit":"แห่ง","type":"num","agg":"sum","level":1,"print":"","h":24.75},
{"id":"R59","row":59,"section":"3","code":"3.6","label":"เปิดให้บริการ (ณ ครั้งที่รายงาน)","printLabel":"- เปิดให้บริการ (ณ ครั้งที่รายงาน)","unit":"แห่ง","type":"num","agg":"latest","level":2,"print":"","h":24.75},
{"id":"R60","row":60,"section":"3","code":"3.7","label":"จัดหน่วยบริหารด้านสาธารณสุขลงพื้นที่ เพื่อให้คำแนะนำ/ดูแลสุขภาพประชาชน","printLabel":"จัดหน่วยบริหารด้านสาธารณสุขลงพื้นที่ เพื่อให้คำแนะนำ/ดูแลสุขภาพประชาชน","unit":"ครั้ง","type":"num","agg":"sum","level":1,"print":"","h":24.75},
{"id":"R61","row":61,"section":"3","code":"3.8","label":"แจกจ่ายหน้ากากอนามัย","printLabel":"แจกจ่ายหน้ากากอนามัย","unit":"ชิ้น","type":"num","agg":"sum","level":1,"print":"","h":24.75},
{"id":"R62","row":62,"section":"3","code":"3.9","label":"มีการออกปฏิบัติการในการป้องกัน แก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5)","printLabel":"มีการออกปฏิบัติการในการป้องกัน แก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5)","unit":"","type":"header","agg":"sum","level":1,"print":"gray","h":24.75},
{"id":"R63","row":63,"section":"3","code":"3.9","label":"ออกปฏิบัติการการป้องกัน แก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5) อาทิ การเฝ้าระวัง การลาดตะเวน การดับไฟป่า ฯลฯ","printLabel":"- ออกปฏิบัติการการป้องกัน แก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5) \nอาทิ การเฝ้าระวัง การลาดตะเวน การดับไฟป่า ฯลฯ","unit":"ครั้ง","type":"num","agg":"sum","level":2,"print":"","h":45.75},
{"id":"R64","row":64,"section":"3","code":"3.9","label":"เจ้าหน้าที่ อาสาสมัครท้องถิ่นรักษ์โลก (อถล.) ประชาชนจิตอาสา อาสาสมัครอื่น ๆ ที่ออกปฏบัติการฯ","printLabel":"- เจ้าหน้าที่ อาสาสมัครท้องถิ่นรักษ์โลก (อถล.) ประชาชนจิตอาสา อาสาสมัครอื่น ๆ ที่ออกปฏบัติการฯ","unit":"คน","type":"num","agg":"sum","level":2,"print":"","h":24.75}
];
if (typeof module !== "undefined") module.exports = AG_ITEMS;


/* ───────── core.js ───────── */
/**
 * AGCore — ตรรกะคำนวณยอดสะสม (ใช้ร่วมกันทั้ง Google Apps Script, หน้าเว็บ และชุดทดสอบ)
 *
 * ระเบียนรายงาน (record) = 1 อำเภอ × 1 ครั้ง
 *   { round, district, status, values:{R29:{h,v,t,u}}, sec4:[{id,t,h,v,u}], sec5:'', meta:{...} }
 *   status: draft (ร่าง) | submitted (ส่งแล้ว) | accepted (จังหวัดตรวจรับ) | returned (ส่งกลับแก้ไข)
 *   ครั้งที่ 0 = ยอดยกมา (ผลงานก่อนรายงานครั้งที่ 1)
 *
 * กติกา
 *  - นับเข้ายอดสะสมเฉพาะรายงานที่ "ส่งแล้ว" หรือ "ตรวจรับแล้ว"
 *  - ช่องว่าง = ไม่นับ (ไม่ถือเป็น 0 และไม่ลบยอดเดิม)
 *  - agg 'sum' บวกสะสม / agg 'latest' ใช้ค่าล่าสุด (เช่น "เปิดให้บริการ ณ ครั้งที่รายงาน")
 *  - มี/ไม่มี: เลือกเองได้ ถ้าไม่เลือกแต่มีตัวเลข > 0 หรือมีข้อความ ถือว่า "มี"
 *  - ข้อ 4 (กิจกรรมอื่น ๆ) สะสมแยกตามรหัสกิจกรรม (id) ที่ยกต่อจากครั้งก่อน
 */
var AGCore = (function () {
  var COUNTED = { submitted: 1, accepted: 1 };
  var STATUS_TH = { '': 'ยังไม่ส่ง', none: 'ยังไม่ส่ง', draft: 'ฉบับร่าง', submitted: 'ส่งแล้ว', accepted: 'ตรวจรับแล้ว', returned: 'ส่งกลับแก้ไข' };

  function isBlank(x) { return x === undefined || x === null || String(x).trim() === ''; }
  function num(x) {
    if (isBlank(x)) return null;
    var n = Number(String(x).replace(/,/g, '').trim());
    return isFinite(n) ? n : null;
  }
  function r2(n) { return n === null ? null : Math.round(n * 100) / 100; }
  function add(a, b) { return b === null ? a : r2((a || 0) + b); }
  function isCounted(rec) { return !!rec && (COUNTED[rec.status] === 1 || rec.status === undefined || rec.status === ''); }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  function hasOf(cell) {
    if (!cell) return '';
    if (cell.h === 'Y' || cell.h === 'N') return cell.h;
    var n = num(cell.v);
    if (n !== null && n > 0) return 'Y';
    if (!isBlank(cell.t)) return 'Y';
    return '';
  }

  /** เลือกระเบียนที่ใช้คำนวณของอำเภอหนึ่ง ถึงครั้งที่ round */
  function pick(records, district, round, opts) {
    opts = opts || {};
    var list = [];
    records.forEach(function (r) {
      if (r.district !== district || Number(r.round) > round) return;
      var cur = Number(r.round) === round;
      if (cur && opts.override) return;
      if (opts.includeDraft || isCounted(r) || (cur && opts.includeCurrent)) list.push(r);
    });
    if (opts.override) list.push(opts.override);
    return list.sort(function (a, b) { return Number(a.round) - Number(b.round); });
  }

  function recordOf(records, district, round) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].district === district && Number(records[i].round) === Number(round)) return records[i];
    }
    return null;
  }

  /**
   * ยอดของอำเภอเดียว ณ ครั้งที่ round
   * opts.override       : ระเบียนที่กำลังแก้ไข (ใช้แทนครั้งปัจจุบัน เพื่อแสดงยอดสะสมทันที)
   * opts.includeCurrent : นับครั้งปัจจุบันแม้ยังเป็นร่าง (มุมมองของอำเภอเอง)
   * opts.includeDraft   : นับทุกสถานะ
   */
  function computeDistrict(items, records, district, round, opts) {
    round = Number(round); opts = opts || {};
    var list = pick(records, district, round, opts);
    var raw = opts.override || recordOf(records, district, round);
    var current = null;
    list.forEach(function (r) { if (Number(r.round) === round) current = r; });
    var out = {};
    items.forEach(function (it) {
      if (it.type === 'header') return;
      var o = { week: { h: '', v: null, t: '', u: '' }, prevCum: null, cum: null, everHas: false, unit: it.unit || '', texts: [] };
      var wk = raw && raw.values ? raw.values[it.id] : null;
      if (wk) o.week = { h: hasOf(wk), v: num(wk.v), t: wk.t || '', u: wk.u || '' };
      list.forEach(function (r) {
        var c = r.values && r.values[it.id];
        if (!c) return;
        var n = num(c.v), before = Number(r.round) < round;
        if (hasOf(c) === 'Y') o.everHas = true;
        if (!isBlank(c.t) && o.texts.indexOf(norm(c.t)) < 0) o.texts.push(norm(c.t));
        if (!isBlank(c.u)) o.unit = norm(c.u);
        if (n === null) return;
        if (it.agg === 'latest') { o.cum = n; if (before) o.prevCum = n; }
        else { o.cum = add(o.cum, n); if (before) o.prevCum = add(o.prevCum, n); }
      });
      if (!o.unit && wk && wk.u) o.unit = norm(wk.u);
      out[it.id] = o;
    });

    // ข้อ 4: กิจกรรมอื่น ๆ — สะสมตาม id
    var acts = {}, order = [];
    list.forEach(function (r) {
      (r.sec4 || []).forEach(function (a) {
        if (!a || (isBlank(a.t) && isBlank(a.v))) return;
        var id = a.id || norm(a.t) + '|' + norm(a.u);
        if (!acts[id]) { acts[id] = { id: id, t: '', u: '', week: { h: '', v: null }, prevCum: null, cum: null, everHas: false }; order.push(id); }
        var x = acts[id], n = num(a.v);
        if (!isBlank(a.t)) x.t = norm(a.t);
        if (!isBlank(a.u)) x.u = norm(a.u);
        if (hasOf(a) === 'Y') x.everHas = true;
        if (n !== null) { x.cum = add(x.cum, n); if (Number(r.round) < round) x.prevCum = add(x.prevCum, n); }
      });
    });
    ((raw && raw.sec4) || []).forEach(function (a) {
      var id = a.id || norm(a.t) + '|' + norm(a.u);
      if (acts[id]) acts[id].week = { h: hasOf(a), v: num(a.v) };
    });
    // แสดงเฉพาะกิจกรรมที่ยังอยู่ในระเบียนล่าสุดหรือมียอดสะสม
    var sec4 = order.map(function (id) { return acts[id]; });

    var pending = [];
    records.forEach(function (r) {
      if (r.district === district && Number(r.round) < round && !isCounted(r)) pending.push(Number(r.round));
    });

    return {
      district: district, round: round,
      status: raw ? (raw.status || 'submitted') : '',
      counted: !!(raw && isCounted(raw)),
      reported: !!current,
      meta: (raw && raw.meta) || {},
      sec5: (raw && raw.sec5) || '',
      items: out, sec4: sec4, pendingRounds: pending.sort(function (a, b) { return a - b; })
    };
  }

  /** ยอดรวมจังหวัด ณ ครั้งที่ round (นับเฉพาะรายงานที่ส่งแล้ว/ตรวจรับแล้ว) */
  function computeProvince(items, records, districts, round, opts) {
    round = Number(round); opts = opts || {};
    var per = {};
    districts.forEach(function (d) { per[d.code] = computeDistrict(items, records, d.code, round, { includeDraft: !!opts.includeDraft }); });
    var out = {};
    items.forEach(function (it) {
      if (it.type === 'header') return;
      var o = { week: null, cum: null, prevCum: null, yes: 0, no: 0, everHas: false, byDistrict: {}, texts: [], units: {} };
      districts.forEach(function (d) {
        var p = per[d.code], x = p.items[it.id];
        var wk = p.counted || opts.includeDraft ? x.week : { h: '', v: null, t: '', u: '' };
        o.byDistrict[d.code] = { week: wk.v, cum: x.cum, h: wk.h, everHas: x.everHas };
        o.week = add(o.week, wk.v);
        o.cum = add(o.cum, x.cum);
        o.prevCum = add(o.prevCum, x.prevCum);
        if (x.everHas) o.everHas = true;
        if (wk.h === 'Y') o.yes++; else if (wk.h === 'N') o.no++;
        x.texts.forEach(function (t) { o.texts.push({ district: d.name, text: t }); });
        if (x.unit && x.cum !== null) o.units[x.unit] = (o.units[x.unit] || 0) + 1;
      });
      var best = '', bn = 0;
      Object.keys(o.units).forEach(function (u) { if (o.units[u] > bn) { best = u; bn = o.units[u]; } });
      o.unit = best || it.unit || '';
      out[it.id] = o;
    });

    // ข้อ 4 รวมจังหวัด: รวมกิจกรรมที่ชื่อ+หน่วยเหมือนกัน
    var acts = {}, order = [];
    districts.forEach(function (d) {
      var p = per[d.code];
      p.sec4.forEach(function (a) {
        var key = norm(a.t).toLowerCase() + '|' + norm(a.u);
        if (!acts[key]) { acts[key] = { id: key, t: a.t, u: a.u, week: { h: '', v: null }, cum: null, prevCum: null, everHas: false, districts: [] }; order.push(key); }
        var x = acts[key];
        if (p.counted || opts.includeDraft) { x.week.v = add(x.week.v, a.week.v); if (a.week.h === 'Y') x.week.h = 'Y'; }
        x.cum = add(x.cum, a.cum); x.prevCum = add(x.prevCum, a.prevCum);
        if (a.everHas) x.everHas = true;
        if (x.districts.indexOf(d.name) < 0) x.districts.push(d.name);
      });
    });

    var sec5 = [];
    districts.forEach(function (d) {
      var p = per[d.code];
      if ((p.counted || opts.includeDraft) && !isBlank(p.sec5)) sec5.push({ district: d.name, text: norm(p.sec5) });
    });
    var reported = districts.filter(function (d) { return per[d.code].counted; }).map(function (d) { return d.code; });
    return { round: round, items: out, sec4: order.map(function (k) { return acts[k]; }), sec5: sec5, reported: reported, perDistrict: per };
  }

  /** สถานะการส่งรายงาน: {D01: {3: {status, at, late, by}}} */
  function statusMatrix(records, rounds) {
    var due = {};
    (rounds || []).forEach(function (r) { due[r.round] = r.due; });
    var m = {};
    records.forEach(function (r) {
      var meta = r.meta || {};
      var at = meta.submitted_at || '';
      m[r.district] = m[r.district] || {};
      m[r.district][r.round] = {
        status: r.status || 'submitted', at: at, updated_at: meta.updated_at || '',
        by: meta.submitted_by || meta.updated_by || '',
        late: !!(at && due[r.round] && String(at).slice(0, 10) > due[r.round]),
        note: meta.review_note || ''
      };
    });
    return m;
  }

  /** ทำความสะอาดข้อมูลที่ส่งเข้ามา */
  function sanitizeInput(items, input) {
    input = input || {};
    var values = {}, src = input.values || {};
    items.forEach(function (it) {
      if (it.type === 'header') return;
      var c = src[it.id];
      if (!c) return;
      var h = c.h === 'Y' || c.h === 'N' ? c.h : '';
      var v = it.type === 'num' || it.type === 'other' ? num(c.v) : null;
      if (!isBlank(c.v) && v === null) throw new Error('ตัวเลขไม่ถูกต้อง: ข้อ ' + it.code + ' ' + it.label.slice(0, 40));
      if (v !== null && v < 0) throw new Error('ค่าติดลบไม่ได้: ข้อ ' + it.code + ' ' + it.label.slice(0, 40));
      var t = it.type === 'other' ? norm(c.t).slice(0, 300) : '';
      var u = it.type === 'other' ? norm(c.u).slice(0, 30) : '';
      if (h || v !== null || t) values[it.id] = { h: h, v: v === null ? '' : v, t: t, u: u };
    });
    var sec4 = [];
    (input.sec4 || []).slice(0, 12).forEach(function (a, i) {
      if (!a) return;
      var t = String(a.t || '').trim().slice(0, 1000), v = num(a.v), u = norm(a.u).slice(0, 30);
      if (!isBlank(a.v) && v === null) throw new Error('ตัวเลขไม่ถูกต้อง ในข้อ 4 แถวที่ ' + (i + 1));
      if (v !== null && v < 0) throw new Error('ค่าติดลบไม่ได้ ในข้อ 4 แถวที่ ' + (i + 1));
      if (isBlank(t) && v === null) return;
      var id = String(a.id || '').replace(/[^\w-]/g, '').slice(0, 24) || ('a' + Date.now().toString(36) + i);
      sec4.push({ id: id, t: t, h: a.h === 'Y' || a.h === 'N' ? a.h : '', v: v === null ? '' : v, u: u });
    });
    return { values: values, sec4: sec4, sec5: String(input.sec5 || '').trim().slice(0, 3000) };
  }

  /** ข้อ 4 ที่ยกมาจากครั้งก่อน (ชื่อ/หน่วยเดิม ตัวเลขว่าง) */
  function carrySec4(records, district, round) {
    var prev = null;
    records.forEach(function (r) {
      if (r.district === district && Number(r.round) < Number(round) && (r.sec4 || []).length) {
        if (!prev || Number(r.round) > Number(prev.round)) prev = r;
      }
    });
    return prev ? prev.sec4.map(function (a) { return { id: a.id, t: a.t, h: '', v: '', u: a.u }; }) : [];
  }

  return {
    COUNTED: COUNTED, STATUS_TH: STATUS_TH,
    isBlank: isBlank, num: num, hasOf: hasOf, isCounted: isCounted, norm: norm, recordOf: recordOf,
    computeDistrict: computeDistrict, computeProvince: computeProvince,
    statusMatrix: statusMatrix, sanitizeInput: sanitizeInput, carrySec4: carrySec4
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AGCore;


/* ───────── server.js ───────── */
/**
 * AGServer — กฎทางธุรกิจทั้งหมดของระบบ (สิทธิ์ผู้ใช้, การบันทึก/ส่ง/ตรวจรับรายงาน, บันทึกการเข้าใช้งาน)
 * ใช้ร่วมกัน: Google Apps Script (เก็บใน Google Sheets) และโหมดทดลองบนหน้าเว็บ (เก็บใน localStorage)
 *
 * store ต้องมีเมธอด:
 *   rows(table) → [obj]          insert(table, obj)          update(table, pred, patch) → n
 *   remove(table, pred) → n      now() 'yyyy-MM-dd HH:mm:ss'  today() 'yyyy-MM-dd'
 *   sha256(str) → hex            hmac(str) → hex              uuid() → string
 *   cacheGet(k) / cachePut(k, v, sec)                         lock(fn) → fn()
 *
 * บทบาท (role):  district = เจ้าหน้าที่ระดับอำเภอ (Admin)
 *                mini     = ผู้รวบรวมข้อมูลระดับจังหวัด (Mini Super Admin)
 *                super    = ผู้ดูแลระบบสูงสุด (Super Admin)
 */
var AGServer = (function () {
  var T = { SETTINGS: 'Settings', DISTRICTS: 'Districts', USERS: 'Users', ROUNDS: 'Rounds', DATA: 'Data', LOG: 'AccessLog' };

  var COLS = {
    Settings: ['key', 'value', 'note'],
    Districts: ['code', 'name', 'amp_code', 'active'],
    Users: ['id', 'role', 'username', 'pass_hash', 'salt', 'phone', 'prefix', 'name', 'position', 'district', 'status',
      'token_ver', 'created_at', 'created_by', 'last_login', 'login_count', 'last_seen'],
    Rounds: ['round', 'label', 'start', 'end', 'due', 'open'],
    AccessLog: ['time', 'user_id', 'account', 'name', 'role', 'district', 'action', 'detail', 'ua'],
    DataMeta: ['round', 'district', 'district_name', 'status', 'reporter', 'position', 'phone', 'sec4', 'sec5',
      'updated_at', 'updated_by', 'submitted_at', 'submitted_by', 'reviewed_at', 'reviewed_by', 'review_note']
  };

  var DEFAULT_SETTINGS = [
    ['SITE_NAME', 'KPP Smart Agri-Materials', 'ชื่อเว็บไซต์'],
    ['PROVINCE', 'กำแพงเพชร', 'ชื่อจังหวัด'],
    ['OFFICE', 'สำนักงานเกษตรจังหวัดกำแพงเพชร', 'ชื่อหน่วยงาน (หัวรายงานระดับจังหวัด)'],
    ['TITLE', 'แบบรายงานผลการดำเนินการป้องกันและแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM2.5)', 'หัวเรื่องรายงาน'],
    ['SEASON', '2569 - 2570', 'ปีของรายงาน (แสดงต่อจากคำว่า "ปี")'],
    ['DOC_REF_1', 'ตามข้อสั่งการของกองบัญชาการป้องกันและบรรเทาสาธารณภัยแห่งชาติ', 'บรรทัดอ้างอิงที่ 1'],
    ['DOC_REF_2', '(หนังสือกองบัญชาการป้องกันและบรรเทาสาธารณภัยแห่งชาติ  ด่วนที่สุด ที่ มท (บกปภ) 0624/ว 115 ลงวันที่ 13 พฤศจิกายน 2568 และด่วนที่สุด ที่ มท (บกปภ) 0624/ว 152 ลงวันที่ 9 ธันวาคม 2568)', 'บรรทัดอ้างอิงที่ 2 (เลขหนังสือสั่งการ)'],
    ['QR_NOTE', 'สามารถดาวน์โหลดแบบฟอร์มได้ที่', 'ข้อความเหนือ QR Code'],
    ['QR_LINK', 'https://shorturl.at/DmEcz', 'ลิงก์ใต้ QR Code'],
    ['QR_IMAGE', '', 'รูป QR Code (data URL) — เว้นว่าง = ใช้รูปตั้งต้น'],
    ['PROV_REPORTER_NAME', 'นายกิตติ  โพธิ์จวง', 'ผู้รายงานข้อมูลระดับจังหวัด'],
    ['PROV_REPORTER_TITLE', 'นักวิชาการส่งเสริมการเกษตรชำนาญการ', 'ตำแหน่งผู้รายงานระดับจังหวัด'],
    ['REGISTRATION_OPEN', 'TRUE', 'เปิดให้เจ้าหน้าที่อำเภอลงทะเบียนเอง'],
    ['PUBLIC_DASHBOARD', 'TRUE', 'แสดงแผนที่สรุปผล (เฉพาะรายงานที่ส่งแล้ว) โดยไม่ต้องเข้าสู่ระบบ'],
    ['STATUS_VISIBLE_TO_DISTRICT', 'FALSE', 'ให้เจ้าหน้าที่อำเภอดูสถานะการส่งรายงานของทุกอำเภอได้'],
    ['SESSION_HOURS', '12', 'อายุการเข้าสู่ระบบ (ชั่วโมง)']
  ];
  var PUBLIC_KEYS = ['SITE_NAME', 'PROVINCE', 'OFFICE', 'TITLE', 'SEASON', 'DOC_REF_1', 'DOC_REF_2', 'QR_NOTE', 'QR_LINK', 'QR_IMAGE',
    'PROV_REPORTER_NAME', 'PROV_REPORTER_TITLE', 'REGISTRATION_OPEN', 'PUBLIC_DASHBOARD', 'STATUS_VISIBLE_TO_DISTRICT'];
  var MINI_KEYS = ['OFFICE', 'TITLE', 'SEASON', 'DOC_REF_1', 'DOC_REF_2', 'QR_NOTE', 'QR_LINK', 'QR_IMAGE',
    'PROV_REPORTER_NAME', 'PROV_REPORTER_TITLE', 'STATUS_VISIBLE_TO_DISTRICT'];
  var SUPER_KEYS = PUBLIC_KEYS.concat(['SESSION_HOURS']);

  var DEFAULT_DISTRICTS = ['เมืองกำแพงเพชร', 'ไทรงาม', 'คลองลาน', 'ขาณุวรลักษบุรี', 'คลองขลุง', 'พรานกระต่าย',
    'ลานกระบือ', 'ทรายทองวัฒนา', 'ปางศิลาทอง', 'บึงสามัคคี', 'โกสัมพีนคร'];

  var ROLE_TH = { district: 'เจ้าหน้าที่อำเภอ', mini: 'ผู้รวบรวมระดับจังหวัด', super: 'ผู้ดูแลระบบสูงสุด' };

  function fail(msg, code) { var e = new Error(msg); e.code = code || 'bad_request'; throw e; }
  function truthy(v) { return v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || v === '1'; }
  function str(v) { return v === null || v === undefined ? '' : String(v); }
  function clip(v, n) { return str(v).trim().slice(0, n || 200); }

  function normPhone(p) {
    var d = str(p).replace(/\D/g, '');
    if (d.length === 9 && d.charAt(0) !== '0') d = '0' + d;
    return d;
  }
  function validPhone(p) { return /^0\d{8,9}$/.test(p); }
  function normUser(u) { return str(u).trim().toLowerCase(); }

  /* ───────────── data row ↔ record ───────────── */
  function dataColumns(items) {
    var cols = COLS.DataMeta.slice();
    items.forEach(function (it) {
      if (it.type === 'header') return;
      cols.push(it.id + '_h');
      if (it.type === 'num' || it.type === 'other') cols.push(it.id + '_v');
      if (it.type === 'other') { cols.push(it.id + '_t'); cols.push(it.id + '_u'); }
    });
    return cols;
  }
  function rowToRecord(items, row) {
    var values = {};
    items.forEach(function (it) {
      if (it.type === 'header') return;
      var h = str(row[it.id + '_h']), v = row[it.id + '_v'], t = row[it.id + '_t'], u = row[it.id + '_u'];
      h = h === 'มี' || h === 'Y' ? 'Y' : h === 'ไม่มี' || h === 'N' ? 'N' : '';
      v = v === undefined || v === null ? '' : v;
      t = str(t); u = str(u);
      if (h || v !== '' || t) values[it.id] = { h: h, v: v, t: t, u: u };
    });
    var sec4 = [];
    try { sec4 = row.sec4 ? JSON.parse(row.sec4) : []; } catch (e) { sec4 = []; }
    return {
      round: Number(row.round), district: str(row.district), status: str(row.status) || 'submitted',
      values: values, sec4: sec4, sec5: str(row.sec5),
      meta: {
        reporter: str(row.reporter), position: str(row.position), phone: str(row.phone),
        updated_at: str(row.updated_at), updated_by: str(row.updated_by),
        submitted_at: str(row.submitted_at), submitted_by: str(row.submitted_by),
        reviewed_at: str(row.reviewed_at), reviewed_by: str(row.reviewed_by), review_note: str(row.review_note)
      }
    };
  }
  function recordToRow(items, rec, districtName) {
    var m = rec.meta || {};
    var row = {
      round: Number(rec.round), district: rec.district, district_name: districtName || '', status: rec.status,
      reporter: m.reporter || '', position: m.position || '', phone: m.phone || '',
      sec4: (rec.sec4 && rec.sec4.length) ? JSON.stringify(rec.sec4) : '', sec5: rec.sec5 || '',
      updated_at: m.updated_at || '', updated_by: m.updated_by || '', submitted_at: m.submitted_at || '',
      submitted_by: m.submitted_by || '', reviewed_at: m.reviewed_at || '', reviewed_by: m.reviewed_by || '', review_note: m.review_note || ''
    };
    items.forEach(function (it) {
      if (it.type === 'header') return;
      var c = rec.values[it.id] || {};
      row[it.id + '_h'] = c.h === 'Y' ? 'มี' : c.h === 'N' ? 'ไม่มี' : '';
      if (it.type === 'num' || it.type === 'other') row[it.id + '_v'] = c.v === undefined || c.v === null ? '' : c.v;
      if (it.type === 'other') { row[it.id + '_t'] = c.t || ''; row[it.id + '_u'] = c.u || ''; }
    });
    return row;
  }

  /* ───────────── server factory ───────────── */
  function create(store, items) {
    items = items || (typeof AG_ITEMS !== 'undefined' ? AG_ITEMS : []);

    function settings() {
      var o = {};
      DEFAULT_SETTINGS.forEach(function (s) { o[s[0]] = s[1]; });
      store.rows(T.SETTINGS).forEach(function (r) { if (r.key) o[r.key] = str(r.value); });
      return o;
    }
    function setSetting(k, v) {
      var n = store.update(T.SETTINGS, function (r) { return r.key === k; }, { value: v });
      if (!n) {
        var d = DEFAULT_SETTINGS.filter(function (s) { return s[0] === k; })[0];
        store.insert(T.SETTINGS, { key: k, value: v, note: d ? d[2] : '' });
      }
    }
    function districts(all) {
      return store.rows(T.DISTRICTS).filter(function (d) { return d.code && (all || d.active === '' || truthy(d.active)); })
        .map(function (d) { return { code: str(d.code), name: str(d.name), amp_code: str(d.amp_code) }; });
    }
    function districtName(code) { var d = districts(true).filter(function (x) { return x.code === code; })[0]; return d ? d.name : code; }
    function rounds() {
      return store.rows(T.ROUNDS).filter(function (r) { return r.round !== '' && r.round !== undefined; }).map(function (r) {
        return { round: Number(r.round), label: str(r.label), start: str(r.start).slice(0, 10), end: str(r.end).slice(0, 10), due: str(r.due).slice(0, 10), open: truthy(r.open) };
      }).sort(function (a, b) { return a.round - b.round; });
    }
    function users() { return store.rows(T.USERS); }
    function records() { return store.rows(T.DATA).filter(function (r) { return r.district && r.round !== ''; }).map(function (r) { return rowToRecord(items, r); }); }

    function publicUser(u) {
      return { id: str(u.id), role: str(u.role), roleName: ROLE_TH[u.role] || u.role, username: str(u.username), phone: str(u.phone),
        prefix: str(u.prefix), name: str(u.name), position: str(u.position), district: str(u.district),
        districtName: u.district ? districtName(str(u.district)) : '', status: str(u.status) || 'active' };
    }
    function adminUser(u) {
      var p = publicUser(u);
      p.created_at = str(u.created_at); p.created_by = str(u.created_by); p.last_login = str(u.last_login);
      p.login_count = Number(u.login_count) || 0; p.last_seen = str(u.last_seen); p.hasPassword = !!u.pass_hash;
      return p;
    }

    /* ── audit ── */
    function audit(user, action, detail, ua, account) {
      store.insert(T.LOG, {
        time: store.now(), user_id: user ? str(user.id) : '', account: account || (user ? (user.username || user.phone) : ''),
        name: user ? str(user.name) : '', role: user ? str(user.role) : '', district: user && user.district ? districtName(str(user.district)) : '',
        action: action, detail: clip(detail, 500), ua: clip(ua, 160)
      });
    }

    /* ── token ── */
    function issueToken(u) {
      var hours = Number(settings().SESSION_HOURS) || 12;
      var exp = Date.now() + hours * 3600 * 1000;
      var body = str(u.id) + '.' + (Number(u.token_ver) || 0) + '.' + exp;
      return body + '.' + store.hmac(body).slice(0, 40);
    }
    function auth(token) {
      var p = str(token).split('.');
      if (p.length !== 4) fail('กรุณาเข้าสู่ระบบ', 'auth');
      var body = p[0] + '.' + p[1] + '.' + p[2];
      if (store.hmac(body).slice(0, 40) !== p[3]) fail('การเข้าสู่ระบบไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่', 'auth');
      if (Number(p[2]) < Date.now()) fail('หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่', 'auth');
      var u = users().filter(function (x) { return str(x.id) === p[0]; })[0];
      if (!u) fail('ไม่พบบัญชีผู้ใช้', 'auth');
      if (str(u.status) === 'suspended') fail('บัญชีถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ', 'auth');
      if ((Number(u.token_ver) || 0) !== Number(p[1])) fail('การเข้าสู่ระบบถูกยกเลิก กรุณาเข้าสู่ระบบใหม่', 'auth');
      var k = 'seen:' + u.id;
      if (!store.cacheGet(k)) { store.cachePut(k, '1', 300); store.update(T.USERS, function (x) { return str(x.id) === str(u.id); }, { last_seen: store.now() }); }
      return u;
    }
    function need(u, roles) { if (roles.indexOf(u.role) < 0) fail('ไม่มีสิทธิ์ใช้งานส่วนนี้', 'forbidden'); }
    function throttle(key) {
      var n = Number(store.cacheGet('fail:' + key) || 0);
      if (n >= 8) fail('พยายามเข้าสู่ระบบผิดหลายครั้ง กรุณารอ 15 นาที', 'locked');
    }
    function failed(key) { store.cachePut('fail:' + key, String(Number(store.cacheGet('fail:' + key) || 0) + 1), 900); }

    function hashPass(salt, pass) { return store.sha256(salt + ':' + pass); }
    function loginOk(u, ua, via) {
      store.update(T.USERS, function (x) { return str(x.id) === str(u.id); },
        { last_login: store.now(), last_seen: store.now(), login_count: (Number(u.login_count) || 0) + 1 });
      audit(u, 'login', 'เข้าสู่ระบบด้วย' + via, ua);
      return { token: issueToken(u), user: publicUser(u) };
    }

    /* ── permissions on reports ── */
    function canSeeDistrict(u, d) { return u.role === 'super' || u.role === 'mini' || str(u.district) === d; }
    function statusVisible(u, s) { return u.role !== 'district' || truthy(s.STATUS_VISIBLE_TO_DISTRICT); }

    /* ───────────── actions ───────────── */
    var A = {};

    A['public.bootstrap'] = function () {
      var s = settings(), pub = {};
      PUBLIC_KEYS.forEach(function (k) { pub[k] = s[k]; });
      return { settings: pub, districts: districts(), rounds: rounds(), today: store.today() };
    };

    A['public.summary'] = function () {
      if (!truthy(settings().PUBLIC_DASHBOARD)) return { enabled: false, records: [] };
      return {
        enabled: true,
        records: records().filter(AGCore.isCounted).map(function (r) {
          return { round: r.round, district: r.district, status: r.status, values: r.values, sec4: r.sec4, sec5: '', meta: {} };
        })
      };
    };

    A['data.summary'] = function () {
      return records().filter(AGCore.isCounted).map(function (r) {
        return { round: r.round, district: r.district, status: r.status, values: r.values, sec4: r.sec4, sec5: '', meta: {} };
      });
    };

    A['auth.register'] = function (p) {
      var s = settings();
      if (!truthy(s.REGISTRATION_OPEN)) fail('ปิดรับลงทะเบียนชั่วคราว กรุณาติดต่อผู้ดูแลระบบ');
      var phone = normPhone(p.phone);
      if (!validPhone(phone)) fail('หมายเลขโทรศัพท์ไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)');
      var name = clip(p.name, 120), position = clip(p.position, 120), prefix = clip(p.prefix, 30);
      if (name.length < 3) fail('กรุณากรอกชื่อ-สกุล');
      if (!position) fail('กรุณากรอกตำแหน่ง');
      var d = districts().filter(function (x) { return x.code === p.district; })[0];
      if (!d) fail('กรุณาเลือกอำเภอที่สังกัด');
      return store.lock(function () {
        if (users().some(function (u) { return normPhone(u.phone) === phone; })) fail('หมายเลขนี้ลงทะเบียนแล้ว กรุณาเข้าสู่ระบบ', 'exists');
        var u = { id: store.uuid(), role: 'district', username: '', pass_hash: '', salt: '', phone: phone, prefix: prefix, name: name,
          position: position, district: d.code, status: 'active', token_ver: 0, created_at: store.now(), created_by: 'ลงทะเบียนเอง',
          last_login: '', login_count: 0, last_seen: '' };
        store.insert(T.USERS, u);
        audit(u, 'register', 'ลงทะเบียน อ.' + d.name, p._ua);
        return loginOk(u, p._ua, 'เบอร์โทร (หลังลงทะเบียน)');
      });
    };

    A['auth.login'] = function (p) {
      var u;
      if (p.username !== undefined) {
        var un = normUser(p.username);
        if (!un || !p.password) fail('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
        throttle('u:' + un);
        u = users().filter(function (x) { return normUser(x.username) === un && x.pass_hash; })[0];
        if (!u || hashPass(str(u.salt), str(p.password)) !== str(u.pass_hash)) {
          failed('u:' + un); audit(null, 'login_failed', 'ชื่อผู้ใช้/รหัสผ่านไม่ถูกต้อง', p._ua, un);
          fail('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'auth');
        }
        if (str(u.status) === 'suspended') { audit(u, 'login_failed', 'บัญชีถูกระงับ', p._ua); fail('บัญชีถูกระงับการใช้งาน'); }
        return loginOk(u, p._ua, 'ชื่อผู้ใช้');
      }
      var phone = normPhone(p.phone);
      if (!validPhone(phone)) fail('หมายเลขโทรศัพท์ไม่ถูกต้อง');
      throttle('p:' + phone);
      u = users().filter(function (x) { return normPhone(x.phone) === phone; })[0];
      if (!u) { failed('p:' + phone); audit(null, 'login_failed', 'ยังไม่ได้ลงทะเบียน', p._ua, phone); fail('หมายเลขนี้ยังไม่ได้ลงทะเบียน', 'not_registered'); }
      if (u.role !== 'district') {
        audit(u, 'login_failed', 'บัญชีผู้ดูแลต้องใช้ชื่อผู้ใช้/รหัสผ่าน', p._ua);
        fail('บัญชีนี้เป็นผู้ดูแลระดับจังหวัด กรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน');
      }
      if (str(u.status) === 'suspended') { audit(u, 'login_failed', 'บัญชีถูกระงับ', p._ua); fail('บัญชีถูกระงับการใช้งาน กรุณาติดต่อจังหวัด'); }
      return loginOk(u, p._ua, 'เบอร์โทร');
    };

    A['auth.me'] = function (p, u) { return { user: publicUser(u) }; };
    A['auth.logout'] = function (p, u) { audit(u, 'logout', '', p._ua); return true; };
    A['auth.changePassword'] = function (p, u) {
      need(u, ['mini', 'super']);
      if (hashPass(str(u.salt), str(p.oldPassword)) !== str(u.pass_hash)) fail('รหัสผ่านเดิมไม่ถูกต้อง');
      if (str(p.newPassword).length < 6) fail('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร');
      var salt = store.uuid();
      store.update(T.USERS, function (x) { return str(x.id) === str(u.id); }, { salt: salt, pass_hash: hashPass(salt, str(p.newPassword)) });
      audit(u, 'password_change', 'เปลี่ยนรหัสผ่านตนเอง', p._ua);
      return true;
    };
    A['auth.updateProfile'] = function (p, u) {
      var patch = {};
      if (p.prefix !== undefined) patch.prefix = clip(p.prefix, 30);
      if (p.name !== undefined) { patch.name = clip(p.name, 120); if (patch.name.length < 3) fail('กรุณากรอกชื่อ-สกุล'); }
      if (p.position !== undefined) patch.position = clip(p.position, 120);
      store.update(T.USERS, function (x) { return str(x.id) === str(u.id); }, patch);
      audit(u, 'profile_update', 'แก้ไขข้อมูลส่วนตัว', p._ua);
      return { user: publicUser(users().filter(function (x) { return str(x.id) === str(u.id); })[0]) };
    };

    A['data.records'] = function (p, u) {
      var all = records();
      if (u.role === 'district') all = all.filter(function (r) { return r.district === str(u.district); });
      return all;
    };

    A['data.save'] = function (p, u) {
      var round = Number(p.round), d = str(p.district);
      if (u.role === 'district' && d !== str(u.district)) fail('แก้ไขได้เฉพาะข้อมูลของอำเภอตนเองเท่านั้น', 'forbidden');
      if (u.role === 'mini') fail('ผู้รวบรวมระดับจังหวัดไม่สามารถแก้ไขรายงานของอำเภอได้ ใช้ "ส่งกลับแก้ไข" แทน', 'forbidden');
      if (!districts().some(function (x) { return x.code === d; })) fail('ไม่พบอำเภอ');
      var rd = rounds().filter(function (r) { return r.round === round; })[0];
      if (!rd) fail('ไม่พบรอบรายงานครั้งที่ ' + round);
      if (!rd.open && u.role !== 'super') fail('รอบรายงานครั้งที่ ' + round + ' ปิดรับข้อมูลแล้ว กรุณาติดต่อจังหวัด');
      var clean = AGCore.sanitizeInput(items, p);
      var mode = p.mode === 'submit' ? 'submit' : 'draft';
      return store.lock(function () {
        var old = AGCore.recordOf(records(), d, round);
        if (old && old.status === 'accepted' && u.role !== 'super') fail('จังหวัดตรวจรับรายงานนี้แล้ว หากต้องแก้ไขกรุณาติดต่อจังหวัดให้ส่งกลับแก้ไข');
        var now = store.now(), m = p.meta || {}, om = old ? old.meta : {};
        var rec = {
          round: round, district: d, values: clean.values, sec4: clean.sec4, sec5: clean.sec5,
          status: mode === 'submit' ? (old && old.status === 'accepted' ? 'accepted' : 'submitted') : (old && old.status === 'returned' ? 'returned' : 'draft'),
          meta: {
            reporter: clip(m.reporter || ((u.prefix || '') + u.name), 120), position: clip(m.position || u.position, 120), phone: clip(m.phone || u.phone, 20),
            updated_at: now, updated_by: str(u.name),
            submitted_at: mode === 'submit' ? now : (om.submitted_at || ''), submitted_by: mode === 'submit' ? str(u.name) : (om.submitted_by || ''),
            reviewed_at: om.reviewed_at || '', reviewed_by: om.reviewed_by || '', review_note: om.review_note || ''
          }
        };
        if (mode === 'draft' && old && (old.status === 'submitted')) rec.status = 'draft';
        var row = recordToRow(items, rec, districtName(d));
        var n = store.update(T.DATA, function (r) { return Number(r.round) === round && str(r.district) === d; }, row);
        if (!n) store.insert(T.DATA, row);
        audit(u, mode === 'submit' ? 'submit' : 'save_draft', 'อ.' + districtName(d) + ' ครั้งที่ ' + round + ' (' + Object.keys(clean.values).length + ' ช่อง)', p._ua);
        return rec;
      });
    };

    A['data.withdraw'] = function (p, u) {
      var round = Number(p.round), d = str(p.district);
      if (u.role === 'district' && d !== str(u.district)) fail('แก้ไขได้เฉพาะข้อมูลของอำเภอตนเองเท่านั้น', 'forbidden');
      need(u, ['district', 'super']);
      var rd = rounds().filter(function (r) { return r.round === round; })[0];
      if (!rd || (!rd.open && u.role !== 'super')) fail('รอบรายงานนี้ปิดรับข้อมูลแล้ว');
      var old = AGCore.recordOf(records(), d, round);
      if (!old || old.status !== 'submitted') fail('ถอนได้เฉพาะรายงานที่ส่งแล้วและจังหวัดยังไม่ตรวจรับ');
      store.update(T.DATA, function (r) { return Number(r.round) === round && str(r.district) === d; }, { status: 'draft', updated_at: store.now(), updated_by: str(u.name) });
      audit(u, 'withdraw', 'ถอนรายงาน อ.' + districtName(d) + ' ครั้งที่ ' + round + ' เพื่อแก้ไข', p._ua);
      return true;
    };

    A['data.review'] = function (p, u) {
      need(u, ['mini', 'super']);
      var round = Number(p.round), d = str(p.district), dec = p.decision;
      var old = AGCore.recordOf(records(), d, round);
      if (!old) fail('อำเภอนี้ยังไม่ได้ส่งรายงานครั้งนี้');
      var patch = { reviewed_at: store.now(), reviewed_by: str(u.name), review_note: clip(p.note, 500) };
      if (dec === 'accept') {
        if (old.status !== 'submitted' && old.status !== 'accepted') fail('ตรวจรับได้เฉพาะรายงานที่ส่งแล้ว');
        patch.status = 'accepted';
      } else if (dec === 'return') {
        if (!clip(p.note, 500)) fail('กรุณาระบุสิ่งที่ต้องแก้ไข');
        patch.status = 'returned';
      } else fail('คำสั่งไม่ถูกต้อง');
      store.update(T.DATA, function (r) { return Number(r.round) === round && str(r.district) === d; }, patch);
      audit(u, dec === 'accept' ? 'review_accept' : 'review_return', 'อ.' + districtName(d) + ' ครั้งที่ ' + round + (patch.review_note ? ' — ' + patch.review_note : ''), p._ua);
      return true;
    };

    A['status.get'] = function (p, u) {
      var s = settings();
      if (!statusVisible(u, s)) fail('รายงานสถานะการส่งเปิดให้เฉพาะผู้ดูแลระดับจังหวัด', 'forbidden');
      var m = AGCore.statusMatrix(records(), rounds());
      if (u.role === 'district') {
        Object.keys(m).forEach(function (d) { Object.keys(m[d]).forEach(function (r) { m[d][r].by = ''; m[d][r].note = d === str(u.district) ? m[d][r].note : ''; }); });
      }
      return { matrix: m, visibleToDistrict: truthy(s.STATUS_VISIBLE_TO_DISTRICT) };
    };

    /* ── ผู้ใช้ ── */
    A['admin.users.list'] = function (p, u) {
      need(u, ['mini', 'super']);
      return users().filter(function (x) { return u.role === 'super' || x.role === 'district'; }).map(adminUser);
    };
    A['admin.users.create'] = function (p, u) {
      need(u, ['super']);
      var role = p.role;
      if (['district', 'mini', 'super'].indexOf(role) < 0) fail('บทบาทไม่ถูกต้อง');
      var name = clip(p.name, 120);
      if (name.length < 3) fail('กรุณากรอกชื่อ-สกุล');
      var rec = { id: store.uuid(), role: role, username: '', pass_hash: '', salt: '', phone: normPhone(p.phone), prefix: clip(p.prefix, 30), name: name,
        position: clip(p.position, 120), district: '', status: 'active', token_ver: 0, created_at: store.now(), created_by: str(u.name), last_login: '', login_count: 0, last_seen: '' };
      return store.lock(function () {
        if (rec.phone) {
          if (!validPhone(rec.phone)) fail('หมายเลขโทรศัพท์ไม่ถูกต้อง');
          if (users().some(function (x) { return normPhone(x.phone) === rec.phone; })) fail('หมายเลขโทรศัพท์นี้มีในระบบแล้ว');
        }
        if (role === 'district') {
          if (!rec.phone) fail('เจ้าหน้าที่อำเภอต้องมีหมายเลขโทรศัพท์');
          if (!districts().some(function (x) { return x.code === p.district; })) fail('กรุณาเลือกอำเภอ');
          rec.district = p.district;
        } else {
          rec.username = normUser(p.username);
          if (!/^[a-z0-9._-]{3,30}$/.test(rec.username)) fail('ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ/ตัวเลข 3–30 ตัว');
          if (users().some(function (x) { return normUser(x.username) === rec.username; })) fail('ชื่อผู้ใช้นี้มีในระบบแล้ว');
          if (str(p.password).length < 6) fail('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
          rec.salt = store.uuid(); rec.pass_hash = hashPass(rec.salt, str(p.password));
        }
        store.insert(T.USERS, rec);
        audit(u, 'user_create', 'เพิ่ม' + ROLE_TH[role] + ': ' + name + (rec.username ? ' (' + rec.username + ')' : ''), p._ua);
        return adminUser(rec);
      });
    };
    A['admin.users.update'] = function (p, u) {
      need(u, ['mini', 'super']);
      var t = users().filter(function (x) { return str(x.id) === str(p.id); })[0];
      if (!t) fail('ไม่พบผู้ใช้');
      if (u.role === 'mini' && t.role !== 'district') fail('จัดการได้เฉพาะบัญชีเจ้าหน้าที่อำเภอ', 'forbidden');
      var patch = {}, notes = [];
      if (p.status !== undefined) {
        if (str(t.id) === str(u.id)) fail('ไม่สามารถระงับบัญชีของตนเองได้');
        patch.status = p.status === 'suspended' ? 'suspended' : 'active';
        if (patch.status === 'suspended') patch.token_ver = (Number(t.token_ver) || 0) + 1;
        notes.push(patch.status === 'suspended' ? 'ระงับการใช้งาน' : 'เปิดใช้งาน');
      }
      if (p.revoke) { patch.token_ver = (Number(t.token_ver) || 0) + 1; notes.push('บังคับออกจากระบบ'); }
      if (u.role === 'super') {
        ['prefix', 'name', 'position'].forEach(function (k) { if (p[k] !== undefined) { patch[k] = clip(p[k], 120); } });
        if (p.phone !== undefined) {
          var ph = normPhone(p.phone);
          if (ph && !validPhone(ph)) fail('หมายเลขโทรศัพท์ไม่ถูกต้อง');
          if (ph && users().some(function (x) { return normPhone(x.phone) === ph && str(x.id) !== str(t.id); })) fail('หมายเลขโทรศัพท์นี้มีในระบบแล้ว');
          patch.phone = ph;
        }
        if (p.district !== undefined && t.role === 'district') {
          if (!districts().some(function (x) { return x.code === p.district; })) fail('กรุณาเลือกอำเภอ');
          patch.district = p.district;
        }
        if (p.role !== undefined && p.role !== t.role) {
          if (str(t.id) === str(u.id)) fail('ไม่สามารถเปลี่ยนบทบาทของตนเองได้');
          if (['district', 'mini', 'super'].indexOf(p.role) < 0) fail('บทบาทไม่ถูกต้อง');
          if (p.role !== 'district') {
            var un = normUser(p.username || t.username);
            if (!/^[a-z0-9._-]{3,30}$/.test(un)) fail('ต้องกำหนดชื่อผู้ใช้ (ภาษาอังกฤษ/ตัวเลข 3–30 ตัว) สำหรับบัญชีผู้ดูแล');
            if (users().some(function (x) { return normUser(x.username) === un && str(x.id) !== str(t.id); })) fail('ชื่อผู้ใช้นี้มีในระบบแล้ว');
            if (!t.pass_hash && str(p.password).length < 6) fail('กรุณากำหนดรหัสผ่าน (อย่างน้อย 6 ตัวอักษร)');
            patch.username = un;
          } else {
            if (!normPhone(t.phone) && !patch.phone) fail('เจ้าหน้าที่อำเภอต้องมีหมายเลขโทรศัพท์');
            if (!p.district && !t.district) fail('กรุณาเลือกอำเภอ');
            if (p.district) patch.district = p.district;
          }
          patch.role = p.role; patch.token_ver = (Number(t.token_ver) || 0) + 1;
          notes.push('เปลี่ยนบทบาท ' + (ROLE_TH[t.role] || t.role) + ' → ' + ROLE_TH[p.role]);
        }
        if (p.password) {
          if (str(p.password).length < 6) fail('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
          patch.salt = store.uuid(); patch.pass_hash = hashPass(patch.salt, str(p.password)); notes.push('ตั้งรหัสผ่านใหม่');
          if (p.username) patch.username = normUser(p.username);
        }
      }
      store.update(T.USERS, function (x) { return str(x.id) === str(t.id); }, patch);
      audit(u, 'user_update', (t.name || '') + ': ' + (notes.join(', ') || 'แก้ไขข้อมูล'), p._ua);
      return adminUser(users().filter(function (x) { return str(x.id) === str(t.id); })[0]);
    };
    A['admin.users.delete'] = function (p, u) {
      need(u, ['super']);
      var t = users().filter(function (x) { return str(x.id) === str(p.id); })[0];
      if (!t) fail('ไม่พบผู้ใช้');
      if (str(t.id) === str(u.id)) fail('ไม่สามารถลบบัญชีของตนเองได้');
      if (t.role === 'super' && users().filter(function (x) { return x.role === 'super'; }).length <= 1) fail('ต้องมี Super Admin อย่างน้อย 1 บัญชี');
      store.remove(T.USERS, function (x) { return str(x.id) === str(t.id); });
      audit(u, 'user_delete', 'ลบ' + (ROLE_TH[t.role] || '') + ': ' + t.name, p._ua);
      return true;
    };

    /* ── บันทึกการเข้าใช้งาน ── */
    A['admin.logs'] = function (p, u) {
      need(u, ['mini', 'super']);
      var limit = Math.min(Number(p.limit) || 1000, 5000);
      var all = store.rows(T.LOG);
      if (u.role === 'mini') all = all.filter(function (r) { return r.role !== 'super'; });
      return all.slice(-limit).reverse();
    };

    /* ── ตั้งค่า ── */
    A['admin.settings.get'] = function (p, u) {
      need(u, ['mini', 'super']);
      var s = settings(), keys = u.role === 'super' ? SUPER_KEYS : MINI_KEYS, out = [];
      DEFAULT_SETTINGS.forEach(function (d) { if (keys.indexOf(d[0]) >= 0) out.push({ key: d[0], value: s[d[0]], note: d[2] }); });
      return out;
    };
    A['admin.settings.save'] = function (p, u) {
      need(u, ['mini', 'super']);
      var keys = u.role === 'super' ? SUPER_KEYS : MINI_KEYS, changed = [];
      Object.keys(p.values || {}).forEach(function (k) {
        if (keys.indexOf(k) < 0) fail('ไม่มีสิทธิ์แก้ไขค่า ' + k, 'forbidden');
        var v = str(p.values[k]);
        if (k === 'QR_IMAGE' && v && !/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v)) fail('รูป QR Code ไม่ถูกต้อง');
        if (v.length > 45000) fail('ข้อมูล ' + k + ' ยาวเกินไป (รูปควรมีขนาดไม่เกิน 30 KB)');
        setSetting(k, v); changed.push(k);
      });
      audit(u, 'settings_update', changed.join(', '), p._ua);
      return A['public.bootstrap']().settings;
    };
    A['admin.rounds.save'] = function (p, u) {
      need(u, ['mini', 'super']);
      var re = /^\d{4}-\d{2}-\d{2}$/;
      (p.rounds || []).forEach(function (r) {
        var no = Number(r.round);
        if (!(no >= 0)) fail('ครั้งที่ไม่ถูกต้อง');
        ['start', 'end', 'due'].forEach(function (k) { if (r[k] && !re.test(r[k])) fail('รูปแบบวันที่ไม่ถูกต้อง (ครั้งที่ ' + no + ')'); });
        if (r.start && r.end && r.start > r.end) fail('วันเริ่มต้องไม่หลังวันสิ้นสุด (ครั้งที่ ' + no + ')');
        var patch = { label: clip(r.label, 80), start: r.start || '', end: r.end || '', due: r.due || '', open: !!r.open };
        var n = store.update(T.ROUNDS, function (x) { return Number(x.round) === no && x.round !== ''; }, patch);
        if (!n) { patch.round = no; store.insert(T.ROUNDS, patch); }
      });
      if (p.remove && p.remove.length) {
        var recs = records();
        p.remove.forEach(function (no) {
          if (recs.some(function (r) { return r.round === Number(no); })) fail('ลบครั้งที่ ' + no + ' ไม่ได้ เพราะมีรายงานแล้ว');
          store.remove(T.ROUNDS, function (x) { return Number(x.round) === Number(no) && x.round !== ''; });
        });
      }
      audit(u, 'rounds_update', (p.rounds || []).map(function (r) { return r.round + (r.open ? '(เปิด)' : ''); }).join(', ') + (p.remove && p.remove.length ? ' ลบ ' + p.remove.join(',') : ''), p._ua);
      return rounds();
    };

    A['log.event'] = function (p, u) {
      var ok = { print: 1, export_xlsx: 1, export_csv: 1, view_status: 1 };
      if (!ok[p.action]) fail('ไม่รู้จักเหตุการณ์');
      audit(u, p.action, clip(p.detail, 300), p._ua);
      return true;
    };

    var OPEN = { 'public.bootstrap': 1, 'public.summary': 1, 'auth.register': 1, 'auth.login': 1 };

    function handle(action, payload) {
      payload = payload || {};
      var fn = A[action];
      if (!fn) fail('ไม่รู้จักคำสั่ง: ' + action);
      if (OPEN[action]) return fn(payload, null);
      var u = auth(payload.token);
      return fn(payload, u);
    }

    /** สร้างโครงสร้างตารางและข้อมูลตั้งต้น (เรียกจาก setup) */
    function seed(opts) {
      opts = opts || {};
      if (!store.rows(T.SETTINGS).length) DEFAULT_SETTINGS.forEach(function (s) { store.insert(T.SETTINGS, { key: s[0], value: s[1], note: s[2] }); });
      else DEFAULT_SETTINGS.forEach(function (s) { if (!store.rows(T.SETTINGS).some(function (r) { return r.key === s[0]; })) store.insert(T.SETTINGS, { key: s[0], value: s[1], note: s[2] }); });
      if (!store.rows(T.DISTRICTS).length) DEFAULT_DISTRICTS.forEach(function (n, i) {
        store.insert(T.DISTRICTS, { code: 'D' + ('0' + (i + 1)).slice(-2), name: n, amp_code: String(6201 + i), active: true });
      });
      if (!store.rows(T.ROUNDS).length) {
        store.insert(T.ROUNDS, { round: 0, label: 'ยอดยกมา (ผลงานก่อนรายงานครั้งที่ 1)', start: '', end: '', due: '', open: true });
        var start = opts.start || store.today();
        genRounds(start, opts.count || 26, opts.openFirst === undefined ? 1 : opts.openFirst);
      }
      if (opts.superUser && !users().some(function (x) { return x.role === 'super'; })) {
        var salt = store.uuid();
        store.insert(T.USERS, { id: store.uuid(), role: 'super', username: normUser(opts.superUser.username), pass_hash: hashPass(salt, opts.superUser.password), salt: salt,
          phone: normPhone(opts.superUser.phone || ''), prefix: '', name: opts.superUser.name || 'Super Admin', position: opts.superUser.position || 'ผู้ดูแลระบบ',
          district: '', status: 'active', token_ver: 0, created_at: store.now(), created_by: 'setup', last_login: '', login_count: 0, last_seen: '' });
      }
    }
    function addDays(iso, n) {
      var p = iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
      return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
    }
    function genRounds(start, count, openUpTo) {
      var last = rounds().filter(function (r) { return r.round > 0; }).pop();
      var no = last ? last.round : 0, s = last && last.end ? addDays(last.end, 1) : start;
      for (var i = 0; i < count; i++) {
        no++;
        var e = addDays(s, 6);
        store.insert(T.ROUNDS, { round: no, label: 'ครั้งที่ ' + no, start: s, end: e, due: addDays(e, 2), open: no <= (openUpTo || 0) });
        s = addDays(e, 1);
      }
    }
    A['admin.rounds.generate'] = function (p, u) {
      need(u, ['mini', 'super']);
      var c = Math.min(Math.max(Number(p.count) || 1, 1), 60);
      if (p.start && !/^\d{4}-\d{2}-\d{2}$/.test(p.start)) fail('รูปแบบวันที่ไม่ถูกต้อง');
      genRounds(p.start || store.today(), c, 0);
      audit(u, 'rounds_update', 'สร้างรอบเพิ่ม ' + c + ' ครั้ง', p._ua);
      return rounds();
    };

    return { handle: handle, seed: seed, actions: A, settings: settings, records: records, dataColumns: function () { return dataColumns(items); } };
  }

  return { create: create, COLS: COLS, T: T, DEFAULT_SETTINGS: DEFAULT_SETTINGS, ROLE_TH: ROLE_TH, dataColumns: dataColumns,
    rowToRecord: rowToRecord, recordToRow: recordToRow, normPhone: normPhone };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AGServer;
