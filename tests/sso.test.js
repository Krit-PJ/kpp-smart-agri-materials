// node tests/sso.test.js — เข้าสู่ระบบด้วยตัวตนกลาง (SSO) ร่วมกับ Agri-Risk Map / Green Gain Hub
const assert = require('assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const J = p => require(path.join(__dirname, '../docs/assets/js', p));
global.AG_ITEMS = J('items.js');
global.AGCore = J('core.js');
const AGServer = J('server.js');
const LocalStore = J('store-local.js');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

/* ── ระบบตัวตนกลางจำลอง (พฤติกรรมเดียวกับ Agri-Risk id_redeem / id_register) ── */
const people = {}, tickets = {}, calls = [];
let down = false;
function idp(action, body) {
  calls.push([action, body]);
  if (down) throw new Error('timeout');
  if (action === 'id_redeem') {
    const t = tickets[body.ticket];
    if (!t) return { ok: false, error: 'ตั๋วไม่ถูกต้อง' };
    if (t.used) return { ok: false, error: 'ตั๋วนี้ถูกใช้แล้ว' };
    if (t.aud !== body.aud) return { ok: false, error: 'ตั๋วนี้ไม่ได้ออกให้ระบบนี้' };
    t.used = true;
    const p = people[t.phone];
    if (!p || p.status !== 'active') return { ok: false, error: 'บัญชีถูกระงับหรือไม่พบตัวตน' };
    return { ok: true, person: { personId: 'P' + t.phone, phone: t.phone, fullName: p.fullName, position: p.position } };
  }
  if (action === 'id_register') {
    if (body.consent !== true) return { ok: false, error: 'กรุณายอมรับเงื่อนไข' };
    if (people[body.phone]) return { ok: false, error: 'หมายเลขนี้ลงทะเบียนแล้ว กรุณาเข้าสู่ระบบ' };
    people[body.phone] = Object.assign({ status: 'active' }, body);
    return { ok: true, token: 'x' };
  }
  return { ok: false, error: 'unknown action' };
}
let seq = 0;
const ticket = (phone, aud) => { const k = 'tk' + (++seq) + '.sig'; tickets[k] = { phone, aud: aud || 'SAM' }; return k; };

const store = LocalStore.create({ clock: () => new Date('2026-11-18T03:00:00Z') });
store.idp = idp;
const S = AGServer.create(store, AG_ITEMS);
S.seed({ start: '2026-10-22', count: 4, openFirst: 2, superUser: { username: 'Krit', password: 'secret99', name: 'กิตติ' } });
const call = (a, p) => S.handle(a, Object.assign({ _ua: 'test' }, p || {}));
const err = (a, p, re) => { assert.throws(() => call(a, p), re); n++; };
const errCode = (a, p, code) => { try { call(a, p); assert.fail('ควรล้มเหลว'); } catch (e) { assert.strictEqual(e.code, code, e.message); n++; } };

const sup = call('auth.login', { username: 'krit', password: 'secret99' }).token;
call('admin.users.create', { token: sup, role: 'mini', username: 'mini1', password: 'abcdef12', name: 'มินิ', phone: '0855555555' });

// ค่าเริ่มต้น optional และแสดงในข้อมูลสาธารณะ
ok(call('public.bootstrap').settings.SSO_MODE === 'optional', 'SSO_MODE ค่าเริ่มต้น');

// ผู้ใช้เดิม (ลงทะเบียนด้วยวิธีเดิม) → สร้างตัวตนกลางจากข้อมูลเดิม
call('auth.register', { phone: '0812345678', prefix: 'นาย', name: 'สมชาย ใจดี', position: 'นวก.', district: 'D03' });
ok(call('auth.ssoProvision', { phone: '0812345678' }).status === 'provisioned', 'provision ผู้ใช้เดิม');
const reg = calls.filter(c => c[0] === 'id_register').pop()[1];
ok(reg.consent === true && reg.system === 'SAM' && reg.provinceCode === '62' && reg.fullName === 'นายสมชาย ใจดี' && /อำเภอ/.test(reg.affiliation), 'ข้อมูลที่ส่งไปตัวตนกลาง');
ok(call('auth.ssoProvision', { phone: '0812345678' }).status === 'exists', 'provision ซ้ำ = exists');
ok(call('auth.ssoProvision', { phone: '0899999999' }).status === 'none', 'เบอร์ที่ไม่มีในระบบไม่ถูกส่งออกไป');
ok(!people['0899999999'], 'ไม่สร้างตัวตนให้เบอร์แปลกปลอม');
ok(call('auth.ssoProvision', { phone: '0855555555' }).status === 'none', 'ไม่สร้างตัวตนกลางให้ Mini');

// แลกตั๋ว → session ของระบบนี้
const r1 = call('auth.sso', { ticket: ticket('0812345678') });
ok(r1.token && r1.user.role === 'district' && r1.user.district === 'D03', 'เข้าสู่ระบบด้วยตั๋ว');
ok(call('auth.me', { token: r1.token }).user.name === 'สมชาย ใจดี', 'token ใช้ได้');
ok(calls.filter(c => c[0] === 'id_redeem').pop()[1].aud === 'SAM', 'aud = SAM');
const used = 'tk' + seq + '.sig';
err('auth.sso', { ticket: used }, /ถูกใช้แล้ว/);
err('auth.sso', { ticket: ticket('0812345678', 'GGH') }, /ไม่ได้ออกให้ระบบนี้/);
errCode('auth.sso', { ticket: 'bad ticket<>' }, 'auth');
errCode('auth.sso', {}, 'auth');

// มีตัวตนกลาง (จาก Agri-Risk/GGH) แต่ยังไม่มีบัญชีระบบนี้ → need_register (ไม่สร้างบัญชีเอง: ต้องเลือกอำเภอ)
people['0866666666'] = { status: 'active', fullName: 'สมศรี มีสุข', position: 'นักวิชาการ' };
const nr = call('auth.sso', { ticket: ticket('0866666666') });
ok(nr.status === 'need_register' && nr.phone === '0866666666' && nr.name === 'สมศรี มีสุข' && !nr.token, 'need_register');
ok(!store.rows('Users').some(u => u.phone === '0866666666'), 'ไม่สร้างแถว Users อัตโนมัติ');

// Mini/Super ต้องใช้ชื่อผู้ใช้ + รหัสผ่าน
people['0855555555'] = { status: 'active', fullName: 'มินิ' };
errCode('auth.sso', { ticket: ticket('0855555555') }, 'admin_account');

// ระงับในระบบนี้ → เข้าไม่ได้ แม้ตัวตนกลางยังใช้งานอยู่
const uid = store.rows('Users').find(u => u.phone === '0812345678').id;
call('admin.users.update', { token: sup, id: uid, status: 'suspended' });
err('auth.sso', { ticket: ticket('0812345678') }, /ระงับ/);
ok(call('auth.ssoProvision', { phone: '0812345678' }).status === 'none', 'บัญชีระงับไม่ถูก provision');
call('admin.users.update', { token: sup, id: uid, status: 'active' });

// ตัวตนกลางถูกระงับ ("ไม่ใช่ฉัน") → แลกตั๋วไม่ได้
people['0812345678'].status = 'suspended';
err('auth.sso', { ticket: ticket('0812345678') }, /ระงับ/);
people['0812345678'].status = 'active';

// ตัวตนกลางล่ม → รหัส sso_unreachable (หน้าเว็บสลับไปวิธีเดิม)
down = true;
errCode('auth.sso', { ticket: ticket('0812345678') }, 'sso_unreachable');
down = false;

// บันทึกการเข้าใช้งาน
const logs = call('admin.logs', { token: sup });
ok(logs.some(l => l.action === 'login' && /ตัวตนกลาง/.test(l.detail)), 'log เข้าสู่ระบบผ่าน SSO');
ok(logs.some(l => l.action === 'sso_provision'), 'log การสร้างตัวตนกลาง');

// โหมด required: ปิดการเข้าด้วยเบอร์แบบเดิม (ชื่อผู้ใช้/รหัสผ่านยังใช้ได้)
err('admin.settings.save', { token: sup, values: { SSO_MODE: 'maybe' } }, /SSO_MODE/);
call('admin.settings.save', { token: sup, values: { SSO_MODE: 'required' } });
errCode('auth.login', { phone: '0812345678' }, 'sso_required');
ok(call('auth.login', { username: 'mini1', password: 'abcdef12' }).token, 'Mini ยังเข้าด้วยรหัสผ่านได้');
ok(call('auth.sso', { ticket: ticket('0812345678') }).token, 'required: SSO ใช้ได้');
// Mini แก้ SSO_MODE ไม่ได้
const mini = call('auth.login', { username: 'mini1', password: 'abcdef12' }).token;
errCode('admin.settings.save', { token: mini, values: { SSO_MODE: 'off' } }, 'forbidden');

// โหมด off: SSO ปิด, วิธีเดิมใช้ได้
call('admin.settings.save', { token: sup, values: { SSO_MODE: 'off' } });
errCode('auth.sso', { ticket: ticket('0812345678') }, 'sso_off');
ok(call('auth.ssoProvision', { phone: '0812345678' }).status === 'off', 'off: ไม่ provision');
ok(call('auth.login', { phone: '0812345678' }).token, 'off: เบอร์โทรแบบเดิมใช้ได้');

// โหมดทดลอง (ไม่มี store.idp): required ไม่ปิดวิธีเดิม และ SSO ตอบ sso_off
const st2 = LocalStore.create({ clock: () => new Date('2026-11-18T03:00:00Z') });
const S2 = AGServer.create(st2, AG_ITEMS);
S2.seed({ start: '2026-10-22', count: 2, openFirst: 1 });
st2.update('Settings', r => r.key === 'SSO_MODE', { value: 'required' });
S2.handle('auth.register', { phone: '0812222222', name: 'ทดลอง ระบบ', position: 'x', district: 'D01' });
ok(S2.handle('auth.login', { phone: '0812222222' }).token, 'โหมดทดลองไม่ถูกบังคับ SSO');
try { S2.handle('auth.sso', { ticket: 'a.b' }); assert.fail(); } catch (e) { ok(e.code === 'sso_off', e.message); }

/* ── Code.gs: SheetStore_.idp เรียก Agri-Risk ผ่าน UrlFetchApp ── */
const fetched = [];
const props = {};
const ctx = { console, JSON, Object, String, Date,
  UrlFetchApp: { fetch: (url, o) => { fetched.push([url, o]); return { getContentText: () => JSON.stringify({ ok: true, echo: JSON.parse(o.payload) }) }; } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) }, Logger: { log() { } },
  SpreadsheetApp: { openById: () => ({}), getActiveSpreadsheet: () => ({}) } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);
let res = vm.runInContext('new SheetStore_().idp("id_redeem", { ticket: "a.b", aud: "SAM" })', ctx);
ok(res.ok && res.echo.action === 'id_redeem' && res.echo.ticket === 'a.b' && res.echo.aud === 'SAM', 'payload ไป Agri-Risk');
ok(/AKfycbzAgSOx/.test(fetched[0][0]) && fetched[0][1].method === 'post' && fetched[0][1].muteHttpExceptions, 'URL/ตัวเลือกเริ่มต้น');
props.SSO_IDP_URL = 'https://example.test/exec';
vm.runInContext('new SheetStore_().idp("ping", {})', ctx);
ok(fetched[1][0] === 'https://example.test/exec', 'SSO_IDP_URL แทนค่าเริ่มต้นได้');
ctx.UrlFetchApp.fetch = () => ({ getContentText: () => '<html>error</html>' });
ok(vm.runInContext('new SheetStore_().idp("ping", {})', ctx) === null, 'ตอบไม่ใช่ JSON → null (server แจ้ง sso_unreachable)');
// ไฟล์ติดตั้งจริงมีโค้ดล่าสุด
const all = fs.readFileSync(path.join(__dirname, '../apps-script/KPP-AllInOne.gs'), 'utf8');
ok(all.includes("A['auth.sso']") && all.includes('SheetStore_.prototype.idp') && all.includes('function ssoCheck'), 'KPP-AllInOne.gs สร้างใหม่แล้ว');

console.log('✓ SSO tests passed (' + n + ' checks)');
