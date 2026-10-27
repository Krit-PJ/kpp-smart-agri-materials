/* หน้าสถานะการส่งรายงาน + ตรวจรับ/ส่งกลับแก้ไข (จังหวัด) */
(function () {
  var ST = { r: null };
  function itemOf(id) { return AG_ITEMS.filter(function (i) { return i.id === id; })[0]; }

  Pages.status = {
    title: 'สถานะการส่งรายงาน', sub: 'ติดตามการส่งรายงานของ 11 อำเภอ',
    render: function (view, params) {
      if (params.r !== undefined) ST.r = Number(params.r);
      if (ST.r === null || !S.roundOf(ST.r)) ST.r = S.currentRound();
      var jobs = [S.call('status.get')];
      if (S.isAdmin()) jobs.push(S.loadRecords(true));
      return Promise.all(jobs).then(function (res) { ST.data = res[0]; draw(view); });
    }
  };

  function cellOf(m, d, r) { return (m[d] && m[d][r]) || null; }
  function isLateMiss(rd) { return rd && rd.due && rd.due < U.today(); }

  function draw(view) {
    var m = ST.data.matrix, r = ST.r, rd = S.roundOf(r), admin = S.isAdmin();
    App.setHeader('สถานะการส่งรายงาน', S.roundText(rd) + (rd && rd.due ? ' · กำหนดส่ง ' + U.thLong(rd.due) : ''));
    if (admin) {
      var a = App.actions('<label class="switch" title="ค่าเริ่มต้น: ปิด (เห็นเฉพาะผู้ดูแลระดับจังหวัด)"><input type="checkbox" id="sVis"' + (ST.data.visibleToDistrict ? ' checked' : '') + '> ให้เจ้าหน้าที่อำเภอดูหน้านี้ได้</label>');
      a.querySelector('#sVis').onchange = function (e) {
        var on = e.target.checked;
        S.call('admin.settings.save', { values: { STATUS_VISIBLE_TO_DISTRICT: on ? 'TRUE' : 'FALSE' } }).then(function (s) {
          S.settings = s; ST.data.visibleToDistrict = on;
          U.toast(on ? 'เปิดให้เจ้าหน้าที่อำเภอดูสถานะการส่งได้แล้ว' : 'ปิดการแสดงผลสำหรับเจ้าหน้าที่อำเภอแล้ว', 'ok');
        }).catch(function (err) { e.target.checked = !on; U.toast(err.message, 'err'); });
      };
    }
    var cnt = { accepted: 0, submitted: 0, draft: 0, returned: 0, none: 0, late: 0 };
    S.districts.forEach(function (d) { var c = cellOf(m, d.code, r); cnt[c ? c.status : 'none']++; if (c && c.late) cnt.late++; });
    var sent = cnt.accepted + cnt.submitted;
    var h = ['<div class="toolbar"><label class="fld"><span>ครั้งที่รายงาน</span><select id="sR">' + S.roundOptions(r) + '</select></label><div class="spacer"></div>' +
      (admin ? '<button class="btn" id="sLine">' + U.icon('copy') + 'คัดลอกข้อความแจ้งเตือน (LINE)</button>' : '') + '</div>'];
    h.push('<div class="kpis">' +
      tile('checks', '', 'ส่งแล้ว', sent + '<small>/ ' + S.districts.length + ' อำเภอ</small>', '<div class="bar-mini"><i style="width:' + Math.round(sent / S.districts.length * 100) + '%"></i></div>') +
      tile('check', '', 'จังหวัดตรวจรับแล้ว', cnt.accepted + '<small>อำเภอ</small>', '<div class="small muted">รอตรวจ ' + cnt.submitted + ' อำเภอ</div>') +
      tile('edit', 'b', 'ฉบับร่าง / ส่งกลับแก้ไข', (cnt.draft + cnt.returned) + '<small>อำเภอ</small>', '<div class="small muted">ร่าง ' + cnt.draft + ' · ส่งกลับ ' + cnt.returned + '</div>') +
      tile('alert', cnt.none && isLateMiss(rd) ? 'r' : 'y', isLateMiss(rd) ? 'เลยกำหนด ยังไม่ส่ง' : 'ยังไม่ส่ง', cnt.none + '<small>อำเภอ</small>', '<div class="small muted">ส่งหลังกำหนด ' + cnt.late + ' อำเภอ</div>') + '</div>');

    var t = ['<div class="card"><div class="card-h"><h2>รายละเอียด ' + U.esc(S.roundText(rd)) + '</h2></div><div class="tbl-wrap"><table class="t"><thead><tr><th>อำเภอ</th><th>สถานะ</th><th>ส่งเมื่อ</th>' + (admin ? '<th>ผู้ส่ง</th>' : '') + '<th>หมายเหตุ</th>' + (admin ? '<th></th>' : '') + '</tr></thead><tbody>'];
    S.districts.forEach(function (d) {
      var c = cellOf(m, d.code, r), st = c ? c.status : 'none';
      var miss = !c && isLateMiss(rd);
      t.push('<tr><td><b>' + U.esc(d.name) + '</b></td><td>' + (miss ? '<span class="chip st-miss"><i></i>เลยกำหนด</span>' : U.statusChip(st, c && c.late)) + '</td>' +
        '<td class="small">' + (c && c.at ? U.thDateTime(c.at) : c ? '<span class="muted">แก้ไขล่าสุด ' + U.thDateTime(c.updated_at) + '</span>' : '–') + '</td>' +
        (admin ? '<td class="small">' + U.esc(c ? c.by : '') + '</td>' : '') +
        '<td class="small">' + U.esc(c ? c.note : '') + '</td>' +
        (admin ? '<td style="white-space:nowrap">' + (c ? '<button class="btn sm" data-review="' + d.code + '">' + U.icon('eye') + 'ตรวจสอบ</button>' : '') + '</td>' : '') + '</tr>');
    });
    t.push('</tbody></table></div></div>');
    h.push(t.join(''));

    // ตารางทุกครั้ง
    var rs = S.rounds.filter(function (x) { return x.round <= Math.max(S.currentRound(), 1); });
    var mx = ['<div class="card"><div class="card-h"><h2>ภาพรวมทุกครั้ง</h2><div class="legend"><span><i class="c-accepted"></i>ตรวจรับ</span><span><i class="c-submitted"></i>ส่งแล้ว</span><span><i class="c-draft"></i>ร่าง</span><span><i class="c-returned"></i>ส่งกลับ</span><span><i class="c-miss"></i>เลยกำหนด</span><span><i style="box-shadow:inset 0 -3px 0 var(--accent);background:#f3f4f6"></i>ส่งช้า</span></div></div><div class="tbl-wrap"><table class="t"><thead><tr><th>อำเภอ</th>' +
      rs.map(function (x) { return '<th class="n" title="' + U.esc(S.roundText(x)) + '">' + (x.round === 0 ? 'ยกมา' : x.round) + '</th>'; }).join('') + '<th class="n">ส่งแล้ว</th></tr></thead><tbody>'];
    S.districts.forEach(function (d) {
      var n = 0;
      mx.push('<tr><td>' + U.esc(d.name) + '</td>' + rs.map(function (x) {
        var c = cellOf(m, d.code, x.round), cls = c ? 'c-' + c.status : (x.round > 0 && isLateMiss(x) ? 'c-miss' : 'c-none');
        if (c && (c.status === 'submitted' || c.status === 'accepted') && x.round > 0) n++;
        var lab = c ? { accepted: '✓✓', submitted: '✓', draft: 'ร', returned: '!' }[c.status] : (cls === 'c-miss' ? '×' : '·');
        return '<td class="cell"><button class="' + cls + (c && c.late ? ' c-late' : '') + '" data-d="' + d.code + '" data-r="' + x.round + '" title="' + U.esc(d.name + ' ' + S.roundText(x) + ': ' + (c ? AGCore.STATUS_TH[c.status] : 'ยังไม่ส่ง')) + '">' + lab + '</button></td>';
      }).join('') + '<td class="n"><b>' + n + '</b>/' + rs.filter(function (x) { return x.round > 0; }).length + '</td></tr>');
    });
    mx.push('</tbody></table></div></div>');
    h.push(mx.join(''));
    view.innerHTML = h.join('');

    U.$('sR').onchange = function (e) { App.go('status', { r: e.target.value }); };
    view.querySelectorAll('td.cell button').forEach(function (b) {
      b.onclick = function () {
        if (Number(b.dataset.r) !== ST.r) { App.go('status', { r: b.dataset.r }); return; }
        if (admin && cellOf(m, b.dataset.d, ST.r)) review(b.dataset.d);
      };
    });
    view.querySelectorAll('[data-review]').forEach(function (b) { b.onclick = function () { review(b.dataset.review); }; });
    var ln = U.$('sLine'); if (ln) ln.onclick = function () { lineText(m, r, rd); };
  }

  function tile(ic, cls, k, v, extra) {
    return '<div class="kpi"><div class="kpi-ic ' + cls + '">' + U.icon(ic) + '</div><div style="flex:1"><div class="k">' + k + '</div><div class="v">' + v + '</div>' + (extra || '') + '</div></div>';
  }

  function lineText(m, r, rd) {
    var miss = [], fix = [];
    S.districts.forEach(function (d) { var c = cellOf(m, d.code, r); if (!c || c.status === 'draft') miss.push(d.name); else if (c.status === 'returned') fix.push(d.name); });
    var txt = 'แจ้งเตือนการรายงานผลการจัดการเศษวัสดุทางการเกษตร ' + S.roundText(rd) + '\n' +
      (rd && rd.due ? 'กำหนดส่ง วันศุกร์ที่ ' + U.thLong(rd.due) + '\n' : '') +
      (miss.length ? '\nยังไม่ส่ง (' + miss.length + ' อำเภอ): ' + miss.map(function (n) { return 'อ.' + n; }).join(', ') : '\nทุกอำเภอส่งรายงานแล้ว ขอบคุณครับ/ค่ะ') +
      (fix.length ? '\nรอแก้ไขตามที่จังหวัดแจ้ง: ' + fix.map(function (n) { return 'อ.' + n; }).join(', ') : '') +
      '\n\nส่งรายงานได้ที่ ' + location.origin + location.pathname;
    var m2 = U.modal({ title: 'ข้อความแจ้งเตือน', body: '<textarea id="lnT" rows="9" style="font-size:14px">' + U.esc(txt) + '</textarea>',
      actions: [{ label: 'ปิด', cls: 'ghost' }, { label: U.icon('copy') + 'คัดลอก', cls: 'primary', onClick: function () {
        var ta = U.$('lnT');
        return (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(function () { U.toast('คัดลอกแล้ว นำไปวางใน LINE ได้เลย', 'ok'); })
          .catch(function () { ta.select(); document.execCommand('copy'); U.toast('คัดลอกแล้ว'); });
      } }] });
    return m2;
  }

  function review(code) {
    var rec = AGCore.recordOf(S.records, code, ST.r);
    if (!rec) return;
    var comp = AGCore.computeDistrict(AG_ITEMS, S.records, code, ST.r, { includeCurrent: true });
    var rows = [];
    AG_ITEMS.forEach(function (it) {
      if (it.type === 'header') return;
      var c = rec.values[it.id]; if (!c) return;
      var x = comp.items[it.id], v = AGCore.num(c.v);
      rows.push('<tr><td><span class="code">' + it.code + '</span>' + U.pm(it.label.slice(0, 80)) + (c.t ? '<div class="small muted">' + U.esc(c.t) + '</div>' : '') + '</td><td>' + (c.h === 'Y' ? '<span class="yes">มี</span>' : c.h === 'N' ? 'ไม่มี' : '') + '</td><td class="n">' + U.fmt(v, '') + '</td><td class="n"><b>' + (it.type === 'check' ? '' : U.fmt(x.cum)) + '</b></td><td class="muted">' + U.esc(it.type === 'check' ? '' : x.unit) + '</td></tr>');
    });
    (rec.sec4 || []).forEach(function (a) { rows.push('<tr><td><span class="code">4</span>' + U.esc(a.t) + '</td><td>' + (a.h === 'Y' ? 'มี' : '') + '</td><td class="n">' + U.fmt(a.v, '') + '</td><td></td><td class="muted">' + U.esc(a.u) + '</td></tr>'); });
    var body = '<div class="row" style="margin-bottom:10px;gap:8px">' + U.statusChip(rec.status) + '<span class="small muted">ส่งโดย ' + U.esc(rec.meta.submitted_by || rec.meta.updated_by) + ' ' + U.thDateTime(rec.meta.submitted_at || rec.meta.updated_at) + ' · ผู้รายงาน ' + U.esc(rec.meta.reporter) + ' ' + U.esc(rec.meta.phone) + '</span></div>' +
      '<div class="tbl-wrap" style="max-height:46vh;border:1px solid var(--border-light);border-radius:8px"><table class="t"><thead><tr><th>รายการ</th><th>มี/ไม่มี</th><th class="n">ครั้งนี้</th><th class="n">สะสม</th><th>หน่วย</th></tr></thead><tbody>' +
      (rows.join('') || '<tr><td colspan="5" class="empty">ไม่มีผลงานในสัปดาห์นี้</td></tr>') + '</tbody></table></div>' +
      (rec.sec5 ? '<p class="small"><b>ปัญหาอุปสรรค:</b> ' + U.esc(rec.sec5) + '</p>' : '') +
      (rec.meta.review_note ? '<div class="notice warn" style="margin-top:10px">' + U.icon('info') + '<div>หมายเหตุครั้งก่อน: ' + U.esc(rec.meta.review_note) + '</div></div>' : '') +
      '<label class="fld" style="margin-top:12px"><span>หมายเหตุถึงอำเภอ (จำเป็นเมื่อส่งกลับแก้ไข)</span><textarea id="rvNote" rows="2" placeholder="เช่น ตรวจสอบตัวเลขพื้นที่ไถกลบอีกครั้ง"></textarea></label>';
    var acts = [{ label: 'ปิด', cls: 'ghost' }];
    if (rec.status === 'submitted' || rec.status === 'accepted') acts.push({ label: U.icon('undo') + 'ส่งกลับแก้ไข', cls: 'danger', onClick: function () { return decide(code, 'return'); } });
    if (rec.status === 'submitted') acts.push({ label: U.icon('checks') + 'ตรวจรับ', cls: 'primary', onClick: function () { return decide(code, 'accept'); } });
    acts.splice(1, 0, { label: U.icon('grid') + 'เปิดรายงานอำเภอ', cls: '', onClick: function () { App.go('district', { d: code, r: ST.r }); } });
    U.modal({ title: 'อ.' + S.districtName(code) + ' · ' + S.roundText(S.roundOf(ST.r)), wide: true, body: body, actions: acts, focus: false });
  }
  function decide(code, decision) {
    var note = U.$('rvNote').value.trim();
    if (decision === 'return' && !note) { U.toast('กรุณาระบุสิ่งที่ต้องแก้ไข', 'err'); U.$('rvNote').focus(); return false; }
    return S.call('data.review', { round: ST.r, district: code, decision: decision, note: note }).then(function () {
      U.toast(decision === 'accept' ? 'ตรวจรับรายงาน อ.' + S.districtName(code) + ' แล้ว' : 'ส่งกลับให้ อ.' + S.districtName(code) + ' แก้ไขแล้ว', 'ok');
      return Promise.all([S.call('status.get'), S.loadRecords(true)]).then(function (res) { ST.data = res[0]; draw(U.$('view')); });
    });
  }
})();
