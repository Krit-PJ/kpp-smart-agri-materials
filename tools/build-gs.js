// สร้างไฟล์ Apps Script สำหรับติดตั้ง: node tools/build-gs.js
// apps-script/KPP-AllInOne.gs = Code.gs (ต้นฉบับฝั่ง Google Sheets) + ไฟล์ที่ใช้ร่วมกับหน้าเว็บใน docs/assets/js
// (ระบบจริงติดตั้งไฟล์นี้ไฟล์เดียว — แก้ไขที่ต้นฉบับเท่านั้น ห้ามแก้ KPP-AllInOne.gs โดยตรง)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const SHARED = ['items.js', 'core.js', 'server.js'];
const lib = SHARED.map(f => '/* ───────── ' + f + ' ───────── */\n' + fs.readFileSync(path.join(root, 'docs/assets/js', f), 'utf8')).join('\n\n');
const code = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const head = '/**\n * KPP-AllInOne.gs — สร้างอัตโนมัติด้วย node tools/build-gs.js (ห้ามแก้ไขไฟล์นี้โดยตรง)\n' +
  ' * ต้นฉบับ: apps-script/Code.gs + docs/assets/js/{' + SHARED.join(',') + '}\n */\n\n';
const out = head + code + '\n\n' + lib;
fs.writeFileSync(path.join(root, 'apps-script/KPP-AllInOne.gs'), out);
const old = path.join(root, 'apps-script/Lib.gs');
if (fs.existsSync(old)) fs.unlinkSync(old); // รุ่นเก่าแยก Lib.gs — รวมเป็นไฟล์เดียวแล้ว
console.log('apps-script/KPP-AllInOne.gs', out.length, 'chars');
