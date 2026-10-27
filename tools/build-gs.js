// สร้าง apps-script/Lib.gs จากไฟล์ที่ใช้ร่วมกับหน้าเว็บ: node tools/build-gs.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const parts = ['items.js', 'core.js', 'server.js'].map(f => {
  const src = fs.readFileSync(path.join(root, 'docs/assets/js', f), 'utf8');
  return '/* ───────── ' + f + ' ───────── */\n' + src;
});
const out = '/**\n * Lib.gs — สร้างอัตโนมัติจาก docs/assets/js/{items,core,server}.js (ห้ามแก้ไขไฟล์นี้โดยตรง)\n * รันคำสั่ง: node tools/build-gs.js\n */\n\n' + parts.join('\n\n');
fs.writeFileSync(path.join(root, 'apps-script/Lib.gs'), out);
console.log('apps-script/Lib.gs', out.length, 'bytes');
// ไฟล์เดียวจบ สำหรับคัดลอกไปวางใน Apps Script (Code.gs + Lib.gs)
const code = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
fs.writeFileSync(path.join(root, 'apps-script/KPP-AllInOne.gs'), code + '\n\n' + out);
console.log('apps-script/KPP-AllInOne.gs');
