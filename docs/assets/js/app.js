/* KPP Smart Agri-Materials — โครงหน้าเว็บ: สถานะ, การเข้าสู่ระบบ, เมนู, เส้นทางหน้า */
var Pages = window.Pages || (window.Pages = {});
var S = {
  boot: null, settings: {}, districts: [], rounds: [], user: null, token: null, records: [], recordsLoaded: false,
  call: function (action, payload) {
    var p = Object.assign({}, payload || {});
    if (S.token) p.token = S.token;
    return API.call(action, p).catch(function (e) {
      if (e.code === 'auth' && S.token) { App.logout(true); U.toast(e.message, 'err'); }
      throw e;
    });
  },
  loadRecords: function (force) {
    if (S.recordsLoaded && !force) return Promise.resolve(S.records);
    var p = S.user ? S.call('data.records') : API.call('public.summary').then(function (r) { S.publicEnabled = r.enabled; return r.records; });
    return p.then(function (r) { S.records = r; S.recordsLoaded = true; return r; });
  },
  roundOf: function (n) { return S.rounds.filter(function (r) { return r.round === Number(n); })[0]; },
  /** ครั้งที่ปัจจุบัน = รอบล่าสุดที่เริ่มแล้ว */
  currentRound: function () {
    var t = U.today(), cur = 0;
    S.rounds.forEach(function (r) { if (r.round > 0 && r.start && r.start <= t) cur = Math.max(cur, r.round); });
    if (!cur) S.rounds.forEach(function (r) { if (r.open) cur = Math.max(cur, r.round); });
    return cur;
  },
  visibleRounds: function () { var c = S.currentRound(); return S.rounds.filter(function (r) { return r.round <= c || r.open; }); },
  roundText: function (r) {
    if (!r) return '';
    if (r.round === 0) return 'ยอดยกมา (ก่อนครั้งที่ 1)';
    return 'ครั้งที่ ' + r.round + (r.start ? ' · ' + U.thShort(r.start) + ' – ' + U.thShort(r.end) : '');
  },
  districtName: function (code) { var d = S.districts.filter(function (x) { return x.code === code; })[0]; return d ? d.name : code; },
  role: function () { return S.user ? S.user.role : 'public'; },
  isAdmin: function () { return S.user && (S.user.role === 'mini' || S.user.role === 'super'); },
  canSeeStatus: function () { return S.isAdmin() || (S.user && S.settings.STATUS_VISIBLE_TO_DISTRICT === 'TRUE'); },
  roundOptions: function (sel, withState) {
    return S.visibleRounds().slice().reverse().map(function (r) {
      return '<option value="' + r.round + '"' + (Number(sel) === r.round ? ' selected' : '') + '>' + U.esc(S.roundText(r)) + (withState && !r.open ? ' (ปิดรับ)' : '') + '</option>';
    }).join('');
  },
  districtOptions: function (sel, all) {
    return (all ? '<option value="">ทุกอำเภอ</option>' : '') + S.districts.map(function (d) {
      return '<option value="' + d.code + '"' + (sel === d.code ? ' selected' : '') + '>' + U.esc(d.name) + '</option>';
    }).join('');
  },
  qrImage: function () { return S.settings.QR_IMAGE || 'assets/img/qr-default.png'; }
};

var App = (function () {
  var NAV = [
    { group: 'ภาพรวม' },
    { key: 'map', label: 'แผนที่ภาพรวม', icon: 'map', roles: ['district', 'mini', 'super'] },
    { key: 'province', label: 'สรุปผลระดับจังหวัด', icon: 'chart', roles: ['mini', 'super'] },
    { group: 'งานรายงาน' },
    { key: 'entry', label: 'กรอกและส่งรายงาน', icon: 'edit', roles: ['district', 'super'] },
    { key: 'district', label: 'รายงานระดับอำเภอ', icon: 'grid', roles: ['district', 'mini', 'super'] },
    { key: 'status', label: 'สถานะการส่งรายงาน', icon: 'checks', roles: ['mini', 'super'], also: 'statusVisible' },
    { key: 'print', label: 'พิมพ์รายงาน', icon: 'print', roles: ['district', 'mini', 'super'] },
    { group: 'ผู้ดูแลระบบ', roles: ['mini', 'super'] },
    { key: 'users', label: 'ผู้ใช้งาน', icon: 'users', roles: ['mini', 'super'] },
    { key: 'logs', label: 'บันทึกการเข้าใช้งาน', icon: 'shield', roles: ['mini', 'super'] },
    { key: 'settings', label: 'ตั้งค่ารายงานและระบบ', icon: 'gear', roles: ['mini', 'super'] },
    { group: 'บัญชี' },
    { key: 'profile', label: 'ข้อมูลส่วนตัว', icon: 'user', roles: ['district', 'mini', 'super'] }
  ];
  var current = null, cleanup = null;

  function allowed(item) {
    var r = S.role();
    if (item.roles && item.roles.indexOf(r) >= 0) return true;
    if (item.also === 'statusVisible' && r === 'district' && S.canSeeStatus()) return true;
    return false;
  }
  function parseHash() {
    var h = (location.hash || '').replace(/^#/, ''), parts = h.split('?'), params = {};
    (parts[1] || '').split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    return { key: parts[0] || '', params: params };
  }
  function go(key, params) {
    var q = params ? Object.keys(params).filter(function (k) { return params[k] !== undefined && params[k] !== ''; }).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&') : '';
    var h = '#' + key + (q ? '?' + q : '');
    if (location.hash === h) route(); else location.hash = h;
  }

  function renderNav() {
    var html = [], pendingGroup = null;
    NAV.forEach(function (it) {
      if (it.group) { pendingGroup = it; return; }
      if (!allowed(it)) return;
      if (pendingGroup) { html.push('<div class="nav-group">' + U.esc(pendingGroup.group) + '</div>'); pendingGroup = null; }
      html.push('<a class="nav-item" data-key="' + it.key + '" href="#' + it.key + '">' + U.icon(it.icon) + '<span>' + U.esc(it.label) + '</span>' + (it.key === 'status' && S.badgeStatus ? '<span class="badge">' + S.badgeStatus + '</span>' : '') + '</a>');
    });
    if (API.demo && S.user) html.push('<div class="side-demo"><b>โหมดทดลอง</b> · ข้อมูลตัวอย่างในเบราว์เซอร์นี้<br>อำเภอ <code>0810000001</code>–<code>11</code><br>จังหวัด <code>mini</code>/<code>mini1234</code> · Super <code>admin</code>/<code>admin1234</code></div>');
    U.$('nav').innerHTML = html.join('');
    var u = S.user;
    U.$('sideUser').innerHTML = u ? '<div class="avatar">' + U.esc(U.initials(u.name)) + '</div><div class="who"><b>' + U.esc((u.prefix || '') + u.name) + '</b><small>' +
      U.esc(u.role === 'district' ? 'อ.' + u.districtName : u.roleName) + '</small></div><button class="icon-btn" id="logoutBtn" title="ออกจากระบบ" aria-label="ออกจากระบบ">' + U.icon('logout') + '</button>' : '';
    var lb = U.$('logoutBtn'); if (lb) lb.onclick = function () { U.confirm('ออกจากระบบ', 'ต้องการออกจากระบบหรือไม่?', 'ออกจากระบบ').then(function (ok) { if (ok) logout(); }); };
    markNav();
  }
  function markNav() {
    document.querySelectorAll('.nav-item').forEach(function (a) { a.classList.toggle('on', a.dataset.key === current); });
  }

  function route() {
    var h = parseHash(), key = h.key;
    if (!S.user) {
      if (key && key !== 'map') { setTimeout(function () { openLogin(); }, 50); }
      key = 'map';
    } else if (!key || !Pages[key]) {
      key = S.user.role === 'district' ? 'entry' : S.user.role === 'mini' ? 'province' : 'province';
    }
    var nav = NAV.filter(function (n) { return n.key === key; })[0];
    if (S.user && nav && !allowed(nav)) { U.toast('ไม่มีสิทธิ์เข้าถึงหน้านี้', 'err'); key = S.user.role === 'district' ? 'entry' : 'province'; }
    if (Pages[current] && Pages[current].leave && (current !== key || route.force)) {
      if (Pages[current].leave() === false) { history.replaceState(null, '', '#' + current); return; }
    }
    if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
    current = key;
    document.body.classList.toggle('public', !S.user);
    document.body.classList.remove('nav-open');
    markNav();
    var page = Pages[key], view = U.$('view');
    U.$('pageTitle').textContent = page.title || '';
    U.$('pageSub').textContent = page.sub || '';
    U.$('topActions').innerHTML = '';
    view.className = 'view' + (page.flush ? ' flush' : '');
    view.innerHTML = '<div class="empty"><div class="boot-mark"><img src="assets/img/logo.svg" alt="" style="width:36px"></div>กำลังโหลดข้อมูล…</div>';
    window.scrollTo(0, 0);
    Promise.resolve(page.render(view, h.params)).then(function (c) { if (typeof c === 'function') cleanup = c; })
      .catch(function (e) { view.innerHTML = '<div class="notice err">' + U.icon('alert') + '<div>' + U.esc(e.message) + '</div></div>'; });
  }
  function setHeader(title, sub) { U.$('pageTitle').textContent = title || ''; U.$('pageSub').textContent = sub || ''; }
  function actions(html) { U.$('topActions').innerHTML = html; return U.$('topActions'); }

  /* ───────── เข้าสู่ระบบ / ลงทะเบียน ───────── */
  function openLogin(tab, phone) {
    var reg = S.settings.REGISTRATION_OPEN === 'TRUE';
    var m = U.modal({
      hero: '<div class="login-hero"><img src="assets/img/logo.svg" alt=""><div><h2>เข้าสู่ระบบเจ้าหน้าที่</h2><p>KPP Smart Agri-Materials · สำนักงานเกษตรจังหวัดกำแพงเพชร</p></div><button class="icon-btn" data-x aria-label="ปิด" style="margin-left:auto;color:#fff">' + U.icon('x') + '</button></div>' +
        '<div class="tabs" id="lgTabs"><button data-t="phone">เจ้าหน้าที่อำเภอ</button><button data-t="admin">ผู้ดูแลระดับจังหวัด</button></div>',
      body: '<div id="lgBody"></div>'
    });
    var body = m.body.querySelector('#lgBody');
    function show(t, ph) {
      m.el.querySelectorAll('#lgTabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === (t === 'register' ? 'phone' : t)); });
      if (t === 'phone') {
        body.innerHTML = '<form id="lgForm" class="grid2" style="grid-template-columns:1fr">' +
          '<label class="fld"><span>หมายเลขโทรศัพท์ที่ลงทะเบียนไว้</span><input id="lgPhone" inputmode="tel" autocomplete="tel" placeholder="08x-xxx-xxxx" value="' + U.esc(ph || '') + '" required></label>' +
          '<button class="btn primary" type="submit" style="justify-content:center">' + U.icon('login') + 'เข้าสู่ระบบ</button>' +
          (reg ? '<p class="small muted" style="margin:0;text-align:center">ยังไม่มีบัญชี? <a href="#" id="toReg">ลงทะเบียนเจ้าหน้าที่อำเภอ</a> (ใช้งานได้ทันที)</p>' : '<p class="small muted" style="margin:0">ปิดรับลงทะเบียนชั่วคราว ติดต่อผู้ดูแลระดับจังหวัด</p>') + '</form>';
        body.querySelector('#lgForm').onsubmit = function (e) {
          e.preventDefault();
          var btn = e.target.querySelector('button'), phone = U.$('lgPhone').value;
          btn.disabled = true;
          API.call('auth.login', { phone: phone }).then(done).catch(function (err) {
            btn.disabled = false;
            if (err.code === 'not_registered' && reg) { U.toast('หมายเลขนี้ยังไม่ได้ลงทะเบียน — กรอกข้อมูลเพื่อลงทะเบียน'); show('register', phone); }
            else U.toast(err.message, 'err');
          });
        };
        var tr = body.querySelector('#toReg'); if (tr) tr.onclick = function (e) { e.preventDefault(); show('register', U.$('lgPhone').value); };
      } else if (t === 'register') {
        body.innerHTML = '<form id="rgForm" class="grid2">' +
          '<div class="span2 notice info" style="margin:0">' + U.icon('info') + '<div>ลงทะเบียนครั้งเดียว ครั้งต่อไปเข้าสู่ระบบด้วยหมายเลขโทรศัพท์เท่านั้น</div></div>' +
          '<label class="fld span2"><span>หมายเลขโทรศัพท์ *</span><input id="rgPhone" inputmode="tel" value="' + U.esc(ph || '') + '" required placeholder="08x-xxx-xxxx"></label>' +
          '<label class="fld"><span>คำนำหน้า</span><select id="rgPrefix"><option>นาย</option><option>นาง</option><option>นางสาว</option><option value="">อื่น ๆ / ไม่ระบุ</option></select></label>' +
          '<label class="fld"><span>ชื่อ - สกุล *</span><input id="rgName" required autocomplete="name"></label>' +
          '<label class="fld span2"><span>ตำแหน่ง *</span><input id="rgPos" required list="posList" placeholder="เช่น นักวิชาการส่งเสริมการเกษตรปฏิบัติการ"><datalist id="posList"><option>เกษตรอำเภอ</option><option>นักวิชาการส่งเสริมการเกษตรชำนาญการ</option><option>นักวิชาการส่งเสริมการเกษตรปฏิบัติการ</option><option>เจ้าพนักงานการเกษตรชำนาญงาน</option><option>เจ้าพนักงานการเกษตรปฏิบัติงาน</option></datalist></label>' +
          '<label class="fld span2"><span>สังกัดสำนักงานเกษตรอำเภอ *</span><select id="rgDist" required><option value="">— เลือกอำเภอ —</option>' + S.districtOptions('') + '</select></label>' +
          '<label class="switch span2" style="align-items:flex-start"><input type="checkbox" id="rgOk" required style="margin-top:2px"><span class="small">ยินยอมให้ระบบเก็บชื่อ ตำแหน่ง และหมายเลขโทรศัพท์ เพื่อยืนยันตัวตนและบันทึกการเข้าใช้งานตามระเบียบราชการ</span></label>' +
          '<div class="span2 row" style="justify-content:space-between"><button type="button" class="btn ghost" id="rgBack">' + U.icon('arrowL') + 'กลับ</button><button class="btn primary" type="submit">' + U.icon('check') + 'ลงทะเบียนและเข้าใช้งาน</button></div></form>';
        body.querySelector('#rgBack').onclick = function () { show('phone', U.$('rgPhone').value); };
        body.querySelector('#rgForm').onsubmit = function (e) {
          e.preventDefault();
          var btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
          API.call('auth.register', { phone: U.$('rgPhone').value, prefix: U.$('rgPrefix').value, name: U.$('rgName').value, position: U.$('rgPos').value, district: U.$('rgDist').value })
            .then(function (r) { U.toast('ลงทะเบียนสำเร็จ ยินดีต้อนรับ', 'ok'); done(r); })
            .catch(function (err) { btn.disabled = false; U.toast(err.message, 'err'); });
        };
      } else {
        body.innerHTML = '<form id="adForm" class="grid2" style="grid-template-columns:1fr">' +
          '<label class="fld"><span>ชื่อผู้ใช้</span><input id="adUser" autocomplete="username" autocapitalize="none" required></label>' +
          '<label class="fld"><span>รหัสผ่าน</span><input id="adPass" type="password" autocomplete="current-password" required></label>' +
          '<button class="btn primary" type="submit" style="justify-content:center">' + U.icon('lock') + 'เข้าสู่ระบบผู้ดูแล</button>' +
          '<p class="small muted" style="margin:0">สำหรับผู้รวบรวมข้อมูลระดับจังหวัด (Mini Super Admin) และผู้ดูแลระบบ (Super Admin)</p></form>';
        body.querySelector('#adForm').onsubmit = function (e) {
          e.preventDefault();
          var btn = e.target.querySelector('button'); btn.disabled = true;
          API.call('auth.login', { username: U.$('adUser').value, password: U.$('adPass').value }).then(done)
            .catch(function (err) { btn.disabled = false; U.toast(err.message, 'err'); });
        };
      }
      var f = body.querySelector('input'); if (f) setTimeout(function () { f.focus(); }, 30);
    }
    m.el.querySelector('#lgTabs').onclick = function (e) { var b = e.target.closest('button'); if (b) show(b.dataset.t); };
    function done(r) {
      m.close();
      setSession(r.token, r.user);
      U.toast('สวัสดี ' + r.user.name, 'ok');
      var h = parseHash();
      go(h.key && h.key !== 'map' ? h.key : (r.user.role === 'district' ? 'entry' : 'province'));
    }
    show(tab || 'phone', phone);
  }

  function setSession(token, user) {
    S.token = token; S.user = user; S.recordsLoaded = false;
    U.store('kpp-session', JSON.stringify({ token: token, user: user, demo: API.demo }));
    renderNav();
  }
  function logout(silent) {
    if (S.token && !silent) API.call('auth.logout', { token: S.token }).catch(function () { });
    S.token = null; S.user = null; S.recordsLoaded = false; S.records = [];
    U.store('kpp-session', null);
    renderNav();
    go('map');
  }

  function refreshBoot() {
    return API.call('public.bootstrap').then(function (b) {
      S.boot = b; S.settings = b.settings; S.districts = b.districts; S.rounds = b.rounds;
      return b;
    });
  }

  function start() {
    U.$('menuBtn').onclick = function () { document.body.classList.toggle('nav-open'); };
    U.$('scrim').onclick = function () { document.body.classList.remove('nav-open'); };
    if (API.demo) {
      var bar = U.$('demoBar');
      bar.innerHTML = '<button class="icon-btn" aria-label="ซ่อน">' + U.icon('x') + '</button><b>โหมดทดลอง</b> — ข้อมูลตัวอย่างเก็บในเบราว์เซอร์นี้เท่านั้น<br>' +
        'อำเภอ: เบอร์ <code>0810000001</code>–<code>0810000011</code> · จังหวัด: <code>mini</code>/<code>mini1234</code> · Super: <code>admin</code>/<code>admin1234</code>';
      bar.hidden = false;
      bar.querySelector('button').onclick = function () { bar.hidden = true; };
    }
    var saved = null;
    try { saved = JSON.parse(U.store('kpp-session') || 'null'); } catch (e) { saved = null; }
    if (saved && !!saved.demo !== API.demo) saved = null;
    refreshBoot().then(function () {
      if (!saved) return null;
      S.token = saved.token;
      return API.call('auth.me', { token: saved.token }).then(function (r) { S.user = r.user; }).catch(function () { S.token = null; U.store('kpp-session', null); });
    }).then(function () {
      U.$('boot').hidden = true;
      U.$('shell').hidden = false;
      renderNav();
      window.addEventListener('hashchange', route);
      route();
    }).catch(function (e) {
      U.$('boot').innerHTML = '<div class="notice err" style="max-width:520px">' + U.icon('alert') + '<div><b>เชื่อมต่อระบบไม่สำเร็จ</b><br>' + U.esc(e.message) +
        '<br><span class="small">ผู้ดูแล: ตรวจสอบ API_URL ใน assets/js/config.js และการ Deploy Apps Script (Who has access: Anyone)</span></div></div>';
    });
  }

  return { start: start, go: go, route: route, openLogin: openLogin, logout: logout, setHeader: setHeader, actions: actions, renderNav: renderNav, refreshBoot: refreshBoot, setSession: setSession, parseHash: parseHash };
})();

document.addEventListener('DOMContentLoaded', App.start);
