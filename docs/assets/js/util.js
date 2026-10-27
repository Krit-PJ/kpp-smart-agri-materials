/* เครื่องมือทั่วไปของหน้าเว็บ */
var Pages = window.Pages = window.Pages || {};
var U = (function () {
  var TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  var ICONS = {
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checks: '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/>',
    tractor: '<circle cx="7" cy="17" r="3"/><circle cx="18" cy="18" r="2"/><path d="M4 13V7h6l2 6M10 13h8v3M14 7v6"/>',
    recycle: '<path d="M7 19H4.8a1.8 1.8 0 0 1-1.6-2.7L7.2 9"/><path d="M11 19h8.2a1.8 1.8 0 0 0 1.6-2.7l-1.2-2.1"/><path d="m14 16-3 3 3 3"/><path d="M8.3 13.6 7.2 9 2.6 10.1"/><path d="m9.3 5.7 1.1-1.9a1.8 1.8 0 0 1 3.1 0l3.9 6.8"/><path d="m13.4 10.6 4.6-1.2 1.2 4.6"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    straw: '<path d="M4 20h16"/><path d="M6 20c0-6 2-10 6-14 4 4 6 8 6 14"/><path d="M9 20c0-4 1-7 3-10 2 3 3 6 3 10"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0 0 20.5 15"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    arrowL: '<path d="M19 12H5M12 19l-7-7 7-7"/>'
  };
  function icon(name) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>'; }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, dash) {
    if (n === null || n === undefined || n === '') return dash === undefined ? '–' : dash;
    return Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  }
  function thLong(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return Number(p[2]) + ' ' + TH_MONTHS[Number(p[1]) - 1] + ' ' + (Number(p[0]) + 543); }
  function thShort(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return Number(p[2]) + ' ' + TH_M[Number(p[1]) - 1] + ' ' + String(Number(p[0]) + 543).slice(-2); }
  function thDateTime(s) { if (!s) return ''; return thShort(s) + (String(s).length > 10 ? ' ' + String(s).slice(11, 16) + ' น.' : ''); }
  function today() { var d = new Date(Date.now() + (7 * 60 + new Date().getTimezoneOffset()) * 60000); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addDays(iso, n) { var p = iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return d.toISOString().slice(0, 10); }

  function toast(msg, kind) {
    var t = $('toast'); t.textContent = msg; t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = 'toast'; }, kind === 'err' ? 5200 : 2800);
  }

  /** modal({title, body(html|node), wide, actions:[{label, cls, onClick(close) → false keeps open}]}) */
  function modal(o) {
    var root = $('modalRoot'), back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal ' + (o.wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' +
      (o.hero || ('<div class="modal-h"><h2>' + esc(o.title || '') + '</h2><button class="icon-btn" data-x aria-label="ปิด">' + icon('x') + '</button></div>')) +
      '<div class="modal-b"></div><div class="modal-f"></div></div>';
    var body = back.querySelector('.modal-b'), foot = back.querySelector('.modal-f');
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    function close() { back.remove(); document.removeEventListener('keydown', onKey); if (o.onClose) o.onClose(); }
    function onKey(e) { if (e.key === 'Escape' && o.dismiss !== false) close(); }
    (o.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn ' + (a.cls || ''); b.innerHTML = a.label;
      b.addEventListener('click', function () {
        var r = a.onClick ? a.onClick(close, b) : undefined;
        if (r && typeof r.then === 'function') {
          b.disabled = true;
          r.then(function (keep) { if (keep !== false) close(); }).catch(function (e) { toast(e.message, 'err'); }).then(function () { b.disabled = false; });
        } else if (r !== false) close();
      });
      foot.appendChild(b);
    });
    if (!o.actions || !o.actions.length) foot.remove();
    back.addEventListener('click', function (e) { if ((e.target === back && o.dismiss !== false) || e.target.closest('[data-x]')) close(); });
    document.addEventListener('keydown', onKey);
    root.appendChild(back);
    var f = back.querySelector('input:not([type=hidden]),select,textarea'); if (f && o.focus !== false) setTimeout(function () { f.focus(); }, 30);
    return { el: back, body: body, close: close };
  }
  function confirmBox(title, html, okLabel, cls) {
    return new Promise(function (ok) {
      var done = false;
      modal({ title: title, body: html, onClose: function () { if (!done) ok(false); },
        actions: [{ label: 'ยกเลิก', cls: 'ghost' }, { label: okLabel || 'ยืนยัน', cls: cls || 'primary', onClick: function () { done = true; ok(true); } }] });
    });
  }

  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function csv(rows) {
    return '﻿' + rows.map(function (r) { return r.map(function (c) { c = String(c === null || c === undefined ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
  }
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; }
  }
  function statusChip(st, late) {
    var s = st || 'none';
    return '<span class="chip st-' + s + '"><i></i>' + esc(AGCore.STATUS_TH[s] || s) + '</span>' + (late ? ' <span class="chip st-late">ส่งช้า</span>' : '');
  }
  function pm(s) { return esc(s).replace(/PM2\.5/g, 'PM<sub>2.5</sub>'); }
  function initials(name) { var n = String(name || '?').replace(/^(นาย|นางสาว|นาง|น\.ส\.|ว่าที่ ร\.ต\.|ดร\.)\s*/, '').trim(); return n.charAt(0) || '?'; }
  function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }

  return { icon: icon, $: $, esc: esc, fmt: fmt, thLong: thLong, thShort: thShort, thDateTime: thDateTime, today: today, addDays: addDays,
    toast: toast, modal: modal, confirm: confirmBox, download: download, csv: csv, store: store, statusChip: statusChip, pm: pm,
    initials: initials, debounce: debounce, TH_MONTHS: TH_MONTHS };
})();
