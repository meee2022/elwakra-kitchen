/* ============================================================
   مولّد كود QR — تنفيذ محلي كامل (بدون أي مكتبات خارجية)
   نمط البايت · مستوى تصحيح الأخطاء M · الإصدارات 1..15
   يُستخدم لطباعة كود التحقق على الفاتورة الإلكترونية.
   ============================================================ */
const QR = (function () {
  /* ---------- حقل جالوا GF(256) ---------- */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  function rsGenPoly(deg) {
    let poly = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) { next[j] ^= poly[j]; next[j + 1] ^= gmul(poly[j], EXP[i]); }
      poly = next;
    }
    return poly;
  }
  function rsEncode(data, ecLen) {
    const gen = rsGenPoly(ecLen), res = new Array(ecLen).fill(0);
    for (const b of data) {
      const factor = b ^ res[0];
      res.shift(); res.push(0);
      for (let i = 0; i < ecLen; i++) res[i] ^= gmul(gen[i + 1], factor);
    }
    return res;
  }

  /* ---------- جداول المواصفة (مستوى M) ---------- */
  // [إجمالي الكلمات، كلمات التصحيح/كتلة، كتل م1، بيانات م1، كتل م2، بيانات م2]
  const SPEC = {
    1: [26, 10, 1, 16, 0, 0], 2: [44, 16, 1, 28, 0, 0], 3: [70, 26, 1, 44, 0, 0],
    4: [100, 18, 2, 32, 0, 0], 5: [134, 24, 2, 43, 0, 0], 6: [172, 16, 4, 27, 0, 0],
    7: [196, 18, 4, 31, 0, 0], 8: [242, 22, 2, 38, 2, 39], 9: [292, 22, 3, 36, 2, 37],
    10: [346, 26, 4, 43, 1, 44], 11: [404, 30, 1, 50, 4, 51], 12: [466, 22, 6, 36, 2, 37],
    13: [532, 22, 8, 37, 1, 38], 14: [581, 24, 4, 40, 5, 41], 15: [655, 24, 5, 41, 5, 42]
  };
  const ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38],
    8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50], 11: [6, 30, 54], 12: [6, 32, 58],
    13: [6, 34, 62], 14: [6, 26, 46, 66], 15: [6, 26, 48, 70]
  };
  const remainderBits = v => (v === 1 ? 0 : v <= 6 ? 7 : v <= 13 ? 0 : 3);
  const dataCapacity = v => { const s = SPEC[v]; return s[2] * s[3] + s[4] * s[5]; };

  /* ---------- تحويل النص إلى بايتات UTF-8 ---------- */
  function utf8(str) {
    const out = [];
    for (const ch of str) {
      let c = ch.codePointAt(0);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) out.push(0xE0 | c >> 12, 0x80 | (c >> 6) & 63, 0x80 | c & 63);
      else out.push(0xF0 | c >> 18, 0x80 | (c >> 12) & 63, 0x80 | (c >> 6) & 63, 0x80 | c & 63);
    }
    return out;
  }

  /* ---------- بناء تدفق البتات ---------- */
  function buildCodewords(bytes, version) {
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(4, 4);                                   // نمط البايت
    push(bytes.length, version <= 9 ? 8 : 16);    // عدّاد الأحرف
    for (const b of bytes) push(b, 8);

    const cap = dataCapacity(version) * 8;
    for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);   // الإنهاء
    while (bits.length % 8) bits.push(0);

    const cw = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      cw.push(b);
    }
    const pads = [0xEC, 0x11];
    for (let i = 0; cw.length < dataCapacity(version); i++) cw.push(pads[i % 2]);
    return cw;
  }

  /* ---------- تقسيم الكتل + التشابك ---------- */
  function interleave(cw, version) {
    const [, ecLen, n1, d1, n2, d2] = SPEC[version];
    const dataBlocks = [], ecBlocks = [];
    let p = 0;
    for (let i = 0; i < n1; i++) { const b = cw.slice(p, p + d1); p += d1; dataBlocks.push(b); ecBlocks.push(rsEncode(b, ecLen)); }
    for (let i = 0; i < n2; i++) { const b = cw.slice(p, p + d2); p += d2; dataBlocks.push(b); ecBlocks.push(rsEncode(b, ecLen)); }

    const out = [];
    const maxD = Math.max(d1, d2);
    for (let i = 0; i < maxD; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
    for (let i = 0; i < ecLen; i++) for (const b of ecBlocks) out.push(b[i]);
    return out;
  }

  /* ---------- المصفوفة ---------- */
  function makeMatrix(version) {
    const size = version * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(null));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (r, c, v) => { m[r][c] = v; fn[r][c] = true; };

    // مربعات التموضع + الفواصل
    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const d = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        set(rr, cc, d !== 2 && d <= 3 ? 1 : 0);
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    // أنماط التوقيت
    for (let i = 8; i < size - 8; i++) { const v = i % 2 === 0 ? 1 : 0; set(6, i, v); set(i, 6, v); }

    // أنماط المحاذاة
    const al = ALIGN[version];
    for (const r of al) for (const c of al) {
      if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
        set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0);
    }

    // حجز مواضع معلومات النسق + وحدة داكنة
    for (let i = 0; i < 9; i++) { if (m[8][i] === null) set(8, i, 0); if (m[i][8] === null) set(i, 8, 0); }
    for (let i = 0; i < 8; i++) { set(8, size - 1 - i, 0); set(size - 1 - i, 8, 0); }
    set(size - 8, 8, 1);

    // معلومات الإصدار (7 فأعلى)
    if (version >= 7) {
      let d = version;
      for (let i = 0; i < 12; i++) d = (d << 1) ^ ((d >>> 11) * 0x1F25);
      const bitsV = (version << 12) | d;
      for (let i = 0; i < 18; i++) {
        const b = (bitsV >> i) & 1, r = Math.floor(i / 3), c = i % 3;
        set(size - 11 + c, r, b); set(r, size - 11 + c, b);
      }
    }
    return { m, fn, size };
  }

  function placeData(m, fn, size, cw, remBits) {
    const bits = [];
    for (const b of cw) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
    for (let i = 0; i < remBits; i++) bits.push(0);

    let idx = 0, up = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col--;                       // تخطّي عمود التوقيت
      for (let k = 0; k < size; k++) {
        const row = up ? size - 1 - k : k;
        for (let c = 0; c < 2; c++) {
          const cc = col - c;
          if (fn[row][cc]) continue;
          m[row][cc] = idx < bits.length ? bits[idx++] : 0;
        }
      }
      up = !up;
    }
  }

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
    (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0
  ];

  function applyFormat(m, size, mask) {
    // مستوى M = 00
    let d = (0 << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bitsF = ((d << 10) | rem) ^ 0x5412;
    const get = i => (bitsF >> i) & 1;
    for (let i = 0; i <= 5; i++) m[8][i] = get(i);
    m[8][7] = get(6); m[8][8] = get(7); m[7][8] = get(8);
    for (let i = 9; i < 15; i++) m[14 - i][8] = get(i);
    for (let i = 0; i < 8; i++) m[size - 1 - i][8] = get(i);
    for (let i = 8; i < 15; i++) m[8][size - 15 + i] = get(i);
    m[size - 8][8] = 1;
  }

  function penalty(m, size) {
    let p = 0;
    // القاعدة 1: خمس وحدات متتالية بنفس اللون فأكثر
    for (let i = 0; i < size; i++) {
      for (const rowMode of [true, false]) {
        let run = 1, prev = rowMode ? m[i][0] : m[0][i];
        for (let j = 1; j < size; j++) {
          const v = rowMode ? m[i][j] : m[j][i];
          if (v === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
          else { run = 1; prev = v; }
        }
      }
    }
    // القاعدة 2: كتل 2×2
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
    }
    // القاعدة 3: النمط 1:1:3:1:1
    const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], patR = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (let i = 0; i < size; i++) for (let j = 0; j <= size - 11; j++) {
      let okR = true, okC = true, okR2 = true, okC2 = true;
      for (let k = 0; k < 11; k++) {
        if (m[i][j + k] !== pat[k]) okR = false;
        if (m[i][j + k] !== patR[k]) okR2 = false;
        if (m[j + k][i] !== pat[k]) okC = false;
        if (m[j + k][i] !== patR[k]) okC2 = false;
      }
      if (okR) p += 40; if (okR2) p += 40; if (okC) p += 40; if (okC2) p += 40;
    }
    // القاعدة 4: نسبة الوحدات الداكنة
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
    const pct = dark * 100 / (size * size);
    p += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return p;
  }

  /** يبني مصفوفة QR ثنائية الأبعاد من نص. */
  function encode(text) {
    const bytes = utf8(text);
    let version = 0;
    for (let v = 1; v <= 15; v++) {
      const header = 4 + (v <= 9 ? 8 : 16);
      if (dataCapacity(v) * 8 >= header + bytes.length * 8) { version = v; break; }
    }
    if (!version) throw new Error('النص أطول من سعة كود QR المدعومة');

    const cw = interleave(buildCodewords(bytes, version), version);
    const { m, fn, size } = makeMatrix(version);
    placeData(m, fn, size, cw, remainderBits(version));

    // اختيار أفضل قناع
    let best = null, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const t = m.map(r => r.slice());
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
        if (!fn[r][c] && MASKS[mask](r, c)) t[r][c] ^= 1;
      applyFormat(t, size, mask);
      const s = penalty(t, size);
      if (s < bestScore) { bestScore = s; best = t; }
    }
    return best;
  }

  /** يرسم كود QR ويعيده كصورة PNG بصيغة data URL (صالحة للطباعة). */
  function toDataURL(text, opts = {}) {
    const scale = opts.scale || 4, quiet = opts.quiet == null ? 4 : opts.quiet;
    const m = encode(text), size = m.length, px = (size + quiet * 2) * scale;
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#000';
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
      if (m[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    return cv.toDataURL('image/png');
  }

  return { encode, toDataURL };
})();
