/* หน้าแผนที่ภาพรวม (Smart Map) — choropleth ยอดสะสมรายอำเภอ */
(function () {
  var LAYERS = [
    { id: 'R31', icon: 'tractor', short: 'ไถกลบตอซัง/ใช้สารย่อยสลาย' },
    { id: 'R29', icon: 'megaphone', short: 'ส่งเสริมนำเศษวัสดุไปเพิ่มมูลค่า' },
    { id: 'R30', icon: 'recycle', short: 'แปรรูปวัสดุการเกษตร' },
    { id: 'R32', icon: 'straw', short: 'การดำเนินการอื่น (พื้นที่เกษตร)' }
  ];
  var RAMP = ['#d8f3df', '#a5e0b4', '#6cc58a', '#34a85a', '#1a7f37', '#0f5323'];
  var state = { layer: 'R31', round: null, base: 'osm', selected: null };

  function itemOf(id) { return AG_ITEMS.filter(function (i) { return i.id === id; })[0]; }

  Pages.map = {
    title: 'แผนที่ภาพรวม', sub: 'ยอดสะสมผลการจัดการเศษวัสดุทางการเกษตรรายอำเภอ', flush: true,
    render: function (view) {
      if (state.round === null || !S.roundOf(state.round)) state.round = S.currentRound();
      var pub = !S.user;
      view.innerHTML =
        '<div class="map-wrap"><div id="map" aria-label="แผนที่จังหวัดกำแพงเพชร"></div>' +
        (pub ? '<div class="float map-head"><img src="assets/img/logo.svg" alt=""><div><h1>' + U.esc(S.settings.SITE_NAME || 'KPP Smart Agri-Materials') + '</h1><p>ระบบรายงานการจัดการเศษวัสดุทางการเกษตร · ' + U.esc(S.settings.OFFICE || '') + '</p></div></div>' +
          '<div class="float map-login"><button class="btn dark" id="mLogin">' + U.icon('login') + 'สำหรับเจ้าหน้าที่</button></div>' : '') +
        '<div class="float map-panel" id="mPanel"></div>' +
        '<div class="float map-kpis" id="mKpis"></div>' +
        '<div class="float map-legend" id="mLegend"></div>' +
        '<div class="float dist-card" id="mCard" hidden></div></div>';
      if (pub) U.$('mLogin').onclick = function () { App.openLogin(); };

      var map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 7 }).setView([16.35, 99.55], 9);
      L.control.zoom({ position: pub ? 'bottomright' : 'bottomright' }).addTo(map);
      var bases = {
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }),
        sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: '© Esri' }),
        light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 18, attribution: '© OpenStreetMap © CARTO' })
      };
      bases[state.base].addTo(map);
      var geo = null, labels = [], mapRecs = null;
      function recs() { return mapRecs || S.records; }

      function draw(records) {
        var p = AGCore.computeProvince(AG_ITEMS, records, S.districts, state.round);
        var it = itemOf(state.layer), x = p.items[state.layer];
        var vals = S.districts.map(function (d) { return x.byDistrict[d.code].cum || 0; });
        var max = Math.max.apply(null, vals.concat([0]));
        function color(v) { if (!v) return '#eef1f4'; var k = Math.min(RAMP.length - 1, Math.floor(v / max * (RAMP.length - 0.0001))); return RAMP[k]; }
        var byCode = {};
        S.districts.forEach(function (d) { byCode[d.code] = d; });
        if (geo) geo.remove(); labels.forEach(function (l) { l.remove(); }); labels = [];
        geo = L.geoJSON(window.KPP_GEO, {
          style: function (f) {
            var v = x.byDistrict[f.properties.code] ? x.byDistrict[f.properties.code].cum : 0;
            return { color: '#2b4a3a', weight: state.selected === f.properties.code ? 3.5 : 1.6, fillColor: color(v), fillOpacity: state.base === 'sat' ? .62 : .78 };
          },
          onEachFeature: function (f, layer) {
            layer.on('click', function () { state.selected = f.properties.code; draw(records); card(p, f.properties.code); });
            layer.on('mouseover', function () { layer.setStyle({ weight: 3 }); });
            layer.on('mouseout', function () { geo.resetStyle(layer); });
          }
        }).addTo(map);
        window.KPP_GEO.features.forEach(function (f) {
          var v = x.byDistrict[f.properties.code] ? x.byDistrict[f.properties.code].cum : null;
          var m = L.tooltip({ permanent: true, direction: 'center', className: 'dist-label', interactive: false })
            .setLatLng([f.properties.lat, f.properties.lon]).setContent(U.esc(f.properties.name) + (v ? '<b>' + U.fmt(v) + '</b>' : '')).addTo(map);
          labels.push(m);
        });

        U.$('mLegend').innerHTML = '<b>' + U.esc(it.code + ' ' + shortLabel(it)) + ' (' + U.esc(x.unit || it.unit) + ')</b>' +
          '<div class="ramp">' + RAMP.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</div>' +
          '<div class="ramp-l"><span>' + (max ? '>0' : '0') + '</span><span>' + U.fmt(max, '0') + '</span></div>' +
          '<div class="small muted" style="margin-top:4px">ยอดสะสม ณ ' + U.esc(S.roundText(S.roundOf(state.round))) + '</div>';

        var k = [
          { v: p.reported.length + '/' + S.districts.length, l: 'อำเภอส่งรายงานครั้งนี้' },
          { v: U.fmt(p.items.R31.cum, '0'), l: 'ไถกลบสะสม (ไร่)' },
          { v: U.fmt(p.items.R29.cum, '0'), l: 'ส่งเสริม/อบรม (ครั้ง)' },
          { v: U.fmt(p.items.R30.cum, '0'), l: 'แปรรูป (หมู่บ้าน/ชุมชน)' }
        ];
        U.$('mKpis').innerHTML = k.map(function (a) { return '<div class="map-kpi"><b>' + a.v + '</b><span>' + a.l + '</span></div>'; }).join('');
        if (state.selected) card(p, state.selected);
      }

      function shortLabel(it) { var l = LAYERS.filter(function (x) { return x.id === it.id; })[0]; return l ? l.short : it.label.slice(0, 48) + (it.label.length > 48 ? '…' : ''); }

      function card(p, code) {
        var el = U.$('mCard'), d = p.perDistrict[code];
        if (!d) { el.hidden = true; return; }
        var rows = ['R29', 'R30', 'R31', 'R32', 'R13', 'R20'].map(function (id) {
          var it = itemOf(id), x = d.items[id];
          return '<dt>' + U.esc(shortLabel(it)) + '</dt><dd>' + U.fmt(x.cum, '–') + ' <span class="muted small" style="font-weight:400">' + U.esc(x.unit || it.unit) + '</span></dd>';
        }).join('');
        var canOpen = S.user && (S.isAdmin() || S.user.district === code);
        el.innerHTML = '<div class="row" style="align-items:center;gap:8px"><h2 style="flex:1">อ.' + U.esc(S.districtName(code)) + '</h2><button class="icon-btn" id="mCardX" aria-label="ปิด">' + U.icon('x') + '</button></div>' +
          '<div style="margin-top:6px">' + (d.counted ? U.statusChip(d.status) : '<span class="chip st-none"><i></i>ยังไม่ส่งรายงานครั้งนี้</span>') + '</div>' +
          '<dl>' + rows + '</dl>' +
          (canOpen ? '<button class="btn sm" style="margin-top:12px" id="mOpen">' + U.icon('grid') + 'ดูรายงานของอำเภอ</button>' : '');
        el.hidden = false;
        U.$('mCardX').onclick = function () { el.hidden = true; state.selected = null; draw(recs()); };
        var o = U.$('mOpen'); if (o) o.onclick = function () { App.go('district', { d: code, r: state.round }); };
      }

      function panel() {
        var others = AG_ITEMS.filter(function (i) { return i.type === 'num' && !LAYERS.some(function (l) { return l.id === i.id; }); });
        U.$('mPanel').innerHTML =
          '<h3>ครั้งที่รายงาน</h3><select id="mRound" style="margin-bottom:10px">' + S.roundOptions(state.round) + '</select>' +
          '<h3>ตัวชี้วัด · 2.2 พื้นที่เกษตร</h3>' +
          LAYERS.map(function (l) {
            var it = itemOf(l.id);
            return '<button class="layer-btn' + (state.layer === l.id ? ' on' : '') + '" data-l="' + l.id + '"><span class="ic">' + U.icon(l.icon) + '</span><span>' + U.esc(l.short) + '<small>' + U.esc(it.unit || 'ตามที่ระบุ') + '</small></span></button>';
          }).join('') +
          '<h3 style="margin-top:12px">ตัวชี้วัดอื่น</h3><select id="mOther"><option value="">— เลือกตัวชี้วัด —</option>' +
          others.map(function (i) { return '<option value="' + i.id + '"' + (state.layer === i.id ? ' selected' : '') + '>' + U.esc(i.code + ' ' + i.label.slice(0, 60) + ' (' + i.unit + ')') + '</option>'; }).join('') + '</select>' +
          '<h3 style="margin-top:14px">แผนที่พื้นหลัง</h3><div class="seg" id="mBase"><button data-b="osm">OSM</button><button data-b="light">สีอ่อน</button><button data-b="sat">ดาวเทียม</button></div>';
        U.$('mPanel').querySelectorAll('#mBase button').forEach(function (b) { b.classList.toggle('on', b.dataset.b === state.base); });
        U.$('mPanel').onclick = function (e) {
          var b = e.target.closest('.layer-btn');
          if (b) { state.layer = b.dataset.l; panel(); draw(recs()); return; }
          var bb = e.target.closest('#mBase button');
          if (bb) { map.removeLayer(bases[state.base]); state.base = bb.dataset.b; bases[state.base].addTo(map); bases[state.base].bringToBack(); panel(); draw(recs()); }
        };
        U.$('mRound').onchange = function (e) { state.round = Number(e.target.value); draw(recs()); };
        U.$('mOther').onchange = function (e) { if (e.target.value) { state.layer = e.target.value; panel(); draw(recs()); } };
      }

      panel();
      var src = !S.user ? S.loadRecords(true) : S.isAdmin() ? S.loadRecords(true) : S.call('data.summary');
      src.then(function (records) {
        if (S.user && !S.isAdmin()) { mapRecs = records; }
        if (!S.user && S.publicEnabled === false) {
          U.$('mPanel').innerHTML = '<div class="notice info" style="margin:0">' + U.icon('lock') + '<div>แผนที่สรุปผลเปิดให้เฉพาะเจ้าหน้าที่ กรุณาเข้าสู่ระบบ</div></div>';
          U.$('mKpis').hidden = true; U.$('mLegend').hidden = true;
          geo = L.geoJSON(window.KPP_GEO, { style: { color: '#2b4a3a', weight: 1.6, fillColor: '#eef1f4', fillOpacity: .7 } }).addTo(map);
          map.fitBounds(geo.getBounds(), { padding: [20, 20] });
          return;
        }
        draw(records);
        map.fitBounds(geo.getBounds(), { paddingTopLeft: [20, 90], paddingBottomRight: [window.innerWidth > 860 ? 320 : 20, 110] });
      }).catch(function (e) { U.toast(e.message, 'err'); });
      setTimeout(function () { map.invalidateSize(); }, 60);
      return function () { map.remove(); };
    }
  };
})();
