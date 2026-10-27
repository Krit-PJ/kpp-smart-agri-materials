/**
 * LocalStore — ที่เก็บข้อมูลสำหรับ "โหมดทดลอง" (localStorage) และชุดทดสอบ (หน่วยความจำ)
 * มีเมธอดเหมือน SheetStore ใน Apps Script ทุกประการ
 */
var LocalStore = (function () {
  /* SHA-256 แบบ synchronous (สำหรับโหมดทดลองเท่านั้น) */
  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var utf8 = unescape(encodeURIComponent(ascii)), words = [], H = [], K = [], i, j;
    var isP = {}, cand = 2;
    while (H.length < 64) {
      if (!isP[cand]) {
        for (i = 0; i < 313; i += cand) isP[i] = cand;
        H.push((Math.pow(cand, .5) * 4294967296) | 0);
        K.push((Math.pow(cand, 1 / 3) * 4294967296) | 0);
      }
      cand++;
    }
    H = H.slice(0, 8);
    var bitLen = utf8.length * 8;
    utf8 += '\x80';
    while (utf8.length % 64 - 56) utf8 += '\x00';
    for (i = 0; i < utf8.length; i++) words[i >> 2] |= utf8.charCodeAt(i) << ((3 - i) % 4) * 8;
    words[words.length] = (bitLen / 4294967296) | 0;
    words[words.length] = bitLen;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), old = H.slice(0);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = H[0], e = H[4];
        var t1 = H[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & H[5]) ^ (~e & H[6])) + K[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]));
        H = [(t1 + t2) | 0].concat(H);
        H[4] = (H[4] + t1) | 0;
        H.pop();
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + old[i]) | 0;
    }
    var out = '';
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (H[i] >> (j * 8)) & 255; out += (b < 16 ? '0' : '') + b.toString(16); }
    return out;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function bkk(d) { return new Date(d.getTime() + (7 * 60 + d.getTimezoneOffset()) * 60000); }
  function fmt(d, time) {
    var b = bkk(d), s = b.getFullYear() + '-' + pad(b.getMonth() + 1) + '-' + pad(b.getDate());
    return time ? s + ' ' + pad(b.getHours()) + ':' + pad(b.getMinutes()) + ':' + pad(b.getSeconds()) : s;
  }

  function create(opts) {
    opts = opts || {};
    var key = opts.key, db = null, cache = {};
    var clock = opts.clock || function () { return new Date(); };
    function load() {
      if (db) return db;
      if (key) { try { db = JSON.parse(localStorage.getItem(key)); } catch (e) { db = null; } }
      if (!db || !db.tables) db = { tables: {}, secret: Math.random().toString(36).slice(2) + Date.now().toString(36) };
      return db;
    }
    function save() { if (key) { try { localStorage.setItem(key, JSON.stringify(db)); } catch (e) { /* เต็ม/ถูกบล็อก */ } } }
    function t(name) { var d = load(); return d.tables[name] || (d.tables[name] = []); }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    return {
      rows: function (name) { return clone(t(name)); },
      insert: function (name, obj) { t(name).push(clone(obj)); save(); },
      update: function (name, pred, patch) {
        var n = 0;
        t(name).forEach(function (r) { if (pred(r)) { for (var k in patch) r[k] = patch[k]; n++; } });
        if (n) save();
        return n;
      },
      remove: function (name, pred) {
        var a = t(name), b = a.filter(function (r) { return !pred(r); });
        load().tables[name] = b; save();
        return a.length - b.length;
      },
      now: function () { return fmt(clock(), true); },
      today: function () { return fmt(clock(), false); },
      sha256: sha256,
      hmac: function (s) { return sha256(load().secret + '|' + s); },
      uuid: function () { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
      cacheGet: function (k) { var c = cache[k]; return c && c.exp > Date.now() ? c.v : null; },
      cachePut: function (k, v, sec) { cache[k] = { v: v, exp: Date.now() + sec * 1000 }; },
      lock: function (fn) { return fn(); },
      reset: function () { db = null; if (key) { try { localStorage.removeItem(key); } catch (e) { } } },
      dump: function () { return load(); }
    };
  }
  return { create: create, sha256: sha256 };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalStore;
