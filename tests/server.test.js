// node tests/server.test.js — ทดสอบกฎของระบบทั้งหมดกับที่เก็บข้อมูลในหน่วยความจำ
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const J = p => require(path.join(__dirname, '../docs/assets/js', p));
global.AG_ITEMS = J('items.js');
global.AGCore = J('core.js');
const AGServer = J('server.js');
const LocalStore = J('store-local.js');

// sha256 ของโหมดทดลองต้องตรงกับมาตรฐาน (ใช้ร่วมกับ Apps Script)
assert.strictEqual(LocalStore.sha256('abc:ทดสอบ'), crypto.createHash('sha256').update('abc:ทดสอบ').digest('hex'));

const store = LocalStore.create({ clock: () => new Date('2026-10-28T03:00:00Z') });
const S = AGServer.create(store, AG_ITEMS);
S.seed({ start: '2026-10-22', count: 10, openFirst: 2, superUser: { username: 'Krit', password: 'secret99', name: 'กิตติ โพธิ์จวง' } });
const call = (a, p) => S.handle(a, Object.assign({ _ua: 'test' }, p || {}));
const err = (a, p, re) => assert.throws(() => call(a, p), re);

// bootstrap
const boot = call('public.bootstrap');
assert.strictEqual(boot.districts.length, 11);
assert.strictEqual(boot.rounds.length, 11);
assert.deepStrictEqual(boot.rounds.slice(0, 3).map(r => [r.round, r.start, r.end, r.due, r.open]),
  [[0, '', '', '', true], [1, '2026-10-22', '2026-10-28', '2026-10-30', true], [2, '2026-10-29', '2026-11-04', '2026-11-06', true]]);
assert(boot.settings.DOC_REF_2.includes('0624/ว 115'));

// super login (username ไม่สนตัวพิมพ์)
err('auth.login', { username: 'krit', password: 'wrong' }, /ไม่ถูกต้อง/);
const sup = call('auth.login', { username: 'KRIT', password: 'secret99' });
assert.strictEqual(sup.user.role, 'super');
const ST = sup.token;

// ลงทะเบียน + login ด้วยเบอร์โทร
err('auth.login', { phone: '0812345678' }, /ยังไม่ได้ลงทะเบียน/);
err('auth.register', { phone: '12', name: 'นาย ก', position: 'x', district: 'D01' }, /โทรศัพท์/);
err('auth.register', { phone: '0812345678', name: 'นาย ก ข', position: 'นวก.', district: 'X' }, /อำเภอ/);
const r1 = call('auth.register', { phone: '081-234-5678', prefix: 'นาย', name: 'สมชาย ใจดี', position: 'นักวิชาการ', district: 'D01' });
assert(r1.token && r1.user.district === 'D01' && r1.user.role === 'district');
err('auth.register', { phone: '0812345678', name: 'ซ้ำ ซ้ำ', position: 'x', district: 'D02' }, /ลงทะเบียนแล้ว/);
const A1 = call('auth.login', { phone: '812345678' }).token; // ไม่มี 0 นำหน้าก็ได้
const A2 = call('auth.register', { phone: '0899999999', name: 'สมหญิง รักดี', position: 'นวก.', district: 'D02' }).token;

// token ปลอม
err('data.records', { token: 'x.y.z.w' }, /ไม่ถูกต้อง/);
err('data.records', {}, /เข้าสู่ระบบ/);

// อำเภอแก้ได้เฉพาะของตนเอง
err('data.save', { token: A1, round: 1, district: 'D02', values: {} }, /ของอำเภอตนเอง/);
// รอบที่ปิด
err('data.save', { token: A1, round: 3, district: 'D01', values: { R29: { v: 1 } } }, /ปิดรับ/);

// ยอดยกมา (ส่งแล้ว) + ครั้งที่ 1 ร่าง
call('data.save', { token: A1, round: 0, district: 'D01', mode: 'submit', values: { R29: { v: 10 }, R31: { v: 100 } } });
let rec = call('data.save', { token: A1, round: 1, district: 'D01', mode: 'draft', values: { R29: { v: 5 }, R32: { t: 'อัดฟาง', v: 50, u: 'ไร่' } },
  sec4: [{ id: 'gg1', t: 'Green Gain Hub', h: 'Y', v: 1, u: 'แห่ง' }], sec5: 'ขาดเครื่องอัดฟาง' });
assert.strictEqual(rec.status, 'draft');
err('data.save', { token: A1, round: 1, district: 'D01', values: { R29: { v: -1 } } }, /ติดลบ/);
err('data.save', { token: A1, round: 1, district: 'D01', values: { R29: { v: 'abc' } } }, /ตัวเลขไม่ถูกต้อง/);

// ร่างยังไม่นับในจังหวัด
let recs = call('data.records', { token: ST });
let p = AGCore.computeProvince(AG_ITEMS, recs, boot.districts, 1);
assert.strictEqual(p.items.R29.cum, 10); assert.strictEqual(p.items.R29.week, null);
// มุมมองอำเภอ (นับร่างครั้งปัจจุบัน)
let dv = AGCore.computeDistrict(AG_ITEMS, call('data.records', { token: A1 }), 'D01', 1, { includeCurrent: true });
assert.strictEqual(dv.items.R29.cum, 15); assert.strictEqual(dv.items.R29.prevCum, 10);
assert.strictEqual(dv.items.R32.unit, 'ไร่'); assert.strictEqual(dv.items.R32.cum, 50);
assert.strictEqual(dv.sec4[0].cum, 1);
// อำเภอเห็นเฉพาะของตนเอง
assert(call('data.records', { token: A2 }).length === 0);

// ส่งจริง
call('data.save', { token: A1, round: 1, district: 'D01', mode: 'submit', values: { R29: { v: 5 }, R32: { t: 'อัดฟาง', v: 50, u: 'ไร่' } }, sec4: [{ id: 'gg1', t: 'Green Gain Hub', h: 'Y', v: 1, u: 'แห่ง' }], sec5: 'ขาดเครื่องอัดฟาง' });
call('data.save', { token: A2, round: 1, district: 'D02', mode: 'submit', values: { R29: { v: 2 }, R32: { t: 'ไถกลบ', v: 30, u: 'ไร่' } }, sec4: [{ id: 'x1', t: 'green gain hub', v: 2, u: 'แห่ง' }] });
recs = call('data.records', { token: ST });
p = AGCore.computeProvince(AG_ITEMS, recs, boot.districts, 1);
assert.strictEqual(p.items.R29.cum, 17); assert.strictEqual(p.items.R29.week, 7);
assert.strictEqual(p.items.R32.cum, 80); assert.strictEqual(p.items.R32.unit, 'ไร่');
assert.strictEqual(p.sec4.length, 1, 'รวมกิจกรรมชื่อเดียวกันข้ามอำเภอ'); assert.strictEqual(p.sec4[0].cum, 3);
assert.strictEqual(p.sec5.length, 1); assert.deepStrictEqual(p.reported.sort(), ['D01', 'D02']);
// ส่งซ้ำ = แทนที่
call('data.save', { token: A1, round: 1, district: 'D01', mode: 'submit', values: { R29: { v: 6 } }, sec4: [{ id: 'gg1', t: 'Green Gain Hub', v: 0, u: 'แห่ง' }] });
recs = call('data.records', { token: ST });
assert.strictEqual(recs.filter(r => r.round === 1 && r.district === 'D01').length, 1);
assert.strictEqual(AGCore.computeProvince(AG_ITEMS, recs, boot.districts, 1).items.R29.cum, 18);
// ยกกิจกรรมข้อ 4 ไปครั้งถัดไป
assert.deepStrictEqual(AGCore.carrySec4(recs, 'D01', 2), [{ id: 'gg1', t: 'Green Gain Hub', h: '', v: '', u: 'แห่ง' }]);

// ถอนรายงาน → ร่าง
call('data.withdraw', { token: A1, round: 1, district: 'D01' });
recs = call('data.records', { token: ST });
assert.strictEqual(AGCore.recordOf(recs, 'D01', 1).status, 'draft');
call('data.save', { token: A1, round: 1, district: 'D01', mode: 'submit', values: { R29: { v: 6 } } });

// สถานะ: อำเภอดูไม่ได้ (ค่าเริ่มต้น)
err('status.get', { token: A1 }, /เฉพาะผู้ดูแล/);
let st = call('status.get', { token: ST });
assert.strictEqual(st.matrix.D01[1].status, 'submitted');
// mini
const mini = call('admin.users.create', { token: ST, role: 'mini', username: 'mini01', password: 'abc123', name: 'ผู้รวบรวม หนึ่ง', position: 'นวก.' });
err('admin.users.create', { token: A1, role: 'mini', username: 'x', password: 'abcdef', name: 'aaa' }, /ไม่มีสิทธิ์/);
const MT = call('auth.login', { username: 'mini01', password: 'abc123' }).token;
err('admin.users.create', { token: MT, role: 'mini', username: 'mini02', password: 'abcdef', name: 'aaa bbb' }, /ไม่มีสิทธิ์/);
// mini เปิดให้อำเภอดูสถานะ
call('admin.settings.save', { token: MT, values: { STATUS_VISIBLE_TO_DISTRICT: 'TRUE', SEASON: '2569 - 2570' } });
st = call('status.get', { token: A1 });
assert.strictEqual(st.matrix.D02[1].by, '', 'อำเภอไม่เห็นชื่อผู้ส่งของอำเภออื่น');
err('admin.settings.save', { token: MT, values: { REGISTRATION_OPEN: 'FALSE' } }, /ไม่มีสิทธิ์/);
// mini แก้รายงานอำเภอไม่ได้ แต่ส่งกลับแก้ไขได้
err('data.save', { token: MT, round: 1, district: 'D01', values: {} }, /ส่งกลับแก้ไข/);
err('data.review', { token: MT, round: 1, district: 'D01', decision: 'return' }, /ระบุ/);
call('data.review', { token: MT, round: 1, district: 'D01', decision: 'return', note: 'ตรวจสอบพื้นที่ไถกลบ' });
recs = call('data.records', { token: A1 });
assert.strictEqual(AGCore.recordOf(recs, 'D01', 1).status, 'returned');
assert(!AGCore.isCounted(AGCore.recordOf(recs, 'D01', 1)));
call('data.save', { token: A1, round: 1, district: 'D01', mode: 'submit', values: { R29: { v: 6 } } });
call('data.review', { token: MT, round: 1, district: 'D01', decision: 'accept' });
err('data.save', { token: A1, round: 1, district: 'D01', mode: 'submit', values: { R29: { v: 7 } } }, /ตรวจรับ/);
err('data.withdraw', { token: A1, round: 1, district: 'D01' }, /ยังไม่ตรวจรับ/);
// super แก้ได้ทุกกรณี รวมถึงรอบที่ปิด
call('data.save', { token: ST, round: 3, district: 'D05', mode: 'submit', values: { R31: { v: 9 } } });

// จัดการผู้ใช้
let list = call('admin.users.list', { token: MT });
assert(list.every(u => u.role === 'district'), 'mini เห็นเฉพาะบัญชีอำเภอ');
assert.strictEqual(call('admin.users.list', { token: ST }).length, 4);
const a2id = list.find(u => u.phone === '0899999999').id;
call('admin.users.update', { token: MT, id: a2id, status: 'suspended' });
err('data.records', { token: A2 }, /ระงับ|ยกเลิก/);
err('auth.login', { phone: '0899999999' }, /ระงับ/);
call('admin.users.update', { token: MT, id: a2id, status: 'active' });
call('auth.login', { phone: '0899999999' });
err('admin.users.update', { token: MT, id: mini.id, status: 'suspended' }, /เฉพาะบัญชีเจ้าหน้าที่อำเภอ/);
// เลื่อนเป็น mini ต้องมี username/password
err('admin.users.update', { token: ST, id: a2id, role: 'mini' }, /ชื่อผู้ใช้/);
call('admin.users.update', { token: ST, id: a2id, role: 'mini', username: 'somying', password: 'pass1234' });
err('auth.login', { phone: '0899999999' }, /ชื่อผู้ใช้และรหัสผ่าน/);
call('auth.login', { username: 'somying', password: 'pass1234' });
// ลบ
err('admin.users.delete', { token: MT, id: a2id }, /ไม่มีสิทธิ์/);
call('admin.users.delete', { token: ST, id: a2id });
err('admin.users.delete', { token: ST, id: sup.user.id }, /ตนเอง/);
// mini token ถูกยกเลิกเมื่อลบ/เปลี่ยน
call('admin.users.update', { token: ST, id: mini.id, revoke: true });
err('admin.logs', { token: MT }, /ยกเลิก/);

// เปลี่ยนรหัสผ่าน
call('auth.changePassword', { token: ST, oldPassword: 'secret99', newPassword: 'newpass77' });
err('auth.login', { username: 'krit', password: 'secret99' }, /ไม่ถูกต้อง/);
const ST2 = call('auth.login', { username: 'krit', password: 'newpass77' }).token;

// ล็อกเมื่อผิดหลายครั้ง
for (let i = 0; i < 8; i++) { try { call('auth.login', { username: 'krit', password: 'bad' }); } catch (e) { } }
err('auth.login', { username: 'krit', password: 'newpass77' }, /15 นาที/);

// รอบรายงาน
let rr = call('admin.rounds.save', { token: ST2, rounds: [{ round: 3, label: 'ครั้งที่ 3', start: '2026-11-05', end: '2026-11-11', due: '2026-11-13', open: true }] });
assert.strictEqual(rr.find(r => r.round === 3).open, true);
err('admin.rounds.save', { token: ST2, rounds: [{ round: 4, start: '2026-11-20', end: '2026-11-10' }] }, /ไม่หลัง/);
err('admin.rounds.save', { token: ST2, rounds: [], remove: [1] }, /มีรายงานแล้ว/);
rr = call('admin.rounds.generate', { token: ST2, count: 2 });
assert.strictEqual(rr.length, 13);

// บันทึกการใช้งาน
call('log.event', { token: ST2, action: 'print', detail: 'จังหวัด ครั้งที่ 1' });
const logs = call('admin.logs', { token: ST2 });
const acts = new Set(logs.map(l => l.action));
['login', 'login_failed', 'register', 'save_draft', 'submit', 'withdraw', 'review_return', 'review_accept', 'user_create', 'user_update', 'user_delete', 'settings_update', 'password_change', 'print', 'rounds_update']
  .forEach(a => assert(acts.has(a), 'log ' + a));
assert(logs[0].action === 'print', 'ล่าสุดอยู่บนสุด');

// public summary ไม่มีข้อมูลส่วนบุคคล
const pub = call('public.summary');
assert(pub.enabled && pub.records.every(r => !r.meta.reporter && AGCore.isCounted(r)));
// ผ่านการแปลง row ↔ record (เหมือนใน Google Sheets)
const row = AGServer.recordToRow(AG_ITEMS, AGCore.recordOf(recs, 'D01', 0), 'เมือง');
const back = AGServer.rowToRecord(AG_ITEMS, row);
assert.strictEqual(back.values.R29.v, 10);
console.log('✓ server tests passed (' + logs.length + ' log rows)');

// ═════════ ตัวชี้วัดอื่น: ค่าเริ่มต้นปิด, ผู้ดูแลจังหวัดเปิด-ปิดได้ ═════════
assert.strictEqual(call('public.bootstrap').settings.SHOW_OTHER_INDICATORS, 'FALSE');
const MT2 = call('auth.login', { username: 'mini01', password: 'abc123' }).token;
call('admin.settings.save', { token: MT2, values: { SHOW_OTHER_INDICATORS: 'TRUE' } });
assert.strictEqual(call('public.bootstrap').settings.SHOW_OTHER_INDICATORS, 'TRUE');
err('admin.settings.save', { token: MT2, values: { API_REQUIRE_KEY: 'FALSE' } }, /ไม่มีสิทธิ์/);
err('admin.settings.save', { token: A1, values: { SHOW_OTHER_INDICATORS: 'FALSE' } }, /ไม่มีสิทธิ์/);

// ═════════ Data API v1 ═════════
const apiErr = (p, code) => { try { S.api(p); assert.fail('ควร error'); } catch (e) { assert.strictEqual(e.code, code, e.message); } };
apiErr({ endpoint: 'summary' }, 'key_required');
apiErr({ endpoint: 'summary', key: 'kpp_wrong' }, 'invalid_key');
err('admin.apikeys.create', { token: MT2, label: 'x' }, /ไม่มีสิทธิ์/);
const key = call('admin.apikeys.create', { token: ST2, label: 'Dashboard จังหวัด' });
assert(/^kpp_[0-9a-f]{40}$/.test(key.key));
assert(!JSON.stringify(call('admin.apikeys.list', { token: ST2 })).includes(key.key), 'ไม่เก็บ/ไม่แสดง key เต็ม');
apiErr({ endpoint: 'nope', key: key.key }, 'bad_endpoint');
apiErr({ endpoint: 'summary', key: key.key, round: 99 }, 'bad_round');
apiErr({ endpoint: 'summary', key: key.key, items: 'X1' }, 'bad_items');
let r = S.api({ endpoint: 'meta', key: key.key });
assert.strictEqual(r.body.ok, true); assert.strictEqual(r.body.api_version, '1');
assert.strictEqual(r.body.data.districts.length, 11); assert(r.body.data.items.find(i => i.id === 'R31').agri);
r = S.api({ endpoint: 'summary', key: key.key, round: 1 });
const sum = r.body.data;
assert.deepStrictEqual(sum.items.map(i => i.id), ['R29', 'R30', 'R31', 'R32']);
const pCheck = AGCore.computeProvince(AG_ITEMS, call('data.records', { token: ST2 }).filter(AGCore.isCounted), boot.districts, 1);
assert.strictEqual(sum.items[0].cumulative, pCheck.items.R29.cum);
assert.strictEqual(sum.items[0].by_district.D01.cumulative, pCheck.items.R29.byDistrict.D01.cum);
assert.strictEqual(sum.reported.count, pCheck.reported.length);
assert(!JSON.stringify(sum).includes('สมชาย') && !JSON.stringify(sum).includes('0812345678'), 'ไม่มีข้อมูลส่วนบุคคล');
// cache + ล้าง cache เมื่อมีการบันทึก
assert.strictEqual(S.api({ endpoint: 'summary', key: key.key, round: 1 }).cached, true);
call('data.save', { token: ST2, round: 1, district: 'D06', mode: 'submit', values: { R29: { v: 4 } } });
const after = S.api({ endpoint: 'summary', key: key.key, round: 1 });
assert.strictEqual(after.cached, false);
assert.strictEqual(after.body.data.items[0].cumulative, sum.items[0].cumulative + 4);
r = S.api({ endpoint: 'districts', key: key.key, round: 1, items: 'R29,R31', district: 'd06' });
assert.strictEqual(r.body.data.districts.length, 1); assert.strictEqual(r.body.data.districts[0].items.R29.week, 4);
r = S.api({ endpoint: 'timeseries', key: key.key, round: 2, items: 'R29' });
assert.deepStrictEqual(r.body.data.series.map(x => x.round), [0, 1, 2]);
assert.strictEqual(r.body.data.series[1].values.R29.cumulative, after.body.data.items[0].cumulative);
r = S.api({ endpoint: 'status', key: key.key, round: 2 });
assert.strictEqual(r.body.data.districts.find(d => d.code === 'D01').rounds['1'].status, 'accepted');
r = S.api({ endpoint: 'districts', key: key.key, round: 1, format: 'csv' });
assert(r.csv && r.body.startsWith('﻿round,district_code') && r.body.split('\r\n').length === 1 + 11 * 4);
// เปิดสาธารณะ / ปิด API / ยกเลิก key
call('admin.settings.save', { token: ST2, values: { API_REQUIRE_KEY: 'FALSE' } });
assert.strictEqual(S.api({ endpoint: 'meta' }).body.ok, true);
call('admin.settings.save', { token: ST2, values: { API_REQUIRE_KEY: 'TRUE', API_ENABLED: 'FALSE' } });
apiErr({ endpoint: 'meta', key: key.key }, 'api_disabled');
call('admin.settings.save', { token: ST2, values: { API_ENABLED: 'TRUE' } });
call('admin.apikeys.revoke', { token: ST2, id: key.id });
apiErr({ endpoint: 'meta', key: key.key }, 'invalid_key');
const logs2 = call('admin.logs', { token: ST2 }).map(l => l.action);
assert(logs2.includes('apikey_create') && logs2.includes('apikey_revoke'));
console.log('✓ settings toggle + Data API tests passed');

