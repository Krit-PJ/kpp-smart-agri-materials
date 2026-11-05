/* แบบฟอร์มรายงาน — Super Admin เพิ่ม/แก้ไข/ลบ/ยกเลิกใช้ ข้อคำถามในหัวข้อ "มาตรการ" */
(function () {
  var UNITS = ['ไร่', 'ครั้ง', 'แห่ง', 'ราย', 'ตัน', 'กิโลกรัม', 'หมู่บ้าน/ชุมชน', 'คน', 'กิโลเมตร', 'ชิ้น', 'ฉบับ', 'คัน', 'จุด', 'ศูนย์', 'แปลง'];
  var KIND = {
    num: 'มี/ไม่มี + จำนวน (หน่วยคงที่)', check: 'มี/ไม่มี อย่างเดียว', other: 'อื่น ๆ โปรดระบุ (ข้อความ + จำนวน + หน่วยกรอกเอง)',
    band: 'หัวข้อย่อย (แถบสี ไม่มีช่องกรอก)', gray: 'หัวข้อ มี/ไม่มี (ช่องสีเทา ไม่มีช่องกรอก)'
  };
  var W = null; // { orig, items, usage, core, custom, dirty }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function kindOf(it) { return it.type === 'header' ? (it.print === 'gray' ? 'gray' : 'band') : it.type; }
  function isSec(it) { return it.print === 'section' || (it.type === 'header' && it.level === 0); }
  function used(it) { return it.id ? W.usage[it.id] || 0 : 0; }
  function core(it) { return it.id && W.core.indexOf(it.id) >= 0; }
  function locked(it) { return !!(used(it) || core(it)); }
  function origOf(it) { return it.id ? W.orig.filter(function (o) { return o.id === it.id; })[0] : null; }
  function changed(it) {
    var o = origOf(it); if (!o) return true;
    return ['label', 'code', 'unit', 'type', 'agg', 'level', 'print'].some(function (k) { return String(o[k]) !== String(it[k]); }) || !!o.retired !== !!it.retired;
  }

  Pages.form = {
    title: 'แบบฟอร์มรายงาน', sub: 'เพิ่ม แก้ไข ลบ ข้อคำถามในหัวข้อ "มาตรการ" (Super Admin)',
    leave: function () { return !(W && W.dirty) || window.confirm('มีการแก้ไขแบบฟอร์มที่ยังไม่บันทึก ต้องการออกจากหน้านี้หรือไม่?'); },
    render: function (view) { return S.call('admin.items.get').then(function (r) { load(r); draw(view); }); }
  };
  function load(r) { W = { orig: clone(r.items), items: clone(r.items), usage: r.usage || {}, core: r.core || [], custom: r.custom, dirty: false }; }

  function draw(view) {
    view = view || U.$('view');
    var nQ = W.items.filter(function (i) { return i.type !== 'header' && !i.retired; }).length;
    var nR = W.items.filter(function (i) { return i.retired; }).length;
    var nNew = W.items.filter(function (i) { return !i.id; }).length;
    var del = W.orig.filter(function (o) { return !W.items.some(function (i) { return i.id === o.id; }); }).length;
    var nCh = W.items.filter(function (i) { return i.id && changed(i); }).length + nNew + del;
    App.setHeader('แบบฟอร์มรายงาน', (W.custom ? 'แก้ไขจากแบบฟอร์มต้นฉบับแล้ว' : 'ใช้แบบฟอร์มต้นฉบับ (แบบ ปภ.)') + ' · ข้อคำถามที่ใช้งาน ' + nQ + ' ข้อ' + (nR ? ' · ยกเลิกใช้ ' + nR + ' ข้อ' : ''));
    var a = App.actions('<a class="btn" href="#print?scope=province">' + U.icon('print') + 'ดูแบบพิมพ์</a>' +
      (W.custom ? '<button class="btn" id="fReset">' + U.icon('undo') + 'คืนค่าแบบฟอร์มต้นฉบับ</button>' : ''));
    var rb = a.querySelector('#fReset'); if (rb) rb.onclick = reset;
    var h = ['<div class="notice info">' + U.icon('info') + '<div><b>กติกาเพื่อให้ยอดสะสมถูกต้อง</b><ul style="margin:4px 0 0;padding-left:18px">' +
      '<li>ข้อที่<b>มีข้อมูลแล้ว</b> ลบไม่ได้ ใช้ "ยกเลิกใช้" แทน — ข้อนั้นจะหายจากแบบกรอก แต่ตัวเลขเดิมยังนับในยอดสะสมและแสดงในรายงาน</li>' +
      '<li>ข้อที่มีข้อมูลแล้ว แก้ถ้อยคำและเลขข้อได้ แต่<b>เปลี่ยนรูปแบบคำตอบ/หน่วยนับ/วิธีนับไม่ได้</b> (ถ้าต้องการหน่วยใหม่ ให้เพิ่มเป็นข้อใหม่)</li>' +
      '<li>หัวข้อหลัก 1–3 และตัวชี้วัดหลักข้อ 2.2 (ใช้ในแผนที่/KPI/API) แก้ถ้อยคำได้อย่างเดียว · ข้อ 4 และ 5 เป็นส่วนคงที่ของแบบรายงาน</li>' +
      '<li>การเปลี่ยนแปลงมีผลกับทุกอำเภอทันทีหลังบันทึก และบันทึกไว้ในบันทึกการเข้าใช้งาน · แบบพิมพ์/Excel ตรงแบบ ปภ. 100% เมื่อใช้แบบฟอร์มต้นฉบับ</li></ul></div></div>',
      '<div class="card"><div class="card-h"><h2>ข้อคำถาม (มาตรการ)</h2><p>จัดลำดับด้วยปุ่มลูกศรขึ้น/ลง · ปุ่ม + เพิ่มข้อถัดจากแถวนั้น · ปุ่มรูปตา = ยกเลิกใช้ (ข้อที่มีข้อมูล)</p></div><div class="fe-list" id="feList">'];
    W.items.forEach(function (it, i) { h.push(row(it, i)); });
    h.push('</div></div>');
    h.push('<div class="savebar"><div class="savebar-info">' + (nCh ? '<b>●</b> แก้ไข ' + nCh + ' รายการ ยังไม่บันทึก' : 'ไม่มีการแก้ไขที่ยังไม่บันทึก') + '</div>' +
      '<button class="btn ghost" id="fCancel"' + (nCh ? '' : ' disabled') + '>ยกเลิกการแก้ไข</button><button class="btn primary" id="fSave"' + (nCh ? '' : ' disabled') + '>' + U.icon('save') + 'บันทึกแบบฟอร์ม</button></div>');
    view.innerHTML = h.join('');
    U.$('feList').onclick = onClick;
    U.$('fSave').onclick = save;
    U.$('fCancel').onclick = function () { W.items = clone(W.orig); W.dirty = false; draw(); };
  }

  function row(it, i) {
    var sec = isSec(it), hd = it.type === 'header' && !sec, n = used(it), k = kindOf(it);
    var meta = [];
    if (!sec) meta.push('<span class="chip">' + U.esc(hd ? (k === 'gray' ? 'หัวข้อ มี/ไม่มี' : 'หัวข้อย่อย') : k === 'num' ? 'จำนวน · ' + (it.unit || '?') : k === 'check' ? 'มี/ไม่มี' : 'อื่น ๆ โปรดระบุ') + '</span>');
    if (it.agg === 'latest' && it.type === 'num') meta.push('<span class="chip">ใช้ค่าล่าสุด</span>');
    if (core(it)) meta.push('<span class="chip st-submitted">' + (it.type === 'header' ? 'หัวข้อหลักของระบบ' : 'ตัวชี้วัดหลัก') + '</span>');
    if (it.retired) meta.push('<span class="chip st-returned">ยกเลิกใช้</span>');
    if (!it.id) meta.push('<span class="chip st-accepted">ข้อใหม่</span>');
    var cls = 'fe-row' + (sec ? ' sec' : hd ? ' hd' : '') + (it.level === 2 ? ' l2' : '') + (it.retired ? ' retired' : '') + (!it.id ? ' new' : changed(it) ? ' changed' : '');
    var up = !sec && i > 1, down = !sec && i < W.items.length - 1;
    var act = '<div class="fe-act">' +
      '<button class="icon-btn" data-a="up" title="เลื่อนขึ้น" aria-label="เลื่อนขึ้น"' + (up ? '' : ' disabled') + '>' + U.icon('up') + '</button>' +
      '<button class="icon-btn" data-a="down" title="เลื่อนลง" aria-label="เลื่อนลง"' + (down ? '' : ' disabled') + '>' + U.icon('down') + '</button>' +
      '<button class="icon-btn" data-a="edit" title="แก้ไข" aria-label="แก้ไข">' + U.icon('edit') + '</button>' +
      '<button class="icon-btn" data-a="add" title="เพิ่มข้อถัดจากแถวนี้" aria-label="เพิ่มข้อ">' + U.icon('plus') + '</button>' +
      (sec || core(it) ? '<span style="width:34px"></span>' : n ? '<button class="icon-btn" data-a="retire" title="' + (it.retired ? 'นำกลับมาใช้' : 'ยกเลิกใช้ (คงตัวเลขเดิม)') + '" aria-label="ยกเลิกใช้">' + U.icon(it.retired ? 'undo' : 'eye') + '</button>' :
        '<button class="icon-btn" data-a="del" title="ลบ" aria-label="ลบ" style="color:var(--danger)">' + U.icon('trash') + '</button>') + '</div>';
    return '<div class="' + cls + '" data-i="' + i + '"><div class="fe-code">' + U.esc(sec ? '' : it.code) + '</div>' +
      '<div class="fe-lbl">' + U.pm(it.label) + (meta.length ? '<div class="fe-meta">' + meta.join('') + '</div>' : '') + '</div>' +
      '<div class="fe-use">' + (n ? 'มีข้อมูล ' + n + ' รายงาน' : it.type === 'header' ? '' : 'ยังไม่มีข้อมูล') + '</div>' + act + '</div>';
  }

  function touch() { W.dirty = true; draw(); }
  function onClick(e) {
    var b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    var i = Number(b.closest('.fe-row').dataset.i), it = W.items[i], a = b.dataset.a;
    if (a === 'up' || a === 'down') {
      var j = a === 'up' ? i - 1 : i + 1;
      if (j < 1 || j >= W.items.length) return;
      var t = W.items[j]; W.items[j] = it; W.items[i] = t; touch();
      var el = document.querySelector('.fe-row[data-i="' + j + '"]'); if (el) el.scrollIntoView({ block: 'nearest' });
    } else if (a === 'edit') edit(i);
    else if (a === 'add') {
      var base = isSec(it) ? (W.items[i + 1] || it) : it;
      edit(i + 1, { id: '', code: isSec(it) ? '' : it.code, label: '', type: 'num', unit: '', agg: 'sum', level: it.type === 'header' ? 2 : it.level || 2, print: '', retired: false, _new: true, _from: base.code });
    } else if (a === 'retire') { it.retired = !it.retired; touch(); }
    else if (a === 'del') {
      U.confirm('ลบข้อคำถาม', 'ลบ <b>ข้อ ' + U.esc(it.code) + ' ' + U.esc(it.label.slice(0, 80)) + '</b> ออกจากแบบฟอร์ม?<br><span class="small muted">ข้อนี้ยังไม่มีข้อมูล · มีผลเมื่อกด "บันทึกแบบฟอร์ม"</span>', 'ลบ', 'danger').then(function (ok) { if (ok) { W.items.splice(i, 1); touch(); } });
    }
  }

  /** แก้ไขข้อเดิม (idx) หรือเพิ่มข้อใหม่ที่ตำแหน่ง idx (fresh) */
  function edit(idx, fresh) {
    var it = fresh || W.items[idx], sec = !fresh && isSec(it), lock = !fresh && locked(it), k = kindOf(it);
    var why = core(it) ? 'เป็นตัวชี้วัดหลักของระบบ' : 'มีข้อมูลแล้ว ' + used(it) + ' รายงาน';
    var body = sec ?
      '<label class="fld"><span>ชื่อหัวข้อหลัก</span><textarea id="fLabel" rows="2">' + U.esc(it.label) + '</textarea></label><p class="small muted" style="margin:8px 0 0">หัวข้อหลักแก้ไขได้เฉพาะถ้อยคำ</p>' :
      '<div class="grid2">' +
      '<label class="fld"><span>เลขข้อ *</span><input id="fCode" value="' + U.esc(it.code) + '" placeholder="เช่น 2.2" maxlength="12"></label>' +
      '<label class="fld"><span>ระดับ</span><select id="fLevel"><option value="1">ข้อหลัก (แสดงเลขข้อ)</option><option value="2">ข้อย่อย (ขึ้นต้นด้วย -)</option></select></label>' +
      '<label class="fld span2"><span>ข้อความข้อคำถาม *</span><textarea id="fLabel" rows="3" maxlength="600">' + U.esc(it.label) + '</textarea></label>' +
      '<label class="fld span2"><span>รูปแบบคำตอบ</span><select id="fKind"' + (lock ? ' disabled' : '') + '>' + Object.keys(KIND).map(function (x) { return '<option value="' + x + '">' + KIND[x] + '</option>'; }).join('') + '</select></label>' +
      '<label class="fld" id="fUnitW"><span>หน่วยนับ *</span><input id="fUnit" list="feUnits" value="' + U.esc(it.unit) + '"' + (lock ? ' disabled' : '') + '><datalist id="feUnits">' + UNITS.map(function (u) { return '<option value="' + u + '">'; }).join('') + '</datalist></label>' +
      '<label class="fld" id="fAggW"><span>วิธีนับยอดสะสม</span><select id="fAgg"' + (lock ? ' disabled' : '') + '><option value="sum">บวกสะสมทุกครั้ง</option><option value="latest">ใช้ค่าล่าสุด (ณ ครั้งที่รายงาน)</option></select></label>' +
      (lock ? '<p class="span2 small" style="margin:0;color:var(--accent)">' + U.icon('lock') + ' ข้อนี้' + why + ' — รูปแบบคำตอบ หน่วยนับ และวิธีนับถูกล็อกไว้ เพื่อไม่ให้ยอดสะสมผิด</p>' : '') +
      '</div>';
    U.modal({
      title: fresh ? 'เพิ่มข้อคำถาม' : sec ? 'แก้ไขหัวข้อหลัก' : 'แก้ไขข้อ ' + it.code, wide: true, body: body,
      actions: [{ label: 'ยกเลิก', cls: 'ghost' }, { label: U.icon('check') + (fresh ? 'เพิ่ม' : 'ตกลง'), cls: 'primary', onClick: function () {
        var label = U.$('fLabel').value.replace(/\s+/g, ' ').trim();
        if (label.length < 2) { U.toast('กรุณากรอกข้อความ', 'err'); return false; }
        var o = fresh ? it : W.items[idx];
        o.label = label;
        if (!sec) {
          var kk = U.$('fKind').value, code = U.$('fCode').value.trim();
          if (!code) { U.toast('กรุณากรอกเลขข้อ', 'err'); return false; }
          o.code = code; o.level = Number(U.$('fLevel').value);
          o.type = kk === 'band' || kk === 'gray' ? 'header' : kk;
          o.print = o.type === 'header' ? kk : o.type === 'check' ? 'gray' : '';
          o.unit = o.type === 'num' ? U.$('fUnit').value.trim() : '';
          o.agg = o.type === 'num' ? U.$('fAgg').value : 'sum';
          if (o.type === 'num' && !o.unit) { U.toast('กรุณาระบุหน่วยนับ', 'err'); return false; }
        }
        if (fresh) { delete o._new; delete o._from; W.items.splice(idx, 0, o); }
        touch();
      } }]
    });
    if (sec) return;
    U.$('fKind').value = k; U.$('fLevel').value = String(it.level === 1 ? 1 : 2); U.$('fAgg').value = it.agg === 'latest' ? 'latest' : 'sum';
    function sync() { var x = U.$('fKind').value; U.$('fUnitW').hidden = x !== 'num'; U.$('fAggW').hidden = x !== 'num'; }
    U.$('fKind').onchange = sync; sync();
  }

  function payload() {
    return W.items.map(function (it) { return { id: it.id || '', code: it.code, label: it.label, unit: it.unit, type: it.type, agg: it.agg, level: it.level, print: it.print, retired: !!it.retired }; });
  }
  function after(r, msg) {
    load(r);
    return App.refreshBoot().then(function () { U.toast(msg, 'ok'); draw(); });
  }
  function save() {
    var b = U.$('fSave'); b.disabled = true;
    S.call('admin.items.save', { items: payload() }).then(function (r) { return after(r, 'บันทึกแบบฟอร์มแล้ว — มีผลกับทุกอำเภอทันที'); })
      .catch(function (e) { U.toast(e.message, 'err'); b.disabled = false; });
  }
  function reset() {
    U.confirm('คืนค่าแบบฟอร์มต้นฉบับ', 'ใช้แบบฟอร์มตามแบบ ปภ. ต้นฉบับ (ถ้อยคำ ลำดับ และข้อคำถามเดิมทั้งหมด)<br><span class="small muted">ข้อที่เพิ่มเองซึ่งมีข้อมูลแล้วจะถูกเก็บไว้แบบ "ยกเลิกใช้" เพื่อไม่ให้ตัวเลขที่รายงานไปแล้วหายไป</span>', 'คืนค่า', 'warn')
      .then(function (ok) {
        if (!ok) return;
        S.call('admin.items.reset').then(function (r) { return after(r, 'คืนค่าแบบฟอร์มต้นฉบับแล้ว'); }).catch(function (e) { U.toast(e.message, 'err'); });
      });
  }
})();
