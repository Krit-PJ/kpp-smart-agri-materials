/* หน้ารายงานระดับอำเภอ และสรุปผลระดับจังหวัด */
(function () {
  function itemOf(id) { return AG_ITEMS.filter(function (i) { return i.id === id; })[0]; }
  var AGRI = [['R29', 'megaphone'], ['R30', 'recycle'], ['R31', 'tractor'], ['R32', 'straw']];

  function kpi(it, cum, week, unit, ic) {
    return '<div class="kpi"><div class="kpi-ic y">' + U.icon(ic) + '</div><div style="min-width:0"><div class="k">' + U.esc(it.label.length > 52 ? it.label.slice(0, 50) + '…' : it.label) + '</div>' +
      '<div class="v">' + U.fmt(cum, '0') + '<small>' + U.esc(unit || it.unit || '') + '</small></div>' +
      '<div class="d' + (week ? '' : ' zero') + '">' + (week ? '+' + U.fmt(week) + ' ในครั้งนี้' : 'ไม่มีผลงานเพิ่มในครั้งนี้') + '</div></div></div>';
  }
  function hcell(h) { return h === 'Y' ? '<span class="yes">มี</span>' : h === 'N' ? '<span class="no">ไม่มี</span>' : '<span class="no">–</span>'; }

  /* ═════════ รายงานระดับอำเภอ ═════════ */
  var D = { draft: false };
  Pages.district = {
    title: 'รายงานระดับอำเภอ', sub: 'ผลการดำเนินงานรายสัปดาห์และยอดสะสม',
    render: function (view, params) {
      var d = S.user.role === 'district' ? S.user.district : (params.d || D.d || S.districts[0].code);
      var r = params.r !== undefined ? Number(params.r) : (D.d === d && D.r !== undefined ? D.r : S.currentRound());
      D.d = d; D.r = r;
      return S.loadRecords(true).then(function () { draw(view); });
    }
  };
  function draw(view) {
    var d = D.d, r = D.r, rec = AGCore.recordOf(S.records, d, r);
    var comp = AGCore.computeDistrict(AG_ITEMS, S.records, d, r, { includeDraft: D.draft });
    App.setHeader('รายงานระดับอำเภอ', 'อ.' + S.districtName(d) + ' · ยอดสะสม ณ ' + S.roundText(S.roundOf(r)));
    var a = App.actions('<button class="btn" id="dXlsx">' + U.icon('download') + 'Excel</button><button class="btn primary" id="dPrint">' + U.icon('print') + 'พิมพ์รายงาน</button>');
    a.querySelector('#dPrint').onclick = function () { App.go('print', { scope: d, r: r }); };
    a.querySelector('#dXlsx').onclick = function () { Exporter.xlsx('district', r, d); };
    var sent = S.records.filter(function (x) { return x.district === d && x.round > 0 && x.round <= r && AGCore.isCounted(x); }).length;
    var nRounds = S.rounds.filter(function (x) { return x.round > 0 && x.round <= r; }).length;
    var h = ['<div class="toolbar">',
      S.isAdmin() ? '<label class="fld"><span>อำเภอ</span><select id="dD">' + S.districtOptions(d) + '</select></label>' : '',
      '<label class="fld"><span>ณ ครั้งที่</span><select id="dR">' + S.roundOptions(r) + '</select></label>',
      '<label class="switch" style="margin-bottom:9px"><input type="checkbox" id="dDraft"' + (D.draft ? ' checked' : '') + '> รวมรายงานที่ยังไม่ส่ง (ร่าง)</label>',
      '<div class="spacer"></div><div style="margin-bottom:6px">' + (rec ? U.statusChip(rec.status) : U.statusChip('none')) + '</div></div>'];
    if (rec && rec.status === 'returned') h.push('<div class="notice err">' + U.icon('alert') + '<div><b>ส่งกลับแก้ไข:</b> ' + U.esc(rec.meta.review_note) + '</div></div>');
    h.push('<div class="kpis">' + AGRI.slice(0, 3).map(function (a) { var x = comp.items[a[0]]; return kpi(itemOf(a[0]), x.cum, x.week.v, x.unit, a[1]); }).join('') +
      '<div class="kpi"><div class="kpi-ic b">' + U.icon('calendar') + '</div><div style="flex:1"><div class="k">ส่งรายงานแล้ว</div><div class="v">' + sent + '<small>/ ' + nRounds + ' ครั้ง</small></div>' +
      '<div class="bar-mini"><i style="width:' + (nRounds ? Math.round(sent / nRounds * 100) : 0) + '%"></i></div></div></div></div>');

    var t = ['<div class="card"><div class="card-h"><h2>ผลการดำเนินงานตามแบบรายงาน</h2></div><div class="tbl-wrap"><table class="t"><thead><tr><th>มาตรการ</th><th>ครั้งนี้</th><th class="n">รวม (ครั้งนี้)</th><th class="n">รวมสะสม</th><th>หน่วยนับ</th></tr></thead><tbody>'];
    AG_ITEMS.forEach(function (it) {
      var agri = it.code === '2.2' ? ' agri' : '';
      if (it.type === 'header') { t.push('<tr class="' + (it.level ? 'grp' : 'sec') + agri + '"><td colspan="5">' + (it.level ? '<span class="code">' + it.code + '</span>' : '') + U.pm(it.label) + '</td></tr>'); return; }
      var x = comp.items[it.id], num = it.type === 'num' || it.type === 'other';
      t.push('<tr class="' + agri.trim() + '"><td class="lbl-cell">' + (it.level === 1 ? '<span class="code">' + it.code + '</span>' : '') + U.pm(it.label) +
        (x.texts.length ? '<div class="small muted">' + U.esc(x.texts.join(' / ')) + '</div>' : '') + '</td><td>' + hcell(x.week.h) + '</td>' +
        '<td class="n">' + (num ? U.fmt(x.week.v) : '') + '</td><td class="n"><b>' + (num ? U.fmt(x.cum) : (x.everHas ? '<span class="yes">มี</span>' : '')) + '</b></td><td class="muted">' + U.esc(num ? x.unit || it.unit : '') + '</td></tr>');
    });
    if (comp.sec4.length) {
      t.push('<tr class="sec"><td colspan="5">4. การดำเนินการอื่น ๆ ที่เกี่ยวข้อง</td></tr>');
      comp.sec4.forEach(function (a) { t.push('<tr><td class="lbl-cell">' + U.esc(a.t) + '</td><td>' + hcell(a.week.h) + '</td><td class="n">' + U.fmt(a.week.v) + '</td><td class="n"><b>' + U.fmt(a.cum) + '</b></td><td class="muted">' + U.esc(a.u) + '</td></tr>'); });
    }
    if (comp.sec5) t.push('<tr class="sec"><td colspan="5">5. ปัญหาอุปสรรค หรือข้อเสนอแนะ</td></tr><tr><td colspan="5">' + U.esc(comp.sec5) + '</td></tr>');
    t.push('</tbody></table></div></div>');
    h.push(t.join(''));

    // ประวัติรายสัปดาห์
    var rs = S.rounds.filter(function (x) { return x.round <= r; });
    var mine = {}; S.records.forEach(function (x) { if (x.district === d) mine[x.round] = x; });
    var used = AG_ITEMS.filter(function (it) {
      return (it.type === 'num' || it.type === 'other') && rs.some(function (x) { var c = mine[x.round] && mine[x.round].values[it.id]; return c && c.v !== '' && c.v !== null; });
    });
    var hh = ['<div class="card"><div class="card-h"><h2>ผลงานรายสัปดาห์</h2><p>ตัวเลขสีจาง = ฉบับร่าง/ส่งกลับแก้ไข (ยังไม่นับในยอดสะสม)</p></div><div class="tbl-wrap"><table class="t"><thead><tr><th>มาตรการ</th>' +
      rs.map(function (x) { var m = mine[x.round]; return '<th class="n" title="' + U.esc(S.roundText(x)) + '">' + (x.round === 0 ? 'ยกมา' : 'ครั้ง ' + x.round) + '<br>' + (m ? '<span class="chip st-' + m.status + '" style="padding:2px 6px;font-size:10.5px">' + AGCore.STATUS_TH[m.status] + '</span>' : '<span class="small muted">ยังไม่ส่ง</span>') + '</th>'; }).join('') +
      '<th class="n">สะสม</th></tr></thead><tbody>'];
    if (!used.length) hh.push('<tr><td colspan="' + (rs.length + 2) + '" class="empty">ยังไม่มีข้อมูลตัวเลข</td></tr>');
    used.forEach(function (it) {
      hh.push('<tr><td class="lbl-cell"><span class="code">' + it.code + '</span>' + U.esc(it.label.slice(0, 64)) + ' <span class="muted">(' + U.esc(comp.items[it.id].unit || it.unit) + ')</span></td>' +
        rs.map(function (x) { var m = mine[x.round], c = m && m.values[it.id]; var ok = m && AGCore.isCounted(m); return '<td class="n" style="' + (ok ? '' : 'color:var(--faint)') + '">' + (c && c.v !== '' ? U.fmt(c.v) : '·') + '</td>'; }).join('') +
        '<td class="n"><b>' + U.fmt(comp.items[it.id].cum) + '</b></td></tr>');
    });
    hh.push('</tbody></table></div></div>');
    h.push(hh.join(''));
    view.innerHTML = h.join('');
    var dd = U.$('dD'); if (dd) dd.onchange = function () { App.go('district', { d: dd.value, r: D.r }); };
    U.$('dR').onchange = function (e) { App.go('district', { d: S.isAdmin() ? D.d : undefined, r: e.target.value }); };
    U.$('dDraft').onchange = function (e) { D.draft = e.target.checked; draw(view); };
  }

  /* ═════════ สรุประดับจังหวัด ═════════ */
  var P = { item: 'R31', draft: false };
  Pages.province = {
    title: 'สรุปผลระดับจังหวัด', sub: '',
    render: function (view, params) {
      P.r = params.r !== undefined ? Number(params.r) : (P.r !== undefined ? P.r : S.currentRound());
      return S.loadRecords(true).then(function () { drawP(view); });
    }
  };
  function drawP(view) {
    var r = P.r, p = AGCore.computeProvince(AG_ITEMS, S.records, S.districts, r, { includeDraft: P.draft });
    var nd = S.districts.length;
    App.setHeader('สรุปผลระดับจังหวัด', 'รวม ' + nd + ' อำเภอ · ยอดสะสม ณ ' + S.roundText(S.roundOf(r)) + (P.draft ? ' (รวมฉบับร่าง)' : ''));
    var a = App.actions('<button class="btn" id="pCsv">' + U.icon('download') + 'CSV แยกอำเภอ</button><button class="btn" id="pXlsx">' + U.icon('download') + 'Excel</button><button class="btn primary" id="pPrint">' + U.icon('print') + 'พิมพ์รายงานจังหวัด</button>');
    a.querySelector('#pPrint').onclick = function () { App.go('print', { scope: 'province', r: r }); };
    a.querySelector('#pXlsx').onclick = function () { Exporter.xlsx('province', r); };
    a.querySelector('#pCsv').onclick = function () { Exporter.csv(r, P.draft); };
    var all = S.records.filter(function (x) { return x.round === r; });
    var cnt = { submitted: 0, accepted: 0, draft: 0, returned: 0 };
    all.forEach(function (x) { cnt[x.status] = (cnt[x.status] || 0) + 1; });
    var h = ['<div class="toolbar"><label class="fld"><span>ณ ครั้งที่</span><select id="pR">' + S.roundOptions(r) + '</select></label>',
      '<label class="switch" style="margin-bottom:9px"><input type="checkbox" id="pDraft"' + (P.draft ? ' checked' : '') + '> ดูล่วงหน้า: รวมรายงานที่ยังไม่ส่ง (ร่าง)</label></div>',
      '<div class="kpis"><div class="kpi"><div class="kpi-ic b">' + U.icon('checks') + '</div><div style="flex:1"><div class="k">อำเภอที่ส่งรายงานครั้งนี้</div><div class="v">' + p.reported.length + '<small>/ ' + nd + ' อำเภอ</small></div>' +
      '<div class="bar-mini"><i style="width:' + Math.round(p.reported.length / nd * 100) + '%"></i></div><div class="small muted" style="margin-top:4px">ตรวจรับ ' + cnt.accepted + ' · รอตรวจ ' + cnt.submitted + ' · ร่าง ' + cnt.draft + ' · ส่งกลับ ' + cnt.returned + '</div></div></div>' +
      AGRI.slice(0, 3).map(function (a) { var x = p.items[a[0]]; return kpi(itemOf(a[0]), x.cum, x.week, x.unit, a[1]); }).join('') + '</div>'];

    var nums = AG_ITEMS.filter(function (i) { return i.type === 'num' || i.type === 'other'; });
    h.push('<div class="card"><div class="card-h"><h2>เปรียบเทียบยอดสะสมรายอำเภอ</h2><select id="pItem" style="width:auto;max-width:100%">' +
      nums.map(function (i) { return '<option value="' + i.id + '"' + (P.item === i.id ? ' selected' : '') + '>' + U.esc(i.code + ' ' + (i.label.length > 70 ? i.label.slice(0, 68) + '…' : i.label)) + '</option>'; }).join('') +
      '</select></div><div class="legend" style="padding:10px 18px 4px"><span><i style="background:var(--primary-light)"></i>สะสมก่อนหน้า</span><span><i style="background:var(--accent)"></i>เพิ่มในครั้งนี้</span><span id="pUnit"></span></div><div class="hbars" id="pBars"></div></div>');

    var t = ['<div class="card"><div class="card-h"><h2>ผลการดำเนินงานรวมจังหวัด</h2><p>คลิกแถวที่มีตัวเลขเพื่อดูแยกรายอำเภอ · มี/ไม่มี = จำนวนอำเภอที่รายงานในครั้งนี้</p></div><div class="tbl-wrap"><table class="t" id="pTable"><thead><tr><th>มาตรการ</th><th class="n">มี</th><th class="n">ไม่มี</th><th class="n">รวม (ครั้งนี้)</th><th class="n">รวมสะสม</th><th>หน่วยนับ</th></tr></thead><tbody>'];
    AG_ITEMS.forEach(function (it) {
      var agri = it.code === '2.2' ? ' agri' : '';
      if (it.type === 'header') { t.push('<tr class="' + (it.level ? 'grp' : 'sec') + agri + '"><td colspan="6">' + (it.level ? '<span class="code">' + it.code + '</span>' : '') + U.pm(it.label) + '</td></tr>'); return; }
      var x = p.items[it.id], num = it.type === 'num' || it.type === 'other', click = num && x.cum !== null;
      t.push('<tr class="' + agri.trim() + (click ? ' click' : '') + '"><td class="lbl-cell">' + (it.level === 1 ? '<span class="code">' + it.code + '</span>' : '') + U.pm(it.label) +
        (x.texts.length ? '<div class="small muted">' + x.texts.map(function (o) { return U.esc(o.text) + ' (อ.' + U.esc(o.district) + ')'; }).join(' · ') + '</div>' : '') + '</td>' +
        '<td class="n">' + (x.yes ? '<span class="yes">' + x.yes + '</span>' : '<span class="no">–</span>') + '</td><td class="n">' + (x.no || '<span class="no">–</span>') + '</td>' +
        '<td class="n">' + (num ? U.fmt(x.week) : '') + '</td><td class="n"><b>' + (num ? U.fmt(x.cum) : '') + '</b></td><td class="muted">' + U.esc(num ? x.unit : '') + '</td></tr>');
      if (click) t.push('<tr class="detail" hidden><td colspan="6"><div class="mini-grid">' + S.districts.map(function (d) {
        var b = x.byDistrict[d.code];
        return '<div><span>' + U.esc(d.name) + '</span><b>' + U.fmt(b.cum) + (b.week ? ' <span class="yes">+' + U.fmt(b.week) + '</span>' : '') + '</b></div>';
      }).join('') + '</div></td></tr>');
    });
    if (p.sec4.length) {
      t.push('<tr class="sec"><td colspan="6">4. การดำเนินการอื่น ๆ ที่เกี่ยวข้อง</td></tr>');
      p.sec4.forEach(function (a) { t.push('<tr><td class="lbl-cell">' + U.esc(a.t) + '<div class="small muted">อ.' + U.esc(a.districts.join(', อ.')) + '</div></td><td class="n">' + (a.everHas ? '<span class="yes">/</span>' : '') + '</td><td></td><td class="n">' + U.fmt(a.week.v) + '</td><td class="n"><b>' + U.fmt(a.cum) + '</b></td><td class="muted">' + U.esc(a.u) + '</td></tr>'); });
    }
    if (p.sec5.length) {
      t.push('<tr class="sec"><td colspan="6">5. ปัญหาอุปสรรค หรือข้อเสนอแนะ</td></tr>');
      p.sec5.forEach(function (s) { t.push('<tr><td colspan="6"><b>อ.' + U.esc(s.district) + ':</b> ' + U.esc(s.text) + '</td></tr>'); });
    }
    t.push('</tbody></table></div></div>');
    h.push(t.join(''));
    view.innerHTML = h.join('');
    bars(p);
    U.$('pR').onchange = function (e) { App.go('province', { r: e.target.value }); };
    U.$('pDraft').onchange = function (e) { P.draft = e.target.checked; drawP(view); };
    U.$('pItem').onchange = function (e) { P.item = e.target.value; bars(p); };
    U.$('pTable').onclick = function (e) { var tr = e.target.closest('tr.click'); if (!tr) return; var n = tr.nextElementSibling; if (n && n.classList.contains('detail')) n.hidden = !n.hidden; };
  }
  function bars(p) {
    var x = p.items[P.item], max = 0;
    S.districts.forEach(function (d) { max = Math.max(max, x.byDistrict[d.code].cum || 0); });
    var list = S.districts.slice().sort(function (a, b) { return (x.byDistrict[b.code].cum || 0) - (x.byDistrict[a.code].cum || 0); });
    U.$('pUnit').textContent = 'หน่วย: ' + (x.unit || '-');
    U.$('pBars').innerHTML = list.map(function (d) {
      var b = x.byDistrict[d.code], c = b.cum || 0, w = Math.max(0, Math.min(b.week || 0, c));
      var pc = max ? c / max * 100 : 0, pw = max ? w / max * 100 : 0;
      return '<div class="hbar"><span>' + U.esc(d.name) + '</span><div class="track"><div class="fill" style="width:' + pc + '%"></div><div class="fill wk" style="left:' + (pc - pw) + '%;width:' + pw + '%"></div></div><span class="val">' + U.fmt(b.cum) + '</span></div>';
    }).join('');
  }
})();
