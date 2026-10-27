/**
 * AGCore — ตรรกะคำนวณยอดสะสม (ใช้ร่วมกันทั้ง Google Apps Script, หน้าเว็บ และชุดทดสอบ)
 *
 * ระเบียนรายงาน (record) = 1 อำเภอ × 1 ครั้ง
 *   { round, district, status, values:{R29:{h,v,t,u}}, sec4:[{id,t,h,v,u}], sec5:'', meta:{...} }
 *   status: draft (ร่าง) | submitted (ส่งแล้ว) | accepted (จังหวัดตรวจรับ) | returned (ส่งกลับแก้ไข)
 *   ครั้งที่ 0 = ยอดยกมา (ผลงานก่อนรายงานครั้งที่ 1)
 *
 * กติกา
 *  - นับเข้ายอดสะสมเฉพาะรายงานที่ "ส่งแล้ว" หรือ "ตรวจรับแล้ว"
 *  - ช่องว่าง = ไม่นับ (ไม่ถือเป็น 0 และไม่ลบยอดเดิม)
 *  - agg 'sum' บวกสะสม / agg 'latest' ใช้ค่าล่าสุด (เช่น "เปิดให้บริการ ณ ครั้งที่รายงาน")
 *  - มี/ไม่มี: เลือกเองได้ ถ้าไม่เลือกแต่มีตัวเลข > 0 หรือมีข้อความ ถือว่า "มี"
 *  - ข้อ 4 (กิจกรรมอื่น ๆ) สะสมแยกตามรหัสกิจกรรม (id) ที่ยกต่อจากครั้งก่อน
 */
var AGCore = (function () {
  var COUNTED = { submitted: 1, accepted: 1 };
  var STATUS_TH = { '': 'ยังไม่ส่ง', none: 'ยังไม่ส่ง', draft: 'ฉบับร่าง', submitted: 'ส่งแล้ว', accepted: 'ตรวจรับแล้ว', returned: 'ส่งกลับแก้ไข' };

  function isBlank(x) { return x === undefined || x === null || String(x).trim() === ''; }
  function num(x) {
    if (isBlank(x)) return null;
    var n = Number(String(x).replace(/,/g, '').trim());
    return isFinite(n) ? n : null;
  }
  function r2(n) { return n === null ? null : Math.round(n * 100) / 100; }
  function add(a, b) { return b === null ? a : r2((a || 0) + b); }
  function isCounted(rec) { return !!rec && (COUNTED[rec.status] === 1 || rec.status === undefined || rec.status === ''); }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  function hasOf(cell) {
    if (!cell) return '';
    if (cell.h === 'Y' || cell.h === 'N') return cell.h;
    var n = num(cell.v);
    if (n !== null && n > 0) return 'Y';
    if (!isBlank(cell.t)) return 'Y';
    return '';
  }

  /** เลือกระเบียนที่ใช้คำนวณของอำเภอหนึ่ง ถึงครั้งที่ round */
  function pick(records, district, round, opts) {
    opts = opts || {};
    var list = [];
    records.forEach(function (r) {
      if (r.district !== district || Number(r.round) > round) return;
      var cur = Number(r.round) === round;
      if (cur && opts.override) return;
      if (opts.includeDraft || isCounted(r) || (cur && opts.includeCurrent)) list.push(r);
    });
    if (opts.override) list.push(opts.override);
    return list.sort(function (a, b) { return Number(a.round) - Number(b.round); });
  }

  function recordOf(records, district, round) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].district === district && Number(records[i].round) === Number(round)) return records[i];
    }
    return null;
  }

  /**
   * ยอดของอำเภอเดียว ณ ครั้งที่ round
   * opts.override       : ระเบียนที่กำลังแก้ไข (ใช้แทนครั้งปัจจุบัน เพื่อแสดงยอดสะสมทันที)
   * opts.includeCurrent : นับครั้งปัจจุบันแม้ยังเป็นร่าง (มุมมองของอำเภอเอง)
   * opts.includeDraft   : นับทุกสถานะ
   */
  function computeDistrict(items, records, district, round, opts) {
    round = Number(round); opts = opts || {};
    var list = pick(records, district, round, opts);
    var raw = opts.override || recordOf(records, district, round);
    var current = null;
    list.forEach(function (r) { if (Number(r.round) === round) current = r; });
    var out = {};
    items.forEach(function (it) {
      if (it.type === 'header') return;
      var o = { week: { h: '', v: null, t: '', u: '' }, prevCum: null, cum: null, everHas: false, unit: it.unit || '', texts: [] };
      var wk = raw && raw.values ? raw.values[it.id] : null;
      if (wk) o.week = { h: hasOf(wk), v: num(wk.v), t: wk.t || '', u: wk.u || '' };
      list.forEach(function (r) {
        var c = r.values && r.values[it.id];
        if (!c) return;
        var n = num(c.v), before = Number(r.round) < round;
        if (hasOf(c) === 'Y') o.everHas = true;
        if (!isBlank(c.t) && o.texts.indexOf(norm(c.t)) < 0) o.texts.push(norm(c.t));
        if (!isBlank(c.u)) o.unit = norm(c.u);
        if (n === null) return;
        if (it.agg === 'latest') { o.cum = n; if (before) o.prevCum = n; }
        else { o.cum = add(o.cum, n); if (before) o.prevCum = add(o.prevCum, n); }
      });
      if (!o.unit && wk && wk.u) o.unit = norm(wk.u);
      out[it.id] = o;
    });

    // ข้อ 4: กิจกรรมอื่น ๆ — สะสมตาม id
    var acts = {}, order = [];
    list.forEach(function (r) {
      (r.sec4 || []).forEach(function (a) {
        if (!a || (isBlank(a.t) && isBlank(a.v))) return;
        var id = a.id || norm(a.t) + '|' + norm(a.u);
        if (!acts[id]) { acts[id] = { id: id, t: '', u: '', week: { h: '', v: null }, prevCum: null, cum: null, everHas: false }; order.push(id); }
        var x = acts[id], n = num(a.v);
        if (!isBlank(a.t)) x.t = norm(a.t);
        if (!isBlank(a.u)) x.u = norm(a.u);
        if (hasOf(a) === 'Y') x.everHas = true;
        if (n !== null) { x.cum = add(x.cum, n); if (Number(r.round) < round) x.prevCum = add(x.prevCum, n); }
      });
    });
    ((raw && raw.sec4) || []).forEach(function (a) {
      var id = a.id || norm(a.t) + '|' + norm(a.u);
      if (acts[id]) acts[id].week = { h: hasOf(a), v: num(a.v) };
    });
    // แสดงเฉพาะกิจกรรมที่ยังอยู่ในระเบียนล่าสุดหรือมียอดสะสม
    var sec4 = order.map(function (id) { return acts[id]; });

    var pending = [];
    records.forEach(function (r) {
      if (r.district === district && Number(r.round) < round && !isCounted(r)) pending.push(Number(r.round));
    });

    return {
      district: district, round: round,
      status: raw ? (raw.status || 'submitted') : '',
      counted: !!(raw && isCounted(raw)),
      reported: !!current,
      meta: (raw && raw.meta) || {},
      sec5: (raw && raw.sec5) || '',
      items: out, sec4: sec4, pendingRounds: pending.sort(function (a, b) { return a - b; })
    };
  }

  /** ยอดรวมจังหวัด ณ ครั้งที่ round (นับเฉพาะรายงานที่ส่งแล้ว/ตรวจรับแล้ว) */
  function computeProvince(items, records, districts, round, opts) {
    round = Number(round); opts = opts || {};
    var per = {};
    districts.forEach(function (d) { per[d.code] = computeDistrict(items, records, d.code, round, { includeDraft: !!opts.includeDraft }); });
    var out = {};
    items.forEach(function (it) {
      if (it.type === 'header') return;
      var o = { week: null, cum: null, prevCum: null, yes: 0, no: 0, everHas: false, byDistrict: {}, texts: [], units: {} };
      districts.forEach(function (d) {
        var p = per[d.code], x = p.items[it.id];
        var wk = p.counted || opts.includeDraft ? x.week : { h: '', v: null, t: '', u: '' };
        o.byDistrict[d.code] = { week: wk.v, cum: x.cum, h: wk.h, everHas: x.everHas };
        o.week = add(o.week, wk.v);
        o.cum = add(o.cum, x.cum);
        o.prevCum = add(o.prevCum, x.prevCum);
        if (x.everHas) o.everHas = true;
        if (wk.h === 'Y') o.yes++; else if (wk.h === 'N') o.no++;
        x.texts.forEach(function (t) { o.texts.push({ district: d.name, text: t }); });
        if (x.unit && x.cum !== null) o.units[x.unit] = (o.units[x.unit] || 0) + 1;
      });
      var best = '', bn = 0;
      Object.keys(o.units).forEach(function (u) { if (o.units[u] > bn) { best = u; bn = o.units[u]; } });
      o.unit = best || it.unit || '';
      out[it.id] = o;
    });

    // ข้อ 4 รวมจังหวัด: รวมกิจกรรมที่ชื่อ+หน่วยเหมือนกัน
    var acts = {}, order = [];
    districts.forEach(function (d) {
      var p = per[d.code];
      p.sec4.forEach(function (a) {
        var key = norm(a.t).toLowerCase() + '|' + norm(a.u);
        if (!acts[key]) { acts[key] = { id: key, t: a.t, u: a.u, week: { h: '', v: null }, cum: null, prevCum: null, everHas: false, districts: [] }; order.push(key); }
        var x = acts[key];
        if (p.counted || opts.includeDraft) { x.week.v = add(x.week.v, a.week.v); if (a.week.h === 'Y') x.week.h = 'Y'; }
        x.cum = add(x.cum, a.cum); x.prevCum = add(x.prevCum, a.prevCum);
        if (a.everHas) x.everHas = true;
        if (x.districts.indexOf(d.name) < 0) x.districts.push(d.name);
      });
    });

    var sec5 = [];
    districts.forEach(function (d) {
      var p = per[d.code];
      if ((p.counted || opts.includeDraft) && !isBlank(p.sec5)) sec5.push({ district: d.name, text: norm(p.sec5) });
    });
    var reported = districts.filter(function (d) { return per[d.code].counted; }).map(function (d) { return d.code; });
    return { round: round, items: out, sec4: order.map(function (k) { return acts[k]; }), sec5: sec5, reported: reported, perDistrict: per };
  }

  /** สถานะการส่งรายงาน: {D01: {3: {status, at, late, by}}} */
  function statusMatrix(records, rounds) {
    var due = {};
    (rounds || []).forEach(function (r) { due[r.round] = r.due; });
    var m = {};
    records.forEach(function (r) {
      var meta = r.meta || {};
      var at = meta.submitted_at || '';
      m[r.district] = m[r.district] || {};
      m[r.district][r.round] = {
        status: r.status || 'submitted', at: at, updated_at: meta.updated_at || '',
        by: meta.submitted_by || meta.updated_by || '',
        late: !!(at && due[r.round] && String(at).slice(0, 10) > due[r.round]),
        note: meta.review_note || ''
      };
    });
    return m;
  }

  /** ทำความสะอาดข้อมูลที่ส่งเข้ามา */
  function sanitizeInput(items, input) {
    input = input || {};
    var values = {}, src = input.values || {};
    items.forEach(function (it) {
      if (it.type === 'header') return;
      var c = src[it.id];
      if (!c) return;
      var h = c.h === 'Y' || c.h === 'N' ? c.h : '';
      var v = it.type === 'num' || it.type === 'other' ? num(c.v) : null;
      if (!isBlank(c.v) && v === null) throw new Error('ตัวเลขไม่ถูกต้อง: ข้อ ' + it.code + ' ' + it.label.slice(0, 40));
      if (v !== null && v < 0) throw new Error('ค่าติดลบไม่ได้: ข้อ ' + it.code + ' ' + it.label.slice(0, 40));
      var t = it.type === 'other' ? norm(c.t).slice(0, 300) : '';
      var u = it.type === 'other' ? norm(c.u).slice(0, 30) : '';
      if (h || v !== null || t) values[it.id] = { h: h, v: v === null ? '' : v, t: t, u: u };
    });
    var sec4 = [];
    (input.sec4 || []).slice(0, 12).forEach(function (a, i) {
      if (!a) return;
      var t = String(a.t || '').trim().slice(0, 1000), v = num(a.v), u = norm(a.u).slice(0, 30);
      if (!isBlank(a.v) && v === null) throw new Error('ตัวเลขไม่ถูกต้อง ในข้อ 4 แถวที่ ' + (i + 1));
      if (v !== null && v < 0) throw new Error('ค่าติดลบไม่ได้ ในข้อ 4 แถวที่ ' + (i + 1));
      if (isBlank(t) && v === null) return;
      var id = String(a.id || '').replace(/[^\w-]/g, '').slice(0, 24) || ('a' + Date.now().toString(36) + i);
      sec4.push({ id: id, t: t, h: a.h === 'Y' || a.h === 'N' ? a.h : '', v: v === null ? '' : v, u: u });
    });
    return { values: values, sec4: sec4, sec5: String(input.sec5 || '').trim().slice(0, 3000) };
  }

  /** ข้อ 4 ที่ยกมาจากครั้งก่อน (ชื่อ/หน่วยเดิม ตัวเลขว่าง) */
  function carrySec4(records, district, round) {
    var prev = null;
    records.forEach(function (r) {
      if (r.district === district && Number(r.round) < Number(round) && (r.sec4 || []).length) {
        if (!prev || Number(r.round) > Number(prev.round)) prev = r;
      }
    });
    return prev ? prev.sec4.map(function (a) { return { id: a.id, t: a.t, h: '', v: '', u: a.u }; }) : [];
  }

  return {
    COUNTED: COUNTED, STATUS_TH: STATUS_TH,
    isBlank: isBlank, num: num, hasOf: hasOf, isCounted: isCounted, norm: norm, recordOf: recordOf,
    computeDistrict: computeDistrict, computeProvince: computeProvince,
    statusMatrix: statusMatrix, sanitizeInput: sanitizeInput, carrySec4: carrySec4
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AGCore;
