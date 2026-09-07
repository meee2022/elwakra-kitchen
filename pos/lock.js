/* ============================================================
   قفل النظام برمز دخول
   ------------------------------------------------------------
   رمزان منفصلان:
     • رمز الدخول   — يُطلب عند فتح الموقع
     • رمز الإعدادات — يُطلب عند دخول شاشة الإعدادات

   الرمز نفسه لا يُخزَّن أبداً؛ يُخزَّن اشتقاق PBKDF2-SHA256
   بملح عشوائي و200 ألف دورة، فلا يُقرأ من تخزين المتصفح.

   حدود هذه الحماية — اقرأها قبل الاعتماد عليها:
   النظام يعمل كاملاً داخل المتصفح، فمن يملك الجهاز ويعرف أدوات
   المطوّر يستطيع قراءة الفواتير من قاعدة البيانات المحلية دون
   الرمز. الغرض هنا منع من يمرّ على الجهاز من التصفّح والاطلاع
   على المبيعات والتقارير — لا حماية من مهاجم تقني يملك الجهاز.
   ============================================================ */
'use strict';

const Lock = (function () {
  const ITERATIONS = 200000;
  let unlockedApp = false;
  let unlockedSettings = false;
  let pending = null;          // { resolve, kind } للنافذة المفتوحة

  /* ---------- أدوات التشفير ---------- */
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function derive(code, salt, iterations) {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
    return b64(bits);
  }

  /** يبني سجل تحقّق جديداً لرمز */
  async function makeRecord(code) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return { salt: b64(salt), hash: await derive(code, salt, ITERATIONS), iterations: ITERATIONS };
  }

  /** مقارنة بزمن ثابت حتى لا يتسرّب شيء من فروق التوقيت */
  function sameHash(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  async function verify(code, rec) {
    if (!rec) return false;
    const h = await derive(code, unb64(rec.salt), rec.iterations || ITERATIONS);
    return sameHash(h, rec.hash);
  }

  /* ---------- الحالة ---------- */
  const sec = () => (db.settings.security || (db.settings.security = { app: null, settings: null }));
  const hasApp = () => !!sec().app;
  const hasSettings = () => !!sec().settings;

  /* ---------- شاشة القفل ---------- */
  const gate = () => document.querySelector('#lockGate');

  function showGate(msg) {
    const g = gate();
    if (!g) return;
    g.hidden = false;
    document.body.classList.add('locked');
    g.querySelector('#lockError').textContent = msg || '';
    const inp = g.querySelector('#lockInput');
    inp.value = '';
    setTimeout(() => inp.focus(), 60);
  }

  function hideGate() {
    const g = gate();
    if (!g) return;
    g.hidden = true;
    document.body.classList.remove('locked');
  }

  async function tryUnlock() {
    const g = gate();
    const inp = g.querySelector('#lockInput');
    const code = inp.value;
    if (!code) return;
    g.querySelector('#lockError').textContent = t('جاري التحقق…');
    if (await verify(code, sec().app)) {
      unlockedApp = true;
      hideGate();
    } else {
      inp.value = '';
      g.querySelector('#lockError').textContent = t('رمز غير صحيح');
      inp.focus();
    }
  }

  /** يُستدعى عند الإقلاع: يقفل الشاشة إن كان هناك رمز */
  function guard() {
    if (!hasApp()) { unlockedApp = true; hideGate(); return; }
    showGate();
  }

  function lockNow() {
    if (!hasApp()) return;
    unlockedApp = false;
    unlockedSettings = false;
    showGate();
  }

  /* ---------- نافذة طلب رمز الإعدادات ---------- */
  function ask(title, err) {
    return new Promise(resolve => {
      pending = { resolve };
      const m = document.querySelector('#askModal');
      m.querySelector('#askTitle').textContent = title;
      m.querySelector('#askError').textContent = err || '';
      m.querySelector('#askInput').value = '';
      m.classList.add('open');
      setTimeout(() => m.querySelector('#askInput').focus(), 60);
    });
  }

  function askDone(value) {
    document.querySelector('#askModal').classList.remove('open');
    const p = pending; pending = null;
    if (p) p.resolve(value);
  }

  /** يتحقّق من رمز الإعدادات مرة واحدة لكل جلسة */
  async function requireSettings() {
    if (!hasSettings() || unlockedSettings) return true;
    let err = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = await ask(t('أدخل رمز الإعدادات'), err);
      if (code === null) return false;
      if (await verify(code, sec().settings)) { unlockedSettings = true; return true; }
      err = t('رمز غير صحيح');       // تُعرض مع النافذة التالية، وإلا مُسحت فوراً
    }
    toast(t('رمز غير صحيح'), 'err');
    return false;
  }

  /** يتحقّق من الرمز الحالي قبل تغييره أو إزالته */
  async function confirmCurrent(kind) {
    const rec = sec()[kind];
    if (!rec) return true;
    const code = await ask(t('أدخل الرمز الحالي للتأكيد'));
    if (code === null) return false;
    if (await verify(code, rec)) return true;
    toast(t('رمز غير صحيح'), 'err');
    return false;
  }

  async function setCode(kind, code) {
    sec()[kind] = await makeRecord(code);
    save();
    if (kind === 'app') unlockedApp = true;
    if (kind === 'settings') unlockedSettings = true;
  }

  async function clearCode(kind) {
    sec()[kind] = null;
    save();
    if (kind === 'app') unlockedApp = true;
  }

  /** يطلب رمزاً جديداً (بلا تحقّق) — يعيد null عند الإلغاء */
  const askNew = title => ask(title);

  const state = () => ({ hasApp: hasApp(), hasSettings: hasSettings(), unlockedApp, unlockedSettings });

  return { guard, tryUnlock, lockNow, requireSettings, confirmCurrent, askNew,
           setCode, clearCode, askDone, state, hasApp, hasSettings };
})();
