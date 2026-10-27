/**
 * API — เรียก Google Apps Script Web App (ระบบจริง) หรือ AGServer ในเบราว์เซอร์ (โหมดทดลอง)
 * ทั้งสองแบบใช้กฎชุดเดียวกัน (server.js) จึงทำงานเหมือนกันทุกประการ
 */
var API = (function () {
  var cfg = window.KPP_CONFIG || {};
  var url = String(cfg.API_URL || '').trim();
  var forceDemo = /[?&]demo=1/.test(location.search);
  var demo = !url || forceDemo;
  var DEMO_KEY = 'kpp-sam-demo-v2';
  var local = null;

  function ua() { return (navigator.userAgent || '').replace(/\s+/g, ' ').slice(0, 150); }

  function remote(action, payload) {
    var body = Object.assign({}, payload || {}, { action: action, _ua: ua() });
    return fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (' + r.status + ')'); return r.json(); })
      .catch(function (e) { if (e instanceof SyntaxError || /Failed to fetch|NetworkError/.test(e.message)) throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); throw e; })
      .then(function (res) {
        if (!res.ok) { var err = new Error(res.error || 'เกิดข้อผิดพลาด'); err.code = res.code; throw err; }
        return res.data;
      });
  }

  /* ───────── โหมดทดลอง ───────── */
  function demoServer() {
    if (local) return local;
    var store = LocalStore.create({ key: DEMO_KEY });
    var server = AGServer.create(store, AG_ITEMS);
    if (!store.rows('Settings').length) seedDemo(store, server);
    local = { store: store, server: server };
    return local;
  }
  function seedDemo(store, server) {
    var t = U.today();
    var dow = (new Date(t + 'T00:00:00Z').getUTCDay() + 3) % 7; // วันพฤหัส = 0
    var start = U.addDays(t, -dow - 21);
    server.seed({ start: start, count: 20, openFirst: 4, superUser: { username: 'admin', password: 'admin1234', name: 'ผู้ดูแลระบบ (ทดลอง)', position: 'Super Admin' } });
    store.update('Settings', function (r) { return r.key === 'SEASON'; }, { value: '2568 - 2569' });
    var call = function (a, p) { return server.handle(a, Object.assign({ _ua: 'โหมดทดลอง' }, p)); };
    var st = call('auth.login', { username: 'admin', password: 'admin1234' }).token;
    call('admin.users.create', { token: st, role: 'mini', username: 'mini', password: 'mini1234', prefix: 'นาง', name: 'สุดา รวบรวมดี', position: 'นักวิชาการส่งเสริมการเกษตรชำนาญการ' });
    var names = ['สมชาย ใจดี', 'วิไล ทองดี', 'ประเสริฐ ไร่นา', 'อรุณี ศรีสุข', 'ธนา เกษตรกุล', 'มาลี พรมมา', 'สุรชัย แก้วใส', 'จันทร์เพ็ญ ขาวผ่อง', 'บุญมี มากมูล', 'กมล ทองคำ', 'ปิยะ ศรีงาม'];
    var tokens = {};
    for (var i = 0; i < 11; i++) {
      var code = 'D' + ('0' + (i + 1)).slice(-2);
      tokens[code] = call('auth.register', { phone: '08100000' + ('0' + (i + 1)).slice(-2), prefix: i % 2 ? 'นาง' : 'นาย', name: names[i], position: 'นักวิชาการส่งเสริมการเกษตร', district: code }).token;
    }
    var seed = 11;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    Object.keys(tokens).forEach(function (code, k) {
      [0, 1, 2, 3].forEach(function (round) {
        if (round === 3 && k % 3 === 0) return;
        if (round === 2 && k === 4) return;
        var v = { R29: { v: Math.round(rnd() * 5) + (round ? 1 : 8) }, R31: { v: Math.round(rnd() * (round ? 600 : 3000) + 80) }, R13: { v: Math.round(rnd() * 4) } };
        if (rnd() > .4) v.R30 = { v: Math.round(rnd() * 3) + 1 };
        if (rnd() > .5) v.R20 = { v: Math.round(rnd() * 3) + 1 };
        if (rnd() > .6) v.R32 = { t: 'อัดฟางก้อน', v: Math.round(rnd() * 200 + 20), u: 'ไร่' };
        if (rnd() > .7) v.R8 = { h: 'Y' };
        if (round === 0) v.R14 = { h: 'Y' };
        var sec4 = k === 3 ? [{ id: 'ggh1', t: 'โครงการส่งเสริมการเกษตรที่เป็นมิตรกับสิ่งแวดล้อม กิจกรรมจัดตั้ง "Green Gain Hub" เชื่อมโยงเกษตรกรกับผู้รับซื้อวัสดุชีวมวล', h: 'Y', v: round === 1 ? 1 : 0, u: 'แห่ง' }] : [];
        var mode = round === 3 && k % 4 === 1 ? 'draft' : 'submit';
        call('data.save', { token: tokens[code], round: round, district: code, mode: mode, values: v, sec4: sec4, sec5: round === 2 && k === 2 ? 'เครื่องอัดฟางไม่เพียงพอในช่วงเก็บเกี่ยว' : '' });
      });
    });
    var mt = call('auth.login', { username: 'mini', password: 'mini1234' }).token;
    ['D01', 'D02', 'D03', 'D04', 'D06', 'D07'].forEach(function (d) { call('data.review', { token: mt, round: 1, district: d, decision: 'accept' }); });
    call('data.review', { token: mt, round: 2, district: 'D07', decision: 'return', note: 'พื้นที่ไถกลบสูงผิดปกติ กรุณาตรวจสอบตัวเลขอีกครั้ง' });
  }
  function local_(action, payload) {
    return new Promise(function (ok, bad) {
      setTimeout(function () {
        try {
          var s = demoServer();
          var res = s.server.handle(action, Object.assign({}, payload || {}, { _ua: ua() }));
          ok(JSON.parse(JSON.stringify(res === undefined ? null : res)));
        } catch (e) { bad(e); }
      }, 120);
    });
  }

  return {
    demo: demo,
    call: function (action, payload) { return demo ? local_(action, payload) : remote(action, payload); },
    resetDemo: function () { try { localStorage.removeItem(DEMO_KEY); } catch (e) { } local = null; },
    DEMO_ACCOUNTS: { super: ['admin', 'admin1234'], mini: ['mini', 'mini1234'], district: '0810000001 – 0810000011' }
  };
})();
