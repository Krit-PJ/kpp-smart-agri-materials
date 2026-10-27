/* หน้ากรอกและส่งรายงาน (เจ้าหน้าที่อำเภอ) — 1 กรอกข้อมูล → 2 ตรวจสอบ → 3 ยืนยันและส่ง */
(function () {
  var UNITS = ['ไร่', 'ครั้ง', 'แห่ง', 'ราย', 'ตัน', 'กิโลกรัม', 'หมู่บ้าน/ชุมชน', 'คน', 'กิโลเมตร', 'ชิ้น'];
  var E = null; // สถานะหน้า
  var AGRI_CODE = '2.2';

  function itemOf(id) { return AG_ITEMS.filter(function (i) { return i.id === id; })[0]; }
  function draftKey() { return 'kpp-draft-' + (API.demo ? 'demo-' : '') + E.district + '-' + E.round; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function defaultRound() {
    var cur = S.currentRound(), open = S.rounds.filter(function (r) { return r.open && r.round <= Math.max(cur, 0); });
    if (S.roundOf(cur) && S.roundOf(cur).open) return cur;
    if (open.length) return open[open.length - 1].round;
    return cur;
  }

  Pages.entry = {
    title: 'กรอกและส่งรายงาน', sub: 'กรอกเฉพาะผลงานของสัปดาห์ ระบบรวมเป็นยอดสะสมให้อัตโนมัติ',
    leave: function () { return !(E && E.dirty) || window.confirm('มีข้อมูลที่ยังไม่บันทึก ต้องการออกจากหน้านี้หรือไม่?\n(ระบบเก็บร่างไว้ในเครื่องนี้ให้แล้ว)'); },
    render: function (view, params) {
      var district = S.user.role === 'district' ? S.user.district : (params.d || (E && E.district) || S.districts[0].code);
      var round = params.r !== undefined ? Number(params.r) : (E && E.district === district ? E.round : defaultRound());
      E = { district: district, round: round, step: 1, dirty: false, filter: (E && E.filter) || 'all' };
      return S.loadRecords(true).then(function () { load(view); });
    }
  };

  function load(view) {
    var rec = AGCore.recordOf(S.records, E.district, E.round);
    E.rec = rec;
    E.F = rec ? { values: clone(rec.values), sec4: clone(rec.sec4 || []), sec5: rec.sec5 || '', meta: clone(rec.meta || {}) }
      : { values: {}, sec4: AGCore.carrySec4(S.records, E.district, E.round), sec5: '', meta: {} };
    if (!E.F.meta.reporter) E.F.meta.reporter = (S.user.prefix || '') + S.user.name;
    if (!E.F.meta.position) E.F.meta.position = S.user.position || '';
    if (!E.F.meta.phone) E.F.meta.phone = S.user.phone || '';
    var rd = S.roundOf(E.round);
    E.locked = S.user.role !== 'super' && ((rd && !rd.open) || (rec && rec.status === 'accepted'));
    E.step = rec && (rec.status === 'submitted' || rec.status === 'accepted') ? 3 : 1;
    // ร่างที่เก็บในเครื่อง
    var saved = null;
    try { saved = JSON.parse(U.store(draftKey()) || 'null'); } catch (e) { saved = null; }
    E.restore = saved && !E.locked && (!rec || saved.ts > (rec.meta.updated_at || '')) ? saved : null;
    draw(view);
  }

  function draw(view) {
    view = view || U.$('view');
    var rd = S.roundOf(E.round), rec = E.rec;
    App.setHeader('กรอกและส่งรายงาน', 'อ.' + S.districtName(E.district) + ' · ' + S.roundText(rd));
    var tb = '<div class="toolbar">' +
      (S.user.role === 'super' ? '<label class="fld"><span>อำเภอ (Super Admin)</span><select id="eDist">' + S.districtOptions(E.district) + '</select></label>' : '') +
      '<label class="fld"><span>ครั้งที่รายงาน</span><select id="eRound">' + S.roundOptions(E.round, true) + '</select></label>' +
      '<div class="spacer"></div><div>' + (rec ? U.statusChip(rec.status) : U.statusChip('none')) + '</div></div>';
    var steps = '<div class="stepper">' + [['กรอกข้อมูล', 1], ['ตรวจสอบ', 2], ['ยืนยันและส่ง', 3]].map(function (s) {
      var cls = E.step === s[1] ? 'on' : E.step > s[1] ? 'done' : '';
      return '<button class="step ' + cls + '" data-step="' + s[1] + '"' + (s[1] === 3 || E.locked ? ' disabled' : '') + '><b>' + (E.step > s[1] ? '✓' : s[1]) + '</b><span>' + s[0] + '</span></button>';
    }).join('') + '</div>';
    view.innerHTML = tb + steps + '<div id="eNotes"></div><div id="eBody"></div>';
    notes();
    if (E.step === 1) form(); else if (E.step === 2) review(); else done();

    var dsel = U.$('eDist');
    if (dsel) dsel.onchange = function () { if (Pages.entry.leave()) App.go('entry', { d: dsel.value }); else dsel.value = E.district; };
    U.$('eRound').onchange = function (e) {
      if (!Pages.entry.leave()) { e.target.value = E.round; return; }
      E.dirty = false; App.go('entry', { d: S.user.role === 'super' ? E.district : undefined, r: e.target.value });
    };
    view.querySelector('.stepper').onclick = function (e) {
      var b = e.target.closest('.step'); if (!b || b.disabled) return;
      var s = Number(b.dataset.step);
      if (s === 2 && E.step === 1) { collect(); E.step = 2; draw(); }
      else if (s === 1) { E.step = 1; draw(); }
    };
  }

  function notes() {
    var n = [], rd = S.roundOf(E.round), rec = E.rec;
    var comp = AGCore.computeDistrict(AG_ITEMS, S.records, E.district, E.round, { includeCurrent: true });
    if (rec && rec.status === 'returned') n.push('<div class="notice err">' + U.icon('alert') + '<div><b>จังหวัดส่งกลับให้แก้ไข</b> — ' + U.esc(rec.meta.review_note || '') + '<br><span class="small">โดย ' + U.esc(rec.meta.reviewed_by) + ' ' + U.thDateTime(rec.meta.reviewed_at) + ' · แก้ไขแล้วกด "ยืนยันและส่งรายงาน" อีกครั้ง</span></div></div>');
    if (rd && !rd.open) n.push('<div class="notice warn">' + U.icon('lock') + '<div>ครั้งที่ ' + E.round + ' <b>ปิดรับรายงานแล้ว</b>' + (S.user.role === 'super' ? ' (Super Admin แก้ไขได้)' : ' — ดูข้อมูลได้อย่างเดียว หากต้องแก้ไขกรุณาติดต่อจังหวัด') + '</div></div>');
    if (rec && rec.status === 'accepted' && S.user.role !== 'super') n.push('<div class="notice ok">' + U.icon('checks') + '<div>จังหวัด<b>ตรวจรับรายงานแล้ว</b> เมื่อ ' + U.thDateTime(rec.meta.reviewed_at) + ' — ข้อมูลถูกล็อก</div></div>');
    if (comp.pendingRounds.length) n.push('<div class="notice warn">' + U.icon('alert') + '<div>ครั้งที่ ' + comp.pendingRounds.join(', ') + ' ยัง<b>ไม่ได้ส่ง</b> (ร่าง/ส่งกลับแก้ไข) ยอดของครั้งนั้นยังไม่นับรวมในยอดสะสม <a href="#entry?r=' + comp.pendingRounds[0] + '">ไปที่ครั้งที่ ' + comp.pendingRounds[0] + '</a></div></div>');
    if (E.round === 0 && E.step === 1) n.push('<div class="notice info">' + U.icon('info') + '<div><b>ยอดยกมา</b>: กรอกผลงานสะสมทั้งหมดก่อนการรายงานครั้งที่ 1 (ตั้งแต่ ต.ค. เป็นต้นมา) ยอดนี้เป็นฐานของยอดสะสม</div></div>');
    else if (rd && rd.due && !rec && E.step === 1 && !E.locked) n.push('<div class="notice info">' + U.icon('clock') + '<div>กำหนดส่งรายงานครั้งที่ ' + E.round + ' ภายในวันศุกร์ที่ ' + U.thLong(rd.due) + ' · ช่องที่ไม่มีผลงานเว้นว่างได้</div></div>');
    if (E.restore && E.step === 1) n.push('<div class="notice info" id="eRestore">' + U.icon('save') + '<div style="flex:1">พบข้อมูลที่กรอกค้างไว้ในเครื่องนี้ (' + U.thDateTime(E.restore.ts) + ')</div><button class="btn sm" id="eRestoreYes">กู้คืน</button><button class="btn sm ghost" id="eRestoreNo">ทิ้ง</button></div>');
    U.$('eNotes').innerHTML = n.join('');
    var y = U.$('eRestoreYes');
    if (y) {
      y.onclick = function () { E.F = E.restore.F; E.restore = null; E.dirty = true; draw(); U.toast('กู้คืนข้อมูลที่กรอกค้างไว้แล้ว'); };
      U.$('eRestoreNo').onclick = function () { U.store(draftKey(), null); E.restore = null; U.$('eRestore').remove(); };
    }
  }

  /* ───────── ขั้นที่ 1: แบบฟอร์ม ───────── */
  function form() {
    var body = U.$('eBody'), ro = E.locked;
    var comp = AGCore.computeDistrict(AG_ITEMS, S.records, E.district, E.round, { override: overrideRec() });
    var h = ['<div class="toolbar" style="margin-bottom:10px"><div class="seg" id="eFilter"><button data-f="all">ทั้งหมด</button><button data-f="agri">เฉพาะ 2.2 พื้นที่เกษตร</button><button data-f="filled">ที่กรอกแล้ว</button></div></div>',
      '<div class="form" id="eForm"><div class="fr head"><div>มาตรการ</div><div style="text-align:left">ผลการปฏิบัติงาน</div><div>รวม (ครั้งนี้)</div><div>หน่วยนับ</div><div>สะสมเดิม</div><div>สะสมรวม</div></div>'];
    AG_ITEMS.forEach(function (it) {
      var agri = it.code === AGRI_CODE ? ' agri' : '';
      if (it.type === 'header') {
        h.push('<div class="fr ' + (it.level === 0 ? 'sec' : 'grp') + agri + '" data-sec="' + it.section + '" data-code="' + it.code + '"><div class="lbl">' +
          (it.level ? '<span class="code">' + it.code + '</span>' : '') + U.pm(it.label) + (it.code === AGRI_CODE ? '<span class="tag">เศษวัสดุการเกษตร</span>' : '') + '</div></div>');
        return;
      }
      var c = E.F.values[it.id] || {}, x = comp.items[it.id];
      var yn = '<div><span class="mlabel">ผลการปฏิบัติงาน</span><div class="yn"><button type="button" data-v="Y" class="' + (c.h === 'Y' ? 'on' : '') + '">มี</button><button type="button" data-v="N" class="' + (c.h === 'N' ? 'on' : '') + '">ไม่มี</button></div></div>';
      var rest = '';
      if (it.type === 'num') {
        rest = '<div><span class="mlabel">รวม (ครั้งนี้)</span><input class="num" data-k="v" inputmode="decimal" value="' + U.esc(c.v === undefined ? '' : c.v) + '" placeholder="–" aria-label="จำนวนครั้งนี้"></div>' +
          '<div class="unit"><span class="mlabel">หน่วยนับ</span>' + U.esc(it.unit) + '</div>' +
          '<div class="cum prev"><span class="mlabel">สะสมเดิม</span>' + U.fmt(x.prevCum) + '</div>' +
          '<div class="cum new"><span class="mlabel">สะสมรวม</span><span class="cv"></span></div>';
      } else if (it.type === 'other') {
        rest = '<div class="other-grid" style="grid-column:3 / -1;grid-template-columns:minmax(0,1fr)"></div>';
        h.push('<div class="fr l' + it.level + agri + (ro ? ' locked' : '') + '" data-id="' + it.id + '" data-sec="' + it.section + '" data-code="' + it.code + '">' +
          '<div class="lbl">' + U.esc(it.label) + ' <span class="muted small">(ถ้ามี)</span></div>' + yn +
          '<div><span class="mlabel">รวม (ครั้งนี้)</span><input class="num" data-k="v" inputmode="decimal" value="' + U.esc(c.v === undefined ? '' : c.v) + '" placeholder="–"></div>' +
          '<div><span class="mlabel">หน่วยนับ</span><input class="sm" data-k="u" list="unitList" value="' + U.esc(c.u || x.unit || '') + '" placeholder="หน่วย"></div>' +
          '<div class="cum prev"><span class="mlabel">สะสมเดิม</span>' + U.fmt(x.prevCum) + '</div>' +
          '<div class="cum new"><span class="mlabel">สะสมรวม</span><span class="cv"></span></div>' +
          '<div style="grid-column:1 / -1"><input class="sm" data-k="t" value="' + U.esc(c.t || '') + '" placeholder="โปรดระบุการดำเนินการ เช่น อัดฟาง ทำปุ๋ยหมัก ผลิตถ่านชีวมวล" ' + (x.texts.length ? 'list="ot' + it.id + '"' : '') + '>' +
          (x.texts.length ? '<datalist id="ot' + it.id + '">' + x.texts.map(function (t) { return '<option value="' + U.esc(t) + '">'; }).join('') + '</datalist>' : '') + '</div></div>');
        return;
      } else {
        rest = '<div style="grid-column:3 / -1" class="small muted">' + (x.everHas ? 'เคยรายงานว่า "มี" แล้ว' : '') + '</div>';
      }
      h.push('<div class="fr l' + it.level + agri + (ro ? ' locked' : '') + '" data-id="' + it.id + '" data-sec="' + it.section + '" data-code="' + it.code + '">' +
        '<div class="lbl">' + (it.level === 1 ? '<span class="code">' + it.code + '</span>' : '') + U.pm(it.label) + '</div>' + yn + rest + '</div>');
    });
    h.push('</div><datalist id="unitList">' + UNITS.map(function (u) { return '<option value="' + u + '">'; }).join('') + '</datalist>');

    // ข้อ 4
    h.push('<div class="card"><div class="card-h"><h2>4. การดำเนินการอื่น ๆ ที่เกี่ยวข้อง (ถ้ามี)</h2>' + (ro ? '' : '<button class="btn sm" id="e4Add">' + U.icon('plus') + 'เพิ่มกิจกรรม</button>') +
      '<p>กิจกรรมจะถูกยกไปครั้งถัดไปให้อัตโนมัติเพื่อนับยอดสะสม</p></div><div id="e4"></div></div>');
    h.push('<div class="card"><div class="card-h"><h2>5. ปัญหาอุปสรรค หรือข้อเสนอแนะ ในการดำเนินงาน (ถ้ามี)</h2></div><div class="card-b"><textarea id="e5" rows="3"' + (ro ? ' readonly' : '') + '>' + U.esc(E.F.sec5) + '</textarea></div></div>');
    h.push('<div class="card"><div class="card-h"><h2>ผู้รายงานข้อมูล</h2></div><div class="card-b grid3">' +
      '<label class="fld"><span>ชื่อ - สกุล</span><input id="eRep" value="' + U.esc(E.F.meta.reporter) + '"' + (ro ? ' readonly' : '') + '></label>' +
      '<label class="fld"><span>ตำแหน่ง</span><input id="ePos" value="' + U.esc(E.F.meta.position) + '"' + (ro ? ' readonly' : '') + '></label>' +
      '<label class="fld"><span>โทรศัพท์</span><input id="ePhone" inputmode="tel" value="' + U.esc(E.F.meta.phone) + '"' + (ro ? ' readonly' : '') + '></label></div></div>');
    h.push('<div class="savebar"><div class="savebar-info" id="eInfo"></div>' + (ro ? '' :
      '<button class="btn" id="eDraft">' + U.icon('save') + 'บันทึกร่าง</button><button class="btn primary" id="eNext">ตรวจสอบก่อนส่ง' + U.icon('arrowR') + '</button>') + '</div>');
    body.innerHTML = h.join('');
    sec4();
    body.querySelectorAll('.fr[data-id]').forEach(function (r) { updateCum(r, comp); });
    info();
    U.$('eFilter').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.f === E.filter); });
    applyFilter();

    U.$('eFilter').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; E.filter = b.dataset.f; this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); applyFilter(); };
    if (ro) return;
    var f = U.$('eForm');
    f.addEventListener('click', function (e) {
      var b = e.target.closest('.yn button'); if (!b) return;
      var row = b.closest('.fr'), on = b.classList.contains('on');
      row.querySelectorAll('.yn button').forEach(function (x) { x.classList.remove('on'); });
      if (!on) b.classList.add('on');
      changed(row);
    });
    f.addEventListener('input', function (e) {
      var row = e.target.closest('.fr'); if (!row) return;
      if (e.target.dataset.k === 'v') {
        var v = AGCore.num(e.target.value);
        e.target.style.borderColor = e.target.value.trim() && (v === null || v < 0) ? 'var(--danger)' : '';
        if (v !== null && v > 0) { var n = row.querySelector('.yn [data-v=N]'), y = row.querySelector('.yn [data-v=Y]'); n.classList.remove('on'); y.classList.add('on'); }
      }
      changed(row);
    });
    ['e5', 'eRep', 'ePos', 'ePhone'].forEach(function (id) { U.$(id).addEventListener('input', function () { touch(); }); });
    U.$('e4Add').onclick = function () { collect(); E.F.sec4.push({ id: 'a' + Date.now().toString(36), t: '', h: '', v: '', u: '' }); sec4(); touch(); var ts = U.$('e4').querySelectorAll('textarea'); ts[ts.length - 1].focus(); };
    U.$('eDraft').onclick = function () { save('draft'); };
    U.$('eNext').onclick = function () { collect(); var bad = validate(); if (bad) { U.toast(bad, 'err'); return; } E.step = 2; draw(); window.scrollTo(0, 0); };
  }

  function sec4() {
    var el = U.$('e4'), ro = E.locked;
    var comp = AGCore.computeDistrict(AG_ITEMS, S.records, E.district, E.round, { override: overrideRec() });
    var cum = {}; comp.sec4.forEach(function (a) { cum[a.id] = a; });
    if (!E.F.sec4.length) { el.innerHTML = '<div class="empty small" style="padding:18px">ไม่มีกิจกรรมอื่น' + (ro ? '' : ' — กด "เพิ่มกิจกรรม" หากมี') + '</div>'; return; }
    el.innerHTML = E.F.sec4.map(function (a, i) {
      var c = cum[a.id] || {};
      return '<div class="sec4-row" data-i="' + i + '"><div><textarea data-k="t" rows="2" placeholder="ชื่อโครงการ/กิจกรรม สถานที่ วันที่"' + (ro ? ' readonly' : '') + '>' + U.esc(a.t) + '</textarea></div>' +
        '<div><span class="mlabel">ผลการปฏิบัติงาน</span><div class="yn"><button type="button" data-v="Y" class="' + (a.h === 'Y' ? 'on' : '') + '">มี</button><button type="button" data-v="N" class="' + (a.h === 'N' ? 'on' : '') + '">ไม่มี</button></div></div>' +
        '<div><span class="mlabel">รวม (ครั้งนี้)</span><input class="num" data-k="v" inputmode="decimal" value="' + U.esc(a.v) + '" placeholder="–"' + (ro ? ' readonly' : '') + '></div>' +
        '<div><span class="mlabel">หน่วยนับ</span><input class="sm" data-k="u" list="unitList" value="' + U.esc(a.u) + '" placeholder="หน่วย"' + (ro ? ' readonly' : '') + '></div>' +
        '<div class="cum prev" style="text-align:right"><span class="mlabel">สะสมเดิม</span>' + U.fmt(c.prevCum) + '</div>' +
        '<div class="cum new" style="text-align:right;font-weight:600"><span class="mlabel">สะสมรวม</span>' + U.fmt(c.cum) + '</div>' +
        '<div>' + (ro ? '' : '<button class="icon-btn" data-del title="ลบแถว" aria-label="ลบแถว">' + U.icon('trash') + '</button>') + '</div></div>';
    }).join('');
    if (ro) return;
    el.oninput = U.debounce(function () { collect(); touch(); sec4Cums(); }, 200);
    el.onclick = function (e) {
      var row = e.target.closest('.sec4-row'); if (!row) return;
      var i = Number(row.dataset.i);
      if (e.target.closest('[data-del]')) { collect(); E.F.sec4.splice(i, 1); sec4(); touch(); return; }
      var b = e.target.closest('.yn button');
      if (b) { collect(); var a = E.F.sec4[i]; a.h = a.h === b.dataset.v ? '' : b.dataset.v; sec4(); touch(); }
    };
  }

  function sec4Cums() {
    var comp = AGCore.computeDistrict(AG_ITEMS, S.records, E.district, E.round, { override: overrideRec() });
    var cum = {}; comp.sec4.forEach(function (a) { cum[a.id] = a; });
    U.$('e4').querySelectorAll('.sec4-row').forEach(function (r) {
      var a = E.F.sec4[Number(r.dataset.i)], c = (a && cum[a.id]) || {};
      r.querySelector('.cum.new').innerHTML = '<span class="mlabel">สะสมรวม</span>' + U.fmt(c.cum);
    });
  }
  function overrideRec() { return { round: E.round, district: E.district, status: 'draft', values: E.F.values, sec4: E.F.sec4, sec5: E.F.sec5, meta: {} }; }

  function updateCum(row, comp) {
    var it = itemOf(row.dataset.id); if (!it || (it.type !== 'num' && it.type !== 'other')) return;
    var x = comp.items[it.id], inp = row.querySelector('input[data-k=v]'), v = AGCore.num(inp.value);
    var nv = it.agg === 'latest' ? (v !== null ? v : x.prevCum) : (v === null && x.prevCum === null ? null : (x.prevCum || 0) + (v || 0));
    var cv = row.querySelector('.cv');
    cv.textContent = U.fmt(nv === null ? null : Math.round(nv * 100) / 100);
    cv.parentNode.classList.toggle('up', v !== null && v > 0);
  }
  function changed(row) {
    row.classList.add('changed');
    collectRow(row);
    var comp = AGCore.computeDistrict(AG_ITEMS, S.records, E.district, E.round, { override: overrideRec() });
    updateCum(row, comp);
    touch();
  }
  var autosave = U.debounce(function () { U.store(draftKey(), JSON.stringify({ ts: (function () { var d = new Date(Date.now() + 7 * 3600e3); return d.toISOString().slice(0, 19).replace('T', ' '); })(), F: E.F })); }, 600);
  function touch() { E.dirty = true; info(); collectMeta(); autosave(); }
  function info() {
    var el = U.$('eInfo'); if (!el) return;
    var n = Object.keys(E.F.values).length;
    el.innerHTML = E.locked ? U.icon('lock') + ' ดูข้อมูลได้อย่างเดียว' :
      (E.dirty ? '<b>●</b> มีการแก้ไขที่ยังไม่บันทึก · ' : (E.rec ? 'บันทึกล่าสุด ' + U.thDateTime(E.rec.meta.updated_at) + ' · ' : 'ยังไม่ได้บันทึก · ')) + 'กรอกแล้ว ' + n + ' รายการ';
  }
  function collectRow(row) {
    var id = row.dataset.id, on = row.querySelector('.yn button.on');
    var c = { h: on ? on.dataset.v : '', v: '', t: '', u: '' };
    row.querySelectorAll('input[data-k]').forEach(function (i) { c[i.dataset.k] = i.value.trim(); });
    if (c.h || c.v || c.t) E.F.values[id] = c; else delete E.F.values[id];
  }
  function collectMeta() {
    if (U.$('e5')) E.F.sec5 = U.$('e5').value;
    if (U.$('eRep')) E.F.meta = Object.assign(E.F.meta, { reporter: U.$('eRep').value.trim(), position: U.$('ePos').value.trim(), phone: U.$('ePhone').value.trim() });
  }
  function collect() {
    if (E.step !== 1 || !U.$('eForm')) return;
    U.$('eForm').querySelectorAll('.fr[data-id]').forEach(collectRow);
    var rows = U.$('e4') ? U.$('e4').querySelectorAll('.sec4-row') : [];
    rows.forEach(function (r) {
      var a = E.F.sec4[Number(r.dataset.i)]; if (!a) return;
      r.querySelectorAll('[data-k]').forEach(function (i) { a[i.dataset.k] = i.value.trim(); });
    });
    collectMeta();
  }
  function applyFilter() {
    var f = E.filter;
    U.$('eForm').querySelectorAll('.fr:not(.head)').forEach(function (row) {
      var show = true;
      if (f === 'agri') show = row.dataset.code === AGRI_CODE || (row.classList.contains('sec') && row.dataset.sec === '2');
      if (f === 'filled') show = !!row.dataset.id && !!E.F.values[row.dataset.id];
      row.hidden = !show;
    });
  }
  function validate() {
    for (var id in E.F.values) {
      var c = E.F.values[id], it = itemOf(id);
      if (c.v !== '' && c.v !== undefined && (AGCore.num(c.v) === null || AGCore.num(c.v) < 0)) return 'ตัวเลขไม่ถูกต้อง: ข้อ ' + it.code + ' ' + it.label.slice(0, 40);
    }
    for (var i = 0; i < E.F.sec4.length; i++) {
      var a = E.F.sec4[i];
      if (a.v !== '' && (AGCore.num(a.v) === null || AGCore.num(a.v) < 0)) return 'ตัวเลขไม่ถูกต้อง ในข้อ 4 แถวที่ ' + (i + 1);
    }
    return '';
  }

  /* ───────── ขั้นที่ 2: ตรวจสอบ ───────── */
  function review() {
    var body = U.$('eBody');
    var comp = AGCore.computeDistrict(AG_ITEMS, S.records, E.district, E.round, { override: overrideRec() });
    var rows = [], warns = [];
    // ค่าเฉลี่ยรายสัปดาห์ของครั้งก่อน ๆ
    var hist = S.records.filter(function (r) { return r.district === E.district && r.round > 0 && r.round < E.round && AGCore.isCounted(r); });
    AG_ITEMS.forEach(function (it) {
      if (it.type === 'header') return;
      var c = E.F.values[it.id]; if (!c) return;
      var x = comp.items[it.id], v = AGCore.num(c.v);
      var val = it.type === 'check' ? (c.h === 'Y' ? '<span class="yes">มี</span>' : '<span class="no">ไม่มี</span>') :
        v !== null ? U.fmt(v) + ' <span class="muted small">' + U.esc(x.unit || it.unit) + '</span>' : (c.h === 'Y' ? '<span class="yes">มี</span>' : c.h === 'N' ? '<span class="no">ไม่มี</span>' : '');
      rows.push('<div class="review-item"><div><span class="code">' + it.code + '</span>' + U.pm(it.label) + (c.t ? '<div class="small muted">ระบุ: ' + U.esc(c.t) + '</div>' : '') + '</div><div class="v">' + val + '</div>' +
        '<div class="c">' + (it.type === 'num' || it.type === 'other' ? 'สะสม ' + U.fmt(x.cum) : '') + '</div></div>');
      if (it.type === 'num' && c.h === 'Y' && v === null) warns.push('ข้อ ' + it.code + ' "' + it.label.slice(0, 50) + '" เลือก "มี" แต่ยังไม่ได้กรอกจำนวน');
      if (it.type === 'other' && v !== null && !c.t) warns.push('ข้อ ' + it.code + ' "การดำเนินการอื่น ๆ" กรอกจำนวนแต่ยังไม่ระบุว่าทำอะไร');
      if (it.type === 'other' && v !== null && !c.u) warns.push('ข้อ ' + it.code + ' "การดำเนินการอื่น ๆ" ยังไม่ระบุหน่วยนับ');
      if (v !== null && hist.length >= 2 && it.agg === 'sum') {
        var vals = hist.map(function (r) { return r.values[it.id] ? AGCore.num(r.values[it.id].v) || 0 : 0; });
        var avg = vals.reduce(function (a, b) { return a + b; }, 0) / hist.length;
        if (avg > 0 && v >= 20 && v > avg * 5) warns.push('ข้อ ' + it.code + ' "' + it.label.slice(0, 40) + '" = ' + U.fmt(v) + ' สูงกว่าค่าเฉลี่ยรายสัปดาห์ (' + U.fmt(Math.round(avg * 10) / 10) + ') มากกว่า 5 เท่า — โปรดตรวจสอบ');
      }
    });
    E.F.sec4.forEach(function (a, i) {
      if (!a.t && a.v === '') return;
      var c = comp.sec4.filter(function (x) { return x.id === a.id; })[0] || {};
      rows.push('<div class="review-item"><div><span class="code">4.' + (i + 1) + '</span>' + U.esc(a.t || '(ไม่ระบุชื่อกิจกรรม)') + '</div><div class="v">' + (a.v !== '' ? U.fmt(a.v) + ' <span class="muted small">' + U.esc(a.u) + '</span>' : (a.h === 'Y' ? '<span class="yes">มี</span>' : '–')) + '</div><div class="c">สะสม ' + U.fmt(c.cum) + '</div></div>');
      if (!a.t) warns.push('ข้อ 4 แถวที่ ' + (i + 1) + ' ยังไม่ได้ระบุชื่อกิจกรรม');
    });
    if (E.F.sec5) rows.push('<div class="review-item"><div><span class="code">5.</span>ปัญหาอุปสรรค/ข้อเสนอแนะ<div class="small">' + U.esc(E.F.sec5) + '</div></div><div></div><div></div></div>');
    if (!comp.pendingRounds.length && !rows.length) warns.push('ไม่มีผลงานในสัปดาห์นี้ — เมื่อส่ง ระบบจะบันทึกว่า "ส่งรายงานแล้ว ไม่มีผลงานเพิ่ม" และยกยอดสะสมเดิมไปครั้งถัดไป');
    if (!E.F.meta.reporter) warns.push('ยังไม่ได้ระบุชื่อผู้รายงานข้อมูล');

    var agri = ['R29', 'R30', 'R31'].map(function (id) {
      var it = itemOf(id), x = comp.items[id];
      return '<div class="kpi"><div class="kpi-ic y">' + U.icon(id === 'R31' ? 'tractor' : id === 'R29' ? 'megaphone' : 'recycle') + '</div><div><div class="k">' + U.esc(it.label.slice(0, 46)) + '…</div><div class="v">' + U.fmt(x.cum, '0') + '<small>' + U.esc(it.unit) + '</small></div>' +
        '<div class="d' + (x.week.v ? '' : ' zero') + '">' + (x.week.v ? '+' + U.fmt(x.week.v) + ' ในครั้งนี้' : 'ไม่มีผลงานเพิ่ม') + '</div></div></div>';
    }).join('');
    body.innerHTML = '<div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">' + agri + '</div>' +
      (warns.length ? '<div class="notice warn">' + U.icon('alert') + '<div><b>โปรดตรวจสอบ ' + warns.length + ' รายการ</b><ul class="warn-list" style="margin:6px 0 0;padding-left:18px">' + warns.map(function (w) { return '<li>' + U.esc(w) + '</li>'; }).join('') + '</ul></div></div>' :
        '<div class="notice ok">' + U.icon('check') + '<div>ไม่พบรายการที่ต้องตรวจสอบเพิ่มเติม</div></div>') +
      '<div class="card"><div class="card-h"><h2>สรุปผลงานที่จะส่ง (' + rows.length + ' รายการ)</h2><p>อ.' + U.esc(S.districtName(E.district)) + ' · ' + U.esc(S.roundText(S.roundOf(E.round))) + ' · ผู้รายงาน ' + U.esc(E.F.meta.reporter) + '</p></div>' +
      '<div class="card-b"><div class="review-list">' + (rows.join('') || '<div class="empty">ไม่มีผลงานในสัปดาห์นี้</div>') + '</div></div></div>' +
      '<div class="savebar"><label class="switch savebar-info"><input type="checkbox" id="eOk"> ข้าพเจ้าตรวจสอบข้อมูลแล้ว ถูกต้องครบถ้วน</label>' +
      '<button class="btn" id="eBack">' + U.icon('arrowL') + 'กลับไปแก้ไข</button><button class="btn" id="eDraft2">' + U.icon('save') + 'บันทึกร่าง</button>' +
      '<button class="btn primary" id="eSend" disabled>' + U.icon('send') + 'ยืนยันและส่งรายงาน</button></div>';
    U.$('eOk').onchange = function (e) { U.$('eSend').disabled = !e.target.checked; };
    U.$('eBack').onclick = function () { E.step = 1; draw(); };
    U.$('eDraft2').onclick = function () { save('draft'); };
    U.$('eSend').onclick = function () { save('submit'); };
  }

  function save(mode) {
    collect();
    var bad = validate(); if (bad) { U.toast(bad, 'err'); return; }
    var btns = document.querySelectorAll('.savebar .btn'); btns.forEach(function (b) { b.disabled = true; });
    var wasSubmitted = E.rec && E.rec.status === 'submitted';
    var go = mode === 'draft' && wasSubmitted ? U.confirm('บันทึกเป็นร่าง', 'รายงานนี้ส่งแล้ว การบันทึกเป็นร่างจะ<b>ถอนรายงาน</b>ออกจากยอดรวมจังหวัดจนกว่าจะกดส่งอีกครั้ง ต้องการดำเนินการต่อหรือไม่?', 'บันทึกเป็นร่าง', 'warn') : Promise.resolve(true);
    go.then(function (ok) {
      if (!ok) return null;
      return S.call('data.save', { round: E.round, district: E.district, mode: mode, values: E.F.values, sec4: E.F.sec4, sec5: E.F.sec5, meta: E.F.meta }).then(function () {
        U.store(draftKey(), null);
        E.dirty = false;
        U.toast(mode === 'submit' ? 'ส่งรายงานเรียบร้อย ขอบคุณครับ/ค่ะ' : 'บันทึกร่างแล้ว (ยังไม่นับรวมในยอดจังหวัด)', 'ok');
        return S.loadRecords(true).then(function () { load(); });
      });
    }).catch(function (e) { U.toast(e.message, 'err'); })
      .then(function () { document.querySelectorAll('.savebar .btn').forEach(function (b) { b.disabled = false; }); if (U.$('eSend')) U.$('eSend').disabled = !U.$('eOk').checked; });
  }

  /* ───────── ขั้นที่ 3: ส่งแล้ว ───────── */
  function done() {
    var body = U.$('eBody'), rec = E.rec, rd = S.roundOf(E.round);
    var comp = AGCore.computeDistrict(AG_ITEMS, S.records, E.district, E.round);
    var late = rd && rd.due && rec.meta.submitted_at && rec.meta.submitted_at.slice(0, 10) > rd.due;
    var n = Object.keys(rec.values).length + (rec.sec4 || []).length;
    var canWithdraw = rec.status === 'submitted' && rd && (rd.open || S.user.role === 'super');
    var canEdit = !E.locked;
    var agri = ['R29', 'R30', 'R31', 'R32'].map(function (id) {
      var it = itemOf(id), x = comp.items[id];
      return '<div class="kpi"><div class="kpi-ic">' + U.icon(id === 'R31' ? 'tractor' : id === 'R29' ? 'megaphone' : id === 'R30' ? 'recycle' : 'straw') + '</div><div><div class="k">' + U.esc(it.label.slice(0, 40)) + '…</div><div class="v">' + U.fmt(x.cum, '0') + '<small>' + U.esc(x.unit || it.unit) + '</small></div>' +
        '<div class="d' + (x.week.v ? '' : ' zero') + '">' + (x.week.v ? '+' + U.fmt(x.week.v) + ' ในครั้งนี้' : 'ไม่มีผลงานเพิ่ม') + '</div></div></div>';
    }).join('');
    body.innerHTML = '<div class="card"><div class="card-b" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">' +
      '<div class="kpi-ic" style="width:54px;height:54px;border-radius:14px">' + U.icon(rec.status === 'accepted' ? 'checks' : 'check') + '</div>' +
      '<div style="flex:1;min-width:220px"><h2 style="font-size:19px">' + (rec.status === 'accepted' ? 'จังหวัดตรวจรับรายงานแล้ว' : 'ส่งรายงานเรียบร้อยแล้ว') + '</h2>' +
      '<div class="muted small">ส่งเมื่อ ' + U.thDateTime(rec.meta.submitted_at) + ' โดย ' + U.esc(rec.meta.submitted_by) + ' · ' + n + ' รายการ ' + (late ? '<span class="chip st-late">ส่งหลังกำหนด</span>' : '') + '</div></div>' +
      '<div class="row">' + (canEdit ? '<button class="btn" id="eEdit">' + U.icon('edit') + 'แก้ไขรายงาน</button>' : '') +
      (canWithdraw ? '<button class="btn warn" id="eWithdraw">' + U.icon('undo') + 'ถอนเพื่อแก้ไข</button>' : '') +
      '<button class="btn primary" id="ePrint">' + U.icon('print') + 'พิมพ์รายงาน</button></div></div></div>' +
      '<div class="kpis">' + agri + '</div>' +
      '<div class="notice info">' + U.icon('info') + '<div>แก้ไขได้จนกว่ารอบรายงานจะปิดหรือจังหวัดตรวจรับ — กด "แก้ไขรายงาน" แล้วส่งใหม่ ระบบจะแทนที่ข้อมูลเดิมของครั้งนี้ (ยอดสะสมไม่ซ้ำ)</div></div>';
    var ed = U.$('eEdit'); if (ed) ed.onclick = function () { E.step = 1; draw(); };
    var wd = U.$('eWithdraw');
    if (wd) wd.onclick = function () {
      U.confirm('ถอนรายงานเพื่อแก้ไข', 'รายงานจะกลับเป็น<b>ฉบับร่าง</b> และไม่นับรวมในยอดจังหวัดจนกว่าจะส่งอีกครั้ง', 'ถอนรายงาน', 'warn').then(function (ok) {
        if (!ok) return;
        S.call('data.withdraw', { round: E.round, district: E.district }).then(function () { U.toast('ถอนรายงานแล้ว แก้ไขแล้วส่งใหม่ได้'); return S.loadRecords(true); }).then(function () { load(); E.step = 1; draw(); })
          .catch(function (e) { U.toast(e.message, 'err'); });
      });
    };
    U.$('ePrint').onclick = function () { App.go('print', { scope: E.district, r: E.round }); };
  }

  window.addEventListener('beforeunload', function (e) { if (E && E.dirty) { e.preventDefault(); e.returnValue = ''; } });
})();
