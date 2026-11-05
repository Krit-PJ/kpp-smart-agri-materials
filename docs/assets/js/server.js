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
  var T = { SETTINGS: 'Settings', DISTRICTS: 'Districts', USERS: 'Users', ROUNDS: 'Rounds', DATA: 'Data', LOG: 'AccessLog', APIKEYS: 'ApiKeys',
    ITEMS: 'Items' };

  var COLS = {
    Settings: ['key', 'value', 'note'],
    Districts: ['code', 'name', 'amp_code', 'active'],
    Users: ['id', 'role', 'username', 'pass_hash', 'salt', 'phone', 'prefix', 'name', 'position', 'district', 'status',
      'token_ver', 'created_at', 'created_by', 'last_login', 'login_count', 'last_seen'],
    Rounds: ['round', 'label', 'start', 'end', 'due', 'open'],
    AccessLog: ['time', 'user_id', 'account', 'name', 'role', 'district', 'action', 'detail', 'ua'],
    ApiKeys: ['id', 'label', 'prefix', 'key_hash', 'status', 'created_at', 'created_by', 'last_used'],
    // ข้อคำถามของแบบฟอร์ม (ว่าง = ใช้แบบฟอร์มต้นฉบับ) — Super Admin แก้ไขผ่านหน้า "แบบฟอร์มรายงาน"
    Items: ['id', 'sort', 'section', 'code', 'label', 'printLabel', 'unit', 'type', 'agg', 'level', 'print', 'row', 'h', 'status', 'updated_at', 'updated_by'],
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
    ['SESSION_HOURS', '12', 'อายุการเข้าสู่ระบบ (ชั่วโมง)'],
    ['SHOW_OTHER_INDICATORS', 'FALSE', 'แสดงส่วน "ตัวชี้วัดอื่น" (นอกเหนือข้อ 2.2 พื้นที่เกษตร) ในแผนที่และกราฟเปรียบเทียบ'],
    ['API_ENABLED', 'TRUE', 'เปิด Data API ให้เว็บไซต์ Dashboard ภายนอกดึงข้อมูลสรุป'],
    ['API_REQUIRE_KEY', 'TRUE', 'Data API ต้องใช้ API Key (Super Admin สร้าง/ยกเลิกได้)']
  ];
  var PUBLIC_KEYS = ['SITE_NAME', 'PROVINCE', 'OFFICE', 'TITLE', 'SEASON', 'DOC_REF_1', 'DOC_REF_2', 'QR_NOTE', 'QR_LINK', 'QR_IMAGE',
    'PROV_REPORTER_NAME', 'PROV_REPORTER_TITLE', 'REGISTRATION_OPEN', 'PUBLIC_DASHBOARD', 'STATUS_VISIBLE_TO_DISTRICT',
    'SHOW_OTHER_INDICATORS', 'API_ENABLED', 'API_REQUIRE_KEY'];
  var MINI_KEYS = ['OFFICE', 'TITLE', 'SEASON', 'DOC_REF_1', 'DOC_REF_2', 'QR_NOTE', 'QR_LINK', 'QR_IMAGE',
    'PROV_REPORTER_NAME', 'PROV_REPORTER_TITLE', 'STATUS_VISIBLE_TO_DISTRICT', 'SHOW_OTHER_INDICATORS'];
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

  /* ───────────── ข้อคำถามของแบบฟอร์ม ───────────── */
  var ITEM_TYPES = { header: 1, num: 1, check: 1, other: 1 };
  // ข้อที่ระบบใช้เป็นตัวชี้วัดหลัก (แผนที่ KPI และ API กลุ่ม agri) และหัวข้อ 2.2 พื้นที่เกษตร — แก้ถ้อยคำได้ แต่ลบ/ยกเลิกใช้/เปลี่ยนรูปแบบไม่ได้
  var CORE_IDS = ['R28', 'R29', 'R30', 'R31', 'R32'];
  function rowToItem(r) {
    var row = r.row === '' || r.row === undefined || r.row === null ? null : Number(r.row);
    return {
      id: str(r.id), sort: Number(r.sort) || 0, section: str(r.section), code: str(r.code), label: str(r.label),
      printLabel: str(r.printLabel) || str(r.label), unit: str(r.unit), type: ITEM_TYPES[r.type] ? str(r.type) : 'num',
      agg: r.agg === 'latest' ? 'latest' : 'sum', level: Number(r.level) || 0, print: str(r.print),
      row: isFinite(row) ? row : null, h: Number(r.h) || 24.75, retired: str(r.status) === 'retired'
    };
  }
  function itemToRow(it, i, now, by) {
    return { id: it.id, sort: i + 1, section: it.section, code: it.code, label: it.label, printLabel: it.printLabel, unit: it.unit, type: it.type,
      agg: it.agg, level: it.level, print: it.print, row: it.row === null || it.row === undefined ? '' : it.row, h: it.h,
      status: it.retired ? 'retired' : 'active', updated_at: now, updated_by: by };
  }
  function isSection(it) { return it.print === 'section' || (it.type === 'header' && it.level === 0); }

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
  function create(store, baseItems) {
    baseItems = baseItems || (typeof AG_ITEMS !== 'undefined' ? AG_ITEMS : []);
    // แบบฟอร์มต้นฉบับ (ในเบราว์เซอร์ AG_ITEMS อาจถูกแทนที่ด้วยแบบฟอร์มที่แก้ไขแล้ว จึงใช้สำเนา AG_ITEMS_BASE)
    var BASE = (typeof AG_ITEMS_BASE !== 'undefined' && typeof AG_ITEMS !== 'undefined' && baseItems === AG_ITEMS ? AG_ITEMS_BASE : baseItems)
      .map(function (o) { var c = {}; for (var k in o) c[k] = o[k]; return c; });
    var items = BASE, customItems = false;
    /** โหลดข้อคำถามจากชีต Items (ถ้ามี) — เรียกทุกครั้งที่เริ่มคำสั่ง */
    function refreshItems() {
      var rows = store.rows(T.ITEMS).filter(function (r) { return str(r.id); });
      customItems = rows.length > 0;
      items = customItems ? rows.map(rowToItem).sort(function (a, b) { return a.sort - b.sort; }) : BASE;
      return items;
    }

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
      // items = แบบฟอร์มที่ Super Admin แก้ไขแล้ว (null = ใช้แบบฟอร์มต้นฉบับที่มากับหน้าเว็บ)
      return { settings: pub, districts: districts(), rounds: rounds(), today: store.today(), items: customItems ? items : null };
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


    /* ═════════ แบบฟอร์มรายงาน: เพิ่ม/แก้ไข/ลบ/ยกเลิกใช้ ข้อคำถาม (Super Admin เท่านั้น) ═════════
     * กติกา: ข้อที่มีข้อมูลแล้ว → ลบไม่ได้ (ใช้ "ยกเลิกใช้" แทน ตัวเลขเดิมยังนับในยอดสะสม)
     *        และเปลี่ยนรูปแบบคำตอบ/หน่วยนับ/วิธีนับไม่ได้ (ยอดสะสมจะบวกต่างหน่วยกัน)
     *        หัวข้อหลัก 1–3 และตัวชี้วัดหลักข้อ 2.2 แก้ถ้อยคำได้อย่างเดียว */
    function replaceTable(name, rows) {
      if (store.replaceAll) return store.replaceAll(name, rows);
      store.remove(name, function () { return true; });
      rows.forEach(function (r) { store.insert(name, r); });
    }
    function itemUsage() {
      var n = {};
      records().forEach(function (r) { Object.keys(r.values || {}).forEach(function (id) { n[id] = (n[id] || 0) + 1; }); });
      return n;
    }
    function itemsPayload() {
      return { items: items, custom: customItems, usage: itemUsage(), core: CORE_IDS, baseIds: BASE.map(function (b) { return b.id; }) };
    }
    function itemName(it) { return 'ข้อ ' + (it.code || '-') + ' "' + clip(it.label, 40) + '"'; }

    A['admin.items.get'] = function (p, u) { need(u, ['super']); return itemsPayload(); };

    A['admin.items.save'] = function (p, u) {
      need(u, ['super']);
      var list = p.items;
      if (!list || !list.length) fail('ไม่มีข้อคำถาม');
      if (list.length > 400) fail('ข้อคำถามมากเกินไป (สูงสุด 400 ข้อ)');
      return store.lock(function () {
        refreshItems();
        var cur = {}, usage = itemUsage(), seq = 0, seen = {}, sec = '', out = [];
        items.forEach(function (it) { cur[it.id] = it; var m = /^N(\d+)$/.exec(it.id); if (m) seq = Math.max(seq, Number(m[1])); });
        var log = { add: [], edit: [], retire: [], restore: [], del: [] }, oldOrder = items.map(function (x) { return x.id; }).join(',');
        list.forEach(function (x, i) {
          var id = str(x.id).trim().toUpperCase(), old = id ? cur[id] : null;
          if (id && !old) fail('ไม่พบข้อคำถามรหัส ' + id + ' (อาจมีผู้แก้ไขพร้อมกัน กรุณาโหลดหน้าใหม่)');
          if (!id) { do { seq++; id = 'N' + seq; } while (cur[id] || seen[id]); }
          if (seen[id]) fail('ข้อคำถามรหัส ' + id + ' ซ้ำกัน');
          seen[id] = 1;
          var label = clip(x.label, 600).replace(/\s+/g, ' ');
          if (label.length < 2) fail('กรุณากรอกข้อความของข้อคำถามลำดับที่ ' + (i + 1));
          if (old && isSection(old)) {
            // หัวข้อหลัก 1–3: แก้ถ้อยคำได้อย่างเดียว
            if (x.retired) fail('ยกเลิกใช้หัวข้อหลักไม่ได้: ' + clip(old.label, 40));
            sec = old.section;
            var s0 = Object.assign({}, old, { label: label, printLabel: label === old.label ? old.printLabel : label, retired: false });
            if (label !== old.label) log.edit.push(itemName(s0));
            out.push(s0); return;
          }
          if (!old && i === 0) fail('ข้อแรกต้องเป็นหัวข้อหลัก');
          var type = ITEM_TYPES[x.type] ? x.type : 'num';
          if (type === 'header' && Number(x.level) === 0) fail('เพิ่มหัวข้อหลักใหม่ไม่ได้ (ข้อ 4 และ 5 เป็นส่วนคงที่ของแบบรายงาน)');
          var used = old ? usage[old.id] || 0 : 0, core = old && CORE_IDS.indexOf(old.id) >= 0;
          var unit = type === 'num' ? clip(x.unit, 30) : '', agg = type === 'num' && x.agg === 'latest' ? 'latest' : 'sum';
          if (type === 'num' && !unit) fail('กรุณาระบุหน่วยนับของ ' + itemName({ code: x.code, label: label }));
          if (old && (used || core)) {
            var why = core ? 'เป็นตัวชี้วัดหลักของระบบ' : 'มีข้อมูลแล้ว ' + used + ' รายงาน';
            if (type !== old.type) fail(itemName(old) + ' ' + why + ' — เปลี่ยนรูปแบบคำตอบไม่ได้ (ให้เพิ่มเป็นข้อใหม่แทน)');
            if (type === 'num' && unit !== old.unit) fail(itemName(old) + ' ' + why + ' — เปลี่ยนหน่วยนับไม่ได้ (ให้เพิ่มเป็นข้อใหม่แทน)');
            if (agg !== old.agg) fail(itemName(old) + ' ' + why + ' — เปลี่ยนวิธีนับยอดสะสมไม่ได้');
          }
          if (core && x.retired) fail(itemName(old) + ' เป็นตัวชี้วัดหลักของระบบ — ยกเลิกใช้ไม่ได้');
          var level = Number(x.level) === 1 ? 1 : 2;
          var print = type === 'header' ? (x.print === 'gray' ? 'gray' : 'band') : type === 'check' ? 'gray' : '';
          var dash = old ? /^-\s/.test(old.printLabel) : level === 2 && type !== 'header';
          var it = {
            id: id, section: sec, code: clip(x.code, 12), label: label,
            printLabel: old && label === old.label ? old.printLabel : (dash ? '- ' : '') + label,
            unit: unit, type: type, agg: agg, level: level, print: print,
            row: old ? old.row : null, h: old ? old.h : 24.75, retired: !!x.retired
          };
          if (!it.code) fail('กรุณาระบุเลขข้อของ ' + itemName(it));
          if (!old) log.add.push(itemName(it));
          else {
            if (it.retired && !old.retired) log.retire.push(itemName(it));
            else if (!it.retired && old.retired) log.restore.push(itemName(it));
            if (label !== old.label || it.code !== old.code || unit !== old.unit || type !== old.type || level !== old.level || print !== old.print || agg !== old.agg) log.edit.push(itemName(it));
          }
          out.push(it);
        });
        items.forEach(function (it) {
          if (seen[it.id]) return;
          if (isSection(it)) fail('ลบหัวข้อหลักไม่ได้: ' + clip(it.label, 40));
          if (CORE_IDS.indexOf(it.id) >= 0) fail(itemName(it) + ' เป็นตัวชี้วัดหลักของระบบ — ลบไม่ได้');
          if (usage[it.id]) fail('ลบ' + itemName(it) + ' ไม่ได้ เพราะมีข้อมูลแล้ว ' + usage[it.id] + ' รายงาน — ใช้ "ยกเลิกใช้" แทน (ตัวเลขเดิมยังนับในยอดสะสม)');
          log.del.push(itemName(it));
        });
        if (!out.some(function (it) { return !it.retired && it.type !== 'header'; })) fail('ต้องมีข้อคำถามที่ใช้งานอย่างน้อย 1 ข้อ');
        var now = store.now();
        replaceTable(T.ITEMS, out.map(function (it, i) { return itemToRow(it, i, now, str(u.name)); }));
        refreshItems();
        var moved = out.map(function (x) { return x.id; }).filter(function (id) { return cur[id]; }).join(',') !== oldOrder.split(',').filter(function (id) { return seen[id]; }).join(',');
        var parts = [];
        [['add', 'เพิ่ม'], ['edit', 'แก้ไข'], ['retire', 'ยกเลิกใช้'], ['restore', 'นำกลับมาใช้'], ['del', 'ลบ']].forEach(function (k) {
          if (log[k[0]].length) parts.push(k[1] + ' ' + log[k[0]].length + ' ข้อ: ' + log[k[0]].slice(0, 4).join(', ') + (log[k[0]].length > 4 ? ' …' : ''));
        });
        if (moved) parts.push('จัดลำดับใหม่');
        audit(u, 'items_update', parts.join(' · ') || 'บันทึก (ไม่มีการเปลี่ยนแปลง)', p._ua);
        return itemsPayload();
      });
    };

    A['admin.items.reset'] = function (p, u) {
      need(u, ['super']);
      return store.lock(function () {
        refreshItems();
        var usage = itemUsage(), baseIds = {}, out = [];
        BASE.forEach(function (b) { baseIds[b.id] = 1; });
        // ข้อที่เพิ่มเองและมีข้อมูลแล้ว คงไว้แบบ "ยกเลิกใช้" ต่อจากข้อเดิมที่อยู่ก่อนหน้า เพื่อไม่ให้ตัวเลขหายจากยอดสะสม
        var keep = {}, prev = BASE[0].id;
        items.forEach(function (it) { if (baseIds[it.id]) prev = it.id; else if (usage[it.id]) (keep[prev] = keep[prev] || []).push(it); });
        BASE.forEach(function (b) {
          out.push(b);
          (keep[b.id] || []).forEach(function (it) { out.push(Object.assign({}, it, { retired: true, section: b.section })); });
        });
        var kept = Object.keys(keep).reduce(function (n, k) { return n + keep[k].length; }, 0);
        if (kept) { var now = store.now(); replaceTable(T.ITEMS, out.map(function (it, i) { return itemToRow(it, i, now, str(u.name)); })); }
        else replaceTable(T.ITEMS, []);
        refreshItems();
        audit(u, 'items_reset', 'คืนค่าแบบฟอร์มต้นฉบับ' + (kept ? ' (คงข้อที่เพิ่มเองซึ่งมีข้อมูลแล้ว ' + kept + ' ข้อ ไว้แบบยกเลิกใช้)' : ''), p._ua);
        return itemsPayload();
      });
    };

    /* ═════════ Data API v1 (อ่านอย่างเดียว สำหรับ Dashboard ภายนอก) ═════════
     * GET <WEB_APP_URL>?api=v1&endpoint=summary&key=...&round=3&items=agri&format=json|csv&callback=fn
     * ข้อมูล = ยอดรวมของรายงานที่ "ส่งแล้ว/ตรวจรับแล้ว" เท่านั้น ไม่มีข้อมูลส่วนบุคคล
     */
    var API_VERSION = '1';
    var AGRI_IDS = ['R29', 'R30', 'R31', 'R32'];
    var API_ENDPOINTS = ['meta', 'summary', 'districts', 'timeseries', 'status'];
    function apiFail(code, msg) { var e = new Error(msg); e.code = code; throw e; }
    function bump() { store.cachePut('data_ver', store.uuid(), 21600); }
    function currentRound(rs) {
      var t = store.today(), cur = 0;
      rs.forEach(function (r) { if (r.round > 0 && r.start && r.start <= t) cur = Math.max(cur, r.round); });
      if (!cur) rs.forEach(function (r) { if (r.open) cur = Math.max(cur, r.round); });
      return cur;
    }
    function apiKeyCheck(p, s) {
      if (!truthy(s.API_REQUIRE_KEY)) return { id: '', label: 'public' };
      var key = str(p.key).trim();
      if (!key) apiFail('key_required', 'ต้องระบุ API Key (พารามิเตอร์ key)');
      var h = store.sha256(key);
      var k = store.rows(T.APIKEYS).filter(function (x) { return str(x.key_hash) === h && str(x.status) !== 'revoked'; })[0];
      if (!k) apiFail('invalid_key', 'API Key ไม่ถูกต้องหรือถูกยกเลิกแล้ว');
      if (!store.cacheGet('keyseen:' + k.id)) {
        store.cachePut('keyseen:' + k.id, '1', 3600);
        store.update(T.APIKEYS, function (x) { return str(x.id) === str(k.id); }, { last_used: store.now() });
      }
      return k;
    }
    function rateLimit(id) {
      var slot = 'rl:' + (id || 'public') + ':' + Math.floor(Date.now() / 60000);
      var n = Number(store.cacheGet(slot) || 0) + 1;
      store.cachePut(slot, String(n), 120);
      if (n > 120) apiFail('rate_limited', 'เรียกใช้เกิน 120 ครั้ง/นาที กรุณาลองใหม่ภายหลัง');
    }
    function pickItems(spec) {
      var all = items.filter(function (it) { return it.type !== 'header'; });
      spec = str(spec || 'agri').trim();
      if (spec === 'all') return all;
      if (spec === 'agri') return all.filter(function (it) { return AGRI_IDS.indexOf(it.id) >= 0; });
      var ids = spec.split(',').map(function (x) { return x.trim().toUpperCase(); });
      var out = all.filter(function (it) { return ids.indexOf(it.id) >= 0; });
      if (!out.length) apiFail('bad_items', 'ไม่พบตัวชี้วัด: ' + spec + ' (ใช้ agri, all หรือรหัส เช่น R29,R31)');
      return out;
    }
    function itemInfo(it) {
      return { id: it.id, code: it.code, section: it.section, label: it.label, unit: it.unit, type: it.type, aggregation: it.agg, agri: AGRI_IDS.indexOf(it.id) >= 0, retired: !!it.retired };
    }
    function roundInfo(r) { return r ? { round: r.round, label: r.label, start: r.start, end: r.end, due: r.due } : null; }
    function nv(x) { return x === undefined ? null : x; }

    var API = {
      meta: function (ctx) {
        var s = ctx.s;
        return {
          site: s.SITE_NAME, province: s.PROVINCE, office: s.OFFICE, title: s.TITLE, season: s.SEASON,
          current_round: ctx.cur, rounds: ctx.rounds.map(roundInfo), districts: ctx.districts,
          items: items.filter(function (it) { return it.type !== 'header'; }).map(itemInfo),
          endpoints: API_ENDPOINTS, counted_status: ['submitted', 'accepted'], form_customized: customItems
        };
      },
      summary: function (ctx) {
        var p = AGCore.computeProvince(items, ctx.records, ctx.districts, ctx.round);
        var st = { accepted: 0, submitted: 0, draft: 0, returned: 0, none: 0 };
        ctx.districts.forEach(function (d) { var r = AGCore.recordOf(ctx.allRecords, d.code, ctx.round); st[r ? r.status : 'none']++; });
        return {
          round: roundInfo(ctx.rd), districts_total: ctx.districts.length,
          reported: { count: p.reported.length, districts: p.reported }, status_counts: st,
          items: ctx.items.map(function (it) {
            var x = p.items[it.id];
            return { id: it.id, code: it.code, label: it.label, unit: x.unit || it.unit, week: nv(x.week), cumulative: nv(x.cum),
              districts_reporting_yes: x.yes, by_district: ctx.districts.reduce(function (o, d) { var b = x.byDistrict[d.code]; o[d.code] = { week: nv(b.week), cumulative: nv(b.cum) }; return o; }, {}) };
          }),
          other_activities: p.sec4.map(function (a) { return { title: a.t, unit: a.u, week: nv(a.week.v), cumulative: nv(a.cum), districts: a.districts }; })
        };
      },
      districts: function (ctx) {
        var list = ctx.p.district ? ctx.districts.filter(function (d) { return d.code === str(ctx.p.district).toUpperCase(); }) : ctx.districts;
        if (!list.length) apiFail('bad_district', 'ไม่พบอำเภอ: ' + ctx.p.district);
        var m = AGCore.statusMatrix(ctx.allRecords, ctx.rounds);
        return {
          round: roundInfo(ctx.rd),
          districts: list.map(function (d) {
            var c = AGCore.computeDistrict(items, ctx.records, d.code, ctx.round), cell = m[d.code] && m[d.code][ctx.round];
            return {
              code: d.code, name: d.name, amp_code: d.amp_code, status: cell ? cell.status : 'none', counted: c.counted, late: !!(cell && cell.late),
              items: ctx.items.reduce(function (o, it) { var x = c.items[it.id]; o[it.id] = { week: nv(x.week.v), cumulative: nv(x.cum), unit: x.unit || it.unit }; return o; }, {})
            };
          })
        };
      },
      timeseries: function (ctx) {
        var dcode = ctx.p.district ? str(ctx.p.district).toUpperCase() : '';
        if (dcode && !ctx.districts.some(function (d) { return d.code === dcode; })) apiFail('bad_district', 'ไม่พบอำเภอ: ' + ctx.p.district);
        var series = ctx.rounds.filter(function (r) { return r.round <= ctx.round; }).map(function (r) {
          var vals = {}, reported;
          if (dcode) {
            var c = AGCore.computeDistrict(items, ctx.records, dcode, r.round);
            ctx.items.forEach(function (it) { var x = c.items[it.id]; vals[it.id] = { week: nv(x.week.v), cumulative: nv(x.cum) }; });
            reported = c.counted ? 1 : 0;
          } else {
            var p = AGCore.computeProvince(items, ctx.records, ctx.districts, r.round);
            ctx.items.forEach(function (it) { var x = p.items[it.id]; vals[it.id] = { week: nv(x.week), cumulative: nv(x.cum) }; });
            reported = p.reported.length;
          }
          return { round: r.round, label: r.label, start: r.start, end: r.end, reported: reported, values: vals };
        });
        return { scope: dcode || 'province', items: ctx.items.map(itemInfo), series: series };
      },
      status: function (ctx) {
        var m = AGCore.statusMatrix(ctx.allRecords, ctx.rounds), rs = ctx.rounds.filter(function (r) { return r.round <= ctx.round; });
        return {
          rounds: rs.map(roundInfo),
          districts: ctx.districts.map(function (d) {
            return { code: d.code, name: d.name, rounds: rs.reduce(function (o, r) { var c = m[d.code] && m[d.code][r.round]; o[r.round] = c ? { status: c.status, late: c.late, submitted_at: c.at } : { status: 'none', late: false, submitted_at: '' }; return o; }, {}) };
          })
        };
      }
    };

    /** แปลงผลลัพธ์เป็นตาราง CSV */
    function toCsv(endpoint, data) {
      var rows = [];
      if (endpoint === 'summary') {
        rows.push(['round', 'item_id', 'code', 'label', 'unit', 'week', 'cumulative', 'districts_reporting_yes']);
        data.items.forEach(function (x) { rows.push([data.round.round, x.id, x.code, x.label, x.unit, x.week, x.cumulative, x.districts_reporting_yes]); });
      } else if (endpoint === 'districts') {
        rows.push(['round', 'district_code', 'district_name', 'status', 'item_id', 'unit', 'week', 'cumulative']);
        data.districts.forEach(function (d) { Object.keys(d.items).forEach(function (id) { var x = d.items[id]; rows.push([data.round.round, d.code, d.name, d.status, id, x.unit, x.week, x.cumulative]); }); });
      } else if (endpoint === 'timeseries') {
        rows.push(['scope', 'round', 'start', 'end', 'reported', 'item_id', 'week', 'cumulative']);
        data.series.forEach(function (r) { Object.keys(r.values).forEach(function (id) { var x = r.values[id]; rows.push([data.scope, r.round, r.start, r.end, r.reported, id, x.week, x.cumulative]); }); });
      } else if (endpoint === 'status') {
        rows.push(['district_code', 'district_name', 'round', 'status', 'late', 'submitted_at']);
        data.districts.forEach(function (d) { Object.keys(d.rounds).forEach(function (r) { var x = d.rounds[r]; rows.push([d.code, d.name, r, x.status, x.late, x.submitted_at]); }); });
      } else {
        rows.push(['item_id', 'code', 'section', 'label', 'unit', 'type', 'aggregation', 'agri', 'retired']);
        data.items.forEach(function (x) { rows.push([x.id, x.code, x.section, x.label, x.unit, x.type, x.aggregation, x.agri, x.retired]); });
      }
      return '﻿' + rows.map(function (r) { return r.map(function (c) { c = c === null || c === undefined ? '' : String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
    }

    /** เรียก Data API: คืน { body: object|string, csv: bool } */
    function api(p) {
      p = p || {};
      refreshItems();
      var s = settings();
      if (!truthy(s.API_ENABLED)) apiFail('api_disabled', 'Data API ปิดใช้งานอยู่');
      var endpoint = str(p.endpoint || 'summary').toLowerCase();
      if (API_ENDPOINTS.indexOf(endpoint) < 0) apiFail('bad_endpoint', 'endpoint ต้องเป็นหนึ่งใน: ' + API_ENDPOINTS.join(', '));
      var key = apiKeyCheck(p, s);
      rateLimit(key.id);
      var format = str(p.format || 'json').toLowerCase() === 'csv' ? 'csv' : 'json';
      var ver = store.cacheGet('data_ver') || '0';
      var ck = 'api:' + store.sha256([ver, endpoint, p.round, p.items, p.district, format].join('|')).slice(0, 40);
      var hit = store.cacheGet(ck);
      if (hit) return { body: format === 'csv' ? hit : JSON.parse(hit), csv: format === 'csv', cached: true };
      var rs = rounds(), cur = currentRound(rs);
      var round = p.round === undefined || p.round === '' || p.round === 'current' ? cur : Number(p.round);
      var rd = rs.filter(function (r) { return r.round === round; })[0];
      if (!rd) apiFail('bad_round', 'ไม่พบครั้งที่ ' + p.round);
      var all = records();
      var ctx = { p: p, s: s, rounds: rs, cur: cur, round: round, rd: rd, districts: districts(), allRecords: all,
        records: all.filter(AGCore.isCounted), items: endpoint === 'meta' || endpoint === 'status' ? [] : pickItems(p.items) };
      var data = API[endpoint](ctx);
      var body = format === 'csv' ? toCsv(endpoint, data) : { ok: true, api_version: API_VERSION, endpoint: endpoint, generated_at: store.now(), timezone: 'Asia/Bangkok', data: data };
      var txt = format === 'csv' ? body : JSON.stringify(body);
      if (txt.length < 90000) store.cachePut(ck, txt, 300);
      return { body: body, csv: format === 'csv', cached: false };
    }

    /* ── จัดการ API Key (Super Admin) ── */
    function publicKey(k) { return { id: str(k.id), label: str(k.label), prefix: str(k.prefix), status: str(k.status) || 'active', created_at: str(k.created_at), created_by: str(k.created_by), last_used: str(k.last_used) }; }
    A['admin.apikeys.list'] = function (p, u) { need(u, ['super']); return store.rows(T.APIKEYS).map(publicKey).reverse(); };
    A['admin.apikeys.create'] = function (p, u) {
      need(u, ['super']);
      var label = clip(p.label, 80);
      if (label.length < 2) fail('กรุณาตั้งชื่อ Key เช่น ชื่อเว็บไซต์ที่จะนำไปใช้');
      var raw = 'kpp_' + store.sha256(store.uuid() + store.uuid() + Date.now()).slice(0, 40);
      var rec = { id: store.uuid(), label: label, prefix: raw.slice(0, 10), key_hash: store.sha256(raw), status: 'active', created_at: store.now(), created_by: str(u.name), last_used: '' };
      store.insert(T.APIKEYS, rec);
      audit(u, 'apikey_create', 'สร้าง API Key: ' + label + ' (' + rec.prefix + '…)', p._ua);
      var out = publicKey(rec); out.key = raw;
      return out;
    };
    A['admin.apikeys.revoke'] = function (p, u) {
      need(u, ['super']);
      var k = store.rows(T.APIKEYS).filter(function (x) { return str(x.id) === str(p.id); })[0];
      if (!k) fail('ไม่พบ API Key');
      store.update(T.APIKEYS, function (x) { return str(x.id) === str(k.id); }, { status: 'revoked' });
      audit(u, 'apikey_revoke', 'ยกเลิก API Key: ' + k.label + ' (' + k.prefix + '…)', p._ua);
      return true;
    };

    var OPEN = { 'public.bootstrap': 1, 'public.summary': 1, 'auth.register': 1, 'auth.login': 1 };

    function handle(action, payload) {
      payload = payload || {};
      var fn = A[action];
      if (!fn) fail('ไม่รู้จักคำสั่ง: ' + action);
      refreshItems();
      if (OPEN[action]) return fn(payload, null);
      var u = auth(payload.token);
      var res = fn(payload, u);
      if (WRITES[action]) bump();
      return res;
    }
    var WRITES = { 'data.save': 1, 'data.withdraw': 1, 'data.review': 1, 'admin.rounds.save': 1, 'admin.rounds.generate': 1, 'admin.settings.save': 1,
      'admin.items.save': 1, 'admin.items.reset': 1 };

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

    refreshItems();
    return { handle: handle, api: api, seed: seed, actions: A, settings: settings,
      records: function () { refreshItems(); return records(); },
      items: function () { return refreshItems(); },
      dataColumns: function () { return dataColumns(refreshItems()); } };
  }

  return { create: create, COLS: COLS, T: T, DEFAULT_SETTINGS: DEFAULT_SETTINGS, ROLE_TH: ROLE_TH, dataColumns: dataColumns,
    rowToRecord: rowToRecord, recordToRow: recordToRow, normPhone: normPhone, CORE_IDS: CORE_IDS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AGServer;
