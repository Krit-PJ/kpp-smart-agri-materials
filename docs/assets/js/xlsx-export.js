/* ส่งออก Excel ตามแบบฟอร์มเดิม (assets/template.xlsx) และ CSV แยกรายอำเภอ */
var Exporter = (function () {
  function v(x) { return x === null || x === undefined || x === '' ? null : Number(x); }

  /* ── แบบฟอร์มที่ Super Admin แก้ไข: สร้างตารางใหม่จากรูปแบบของแบบฟอร์มต้นฉบับ (สี ฟอนต์ เส้น ขนาดคอลัมน์เดิม) ── */
  var T4 = 65, T5 = 70, TEND = 82; // แถวในไฟล์ต้นฉบับ: หัวข้อ 4, หัวข้อ 5, แถวสุดท้าย
  /** แบบฟอร์มเหมือนต้นฉบับ (ลำดับ ถ้อยคำ หน่วย รูปแบบ) หรือไม่ */
  function sameAsBase(items) {
    var base = typeof AG_ITEMS_BASE !== 'undefined' ? AG_ITEMS_BASE : null;
    if (!base || items.length !== base.length) return !base;
    return items.every(function (it, i) { var b = base[i]; return it.id === b.id && it.label === b.label && it.printLabel === b.printLabel && it.unit === b.unit && it.type === b.type && it.code === b.code && it.row === b.row; });
  }
  function tplRow(it) {
    if (it.print === 'section') return 6;
    if (it.type === 'header') return it.print === 'gray' ? 7 : 23;
    if (it.type === 'check') return it.level === 1 ? 14 : 8;
    if (it.type === 'other') return 27;
    return it.level === 1 ? 13 : 16;
  }
  function rebuild(wb, items) {
    var src = wb.worksheets[0], name = src.name, dst = wb.addWorksheet(name + ' (ใหม่)');
    var merges = (src.model.merges || []).map(function (m) {
      var a = m.split(':'), p = function (x) { var r = /^([A-Z]+)(\d+)$/.exec(x); return { c: r[1], r: Number(r[2]) }; };
      return { a: p(a[0]), b: p(a[1] || a[0]) };
    });
    for (var c = 1; c <= 22; c++) if (src.getColumn(c).width) dst.getColumn(c).width = src.getColumn(c).width;
    dst.pageSetup = JSON.parse(JSON.stringify(src.pageSetup || {})); dst.pageSetup.printArea = undefined;
    function copyRow(from, to) {
      var sr = src.getRow(from), dr = dst.getRow(to);
      if (sr.height) dr.height = sr.height;
      for (var c = 1; c <= 12; c++) { var sc = sr.getCell(c), dc = dr.getCell(c); dc.value = sc.value; dc.style = JSON.parse(JSON.stringify(sc.style || {})); }
    }
    function copyMerges(fromRow, toRow) { // เฉพาะช่องรวมภายในแถวเดียว
      merges.forEach(function (m) { if (m.a.r === fromRow && m.b.r === fromRow) dst.mergeCells(m.a.c + toRow + ':' + m.b.c + toRow); });
    }
    var r, map = {};
    for (r = 1; r <= 5; r++) copyRow(r, r);
    merges.forEach(function (m) { if (m.b.r <= 5) dst.mergeCells(m.a.c + m.a.r + ':' + m.b.c + m.b.r); });
    r = 6;
    items.forEach(function (it) {
      var from = it.row || tplRow(it);
      copyRow(from, r); copyMerges(from, r);
      var row = dst.getRow(r);
      row.getCell(1).value = it.print === 'section' ? it.printLabel : null;
      if (it.print !== 'section') {
        row.getCell(2).value = (it.level >= 2 && /^-/.test(it.printLabel) ? ' ' : '') + it.printLabel;
        if (it.type === 'num') { row.getCell(7).value = it.unit || null; row.getCell(10).value = it.unit || null; }
        if (!it.row) row.height = Math.max(24.75, Math.ceil(String(it.printLabel).length / 95) * 22);
      }
      map[it.id] = r; r++;
    });
    // ช่อง "ที่" รวมตามเลขข้อ (เหมือนแบบฟอร์มต้นฉบับ)
    for (var i = 0; i < items.length;) {
      var it = items[i], k = 1;
      if (it.print === 'section') { i++; continue; }
      while (items[i + k] && items[i + k].code === it.code && items[i + k].print !== 'section') k++;
      dst.getCell('A' + map[it.id]).value = it.code || null;
      if (k > 1) dst.mergeCells('A' + map[it.id] + ':A' + map[items[i + k - 1].id]);
      i += k;
    }
    var off = r - T4;
    for (var t = T4; t <= TEND; t++) { copyRow(t, t + off); }
    merges.forEach(function (m) { if (m.a.r >= T4) dst.mergeCells(m.a.c + (m.a.r + off) + ':' + m.b.c + (m.b.r + off)); });
    (src.getImages ? src.getImages() : []).forEach(function (img) {
      var tl = img.range.tl, br = img.range.br, o = { tl: { col: tl.nativeCol, row: tl.nativeRow >= T4 - 1 ? tl.nativeRow + off : tl.nativeRow } };
      if (br) o.br = { col: br.nativeCol, row: br.nativeRow >= T4 - 1 ? br.nativeRow + off : br.nativeRow }; else o.ext = img.range.ext;
      dst.addImage(img.imageId, o);
    });
    dst.views = src.views;
    var order = src.orderNo;
    wb.removeWorksheet(src.id);
    dst.name = name; dst.orderNo = order; // ให้เป็นชีตแรกเหมือนเดิม
    return { row: function (it) { return map[it.id]; }, off: off };
  }

  /** เติมข้อมูลลงสมุดงาน ExcelJS (ใช้ได้ทั้งเบราว์เซอร์และ Node) */
  function fill(wb, o) {
    var L = sameAsBase(o.items) ? { row: function (it) { return it.row; }, off: 0 } : rebuild(wb, o.items);
    var ws = wb.worksheets[0], prov = o.scope === 'province', comp = o.comp, h = o.head;
    ws.getCell('A1').value = h.title + ' ปี ' + h.season + ' ' + h.office;
    ws.getCell('A2').value = Number(h.roundNo) === 0 && !h.start ? 'ยอดยกมา (ผลการดำเนินงานสะสมก่อนการรายงานครั้งที่ 1)' :
      'รายงานครั้งที่ ' + h.roundNo + ' ระหว่างวันที่ ' + U.thLong(h.start) + ' ถึงวันที่ ' + U.thLong(h.end);
    ws.getCell('A3').value = h.ref1 + '\n' + h.ref2;
    o.items.forEach(function (it) {
      if (it.type === 'header' || it.print === 'section' || it.print === 'band') return;
      var r = L.row(it), x = comp.items[it.id];
      ['C', 'D', 'E', 'H'].forEach(function (c) { ws.getCell(c + r).value = null; });
      if (!x) return;
      var has = prov ? x.everHas || x.yes > 0 : x.everHas || x.week.h === 'Y';
      if (has) ws.getCell('C' + r).value = '/'; else if (prov ? x.no > 0 : x.week.h === 'N') ws.getCell('D' + r).value = '/';
      if (it.type === 'num' || it.type === 'other') {
        var week = prov ? x.week : x.week.v;
        if (o.zeroWeek && week === null && x.cum !== null) week = 0;
        ws.getCell('E' + r).value = v(week);
        ws.getCell('H' + r).value = v(x.cum);
        if (it.type === 'other') {
          ws.getCell('G' + r).value = x.unit || null; ws.getCell('J' + r).value = x.unit || null;
          if (x.texts.length) {
            var t = prov ? x.texts.map(function (a) { return a.text; }).filter(function (a, i, arr) { return arr.indexOf(a) === i; }).join(', ') : x.texts[x.texts.length - 1];
            ws.getCell('B' + r).value = ' ' + String(it.printLabel).replace(/[.…\s]+$/, '') + '… ' + t;
          }
        }
      }
    });
    // ข้อ 4 (แถว 66–69)
    for (var i = 0; i < 4; i++) {
      var a = (comp.sec4 || [])[i], rr = 66 + i + L.off;
      ['B', 'C', 'D', 'E', 'G', 'H', 'J'].forEach(function (c) { ws.getCell(c + rr).value = null; });
      if (!a) continue;
      var wk = a.week ? a.week.v : null;
      if (o.zeroWeek && wk === null && a.cum !== null) wk = 0;
      ws.getCell('B' + rr).value = a.t;
      if (a.everHas || a.cum > 0) ws.getCell('C' + rr).value = '/';
      ws.getCell('E' + rr).value = v(wk); ws.getCell('G' + rr).value = a.u || null;
      ws.getCell('H' + rr).value = v(a.cum); ws.getCell('J' + rr).value = a.u || null;
      ws.getCell('B' + rr).alignment = { wrapText: true, vertical: 'top' };
    }
    // ข้อ 5 (แถว 71–74)
    var s5 = prov ? (comp.sec5 || []).map(function (s) { return 'อ.' + s.district + ': ' + s.text; }) : String(comp.sec5 || '').split(/\n+/).filter(Boolean);
    var f = L.off, at = function (c, r) { return ws.getCell(c + (r + f)); };
    for (var j = 0; j < 4; j++) { at('B', 71 + j).value = s5[j] || null; at('B', 71 + j).alignment = { wrapText: true, vertical: 'top' }; }
    if (s5.length > 4) at('B', 74).value = s5.slice(3).join(' / ');
    var name = String(o.sign.name || '');
    at('F', 76).value = name.replace(/^(นาย|นางสาว|นาง)\s*/, '');
    at('E', 77).value = '(' + name + ')';
    at('C', 78).value = 'ตำแหน่ง ' + (o.sign.title || '');
    at('B', 80).value = ' ' + (o.qr.note || '');
    at('B', 82).value = o.qr.link || '';
    if (prov) addBreakdown(wb, o);
    return wb;
  }

  function addBreakdown(wb, o) {
    var old = wb.getWorksheet('แยกรายอำเภอ'); if (old) wb.removeWorksheet(old.id);
    var ws = wb.addWorksheet('แยกรายอำเภอ', { views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }] });
    var ds = o.districts, F = { name: 'TH Sarabun New', size: 14 };
    ws.getCell('A1').value = 'ผลการดำเนินงานแยกรายอำเภอ — ' + (Number(o.head.roundNo) === 0 ? 'ยอดยกมา' : 'รายงานครั้งที่ ' + o.head.roundNo + ' (' + U.thLong(o.head.start) + ' – ' + U.thLong(o.head.end) + ')');
    ws.getCell('A1').font = { name: F.name, size: 16, bold: true };
    var h1 = ['ข้อ', 'มาตรการ', 'หน่วยนับ'], h2 = ['', '', ''];
    ds.forEach(function (d) { h1.push(d.name, ''); h2.push('ครั้งนี้', 'สะสม'); });
    h1.push('รวมจังหวัด', ''); h2.push('ครั้งนี้', 'สะสม');
    ws.getRow(2).values = h1; ws.getRow(3).values = h2;
    for (var i = 0; i <= ds.length; i++) ws.mergeCells(2, 4 + i * 2, 2, 5 + i * 2);
    o.items.forEach(function (it) {
      if (it.type === 'header') { var hr = ws.addRow([it.code, it.label]); hr.font = { name: F.name, size: 14, bold: true }; return; }
      if (it.type !== 'num' && it.type !== 'other') return;
      var x = o.comp.items[it.id], row = [it.code, '  - ' + it.label, x.unit || it.unit];
      ds.forEach(function (d) { var b = x.byDistrict[d.code]; row.push(v(b.week), v(b.cum)); });
      row.push(v(x.week), v(x.cum));
      ws.addRow(row);
    });
    ws.getColumn(1).width = 6; ws.getColumn(2).width = 62; ws.getColumn(3).width = 12;
    var last = 3 + (ds.length + 1) * 2;
    for (var c = 4; c <= last; c++) ws.getColumn(c).width = 9;
    ws.eachRow(function (row, n) {
      row.eachCell({ includeEmpty: true }, function (cell, col) {
        if (col > last) return;
        cell.font = Object.assign({}, F, (n <= 3 || (cell.font && cell.font.bold)) ? { bold: true } : {});
        if (n >= 2) cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        if (n === 2 || n === 3) { cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } }; }
        else if (col === 2) cell.alignment = { wrapText: true, vertical: 'top' };
        if (col >= 4 && n > 3) cell.numFmt = '#,##0.##';
      });
    });
  }

  /** ตัวเลือกจากหน้า (หรือค่าตั้งต้น) → ดาวน์โหลด .xlsx */
  function xlsx(scope, round, district, P) {
    if (typeof ExcelJS === 'undefined') { U.toast('กำลังโหลดตัวสร้าง Excel กรุณาลองใหม่อีกครั้ง', 'err'); return; }
    var s = S.settings, rd = S.roundOf(round) || {}, prov = scope === 'province';
    var comp = prov ? AGCore.computeProvince(AG_ITEMS, S.records, S.districts, round, { includeDraft: P ? P.draft : false })
      : AGCore.computeDistrict(AG_ITEMS, S.records, district, round, P && P.draft ? { includeCurrent: true } : {});
    var shown = AGCore.shownItems(AG_ITEMS, comp);
    var rec = !prov ? AGCore.recordOf(S.records, district, round) : null;
    var o = {
      scope: scope, comp: comp, items: shown, districts: S.districts, zeroWeek: P ? P.zero : false,
      head: { title: P ? P.title : s.TITLE, season: P ? P.season : s.SEASON, office: P && P.office ? P.office : prov ? s.OFFICE : 'สำนักงานเกษตรอำเภอ' + S.districtName(district),
        roundNo: P ? P.roundNo : round, start: P ? P.start : rd.start, end: P ? P.end : rd.end, ref1: P ? P.ref1 : s.DOC_REF_1, ref2: P ? P.ref2 : s.DOC_REF_2 },
      sign: P ? { name: P.signName, title: P.signTitle } : prov ? { name: s.PROV_REPORTER_NAME, title: s.PROV_REPORTER_TITLE } : { name: rec ? rec.meta.reporter : '', title: rec ? rec.meta.position : '' },
      qr: { note: P ? P.qrNote : s.QR_NOTE, link: P ? P.qrLink : s.QR_LINK }
    };
    var name = 'รายงาน_' + (prov ? 'จ.' + (s.PROVINCE || '') : 'อ.' + S.districtName(district)) + '_' + (round ? 'ครั้งที่' + round : 'ยอดยกมา') + '.xlsx';
    U.toast('กำลังสร้างไฟล์ Excel…');
    fetch('assets/template.xlsx').then(function (r) { if (!r.ok) throw new Error('โหลดแบบฟอร์ม Excel ไม่ได้'); return r.arrayBuffer(); })
      .then(function (buf) { var wb = new ExcelJS.Workbook(); return wb.xlsx.load(buf).then(function () { fill(wb, o); return wb.xlsx.writeBuffer(); }); })
      .then(function (out) {
        U.download(name, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        U.toast('ดาวน์โหลด ' + name, 'ok');
        S.call('log.event', { action: 'export_xlsx', detail: name }).catch(function () { });
      }).catch(function (e) { U.toast(e.message, 'err'); });
  }

  function csv(round, draft) {
    var p = AGCore.computeProvince(AG_ITEMS, S.records, S.districts, round, { includeDraft: draft });
    var head = ['ข้อ', 'มาตรการ', 'หน่วยนับ'];
    S.districts.forEach(function (d) { head.push(d.name + ' (ครั้งนี้)', d.name + ' (สะสม)'); });
    head.push('รวมจังหวัด (ครั้งนี้)', 'รวมจังหวัด (สะสม)');
    var rows = [head];
    AGCore.shownItems(AG_ITEMS, p).forEach(function (it) {
      if (it.type !== 'num' && it.type !== 'other') return;
      var x = p.items[it.id], row = [it.code, it.label, x.unit || it.unit];
      S.districts.forEach(function (d) { var b = x.byDistrict[d.code]; row.push(b.week === null ? '' : b.week, b.cum === null ? '' : b.cum); });
      row.push(x.week === null ? '' : x.week, x.cum === null ? '' : x.cum);
      rows.push(row);
    });
    var name = 'แยกรายอำเภอ_' + (round ? 'ครั้งที่' + round : 'ยอดยกมา') + '.csv';
    U.download(name, new Blob([U.csv(rows)], { type: 'text/csv;charset=utf-8' }));
    S.call('log.event', { action: 'export_csv', detail: name }).catch(function () { });
  }
  return { fill: fill, xlsx: xlsx, csv: csv, sameAsBase: sameAsBase };
})();
