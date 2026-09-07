/* ============================================================
   عامل الخدمة — يخزّن ملفات النظام محلياً ليعمل بدون إنترنت.
   غيّر رقم CACHE عند تحديث أي ملف حتى تصل النسخة الجديدة للأجهزة.
   ============================================================ */
const CACHE = 'stdk-pos-v12';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './data.js',
  './qr.js',
  './i18n.js',
  './sync.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png',
  './fonts/cairo.css',
  './fonts/cairo-arabic-400.woff2',
  './fonts/cairo-arabic-500.woff2',
  './fonts/cairo-arabic-600.woff2',
  './fonts/cairo-arabic-700.woff2',
  './fonts/cairo-arabic-800.woff2',
  './fonts/cairo-latin-400.woff2',
  './fonts/cairo-latin-500.woff2',
  './fonts/cairo-latin-600.woff2',
  './fonts/cairo-latin-700.woff2',
  './fonts/cairo-latin-800.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* الشبكة أولاً مع الرجوع للنسخة المخزّنة:
   يضمن وصول التحديثات فوراً، ويُبقي النظام شغالاً لو انقطع الإنترنت. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      // ignoreSearch: الأصول تحمل ?v=<رقم> لكسر تخزين المتصفح، والنسخة
      // المخزّنة محفوظة بالرابط الأساسي — فنتجاهل الاستعلام عند المطابقة.
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || caches.match('./index.html')))
  );
});
