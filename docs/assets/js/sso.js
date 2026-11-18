/**
 * SAM_SSO — เข้าสู่ระบบด้วยตัวตนกลาง (SSO) ร่วมกับ Agri-Risk Map และ Green Gain Hub
 * ใช้ KPP_ID (https://krit-pj.github.io/TH-Agri-Risk-Maps-Burning/js/kpp-id.js):
 *   เบอร์โทร → ตัวตนกลาง → ตั๋วใช้ครั้งเดียว (aud SAM) → Apps Script ของระบบนี้แลกตั๋วเอง (auth.sso) แล้วออก session เดิม
 * เจ้าหน้าที่อำเภอที่มีบัญชีอยู่แล้ว: ครั้งแรกระบบสร้างตัวตนกลางจากข้อมูลเดิมให้ (auth.ssoProvision) ไม่ต้องลงทะเบียนซ้ำ
 * Mini Super Admin / Super Admin: ชื่อผู้ใช้ + รหัสผ่านเหมือนเดิม (ไม่ผ่าน SSO)
 * ถ้าตัวตนกลางเชื่อมต่อไม่ได้ และ SSO_MODE ไม่ใช่ required → ใช้วิธีเดิม (เบอร์โทรของระบบนี้)
 */
var SAM_SSO = (function () {
  var AUD = 'SAM', FLAG = 'sam-sso-auto';
  function mode() { return String((S.settings && S.settings.SSO_MODE) || 'optional').toLowerCase(); }
  function on() { return !API.demo && !!(window.KPP_ID && window.KPP_ID.login) && mode() !== 'off'; }
  /** ข้อผิดพลาดที่ควรสลับไปใช้วิธีเดิม (ตัวตนกลางปิด/เชื่อมต่อไม่ได้) */
  function fallback(err) {
    var m = String(err && err.message || ''), c = err && err.code;
    if (mode() === 'required') return false;
    return c === 'sso_off' || c === 'sso_unreachable' || /ไม่รู้จักคำสั่ง|ปิดใช้งาน|เชื่อมต่อระบบตัวตนกลาง|Failed to fetch|NetworkError|Load failed/i.test(m);
  }
  function identity(phone) {
    return KPP_ID.login(phone, { system: AUD }).catch(function (err) {
      if (err.code !== 'not_found') throw err;
      return API.call('auth.ssoProvision', { phone: phone }).then(function (p) {
        if (p && (p.status === 'provisioned' || p.status === 'exists')) return KPP_ID.login(phone, { system: AUD });
        var e = new Error('หมายเลขนี้ยังไม่ได้ลงทะเบียน'); e.code = 'not_registered'; throw e;
      });
    });
  }
  /** → ผลเหมือน auth.login ({ token, user }) หรือ { status: 'need_register', phone, name } พร้อม prevLogin */
  function login(phone) {
    var prev = null;
    return identity(phone).then(function (id) {
      prev = id && id.prevLogin;
      return KPP_ID.ticket(AUD);
    }).then(function (t) { return API.call('auth.sso', { ticket: t.ticket }); })
      .then(function (r) { r.prevLogin = prev; return r; });
  }
  /** หลังลงทะเบียนในระบบนี้: ให้มีตัวตนกลางด้วย (ไม่ขัดการใช้งานถ้าไม่สำเร็จ) */
  function attach(phone) {
    if (!on()) return Promise.resolve(null);
    return API.call('auth.ssoProvision', { phone: phone })
      .then(function () { return KPP_ID.login(phone, { system: AUD }); })
      .catch(function () { return null; });
  }
  /** เข้าระบบเงียบ ๆ เมื่อเครื่องนี้มีตัวตนกลางอยู่แล้ว (เข้าจาก Agri-Risk / Green Gain Hub มาก่อน) — ครั้งเดียวต่อแท็บต่อการเข้าสู่ระบบ */
  function auto() {
    if (!on()) return Promise.resolve(null);
    var cur = KPP_ID.current(); if (!cur) return Promise.resolve(null);
    try { if (sessionStorage.getItem(FLAG) === String(cur.at)) return Promise.resolve(null); sessionStorage.setItem(FLAG, String(cur.at)); } catch (e) { }
    var job = KPP_ID.ticket(AUD).then(function (t) { return API.call('auth.sso', { ticket: t.ticket }); })
      .then(function (r) { return r && r.token ? r : null; }).catch(function () { return null; });
    // ไม่ให้หน้าเว็บรอนานถ้าตัวตนกลางตอบช้า (ผู้ใช้ยังเข้าด้วยเบอร์ได้ตามปกติ)
    return Promise.race([job, new Promise(function (res) { setTimeout(function () { res(null); }, 8000); })]);
  }
  /** แถบ "เข้าใช้ครั้งก่อน" + ปุ่ม "ไม่ใช่ฉัน" เหนือเนื้อหา (onSuspended: ออกจากระบบนี้) */
  function showPrev(prev, onSuspended) {
    if (!prev || !prev.at || !on()) return;
    var main = U.$('view'); if (!main) return;
    var box = document.getElementById('ssoPrev');
    if (!box) { box = document.createElement('div'); box.id = 'ssoPrev'; box.className = 'sso-prev'; main.parentNode.insertBefore(box, main); }
    box.innerHTML = KPP_ID.prevHtml(prev);
    KPP_ID.bindPrev(box, function (suspended) { if (suspended) { if (onSuspended) onSuspended(); setTimeout(function () { box.remove(); }, 8000); } else box.remove(); });
  }
  function clearPrev() { var b = document.getElementById('ssoPrev'); if (b) b.remove(); }
  function logout() { clearPrev(); if (window.KPP_ID) KPP_ID.logout(); }
  return { on: on, mode: mode, fallback: fallback, login: login, attach: attach, auto: auto, showPrev: showPrev, clearPrev: clearPrev, logout: logout };
})();
