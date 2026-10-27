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
