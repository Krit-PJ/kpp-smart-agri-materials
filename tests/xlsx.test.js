// node tests/xlsx.test.js — ส่งออก Excel: แบบฟอร์มต้นฉบับ (ใช้แม่แบบเดิม) และแบบฟอร์มที่แก้ไข (สร้างตารางใหม่จากรูปแบบเดิม)
const assert = require('assert'), path = require('path'), ExcelJS = require('exceljs');
const J = p => require(path.join(__dirname, '../docs/assets/js', p));
global.AG_ITEMS = J('items.js');
global.AG_ITEMS_BASE = AG_ITEMS.map(o => Object.assign({}, o));
global.AGCore = J('core.js');
global.U = { thLong: s => s || '' };
global.S = {}; global.window = {};
const src = require('fs').readFileSync(path.join(__dirname, '../docs/assets/js/xlsx-export.js'), 'utf8');
const Exporter = new Function('U', 'S', 'AGCore', src + '\nreturn Exporter;')(U, S, AGCore);
const TPL = path.join(__dirname, '../docs/assets/template.xlsx');
const districts = [{ code: 'D01', name: 'เมือง' }];
const rec = (values) => ({ round: 1, district: 'D01', status: 'submitted', values, sec4: [{ id: 'a', t: 'กิจกรรมพิเศษ', v: 2, u: 'ครั้ง' }], sec5: 'ปัญหา', meta: {} });
function opts(items, comp) {
  return { scope: 'D01', comp, items, districts, zeroWeek: false,
    head: { title: 'T', season: '2569', office: 'O', roundNo: 1, start: '2026-10-22', end: '2026-10-28', ref1: 'a', ref2: 'b' },
    sign: { name: 'นายทดสอบ ระบบ', title: 'นวก.' }, qr: { note: 'หมายเหตุ', link: 'https://x' } };
}
(async () => {
  // 1) แบบฟอร์มต้นฉบับ → ตำแหน่งแถวเดิมของแม่แบบ
  let wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(TPL);
  let comp = AGCore.computeDistrict(AG_ITEMS, [rec({ R31: { v: 120 } })], 'D01', 1);
  assert(Exporter.sameAsBase(AGCore.shownItems(AG_ITEMS, comp)));
  Exporter.fill(wb, opts(AGCore.shownItems(AG_ITEMS, comp), comp));
  let ws = wb.worksheets[0];
  assert.strictEqual(ws.getCell('E31').value, 120); assert.strictEqual(ws.getCell('H31').value, 120);
  assert.strictEqual(ws.getCell('B66').value, 'กิจกรรมพิเศษ'); assert.strictEqual(ws.getCell('F76').value, 'ทดสอบ ระบบ');
  // 2) แบบฟอร์มแก้ไข: เพิ่ม 2 ข้อ (หลัง R32), ยกเลิกใช้ R27 (ไม่มีข้อมูล), แก้ถ้อยคำ R31
  const items = AG_ITEMS.map(o => Object.assign({}, o));
  items.find(i => i.id === 'R31').label = items.find(i => i.id === 'R31').printLabel = '- ไถกลบตอซัง (แก้ไข)';
  items.find(i => i.id === 'R27').retired = true;
  const k = items.findIndex(i => i.id === 'R32') + 1;
  items.splice(k, 0, { id: 'N1', section: '2', code: '2.2', label: 'อัดฟางก้อน', printLabel: '- อัดฟางก้อน', unit: 'ตัน', type: 'num', agg: 'sum', level: 2, print: '', row: null, h: 24.75 },
    { id: 'N2', section: '2', code: '2.4', label: 'ข้อใหม่แบบ มี/ไม่มี', printLabel: 'ข้อใหม่แบบ มี/ไม่มี', unit: '', type: 'check', agg: 'sum', level: 1, print: 'gray', row: null, h: 24.75 });
  comp = AGCore.computeDistrict(items, [rec({ R31: { v: 7 }, N1: { v: 3.5 }, N2: { h: 'Y' } })], 'D01', 1);
  const shown = AGCore.shownItems(items, comp);
  assert(!shown.some(i => i.id === 'R27') && !Exporter.sameAsBase(shown));
  wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(TPL);
  const name0 = wb.worksheets[0].name, n0 = wb.worksheets.length;
  Exporter.fill(wb, opts(shown, comp));
  ws = wb.worksheets[0];
  assert.strictEqual(wb.worksheets.length, n0); assert.strictEqual(ws.name, name0);
  const find = t => { let hit = null; ws.eachRow((row, n) => { const v = String(row.getCell(2).value || '') + String(row.getCell(1).value || ''); if (!hit && v.includes(t)) hit = n; }); return hit; };
  const rN1 = find('อัดฟางก้อน'), rR31 = find('(แก้ไข)'), rN2 = find('ข้อใหม่แบบ');
  assert(rN1 && rR31 && rN2 && rN1 > rR31, 'ข้อใหม่อยู่ถัดจากข้อเดิม');
  assert.strictEqual(ws.getCell('E' + rN1).value, 3.5); assert.strictEqual(ws.getCell('G' + rN1).value, 'ตัน');
  assert.strictEqual(ws.getCell('E' + rR31).value, 7);
  assert.strictEqual(ws.getCell('C' + rN2).value, '/');
  assert.strictEqual(ws.getCell('B' + rN1).font.name, 'TH Sarabun New', 'ใช้รูปแบบตัวอักษรของแบบฟอร์มเดิม');
  assert(!find('การดำเนินการอื่น ๆ (ถ้ามี) โปรดระบุ.....') || find('โปรดระบุ') !== 27, 'ไม่มีข้อที่ยกเลิกใช้');
  const off = shown.length - AG_ITEMS.length; // แถวที่เพิ่ม/ลด
  assert.strictEqual(ws.getCell('A' + (65 + off)).text.slice(0, 2), '4.', 'หัวข้อ 4 เลื่อนตามจำนวนข้อ');
  assert.strictEqual(ws.getCell('B' + (66 + off)).value, 'กิจกรรมพิเศษ');
  assert.strictEqual(ws.getCell('F' + (76 + off)).value, 'ทดสอบ ระบบ');
  assert.strictEqual(ws.getCell('B' + (82 + off)).value, 'https://x');
  assert.strictEqual(ws.getCell('A' + (rN2)).value, '2.4');
  await wb.xlsx.writeFile(path.join(require('os').tmpdir(), 'kpp-custom.xlsx'));
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.readFile(path.join(require('os').tmpdir(), 'kpp-custom.xlsx'));
  assert.strictEqual(wb2.worksheets[0].getCell('E' + rN1).value, 3.5, 'เปิดไฟล์ที่บันทึกได้');
  console.log('✓ xlsx export tests passed (custom form rows: ' + shown.length + ', offset ' + off + ')');
})().catch(e => { console.error(e); process.exit(1); });
