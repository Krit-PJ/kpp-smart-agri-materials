/* พิมพ์รายงานตามแบบฟอร์ม ปภ. (เลือกครั้งที่/แก้หัวรายงาน/QR Code ได้) */
var KPPPrint = (function () {
  // สัดส่วนความกว้างคอลัมน์ตามแบบฟอร์มต้นฉบับ (PDF): ที่ | มาตรการ | มี | ไม่มี | รวม | หน่วยนับ | รวมสะสม | หน่วยนับ | หน่วยดำเนินการ
  var COLS = [59, 878, 67, 67, 107, 93, 135, 94, 105];
  var SPLIT_ROW = 48; // หน้า 2 เริ่มที่ข้อ 3.2 (แถว 48 ของแบบฟอร์ม)
  // ความสูงแถว (pt) วัดจากไฟล์ PDF ต้นฉบับ — แถวที่ข้อความยาวกว่าจะขยายเองอัตโนมัติ
  var ROW_H = { 6: 12.6, 7: 13, 8: 13, 9: 13, 10: 23, 11: 33.1, 12: 23.4, 13: 22, 14: 12.6, 15: 23.4, 16: 13, 17: 12.6, 18: 13, 19: 12.6, 20: 12.6, 21: 23.8, 22: 12.6,
    23: 12.6, 24: 13, 25: 12.6, 26: 13, 27: 12.6, 28: 13, 29: 21.6, 30: 22, 31: 12.6, 32: 13, 33: 12.6, 34: 13, 35: 12.6, 36: 12.6, 37: 13, 38: 12.6, 39: 12.6, 40: 12.6,
    41: 12.6, 42: 13, 43: 12.6, 44: 13, 45: 13, 46: 12.6, 47: 12.6,
    48: 12.6, 49: 13, 50: 13, 51: 23.4, 52: 12.6, 53: 13, 54: 23.4, 55: 13, 56: 12.6, 57: 13, 58: 13, 59: 13, 60: 12.6, 61: 13, 62: 12.6, 63: 24.1, 64: 12.6,
    hdr1: 10.8, hdr2: 28.4, sec: 12.6, r4: 22.5, r5: 22.7 };
  function rh(key) { var v = ROW_H[key] || 12.6; return ' style="height:' + v + 'pt"'; }

  function esc(s) { return U.esc(s); }
  function pm(s) { return U.esc(s).replace(/\(PM2\.5\)/g, '(PM<sub>2.5</sub>)').replace(/PM2\.5/g, 'PM<sub>2.5</sub>'); }
  function n(v) { return v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function vcell(v, ed) { var s = n(v); return '<td class="v' + (v !== null && v !== undefined && v !== '' && Math.abs(Number(v)) >= 1000 ? ' big' : '') + '"' + ed + '>' + s + '</td>'; }

  /**
   * สร้างหน้ารายงาน
   * o = { scope:'province'|'D01', comp, items, head:{title, season, office, roundNo, start, end, ref1, ref2},
   *       sign:{name, title}, qr:{img, note, link}, zeroWeek, paper:'a4'|'letter', editable }
   */
  function build(o) {
    var ed = o.editable ? ' contenteditable="true" spellcheck="false"' : '';
    var prov = o.scope === 'province', comp = o.comp;
    var colg = '<colgroup>' + COLS.map(function (w) { return '<col style="width:' + (w / 16.05).toFixed(3) + '%">'; }).join('') + '</colgroup>';
    var thead = '<thead><tr' + rh('hdr1') + '><th rowspan="2">ที่</th><th rowspan="2">มาตรการ</th><th colspan="6">ผลการปฏิบัติงาน</th><th rowspan="2">หน่วย<br>ดำเนินการ</th></tr>' +
      '<tr' + rh('hdr2') + '><th>มี (/)</th><th>ไม่มี (/)</th><th>รวม</th><th>หน่วยนับ</th><th>รวมสะสมตั้งแต่<br>ครั้งแรก</th><th>หน่วยนับ</th></tr></thead>';
    var h = o.head;
    var line2 = Number(h.roundNo) === 0 && !h.start ? 'ยอดยกมา (ผลการดำเนินงานสะสมก่อนการรายงานครั้งที่ 1)' :
      'รายงานครั้งที่ ' + esc(h.roundNo) + ' ระหว่างวันที่ ' + esc(U.thLong(h.start)) + ' ถึงวันที่ ' + esc(U.thLong(h.end));
    var header = '<div class="ph ph1" style="height:18pt"><span>' + pm(h.title) + ' ปี ' + esc(h.season) + ' ' + esc(h.office) + '</span></div>' +
      '<div class="ph ph2" style="height:16.6pt"><span>' + line2 + '</span></div>' +
      '<div class="ph ph34" style="height:29.2pt"><div>' + pm(h.ref1) + '</div><div>' + pm(h.ref2) + '</div></div>';

    // จัดกลุ่มแถวตามข้อ (สำหรับรวมช่อง "ที่")
    var items = o.items;
    function groupSpan(idx) {
      var it = items[idx], k = 1;
      while (items[idx + k] && items[idx + k].code === it.code && items[idx + k].print !== 'section' && items[idx + k].row !== SPLIT_ROW) k++;
      return k;
    }
    function rowsHtml(from, to) {
      var out = [], i = 0;
      while (i < items.length) {
        var it = items[i];
        if (it.row < from || it.row >= to) { i++; continue; }
        if (it.print === 'section') { out.push('<tr class="s"' + rh(it.row) + '><td colspan="9"' + ed + '>' + pm(it.printLabel) + '</td></tr>'); i++; continue; }
        var span = groupSpan(i);
        for (var k = 0; k < span; k++) out.push(rowHtml(items[i + k], k === 0 ? span : 0));
        i += span;
      }
      return out.join('');
    }
    function rowHtml(it, span) {
      var noCell = span ? '<td class="no" rowspan="' + span + '"' + ed + '>' + esc(it.code) + '</td>' : '';
      var label = it.printLabel;
      var tr = '<tr' + rh(it.row) + '>';
      if (it.print === 'band') return tr + noCell + '<td class="lbl band" colspan="8"' + ed + '>' + pm(label) + '</td></tr>';
      var x = it.type === 'header' ? null : comp.items[it.id];
      var lblCls = 'lbl' + (/^-/.test(label) ? ' l2' : '');
      if (it.type === 'other' && x && x.texts.length) {
        var t = prov ? uniq(x.texts.map(function (o) { return o.text; })).join(', ') : x.texts[x.texts.length - 1];
        label = label.replace(/\.{3,}\s*$/, '').replace(/…\s*$/, '') + '… ' + t;
      }
      var mk = '', nmk = '';
      if (x) {
        var has = prov ? x.everHas || x.yes > 0 : x.everHas || x.week.h === 'Y';
        if (has) mk = '/'; else if (prov ? x.no > 0 : x.week.h === 'N') nmk = '/';
      }
      var cells = '<td class="mk"' + ed + '>' + mk + '</td><td class="mk"' + ed + '>' + nmk + '</td>';
      if (it.print === 'gray') {
        cells += '<td class="gray" colspan="4"></td><td' + ed + '></td>';
      } else {
        var unit = x ? (x.unit || it.unit) : it.unit;
        var week = x ? (prov ? x.week : x.week.v) : null, cum = x ? x.cum : null;
        if (o.zeroWeek && (week === null || week === undefined) && cum !== null && cum !== undefined) week = 0;
        cells += vcell(week, ed) + '<td class="c"' + ed + '>' + esc(it.type === 'other' && cum === null && week === null ? '' : unit) + '</td>' +
          vcell(cum, ed) + '<td class="c"' + ed + '>' + esc(it.type === 'other' && cum === null && week === null ? '' : unit) + '</td><td' + ed + '></td>';
      }
      return tr + noCell + '<td class="' + lblCls + '"' + ed + '>' + pm(label) + '</td>' + cells + '</tr>';
    }
    function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

    // ข้อ 4 และ 5
    var acts = comp.sec4 || [];
    var r4 = acts.map(function (a) {
      var week = a.week ? a.week.v : null;
      if (o.zeroWeek && week === null && a.cum !== null) week = 0;
      var has = a.everHas || (a.week && a.week.h === 'Y') || a.cum > 0;
      return '<tr class="r4"' + rh('r4') + '><td' + ed + '></td><td class="lbl"' + ed + '>' + esc(a.t) + '</td><td class="mk"' + ed + '>' + (has ? '/' : '') + '</td><td class="mk"' + ed + '></td>' +
        vcell(week, ed) + '<td class="c"' + ed + '>' + esc(a.u) + '</td>' + vcell(a.cum, ed) + '<td class="c"' + ed + '>' + esc(a.u) + '</td><td' + ed + '></td></tr>';
    });
    while (r4.length < 4) r4.push('<tr class="r4"' + rh('r4') + '><td' + ed + '></td><td class="lbl"' + ed + '></td><td class="mk"' + ed + '></td><td class="mk"' + ed + '></td><td class="v"' + ed + '></td><td class="c"' + ed + '></td><td class="v"' + ed + '></td><td class="c"' + ed + '></td><td' + ed + '></td></tr>');
    var s5 = prov ? (comp.sec5 || []).map(function (s) { return 'อ.' + s.district + ': ' + s.text; }) : String(comp.sec5 || '').split(/\n+/).filter(Boolean);
    var r5 = s5.map(function (t) { return '<tr class="r5"' + rh('r5') + '><td' + ed + '></td><td class="lbl" colspan="8"' + ed + '>' + esc(t) + '</td></tr>'; });
    while (r5.length < 3) r5.push('<tr class="r5"' + rh('r5') + '><td' + ed + '></td><td class="lbl" colspan="8"' + ed + '></td></tr>');

    var foot = '<div class="pf-sign"><div class="l1"><span>ลงชื่อ</span><span class="dots"' + ed + '>' + esc(stripPrefix(o.sign.name)) + '</span><span>ผู้รายงานข้อมูล</span></div>' +
      '<div class="l2"' + ed + '>(' + esc(o.sign.name) + ')</div><div class="l3"' + ed + '>ตำแหน่ง ' + esc(o.sign.title) + '</div></div>' +
      '<div class="pf-note"><div>หมายเหตุ</div><div style="padding-left:1.4mm"' + ed + '>' + esc(o.qr.note) + '</div>' +
      (o.qr.img ? '<img class="qr" src="' + esc(o.qr.img) + '" alt="QR Code">' : '') + '<div class="lnk"' + ed + '>' + esc(o.qr.link) + '</div></div>';

    var p1 = '<div class="sheet ' + (o.paper || 'a4') + '"><div class="sheet-inner">' + header + '<table class="pf">' + colg + thead + '<tbody>' + rowsHtml(0, SPLIT_ROW) + '</tbody></table></div></div>';
    var p2 = '<div class="sheet ' + (o.paper || 'a4') + '"><div class="sheet-inner">' + header + '<table class="pf">' + colg + thead + '<tbody>' + rowsHtml(SPLIT_ROW, 999) +
      '<tr class="s"' + rh('sec') + '><td colspan="9"' + ed + '>4. การดำเนินการอื่น ๆ ที่เกี่ยวข้องในการป้องกันและแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละอองขนาดเล็ก (PM<sub>2.5</sub>) (ถ้ามี)</td></tr>' + r4.join('') +
      '<tr class="s"' + rh('sec') + '><td colspan="9"' + ed + '>5. ปัญหาอุปสรรค หรือข้อเสนอแนะ ในการดำเนินงาน (ถ้ามี)</td></tr>' + r5.join('') + '</tbody></table>' + foot + '</div></div>';
    return p1 + p2;
  }
  function stripPrefix(s) { return String(s || '').replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, ''); }

  /** ย่อเนื้อหาให้พอดีหน้า (ถ้ายาวเกิน) */
  function fit(root) {
    root.querySelectorAll('.sheet').forEach(function (sh) {
      var inner = sh.querySelector('.sheet-inner');
      inner.style.zoom = 1;
      var cs = getComputedStyle(sh);
      var avail = sh.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      var need = inner.scrollHeight;
      var old = sh.querySelector('.fitnote'); if (old) old.remove();
      if (need > avail + 1) {
        var z = Math.max(0.55, avail / need);
        inner.style.zoom = z.toFixed(3);
        var note = document.createElement('div'); note.className = 'fitnote'; note.textContent = 'ย่อ ' + Math.round(z * 100) + '% ให้พอดีหน้า';
        sh.appendChild(note);
      }
    });
  }
  return { build: build, fit: fit };
})();

/* ═════════ หน้า "พิมพ์รายงาน" ═════════ */
(function () {
  var P = null;

  Pages.print = {
    title: 'พิมพ์รายงาน', sub: 'ตามแบบรายงานผลการดำเนินการป้องกันและแก้ไขปัญหาไฟป่า หมอกควัน และฝุ่นละออง (PM2.5)',
    render: function (view, params) {
      var scope = S.user.role === 'district' ? S.user.district : (params.scope || (P && P.scope) || 'province');
      if (S.user.role === 'district') scope = S.user.district;
      var r = params.r !== undefined ? Number(params.r) : (P && P.r !== undefined ? P.r : S.currentRound());
      var rd = S.roundOf(r) || {};
      var s = S.settings;
      var me = S.user;
      P = {
        scope: scope, r: r, paper: (P && P.paper) || 'a4', zero: P ? P.zero : false, draft: P ? P.draft : (S.user.role === 'district'),
        season: s.SEASON, title: s.TITLE, ref1: s.DOC_REF_1, ref2: s.DOC_REF_2,
        roundNo: r, start: rd.start || '', end: rd.end || '',
        qrImg: S.qrImage(), qrNote: s.QR_NOTE, qrLink: s.QR_LINK,
        signName: scope === 'province' ? s.PROV_REPORTER_NAME : '', signTitle: scope === 'province' ? s.PROV_REPORTER_TITLE : ''
      };
      return S.loadRecords(true).then(function () {
        if (scope !== 'province') {
          var rec = AGCore.recordOf(S.records, scope, r);
          P.signName = rec && rec.meta.reporter ? rec.meta.reporter : (me.role === 'district' ? (me.prefix || '') + me.name : '');
          P.signTitle = rec && rec.meta.position ? rec.meta.position : (me.role === 'district' ? me.position : '');
        }
        layout(view);
      });
    }
  };

  function office() { return P.scope === 'province' ? S.settings.OFFICE : 'สำนักงานเกษตรอำเภอ' + S.districtName(P.scope); }

  function layout(view) {
    var admin = S.isAdmin();
    App.setHeader('พิมพ์รายงาน', (P.scope === 'province' ? 'ระดับจังหวัด' : 'อ.' + S.districtName(P.scope)) + ' · ' + S.roundText(S.roundOf(P.r)));
    var scopeSel = S.user.role === 'district' ? '<input value="อ.' + U.esc(S.districtName(P.scope)) + '" disabled>' :
      '<select id="pScope"><option value="province"' + (P.scope === 'province' ? ' selected' : '') + '>ระดับจังหวัด (รวม 11 อำเภอ)</option>' +
      S.districts.map(function (d) { return '<option value="' + d.code + '"' + (P.scope === d.code ? ' selected' : '') + '>อ.' + U.esc(d.name) + '</option>'; }).join('') + '</select>';
    view.innerHTML = '<div class="print-layout"><div class="card print-ctrl"><div class="card-h"><h2>ตั้งค่าการพิมพ์</h2></div><div class="card-b">' +
      '<label class="fld"><span>รายงาน</span>' + scopeSel + '</label>' +
      '<label class="fld"><span>ครั้งที่สรุปผลรายงาน (รายสัปดาห์)</span><select id="pRound">' + S.roundOptions(P.r) + '</select></label>' +
      '<div class="nav-group" style="color:var(--muted);padding:6px 0 0">หัวรายงาน (แก้ไขได้)</div>' +
      '<label class="fld"><span>ปี</span><input id="pSeason" value="' + U.esc(P.season) + '" placeholder="2568 - 2569"></label>' +
      '<div class="grid3" style="grid-template-columns:70px 1fr 1fr;gap:8px"><label class="fld"><span>ครั้งที่</span><input id="pNo" inputmode="numeric" value="' + U.esc(P.roundNo) + '"></label>' +
      '<label class="fld"><span>ระหว่างวันที่</span><input id="pStart" type="date" value="' + U.esc(P.start) + '"></label>' +
      '<label class="fld"><span>ถึงวันที่</span><input id="pEnd" type="date" value="' + U.esc(P.end) + '"></label></div>' +
      '<label class="fld"><span>อ้างอิงบรรทัดที่ 1</span><input id="pRef1" value="' + U.esc(P.ref1) + '"></label>' +
      '<label class="fld"><span>อ้างอิงบรรทัดที่ 2 (เลขหนังสือสั่งการ)</span><textarea id="pRef2" rows="4">' + U.esc(P.ref2) + '</textarea></label>' +
      '<div class="nav-group" style="color:var(--muted);padding:6px 0 0">ผู้รายงานข้อมูล</div>' +
      '<label class="fld"><span>ชื่อ - สกุล</span><input id="pSign" value="' + U.esc(P.signName) + '"></label>' +
      '<label class="fld"><span>ตำแหน่ง</span><input id="pSignT" value="' + U.esc(P.signTitle) + '"></label>' +
      '<div class="nav-group" style="color:var(--muted);padding:6px 0 0">QR Code ด้านล่าง</div>' +
      '<div class="qr-box"><img id="pQrImg" src="' + U.esc(P.qrImg) + '" alt="QR"><div class="row" style="gap:6px;align-items:center">' +
      '<label class="btn sm">' + U.icon('download') + 'อัปโหลดรูป<input type="file" id="pQrFile" accept="image/*" hidden></label>' +
      '<button class="btn sm" id="pQrGen">สร้างจากลิงก์</button><button class="btn sm ghost" id="pQrReset">รูปตั้งต้น</button></div></div>' +
      '<label class="fld"><span>ข้อความเหนือ QR</span><input id="pQrNote" value="' + U.esc(P.qrNote) + '"></label>' +
      '<label class="fld"><span>ลิงก์ใต้ QR</span><input id="pQrLink" value="' + U.esc(P.qrLink) + '"></label>' +
      '<div class="nav-group" style="color:var(--muted);padding:6px 0 0">ตัวเลือก</div>' +
      '<label class="switch"><input type="checkbox" id="pZero"' + (P.zero ? ' checked' : '') + '> ใส่ 0 ในช่อง "รวม" เมื่อไม่มีผลงานครั้งนี้</label>' +
      '<label class="switch"><input type="checkbox" id="pDraft"' + (P.draft ? ' checked' : '') + '> รวมรายงานที่ยังไม่ส่ง (ร่าง)</label>' +
      '<label class="fld"><span>ขนาดกระดาษ</span><select id="pPaper"><option value="a4">A4</option><option value="letter">Letter (ตามไฟล์ต้นฉบับ)</option></select></label>' +
      '<button class="btn primary" id="pPrint" style="justify-content:center">' + U.icon('print') + 'พิมพ์ / บันทึกเป็น PDF</button>' +
      '<button class="btn" id="pXlsx" style="justify-content:center">' + U.icon('download') + 'ดาวน์โหลด Excel</button>' +
      (admin ? '<button class="btn" id="pSave" style="justify-content:center">' + U.icon('save') + 'บันทึกหัวรายงาน/QR เป็นค่าเริ่มต้น</button>' : '') +
      '</div></div><div style="min-width:0"><p class="preview-hint">' + U.icon('info') + 'ตัวอย่างก่อนพิมพ์ — คลิกที่ข้อความในตารางเพื่อแก้ไขก่อนพิมพ์ได้ (ไม่บันทึกลงระบบ และจะรีเซ็ตเมื่อเปลี่ยนตัวเลือกด้านซ้าย)</p>' +
      '<div class="preview-scroll" id="pPrev"><div class="print-pages" id="pPages"></div></div></div></div>';
    U.$('pPaper').value = P.paper;
    bind();
    paint();
  }

  function compute() {
    if (P.scope === 'province') return AGCore.computeProvince(AG_ITEMS, S.records, S.districts, P.r, { includeDraft: P.draft });
    return AGCore.computeDistrict(AG_ITEMS, S.records, P.scope, P.r, P.draft ? { includeCurrent: true } : {});
  }

  function paint() {
    var pages = U.$('pPages');
    pages.innerHTML = KPPPrint.build({
      scope: P.scope === 'province' ? 'province' : 'district', comp: compute(), items: AG_ITEMS, editable: true, zeroWeek: P.zero, paper: P.paper,
      head: { title: P.title, season: P.season, office: office(), roundNo: P.roundNo, start: P.start, end: P.end, ref1: P.ref1, ref2: P.ref2 },
      sign: { name: P.signName, title: P.signTitle }, qr: { img: P.qrImg, note: P.qrNote, link: P.qrLink }
    });
    var style = document.getElementById('pageSizeStyle') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pageSizeStyle' }));
    style.textContent = '@page { size: ' + (P.paper === 'letter' ? 'letter' : 'A4') + ' portrait; margin: 0; }';
    var go = function () { KPPPrint.fit(pages); scale(); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
  }
  function scale() {
    var box = U.$('pPrev'), pages = U.$('pPages'); if (!box) return;
    pages.style.zoom = 1;
    var w = pages.querySelector('.sheet').offsetWidth + 2, avail = box.clientWidth - 40;
    pages.style.zoom = Math.min(1, avail / w).toFixed(3);
  }

  function bind() {
    var sc = U.$('pScope');
    if (sc) sc.onchange = function () { App.go('print', { scope: sc.value, r: P.r }); };
    U.$('pRound').onchange = function (e) { App.go('print', { scope: P.scope, r: e.target.value }); };
    var map = { pSeason: 'season', pNo: 'roundNo', pStart: 'start', pEnd: 'end', pRef1: 'ref1', pRef2: 'ref2', pSign: 'signName', pSignT: 'signTitle', pQrNote: 'qrNote', pQrLink: 'qrLink' };
    var repaint = U.debounce(paint, 250);
    Object.keys(map).forEach(function (id) { U.$(id).addEventListener('input', function (e) { P[map[id]] = e.target.value; repaint(); }); });
    U.$('pZero').onchange = function (e) { P.zero = e.target.checked; paint(); };
    U.$('pDraft').onchange = function (e) { P.draft = e.target.checked; paint(); };
    U.$('pPaper').onchange = function (e) { P.paper = e.target.value; paint(); };
    U.$('pQrFile').onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      shrink(f, function (url) { P.qrImg = url; U.$('pQrImg').src = url; paint(); });
    };
    U.$('pQrGen').onclick = function () {
      if (typeof qrcode === 'undefined') { U.toast('กำลังโหลดตัวสร้าง QR กรุณาลองใหม่', 'err'); return; }
      if (!P.qrLink) { U.toast('กรุณากรอกลิงก์ใต้ QR ก่อน', 'err'); return; }
      var q = qrcode(0, 'M'); q.addData(P.qrLink); q.make();
      P.qrImg = q.createDataURL(6, 0); U.$('pQrImg').src = P.qrImg; paint();
      U.toast('สร้าง QR Code จากลิงก์แล้ว');
    };
    U.$('pQrReset').onclick = function () { P.qrImg = 'assets/img/qr-default.png'; U.$('pQrImg').src = P.qrImg; paint(); };
    U.$('pPrint').onclick = function () {
      S.call('log.event', { action: 'print', detail: (P.scope === 'province' ? 'จังหวัด' : 'อ.' + S.districtName(P.scope)) + ' ครั้งที่ ' + P.r }).catch(function () { });
      setTimeout(function () { window.print(); }, 50);
    };
    U.$('pXlsx').onclick = function () { Exporter.xlsx(P.scope === 'province' ? 'province' : 'district', P.r, P.scope === 'province' ? null : P.scope, P); };
    var sv = U.$('pSave');
    if (sv) sv.onclick = function () {
      var vals = { SEASON: P.season, DOC_REF_1: P.ref1, DOC_REF_2: P.ref2, QR_NOTE: P.qrNote, QR_LINK: P.qrLink, QR_IMAGE: /^data:/.test(P.qrImg) ? P.qrImg : '' };
      if (P.scope === 'province') { vals.PROV_REPORTER_NAME = P.signName; vals.PROV_REPORTER_TITLE = P.signTitle; }
      var rd = S.roundOf(P.r), jobs = [S.call('admin.settings.save', { values: vals })];
      var datesChanged = rd && (rd.start !== P.start || rd.end !== P.end) && P.start && P.end;
      if (datesChanged) jobs.push(S.call('admin.rounds.save', { rounds: [{ round: rd.round, label: rd.label, start: P.start, end: P.end, due: rd.due, open: rd.open }] }));
      sv.disabled = true;
      Promise.all(jobs).then(function (res) {
        S.settings = res[0]; if (res[1]) S.rounds = res[1];
        U.toast('บันทึกค่าเริ่มต้นของหัวรายงาน' + (datesChanged ? ' และวันที่ของครั้งที่ ' + P.r : '') + ' แล้ว', 'ok');
      }).catch(function (e) { U.toast(e.message, 'err'); }).then(function () { sv.disabled = false; });
    };
    window.onresize = U.debounce(scale, 150);
    window.onbeforeprint = function () {
      var pages = U.$('pPages'), root = U.$('printRoot');
      if (!pages) return;
      root.innerHTML = pages.innerHTML;
    };
    window.onafterprint = function () { U.$('printRoot').innerHTML = ''; };
  }

  function shrink(file, cb) {
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 320, k = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        var g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL('image/png'));
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }
})();
