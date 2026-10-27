/* ผู้ใช้งาน · บันทึกการเข้าใช้งาน · ตั้งค่า · ข้อมูลส่วนตัว */
(function () {
  var ROLE = { district: 'เจ้าหน้าที่อำเภอ (Admin)', mini: 'ผู้รวบรวมระดับจังหวัด (Mini Super Admin)', super: 'ผู้ดูแลระบบสูงสุด (Super Admin)' };
  var ROLE_S = { district: 'อำเภอ', mini: 'Mini Super Admin', super: 'Super Admin' };
  function roleChip(r) { return '<span class="chip role-' + r + '">' + U.esc(ROLE_S[r] || r) + '</span>'; }

  /* ═════════ ผู้ใช้งาน ═════════ */
  var UF = { q: '', role: '', d: '', st: '' };
  Pages.users = {
    title: 'ผู้ใช้งาน', sub: '',
    render: function (view) { return S.call('admin.users.list').then(function (list) { UF.list = list; drawUsers(view); }); }
  };
  function drawUsers(view) {
    var sup = S.user.role === 'super', list = UF.list;
    App.setHeader('ผู้ใช้งาน', sup ? 'จัดการบัญชีทุกระดับ · เพิ่ม/ลบ Mini Super Admin' : 'บัญชีเจ้าหน้าที่ระดับอำเภอ');
    if (sup) App.actions('<button class="btn primary" id="uAdd">' + U.icon('plus') + 'เพิ่มผู้ใช้</button>').querySelector('#uAdd').onclick = function () { editUser(null); };
    var c = { district: 0, mini: 0, super: 0, suspended: 0 };
    list.forEach(function (u) { c[u.role]++; if (u.status === 'suspended') c.suspended++; });
    var rows = list.filter(function (u) {
      var q = UF.q.toLowerCase();
      return (!UF.role || u.role === UF.role) && (!UF.d || u.district === UF.d) && (!UF.st || u.status === UF.st) &&
        (!q || (u.name + ' ' + u.phone + ' ' + u.username + ' ' + u.position + ' ' + u.districtName).toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return (a.role === b.role ? 0 : a.role === 'super' ? -1 : b.role === 'super' ? 1 : a.role === 'mini' ? -1 : b.role === 'mini' ? 1 : 0) || String(a.district).localeCompare(b.district) || a.name.localeCompare(b.name, 'th'); });
    var covered = {}; list.forEach(function (u) { if (u.role === 'district' && u.status !== 'suspended') covered[u.district] = (covered[u.district] || 0) + 1; });
    var noUser = S.districts.filter(function (d) { return !covered[d.code]; });
    var h = ['<div class="kpis">',
      tile('users', '', 'เจ้าหน้าที่อำเภอ', c.district + '<small>บัญชี</small>', noUser.length ? '<div class="small" style="color:var(--danger)">ยังไม่มีบัญชี: ' + noUser.map(function (d) { return d.name; }).join(', ') + '</div>' : '<div class="small muted">ครบทั้ง ' + S.districts.length + ' อำเภอ</div>'),
      sup ? tile('shield', 'b', 'Mini Super Admin', c.mini + '<small>บัญชี</small>') : '',
      sup ? tile('key', 'y', 'Super Admin', c.super + '<small>บัญชี</small>') : '',
      tile('lock', 'r', 'ระงับการใช้งาน', c.suspended + '<small>บัญชี</small>'), '</div>',
      '<div class="toolbar"><label class="fld" style="flex:1"><span>ค้นหา</span><input id="uQ" value="' + U.esc(UF.q) + '" placeholder="ชื่อ เบอร์โทร ตำแหน่ง"></label>',
      sup ? '<label class="fld"><span>บทบาท</span><select id="uRole"><option value="">ทั้งหมด</option><option value="district">อำเภอ</option><option value="mini">Mini Super Admin</option><option value="super">Super Admin</option></select></label>' : '',
      '<label class="fld"><span>อำเภอ</span><select id="uD">' + S.districtOptions(UF.d, true) + '</select></label>',
      '<label class="fld"><span>สถานะ</span><select id="uSt"><option value="">ทั้งหมด</option><option value="active">ใช้งาน</option><option value="suspended">ระงับ</option></select></label></div>',
      '<div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>ชื่อ - ตำแหน่ง</th><th>บทบาท</th><th>บัญชีเข้าระบบ</th><th>สังกัด</th><th>เข้าใช้ล่าสุด</th><th class="n">ครั้ง</th><th>สถานะ</th><th></th></tr></thead><tbody>'];
    if (!rows.length) h.push('<tr><td colspan="8" class="empty">ไม่พบผู้ใช้</td></tr>');
    rows.forEach(function (u) {
      var self = u.id === S.user.id, canMng = sup || u.role === 'district';
      h.push('<tr><td><b>' + U.esc((u.prefix || '') + u.name) + '</b>' + (self ? ' <span class="chip st-submitted">คุณ</span>' : '') + '<div class="small muted">' + U.esc(u.position) + '</div></td>' +
        '<td>' + roleChip(u.role) + '</td><td class="small">' + (u.phone ? U.icon('phone') + ' ' + U.esc(u.phone) : '') + (u.username ? '<div>' + U.icon('user') + ' ' + U.esc(u.username) + '</div>' : '') + '</td>' +
        '<td>' + (u.role === 'district' ? 'อ.' + U.esc(u.districtName) : '<span class="muted">จังหวัด</span>') + '</td>' +
        '<td class="small">' + (u.last_login ? U.thDateTime(u.last_login) : '<span class="muted">ยังไม่เคย</span>') + (u.last_seen && u.last_seen !== u.last_login ? '<div class="muted">ใช้งานล่าสุด ' + U.thDateTime(u.last_seen) + '</div>' : '') + '</td>' +
        '<td class="n">' + (u.login_count || 0) + '</td>' +
        '<td>' + (u.status === 'suspended' ? '<span class="chip st-returned"><i></i>ระงับ</span>' : '<span class="chip st-submitted"><i></i>ใช้งาน</span>') + '</td>' +
        '<td style="white-space:nowrap">' + (canMng && !self ? (sup ? '<button class="btn sm" data-edit="' + u.id + '">' + U.icon('edit') + 'แก้ไข</button> ' : '') +
          '<button class="btn sm" data-st="' + u.id + '">' + (u.status === 'suspended' ? 'เปิดใช้งาน' : 'ระงับ') + '</button> ' +
          '<button class="btn sm ghost" data-revoke="' + u.id + '" title="ให้ออกจากระบบทุกอุปกรณ์">' + U.icon('logout') + '</button>' +
          (sup ? '<button class="btn sm ghost danger" data-del="' + u.id + '" title="ลบ">' + U.icon('trash') + '</button>' : '') : '') + '</td></tr>');
    });
    h.push('</tbody></table></div></div>');
    view.innerHTML = h.join('');
    var redraw = function () { drawUsers(view); };
    U.$('uQ').oninput = U.debounce(function (e) { UF.q = e.target.value; redraw(); U.$('uQ').focus(); U.$('uQ').setSelectionRange(UF.q.length, UF.q.length); }, 250);
    if (U.$('uRole')) { U.$('uRole').value = UF.role; U.$('uRole').onchange = function (e) { UF.role = e.target.value; redraw(); }; }
    U.$('uD').onchange = function (e) { UF.d = e.target.value; redraw(); };
    U.$('uSt').value = UF.st; U.$('uSt').onchange = function (e) { UF.st = e.target.value; redraw(); };
    function byId(id) { return list.filter(function (u) { return u.id === id; })[0]; }
    function reload(msg) { return S.call('admin.users.list').then(function (l) { UF.list = l; redraw(); if (msg) U.toast(msg, 'ok'); }); }
    view.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { editUser(byId(b.dataset.edit)); }; });
    view.querySelectorAll('[data-st]').forEach(function (b) {
      b.onclick = function () {
        var u = byId(b.dataset.st), to = u.status === 'suspended' ? 'active' : 'suspended';
        U.confirm(to === 'suspended' ? 'ระงับการใช้งาน' : 'เปิดใช้งาน', (to === 'suspended' ? 'ระงับบัญชีของ <b>' : 'เปิดใช้งานบัญชีของ <b>') + U.esc(u.name) + '</b>' + (to === 'suspended' ? ' ผู้ใช้จะถูกออกจากระบบทันที' : ''), to === 'suspended' ? 'ระงับ' : 'เปิดใช้งาน', to === 'suspended' ? 'danger solid' : 'primary')
          .then(function (ok) { if (ok) S.call('admin.users.update', { id: u.id, status: to }).then(function () { return reload(to === 'suspended' ? 'ระงับบัญชีแล้ว' : 'เปิดใช้งานแล้ว'); }).catch(function (e) { U.toast(e.message, 'err'); }); });
      };
    });
    view.querySelectorAll('[data-revoke]').forEach(function (b) {
      b.onclick = function () {
        var u = byId(b.dataset.revoke);
        U.confirm('บังคับออกจากระบบ', 'ให้ <b>' + U.esc(u.name) + '</b> ออกจากระบบทุกอุปกรณ์ (เข้าสู่ระบบใหม่ได้ตามปกติ)', 'บังคับออก').then(function (ok) {
          if (ok) S.call('admin.users.update', { id: u.id, revoke: true }).then(function () { return reload('บังคับออกจากระบบแล้ว'); }).catch(function (e) { U.toast(e.message, 'err'); });
        });
      };
    });
    view.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        var u = byId(b.dataset.del);
        U.confirm('ลบผู้ใช้', 'ลบบัญชี <b>' + U.esc(u.name) + '</b> (' + U.esc(ROLE_S[u.role]) + ') ถาวร<br><span class="small muted">ข้อมูลรายงานที่เคยส่งยังคงอยู่ · บันทึกการเข้าใช้งานยังคงอยู่</span>', 'ลบผู้ใช้', 'danger solid').then(function (ok) {
          if (ok) S.call('admin.users.delete', { id: u.id }).then(function () { return reload('ลบผู้ใช้แล้ว'); }).catch(function (e) { U.toast(e.message, 'err'); });
        });
      };
    });
  }
  function editUser(u) {
    var isNew = !u;
    u = u || { role: 'mini', prefix: '', name: '', position: '', phone: '', district: '', username: '' };
    var m = U.modal({
      title: isNew ? 'เพิ่มผู้ใช้' : 'แก้ไขผู้ใช้', body:
        '<div class="grid2"><label class="fld span2"><span>บทบาท</span><select id="eRole"><option value="mini">' + ROLE.mini + '</option><option value="super">' + ROLE.super + '</option><option value="district">' + ROLE.district + '</option></select></label>' +
        '<label class="fld"><span>คำนำหน้า</span><input id="ePre" value="' + U.esc(u.prefix) + '" list="preList"><datalist id="preList"><option>นาย</option><option>นาง</option><option>นางสาว</option></datalist></label>' +
        '<label class="fld"><span>ชื่อ - สกุล *</span><input id="eName" value="' + U.esc(u.name) + '"></label>' +
        '<label class="fld span2"><span>ตำแหน่ง</span><input id="ePos" value="' + U.esc(u.position) + '"></label>' +
        '<label class="fld"><span>หมายเลขโทรศัพท์</span><input id="ePhone" inputmode="tel" value="' + U.esc(u.phone) + '"></label>' +
        '<label class="fld" id="eDistW"><span>อำเภอ *</span><select id="eDist"><option value="">— เลือก —</option>' + S.districtOptions(u.district) + '</select></label>' +
        '<label class="fld eAdm"><span>ชื่อผู้ใช้ (ภาษาอังกฤษ) *</span><input id="eUser" autocapitalize="none" value="' + U.esc(u.username) + '"></label>' +
        '<label class="fld eAdm"><span>' + (isNew ? 'รหัสผ่าน *' : 'รหัสผ่านใหม่ (เว้นว่าง = ไม่เปลี่ยน)') + '</span><input id="ePass" type="text" autocomplete="new-password" placeholder="อย่างน้อย 6 ตัวอักษร"></label>' +
        '<p class="span2 small muted" style="margin:0" id="eHint"></p></div>',
      actions: [{ label: 'ยกเลิก', cls: 'ghost' }, { label: U.icon('save') + (isNew ? 'เพิ่มผู้ใช้' : 'บันทึก'), cls: 'primary', onClick: function () {
        var p = { role: U.$('eRole').value, prefix: U.$('ePre').value, name: U.$('eName').value, position: U.$('ePos').value, phone: U.$('ePhone').value };
        if (p.role === 'district') p.district = U.$('eDist').value; else { p.username = U.$('eUser').value; if (U.$('ePass').value) p.password = U.$('ePass').value; }
        if (!isNew) p.id = u.id;
        return S.call(isNew ? 'admin.users.create' : 'admin.users.update', p).then(function () {
          U.toast(isNew ? 'เพิ่มผู้ใช้แล้ว' : 'บันทึกแล้ว', 'ok');
          return S.call('admin.users.list').then(function (l) { UF.list = l; drawUsers(U.$('view')); });
        });
      } }]
    });
    function sync() {
      var r = U.$('eRole').value;
      U.$('eDistW').hidden = r !== 'district';
      m.el.querySelectorAll('.eAdm').forEach(function (x) { x.hidden = r === 'district'; });
      U.$('eHint').textContent = r === 'district' ? 'เจ้าหน้าที่อำเภอเข้าสู่ระบบด้วยหมายเลขโทรศัพท์ · กรอก ตรวจสอบ ส่ง และแก้ไขได้เฉพาะข้อมูลของอำเภอตนเอง' :
        r === 'mini' ? 'Mini Super Admin เข้าสู่ระบบด้วยชื่อผู้ใช้/รหัสผ่าน · รวบรวม ตรวจรับ และรายงานผลภาพรวมจังหวัด จัดการบัญชีอำเภอ (ระงับ/เปิด)' :
          'Super Admin จัดการได้ทั้งระบบ รวมถึงเพิ่ม/ลบ Mini Super Admin';
    }
    U.$('eRole').value = u.role; U.$('eRole').onchange = sync; sync();
  }
  function tile(ic, cls, k, v, extra) {
    return '<div class="kpi"><div class="kpi-ic ' + cls + '">' + U.icon(ic) + '</div><div style="flex:1;min-width:0"><div class="k">' + k + '</div><div class="v">' + v + '</div>' + (extra || '') + '</div></div>';
  }

  /* ═════════ บันทึกการเข้าใช้งาน ═════════ */
  var ACT = {
    login: ['เข้าสู่ระบบ', 'auth'], logout: ['ออกจากระบบ', 'auth'], login_failed: ['เข้าสู่ระบบไม่สำเร็จ', 'auth'], register: ['ลงทะเบียน', 'auth'],
    save_draft: ['บันทึกร่าง', 'data'], submit: ['ส่งรายงาน', 'data'], withdraw: ['ถอนรายงาน', 'data'],
    review_accept: ['ตรวจรับรายงาน', 'review'], review_return: ['ส่งกลับแก้ไข', 'review'],
    print: ['พิมพ์รายงาน', 'data'], export_xlsx: ['ดาวน์โหลด Excel', 'data'], export_csv: ['ดาวน์โหลด CSV', 'data'], view_status: ['ดูสถานะ', 'data'],
    user_create: ['เพิ่มผู้ใช้', 'admin'], user_update: ['แก้ไขผู้ใช้', 'admin'], user_delete: ['ลบผู้ใช้', 'admin'],
    settings_update: ['แก้ไขการตั้งค่า', 'admin'], rounds_update: ['แก้ไขรอบรายงาน', 'admin'], password_change: ['เปลี่ยนรหัสผ่าน', 'auth'], profile_update: ['แก้ไขข้อมูลส่วนตัว', 'auth'], setup: ['ติดตั้งระบบ', 'admin']
  };
  var LF = { q: '', role: '', grp: '', from: '', to: '', n: 100 };
  Pages.logs = {
    title: 'บันทึกการเข้าใช้งาน', sub: 'ตรวจสอบการเข้าใช้งานและการดำเนินการของผู้ใช้ทุกระดับ',
    render: function (view) { return S.call('admin.logs', { limit: 5000 }).then(function (logs) { LF.logs = logs; drawLogs(view); }); }
  };
  function device(ua) {
    ua = String(ua || '');
    if (!/Mozilla|Chrome|Safari|Firefox/.test(ua)) return ua.slice(0, 40);
    var os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    var br = /Edg\//.test(ua) ? 'Edge' : /Line\//.test(ua) ? 'LINE' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    return [br, os].filter(Boolean).join(' · ');
  }
  function drawLogs(view) {
    var logs = LF.logs, t = U.today(), wk = U.addDays(t, -6);
    App.actions('<button class="btn" id="lCsv">' + U.icon('download') + 'ดาวน์โหลด CSV</button><button class="btn" id="lRe">' + U.icon('refresh') + 'โหลดใหม่</button>');
    var users7 = {}, nLogin = 0, nFail = 0, nSub = 0;
    logs.forEach(function (l) {
      var d = String(l.time).slice(0, 10);
      if (l.action === 'login' && d === t) nLogin++;
      if (d >= wk) { if (l.action === 'login') users7[l.user_id] = 1; if (l.action === 'login_failed') nFail++; if (l.action === 'submit') nSub++; }
    });
    var rows = logs.filter(function (l) {
      var d = String(l.time).slice(0, 10), q = LF.q.toLowerCase();
      return (!LF.role || l.role === LF.role || (LF.role === 'none' && !l.role)) && (!LF.grp || (ACT[l.action] || [])[1] === LF.grp) &&
        (!LF.from || d >= LF.from) && (!LF.to || d <= LF.to) &&
        (!q || [l.name, l.account, l.district, l.detail, (ACT[l.action] || [l.action])[0]].join(' ').toLowerCase().indexOf(q) >= 0);
    });
    var h = ['<div class="kpis">', tile('login', '', 'เข้าสู่ระบบวันนี้', nLogin + '<small>ครั้ง</small>'), tile('users', 'b', 'ผู้ใช้ที่เข้าใช้งาน 7 วัน', Object.keys(users7).length + '<small>คน</small>'),
      tile('send', 'y', 'ส่งรายงาน 7 วัน', nSub + '<small>ครั้ง</small>'), tile('alert', nFail ? 'r' : '', 'เข้าสู่ระบบไม่สำเร็จ 7 วัน', nFail + '<small>ครั้ง</small>'), '</div>',
      '<div class="toolbar"><label class="fld" style="flex:1"><span>ค้นหา</span><input id="lQ" value="' + U.esc(LF.q) + '" placeholder="ชื่อ เบอร์ อำเภอ รายละเอียด"></label>',
      '<label class="fld"><span>ระดับผู้ใช้</span><select id="lRole"><option value="">ทั้งหมด</option><option value="district">อำเภอ</option><option value="mini">Mini Super Admin</option>' + (S.user.role === 'super' ? '<option value="super">Super Admin</option>' : '') + '<option value="none">ไม่ระบุตัวตน</option></select></label>',
      '<label class="fld"><span>ประเภท</span><select id="lGrp"><option value="">ทั้งหมด</option><option value="auth">เข้า/ออกระบบ</option><option value="data">รายงาน</option><option value="review">ตรวจรับ</option><option value="admin">จัดการระบบ</option></select></label>',
      '<label class="fld" style="min-width:150px"><span>ตั้งแต่</span><input type="date" id="lFrom" value="' + LF.from + '"></label><label class="fld" style="min-width:150px"><span>ถึง</span><input type="date" id="lTo" value="' + LF.to + '"></label></div>',
      '<div class="card"><div class="card-h"><h2>' + rows.length.toLocaleString() + ' รายการ</h2></div><div class="tbl-wrap"><table class="t"><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>ระดับ</th><th>อำเภอ</th><th>กิจกรรม</th><th>รายละเอียด</th><th>อุปกรณ์</th></tr></thead><tbody>'];
    if (!rows.length) h.push('<tr><td colspan="7" class="empty">ไม่พบรายการ</td></tr>');
    rows.slice(0, LF.n).forEach(function (l) {
      var a = ACT[l.action] || [l.action, ''], bad = l.action === 'login_failed';
      h.push('<tr><td class="small" style="white-space:nowrap">' + U.thDateTime(l.time) + '</td><td><b>' + U.esc(l.name || '—') + '</b><div class="small muted">' + U.esc(l.account) + '</div></td>' +
        '<td>' + (l.role ? roleChip(l.role) : '<span class="chip st-none">ไม่ระบุ</span>') + '</td><td class="small">' + U.esc(l.district) + '</td>' +
        '<td><span class="chip ' + (bad ? 'st-returned' : a[1] === 'data' ? 'st-submitted' : a[1] === 'review' ? 'st-accepted' : a[1] === 'admin' ? 'role-super' : 'st-draft') + '">' + U.esc(a[0]) + '</span></td>' +
        '<td class="small">' + U.esc(l.detail) + '</td><td class="small muted">' + U.esc(device(l.ua)) + '</td></tr>');
    });
    h.push('</tbody></table></div>' + (rows.length > LF.n ? '<div style="padding:12px;text-align:center"><button class="btn" id="lMore">แสดงเพิ่ม (' + (rows.length - LF.n) + ')</button></div>' : '') + '</div>');
    view.innerHTML = h.join('');
    var redraw = function () { drawLogs(view); };
    U.$('lQ').oninput = U.debounce(function (e) { LF.q = e.target.value; LF.n = 100; redraw(); var q = U.$('lQ'); q.focus(); q.setSelectionRange(LF.q.length, LF.q.length); }, 300);
    U.$('lRole').value = LF.role; U.$('lRole').onchange = function (e) { LF.role = e.target.value; redraw(); };
    U.$('lGrp').value = LF.grp; U.$('lGrp').onchange = function (e) { LF.grp = e.target.value; redraw(); };
    U.$('lFrom').onchange = function (e) { LF.from = e.target.value; redraw(); };
    U.$('lTo').onchange = function (e) { LF.to = e.target.value; redraw(); };
    var more = U.$('lMore'); if (more) more.onclick = function () { LF.n += 200; redraw(); };
    U.$('lRe').onclick = function () { App.route(); };
    U.$('lCsv').onclick = function () {
      var data = [['เวลา', 'ชื่อ', 'บัญชี', 'ระดับ', 'อำเภอ', 'กิจกรรม', 'รายละเอียด', 'อุปกรณ์']].concat(rows.map(function (l) {
        return [l.time, l.name, l.account, ROLE_S[l.role] || '', l.district, (ACT[l.action] || [l.action])[0], l.detail, l.ua];
      }));
      U.download('บันทึกการเข้าใช้งาน_' + U.today() + '.csv', new Blob([U.csv(data)], { type: 'text/csv;charset=utf-8' }));
    };
  }

  /* ═════════ ตั้งค่า ═════════ */
  Pages.settings = {
    title: 'ตั้งค่ารายงานและระบบ', sub: '',
    render: function (view) { return Promise.all([S.call('admin.settings.get'), App.refreshBoot()]).then(function (res) { drawSettings(view, res[0]); }); }
  };
  function drawSettings(view, list) {
    var sup = S.user.role === 'super', val = {};
    list.forEach(function (s) { val[s.key] = s.value; });
    App.setHeader('ตั้งค่ารายงานและระบบ', sup ? 'Super Admin ปรับได้ทุกค่า' : 'Mini Super Admin ปรับรอบรายงาน หัวรายงาน และการแสดงสถานะ');
    var rs = S.rounds;
    var h = ['<div class="card"><div class="card-h"><h2>รอบรายงานรายสัปดาห์</h2><button class="btn sm" id="rGen">' + U.icon('plus') + 'สร้างรอบเพิ่ม</button><button class="btn sm primary" id="rSave">' + U.icon('save') + 'บันทึกรอบรายงาน</button>' +
      '<p>อำเภอบันทึก/แก้ไขได้เฉพาะครั้งที่ "เปิดรับ" · วันที่ใช้แสดงในหัวรายงาน "รายงานครั้งที่ … ระหว่างวันที่ … ถึงวันที่ …"</p></div>' +
      '<div class="tbl-wrap" style="max-height:440px"><table class="t" id="rTable"><thead><tr><th>ครั้งที่</th><th>ชื่อ</th><th>ระหว่างวันที่</th><th>ถึงวันที่</th><th>กำหนดส่ง</th><th>เปิดรับข้อมูล</th></tr></thead><tbody>' +
      rs.map(function (r) {
        return '<tr data-r="' + r.round + '"><td><b>' + (r.round === 0 ? 'ยกมา' : r.round) + '</b></td><td><input data-k="label" value="' + U.esc(r.label) + '" style="min-width:160px"></td>' +
          '<td><input type="date" data-k="start" value="' + r.start + '"' + (r.round === 0 ? ' disabled' : '') + '></td><td><input type="date" data-k="end" value="' + r.end + '"' + (r.round === 0 ? ' disabled' : '') + '></td>' +
          '<td><input type="date" data-k="due" value="' + r.due + '"' + (r.round === 0 ? ' disabled' : '') + '></td><td><label class="switch"><input type="checkbox" data-k="open"' + (r.open ? ' checked' : '') + '></label></td></tr>';
      }).join('') + '</tbody></table></div></div>'];

    var keys = ['TITLE', 'SEASON', 'OFFICE', 'DOC_REF_1', 'DOC_REF_2', 'PROV_REPORTER_NAME', 'PROV_REPORTER_TITLE', 'QR_NOTE', 'QR_LINK'];
    h.push('<div class="card"><div class="card-h"><h2>หัวรายงานและ QR Code (ค่าเริ่มต้นของการพิมพ์)</h2><button class="btn sm primary" id="hSave">' + U.icon('save') + 'บันทึก</button></div><div class="card-b grid2">' +
      keys.map(function (k) {
        var s = list.filter(function (x) { return x.key === k; })[0]; if (!s) return '';
        var long = k === 'DOC_REF_2' || k === 'TITLE';
        return '<label class="fld' + (long ? ' span2' : '') + '"><span>' + U.esc(s.note) + '</span>' + (k === 'DOC_REF_2' ? '<textarea data-set="' + k + '" rows="3">' + U.esc(s.value) + '</textarea>' : '<input data-set="' + k + '" value="' + U.esc(s.value) + '">') + '</label>';
      }).join('') +
      '<div class="fld span2"><span>รูป QR Code</span><div class="qr-box"><img id="sQr" src="' + U.esc(val.QR_IMAGE || 'assets/img/qr-default.png') + '" alt="QR"><label class="btn sm">' + U.icon('download') + 'อัปโหลดรูป<input type="file" id="sQrFile" accept="image/*" hidden></label><button class="btn sm" id="sQrGen">สร้างจากลิงก์</button><button class="btn sm ghost" id="sQrReset">ใช้รูปตั้งต้น</button></div></div></div></div>');

    h.push('<div class="card"><div class="card-h"><h2>การเข้าถึงข้อมูล</h2><button class="btn sm primary" id="aSave">' + U.icon('save') + 'บันทึก</button></div><div class="card-b" style="display:grid;gap:12px">' +
      '<label class="switch"><input type="checkbox" data-set="STATUS_VISIBLE_TO_DISTRICT"' + (val.STATUS_VISIBLE_TO_DISTRICT === 'TRUE' ? ' checked' : '') + '> ให้เจ้าหน้าที่อำเภอดู "สถานะการส่งรายงาน" ของทุกอำเภอได้ <span class="small muted">(ค่าเริ่มต้น: ปิด)</span></label>' +
      (sup ? '<label class="switch"><input type="checkbox" data-set="REGISTRATION_OPEN"' + (val.REGISTRATION_OPEN === 'TRUE' ? ' checked' : '') + '> เปิดให้เจ้าหน้าที่อำเภอลงทะเบียนเอง (เข้าใช้งานได้ทันที)</label>' +
        '<label class="switch"><input type="checkbox" data-set="PUBLIC_DASHBOARD"' + (val.PUBLIC_DASHBOARD === 'TRUE' ? ' checked' : '') + '> แสดงแผนที่สรุปผลต่อสาธารณะ (เฉพาะยอดรวมของรายงานที่ส่งแล้ว ไม่มีข้อมูลส่วนบุคคล)</label>' +
        '<label class="fld" style="max-width:280px"><span>อายุการเข้าสู่ระบบ (ชั่วโมง)</span><input type="number" min="1" max="720" data-set="SESSION_HOURS" value="' + U.esc(val.SESSION_HOURS) + '"></label>' : '') + '</div></div>');
    if (sup) h.push('<div class="card"><div class="card-h"><h2>ฐานข้อมูล</h2></div><div class="card-b small">' + (API.demo ? '<div class="notice warn" style="margin:0 0 10px">' + U.icon('info') + '<div>กำลังใช้ <b>โหมดทดลอง</b> ข้อมูลเก็บในเบราว์เซอร์นี้ · ตั้งค่า API_URL ใน assets/js/config.js เพื่อเชื่อม Google Sheets</div></div><button class="btn sm danger" id="demoReset">' + U.icon('refresh') + 'ล้างข้อมูลทดลองและสร้างใหม่</button>' :
      'เชื่อมต่อ Google Apps Script แล้ว · ') + (window.KPP_CONFIG.SHEET_URL ? ' <a href="' + U.esc(window.KPP_CONFIG.SHEET_URL) + '" target="_blank" rel="noopener">เปิด Google Sheet ฐานข้อมูล</a>' : '') + '</div></div>');
    view.innerHTML = h.join('');

    var qr = val.QR_IMAGE || '';
    U.$('rSave').onclick = function () {
      var out = [];
      U.$('rTable').querySelectorAll('tr[data-r]').forEach(function (tr) {
        var o = { round: Number(tr.dataset.r) };
        tr.querySelectorAll('[data-k]').forEach(function (i) { o[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value; });
        out.push(o);
      });
      var b = this; b.disabled = true;
      S.call('admin.rounds.save', { rounds: out }).then(function (r) { S.rounds = r; U.toast('บันทึกรอบรายงานแล้ว', 'ok'); }).catch(function (e) { U.toast(e.message, 'err'); }).then(function () { b.disabled = false; });
    };
    U.$('rGen').onclick = function () {
      var last = rs[rs.length - 1], next = last && last.end ? U.addDays(last.end, 1) : U.today();
      U.modal({ title: 'สร้างรอบรายงานเพิ่ม', body: '<div class="grid2"><label class="fld"><span>จำนวนสัปดาห์</span><input id="gN" type="number" min="1" max="60" value="4"></label><label class="fld"><span>เริ่มวันที่ (ถ้าไม่มีรอบเดิม)</span><input id="gS" type="date" value="' + next + '"></label><p class="span2 small muted" style="margin:0">รอบละ 7 วัน ต่อจากรอบสุดท้าย กำหนดส่ง = วันสิ้นสุด + 2 วัน · สร้างแล้วแก้ไขวันที่ได้</p></div>',
        actions: [{ label: 'ยกเลิก', cls: 'ghost' }, { label: 'สร้าง', cls: 'primary', onClick: function () {
          return S.call('admin.rounds.generate', { count: Number(U.$('gN').value), start: U.$('gS').value }).then(function (r) { S.rounds = r; U.toast('สร้างรอบเพิ่มแล้ว', 'ok'); App.route(); });
        } }] });
    };
    function saveKeys(sel, extra) {
      var vals = extra || {};
      view.querySelectorAll(sel).forEach(function (i) { vals[i.dataset.set] = i.type === 'checkbox' ? (i.checked ? 'TRUE' : 'FALSE') : i.value; });
      return S.call('admin.settings.save', { values: vals }).then(function (s) { S.settings = s; App.renderNav(); U.toast('บันทึกการตั้งค่าแล้ว', 'ok'); }).catch(function (e) { U.toast(e.message, 'err'); });
    }
    U.$('hSave').onclick = function () { saveKeys('.card-b.grid2 [data-set]', { QR_IMAGE: qr }); };
    U.$('aSave').onclick = function () { var card = this.closest('.card'); var vals = {}; card.querySelectorAll('[data-set]').forEach(function (i) { vals[i.dataset.set] = i.type === 'checkbox' ? (i.checked ? 'TRUE' : 'FALSE') : i.value; }); S.call('admin.settings.save', { values: vals }).then(function (s) { S.settings = s; App.renderNav(); U.toast('บันทึกการตั้งค่าแล้ว', 'ok'); }).catch(function (e) { U.toast(e.message, 'err'); }); };
    U.$('sQrFile').onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, 320 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          var g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          qr = c.toDataURL('image/png'); U.$('sQr').src = qr; U.toast('เลือกรูปแล้ว กด "บันทึก" เพื่อใช้งาน');
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(f);
    };
    U.$('sQrGen').onclick = function () {
      var link = view.querySelector('[data-set=QR_LINK]').value;
      if (typeof qrcode === 'undefined' || !link) { U.toast('กรุณากรอกลิงก์ใต้ QR Code ก่อน', 'err'); return; }
      var q = qrcode(0, 'M'); q.addData(link); q.make(); qr = q.createDataURL(6, 0); U.$('sQr').src = qr; U.toast('สร้าง QR แล้ว กด "บันทึก" เพื่อใช้งาน');
    };
    U.$('sQrReset').onclick = function () { qr = ''; U.$('sQr').src = 'assets/img/qr-default.png'; };
    var dr = U.$('demoReset');
    if (dr) dr.onclick = function () { U.confirm('ล้างข้อมูลทดลอง', 'ลบข้อมูลทดลองทั้งหมดในเบราว์เซอร์นี้และสร้างข้อมูลตัวอย่างใหม่', 'ล้างข้อมูล', 'danger solid').then(function (ok) { if (ok) { API.resetDemo(); U.store('kpp-session', null); location.hash = '#map'; location.reload(); } }); };
  }

  /* ═════════ ข้อมูลส่วนตัว ═════════ */
  Pages.profile = {
    title: 'ข้อมูลส่วนตัว', sub: '',
    render: function (view) {
      var u = S.user, adm = u.role !== 'district';
      App.setHeader('ข้อมูลส่วนตัว', ROLE[u.role]);
      view.innerHTML = '<div class="grid2" style="align-items:start"><div class="card"><div class="card-h"><h2>ข้อมูลผู้ใช้</h2></div><div class="card-b grid2">' +
        '<label class="fld"><span>คำนำหน้า</span><input id="pfPre" value="' + U.esc(u.prefix) + '"></label><label class="fld"><span>ชื่อ - สกุล</span><input id="pfName" value="' + U.esc(u.name) + '"></label>' +
        '<label class="fld span2"><span>ตำแหน่ง</span><input id="pfPos" value="' + U.esc(u.position) + '"></label>' +
        '<label class="fld"><span>' + (adm ? 'ชื่อผู้ใช้' : 'หมายเลขโทรศัพท์ (ใช้เข้าสู่ระบบ)') + '</span><input value="' + U.esc(adm ? u.username : u.phone) + '" disabled></label>' +
        '<label class="fld"><span>สังกัด</span><input value="' + U.esc(u.role === 'district' ? 'สำนักงานเกษตรอำเภอ' + u.districtName : S.settings.OFFICE) + '" disabled></label>' +
        '<div class="span2"><button class="btn primary" id="pfSave">' + U.icon('save') + 'บันทึก</button></div>' +
        (adm ? '' : '<p class="span2 small muted" style="margin:0">ต้องการเปลี่ยนหมายเลขโทรศัพท์หรืออำเภอ กรุณาติดต่อผู้ดูแลระบบ</p>') + '</div></div>' +
        (adm ? '<div class="card"><div class="card-h"><h2>เปลี่ยนรหัสผ่าน</h2></div><div class="card-b grid2" style="grid-template-columns:1fr">' +
          '<label class="fld"><span>รหัสผ่านเดิม</span><input id="pwOld" type="password" autocomplete="current-password"></label>' +
          '<label class="fld"><span>รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</span><input id="pwNew" type="password" autocomplete="new-password"></label>' +
          '<label class="fld"><span>ยืนยันรหัสผ่านใหม่</span><input id="pwNew2" type="password" autocomplete="new-password"></label>' +
          '<div><button class="btn primary" id="pwSave">' + U.icon('key') + 'เปลี่ยนรหัสผ่าน</button></div></div></div>' : '') + '</div>';
      U.$('pfSave').onclick = function () {
        S.call('auth.updateProfile', { prefix: U.$('pfPre').value, name: U.$('pfName').value, position: U.$('pfPos').value }).then(function (r) {
          S.user = r.user; App.setSession(S.token, r.user); U.toast('บันทึกข้อมูลแล้ว', 'ok');
        }).catch(function (e) { U.toast(e.message, 'err'); });
      };
      var pw = U.$('pwSave');
      if (pw) pw.onclick = function () {
        if (U.$('pwNew').value !== U.$('pwNew2').value) { U.toast('รหัสผ่านใหม่ไม่ตรงกัน', 'err'); return; }
        S.call('auth.changePassword', { oldPassword: U.$('pwOld').value, newPassword: U.$('pwNew').value }).then(function () {
          U.toast('เปลี่ยนรหัสผ่านแล้ว', 'ok'); ['pwOld', 'pwNew', 'pwNew2'].forEach(function (i) { U.$(i).value = ''; });
        }).catch(function (e) { U.toast(e.message, 'err'); });
      };
    }
  };
})();
