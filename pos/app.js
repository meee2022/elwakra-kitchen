/* ============================================================
   مطابخ الجنوب للمأكولات الشعبية — نظام نقاط البيع
   والفواتير الإلكترونية الرسمية
   ============================================================ */
'use strict';

const STORE_KEY = 'stdk_pos_v1';   // مفتاح التخزين القديم — للترحيل فقط

/* ══════════════ أدوات مساعدة ══════════════ */
const $  = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
/** يعزل الأرقام الرسمية عن اتجاه النص العربي حتى لا تنعكس عند العرض/الطباعة */
const ltr = s => `<bdi dir="ltr">${esc(s)}</bdi>`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** تقسيم المبلغ إلى ريال ودرهم (كما في الفاتورة الورقية) */
function split(v) {
  const cents = Math.round(Number(v || 0) * 100);
  return { r: Math.floor(cents / 100), d: cents % 100 };
}

const todayISO = () => new Date().toLocaleDateString('en-CA');
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/** بصمة تحقق للفاتورة — تتغيّر لو عُدّل أي رقم فيها (FNV-1a) */
function fingerprint(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).toUpperCase().padStart(7, '0').slice(0, 7);
}

/* ══════════════ تفقيط المبلغ بالحروف ══════════════ */
const _ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
  'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const _TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const _HUND = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

function _below1000(n) {
  const parts = [], h = Math.floor(n / 100), r = n % 100;
  if (h) parts.push(_HUND[h]);
  if (r < 20) { if (r) parts.push(_ONES[r]); }
  else { const u = r % 10, t = Math.floor(r / 10); if (u) parts.push(_ONES[u]); parts.push(_TENS[t]); }
  return parts.join(' و');
}
function _group(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return _below1000(n) + ' ' + few;
  return _below1000(n) + ' ' + many;
}
function numToWords(n) {
  n = Math.floor(n);
  if (n === 0) return 'صفر';
  const parts = [];
  const mil = Math.floor(n / 1000000); n %= 1000000;
  const th = Math.floor(n / 1000); n %= 1000;
  if (mil) parts.push(_group(mil, 'مليون', 'مليونان', 'ملايين', 'مليوناً'));
  if (th) parts.push(_group(th, 'ألف', 'ألفان', 'آلاف', 'ألفاً'));
  if (n) parts.push(_below1000(n));
  return parts.join(' و');
}
function tafqeet(total) {
  const { r, d } = split(total);
  if (!r && !d) return 'فقط صفر ريال قطري لا غير';
  if (!r) return 'فقط ' + numToWords(d) + ' درهماً لا غير';
  let s = 'فقط ' + numToWords(r) + ' ريال قطري';
  if (d) s += ' و' + numToWords(d) + ' درهماً';
  return s + ' لا غير';
}

/* ══════════════ التخزين ══════════════ */
/* قاعدة بيانات محلية (IndexedDB) بدل localStorage: لا سقف عملي للحجم،
   وتتحمّل آلاف الفواتير مع الشعار. يبقى localStorage كخطة بديلة فقط. */
const IDB_NAME = 'stdk_pos', IDB_STORE = 'state', SNAP_KEEP = 7;
let idb = null;
let db = null;

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(IDB_STORE)) d.createObjectStore(IDB_STORE);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbReq(mode, fn) {
  return new Promise((res, rej) => {
    if (!idb) return rej(new Error('no idb'));
    const tx = idb.transaction(IDB_STORE, mode);
    const rq = fn(tx.objectStore(IDB_STORE));
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
const idbGet = k => idbReq('readonly', st => st.get(k));
const idbPut = (k, v) => idbReq('readwrite', st => st.put(v, k));
const idbKeys = () => idbReq('readonly', st => st.getAllKeys());
const idbDel = k => idbReq('readwrite', st => st.delete(k));

function seed() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    products: DEFAULT_PRODUCTS.map(p => ({ id: uid(), active: 1, ...p })),
    invoices: [],
    lastBackup: null
  };
}
function normalize() {
  db.settings = { ...DEFAULT_SETTINGS, ...db.settings };
  if (!Array.isArray(db.products) || !db.products.length) db.products = seed().products;
  if (!Array.isArray(db.invoices)) db.invoices = [];
}

async function load() {
  try { idb = await idbOpen(); } catch (e) { idb = null; }

  let raw = null;
  if (idb) { try { raw = await idbGet('main'); } catch (e) { raw = null; } }

  let migrated = false;
  if (!raw) {                       // ترحيل بيانات النسخة القديمة مرة واحدة
    raw = localStorage.getItem(STORE_KEY);
    migrated = !!raw;
  }

  try { db = raw ? JSON.parse(raw) : seed(); }
  catch (e) { db = seed(); }
  normalize();

  if (migrated) { await flush(); toast('تم نقل بياناتك إلى قاعدة البيانات المحلية', 'ok'); }
  await dailySnapshot();
}

/** لقطة يومية داخل قاعدة البيانات — حماية من الخطأ البشري، لا تغني عن النسخة الاحتياطية */
async function dailySnapshot() {
  if (!idb || !db.invoices.length) return;
  const key = 'snap:' + todayISO();
  try {
    if (await idbGet(key)) return;
    await idbPut(key, JSON.stringify(db));
    const snaps = (await idbKeys()).filter(k => String(k).startsWith('snap:')).sort();
    for (const old of snaps.slice(0, Math.max(0, snaps.length - SNAP_KEEP))) await idbDel(old);
  } catch (e) { /* اللقطات إضافية — لا توقف التشغيل */ }
}

async function flush() {
  const json = JSON.stringify(db);
  if (idb) {
    try { await idbPut('main', json); return; } catch (e) { /* نجرّب البديل */ }
  }
  try { localStorage.setItem(STORE_KEY, json); }
  catch (e) { toast('تعذّر حفظ البيانات — اعمل نسخة احتياطية فوراً وأعد تشغيل المتصفح.', 'err'); }
}
function save() { flush(); }

/* ══════════════ التنقّل بين الشاشات ══════════════ */
const pageCopy = {
  pos: ['نقطة البيع', 'اختَر الأصناف، راجع الطلب، وأصدر الفاتورة.'],
  invoices: ['الفواتير', 'راجع الفواتير الصادرة وتابع التحصيل من مكان واحد.'],
  products: ['الأصناف والأسعار', 'نظّم قائمة المطعم وحدّث الأسعار وتوافر الأصناف.'],
  reports: ['تقارير المبيعات', 'تابع أداء المبيعات والأصناف الأكثر طلبًا خلال الفترة.'],
  settings: ['الإعدادات', 'بيانات المنشأة، الطباعة، والنسخ الاحتياطي والمزامنة.']
};
$('#nav button.active').setAttribute('aria-current', 'page');
$('#nav').addEventListener('click', e => {
  const b = e.target.closest('button[data-page]');
  if (!b) return;
  $$('#nav button').forEach(x => x.classList.toggle('active', x === b));
  $$('#nav button').forEach(x => x === b ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'));
  const copy = pageCopy[b.dataset.page];
  $('#pageTitle').textContent = copy[0];
  $('#pageDescription').textContent = copy[1];
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + b.dataset.page));
  ({ invoices: renderInvoices, products: renderProducts, reports: renderReports, settings: fillSettings }[b.dataset.page] || (() => {}))();
});

/* ══════════════ نقطة البيع ══════════════ */
let cart = [];
let activeCat = 'meals';

function renderCatTabs() {
  $('#catTabs').innerHTML = CATEGORIES
    .map(c => `<button data-cat="${c.key}" aria-pressed="${c.key === activeCat}" class="${c.key === activeCat ? 'active' : ''}">${c.label}</button>`).join('');
}
$('#catTabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-cat]');
  if (!b) return;
  activeCat = b.dataset.cat;
  renderCatTabs(); renderProdGrid();
});
$('#prodSearch').addEventListener('input', renderProdGrid);

function renderProdGrid() {
  const q = $('#prodSearch').value.trim().toLowerCase();
  const list = db.products.filter(p =>
    p.active &&
    (q ? (p.ar.toLowerCase().includes(q) || (p.en || '').toLowerCase().includes(q)) : p.cat === activeCat)
  );
  $('#productCount').textContent = `${list.length} صنف`;
  $('#prodGrid').innerHTML = list.length ? list.map(p => `
    <button class="prod" data-id="${p.id}" aria-label="إضافة ${esc(p.ar)}، ${money(p.price)} ريال">
      <div class="product-meta"><span>${esc(CATEGORIES.find(c => c.key === p.cat)?.label || '')}</span><span class="product-add" aria-hidden="true">+</span></div>
      <div>
        <div class="p-ar">${esc(p.ar)}</div>
        ${p.en ? `<div class="p-en">${esc(p.en)}</div>` : ''}
      </div>
      <div class="p-foot">
        <span class="p-price">${money(p.price)}<span>ر.ق</span></span>
        ${p.weight ? `<span class="p-wt">${p.weight} جم</span>` : ''}
      </div>
    </button>`).join('')
    : `<div class="empty search-empty"><strong>لا توجد أصناف مطابقة</strong><span>جرّب اسمًا آخر أو امسح البحث لعرض القسم.</span></div>`;
}
$('#prodGrid').addEventListener('click', e => {
  const b = e.target.closest('.prod');
  if (b) addToCart(b.dataset.id);
});

function addToCart(id) {
  const p = db.products.find(x => x.id === id);
  if (!p) return;
  const line = cart.find(l => l.id === id);
  if (line) line.qty++;
  else cart.push({ id, ar: p.ar, en: p.en || '', price: Number(p.price) || 0, qty: 1 });
  renderCart();
}

function renderCart() {
  $('#cartCount').textContent = cart.reduce((n, item) => n + item.qty, 0);
  const box = $('#cartItems');
  if (!cart.length) { box.innerHTML = `<div class="empty cart-empty"><span class="empty-receipt" aria-hidden="true">≡</span><strong>ابدأ طلبًا جديدًا</strong><span>اختَر صنفًا من القائمة لإضافته هنا.</span></div>`; }
  else {
    box.innerHTML = cart.map((l, i) => `
      <div class="ci">
        <div>
          <div class="ci-name">${esc(l.ar)}</div>
          ${l.en ? `<div class="ci-en">${esc(l.en)}</div>` : ''}
          <div class="ci-ctl" style="margin-top:5px">
            <button class="qtybtn" aria-label="تقليل كمية ${esc(l.ar)}" data-act="dec" data-i="${i}">−</button>
            <input class="qty" aria-label="كمية ${esc(l.ar)}" type="number" min="1" step="1" value="${l.qty}" data-act="qty" data-i="${i}">
            <button class="qtybtn" aria-label="زيادة كمية ${esc(l.ar)}" data-act="inc" data-i="${i}">+</button>
            <span class="muted" style="font-size:11px">×</span>
            <input class="pr" aria-label="سعر ${esc(l.ar)}" type="number" min="0" step="0.25" value="${l.price}" data-act="price" data-i="${i}">
          </div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; justify-content:space-between">
          <button class="rm" data-act="rm" data-i="${i}" title="حذف">&times;</button>
          <div class="ci-total">${money(l.qty * l.price)}</div>
        </div>
      </div>`).join('');
  }
  updateTotals();
}
$('#cartItems').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const i = +b.dataset.i;
  if (b.dataset.act === 'inc') cart[i].qty++;
  else if (b.dataset.act === 'dec') { cart[i].qty--; if (cart[i].qty < 1) cart.splice(i, 1); }
  else if (b.dataset.act === 'rm') cart.splice(i, 1);
  else return;
  renderCart();
});
$('#cartItems').addEventListener('change', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const i = +b.dataset.i;
  if (b.dataset.act === 'qty') { cart[i].qty = Math.max(1, Math.floor(+b.value || 1)); }
  else if (b.dataset.act === 'price') { cart[i].price = Math.max(0, +b.value || 0); }
  renderCart();
});
['#discount', '#delivery'].forEach(s => $(s).addEventListener('input', updateTotals));

function currentTotals() {
  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const discount = Math.max(0, +$('#discount').value || 0);
  const delivery = Math.max(0, +$('#delivery').value || 0);
  const base = Math.max(0, subtotal - discount) + delivery;
  const vatRate = db.settings.vatEnabled ? (+db.settings.vatRate || 0) : 0;
  const vat = base * vatRate / 100;
  return { subtotal, discount, delivery, vatRate, vat, total: base + vat };
}
function updateTotals() {
  const t = currentTotals();
  $('#tSub').textContent = money(t.subtotal);
  $('#tDisc').textContent = money(t.discount);
  $('#tDel').textContent = money(t.delivery);
  // سطرا الخصم والتوصيل يظهران عند وجود قيمة فقط — أقل تشويشاً ومساحة أوفر
  $('#rowDisc').hidden = !(t.discount > 0);
  $('#rowDel').hidden = !(t.delivery > 0);
  $('#tGrand').textContent = money(t.total) + ' ر.ق';
  $('#btnSave').disabled = $('#btnSaveOnly').disabled = !cart.length;
}

function clearCart() {
  cart = [];
  ['#cName', '#cPhone', '#invNote'].forEach(s => $(s).value = '');
  $('#discount').value = $('#delivery').value = 0;
  $('#payType').value = 'cash';
  $('#invDate').value = todayISO();
  renderCart();
  $('#nextNoLabel').textContent = 'رقم الفاتورة القادم: ' + db.settings.nextInvoiceNo;
}
$('#btnClear').addEventListener('click', () => { if (!cart.length || confirm('إفراغ الفاتورة الحالية؟')) clearCart(); });

function saveInvoice(print) {
  if (!cart.length) return;
  const t = currentTotals();
  const s = db.settings;
  const now = new Date();
  const inv = {
    no: s.nextInvoiceNo,
    date: $('#invDate').value || todayISO(),
    time: now.toTimeString().slice(0, 5),
    createdAt: now.toISOString(),
    customer: $('#cName').value.trim(),
    phone: $('#cPhone').value.trim(),
    type: $('#payType').value,
    paid: $('#payType').value === 'cash',
    paidAt: $('#payType').value === 'cash' ? now.toISOString() : null,
    items: cart.map(l => ({ ar: l.ar, en: l.en, qty: l.qty, price: l.price })),
    ...t,
    note: $('#invNote').value.trim(),
    status: 'active',
    // لقطة من بيانات المنشأة وقت الإصدار — تبقى ثابتة في السجل الرسمي
    org: {
      nameAr: s.nameAr, nameEn: s.nameEn, crNumber: s.crNumber, entityNumber: s.entityNumber,
      taxNumber: s.taxNumber, ownerName: s.ownerName, activity: s.activity, tel: s.tel, mobile: s.mobile,
      poBox: s.poBox, city: s.city, cityEn: s.cityEn
    }
  };
  inv.uid = `STDK-${(s.crNumber || '').replace(/\D/g, '')}-${inv.no}-${inv.date.replace(/-/g, '')}`;
  inv.hash = fingerprint([inv.uid, inv.date, inv.time, money(inv.total), inv.items.length,
    inv.items.map(i => i.ar + i.qty + i.price).join('|')].join('~'));

  Sync.mark(inv);
  db.invoices.unshift(inv);
  db.settings.nextInvoiceNo = inv.no + 1;
  save();
  Sync.run(false);
  clearCart();
  toast(`تم حفظ الفاتورة رقم ${inv.no} — ${money(inv.total)} ر.ق`, 'ok');
  if (print) printInvoice(inv);
}
$('#btnSave').addEventListener('click', () => saveInvoice(true));
$('#btnSaveOnly').addEventListener('click', () => saveInvoice(false));

/* ══════════════ بناء الفاتورة الإلكترونية ══════════════ */
const _qrCache = new Map();
/** كود QR للفاتورة — يُحسب مرة واحدة ويُعاد استخدامه عند إعادة الطباعة */
function qrFor(inv, scale) {
  const key = inv.uid + '|' + scale;
  if (!_qrCache.has(key)) {
    try { _qrCache.set(key, QR.toDataURL(qrPayload(inv), { scale, quiet: 2 })); }
    catch (e) { _qrCache.set(key, ''); }
  }
  return _qrCache.get(key);
}

function qrPayload(inv) {
  const o = inv.org || db.settings;
  return [
    o.nameAr,
    o.nameEn,
    'CR: ' + (o.crNumber || '-'),
    'TAX: ' + (o.taxNumber || '-'),
    'INV: ' + inv.no,
    'DATE: ' + inv.date + ' ' + inv.time,
    'TOTAL: ' + money(inv.total) + ' QAR',
    'UID: ' + inv.uid,
    'HASH: ' + inv.hash
  ].join('\n');
}

/* شعار المطبخ — يُرسم متجهياً ليطبع بوضوح بأي مقاس.
   لو رفع صاحب المطعم شعاره من الإعدادات يُستخدم بدلاً منه. */
const LOGO_SVG = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="STDK">
  <circle cx="60" cy="60" r="58" fill="#2E2521"/>
  <circle cx="60" cy="60" r="51" fill="none" stroke="#B9A79D" stroke-width="1.6"/>
  <text x="60" y="72" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif"
        font-size="34" font-weight="400" letter-spacing="2" fill="#FFFFFF">STDK</text>
</svg>`;
const logoMarkup = () => db.settings.logo
  ? `<img src="${db.settings.logo}" alt="">`
  : LOGO_SVG;

function invoiceHTML(inv, opts = {}) {
  const o = inv.org || db.settings;
  const thermal = (opts.size || db.settings.printSize) === 'thermal';
  const qrImg = qrFor(inv, thermal ? 2 : 3);

  const rows = inv.items.map((it, i) => {
    const up = split(it.price), am = split(it.qty * it.price);
    return `<tr>
      <td class="c">${i + 1}</td>
      <td class="d">${esc(it.ar)}${it.en ? `<span class="en">${esc(it.en)}</span>` : ''}</td>
      <td class="c">${it.qty}</td>
      <td class="c">${up.r}</td><td class="c sep">${String(up.d).padStart(2, '0')}</td>
      <td class="c">${am.r}</td><td class="c sep">${String(am.d).padStart(2, '0')}</td>
    </tr>`;
  }).join('');

  const sumRow = (label, val, cls = 'sum') => {
    const v = split(val);
    return `<tr class="${cls}"><td colspan="5" class="lbl">${label}</td>
      <td class="c">${v.r}</td><td class="c sep">${String(v.d).padStart(2, '0')}</td></tr>`;
  };
  const extras = [
    inv.discount > 0 ? sumRow('الخصم (Discount)', -inv.discount) : '',
    inv.delivery > 0 ? sumRow('التوصيل (Delivery)', inv.delivery) : '',
    inv.vat > 0 ? sumRow(`ضريبة القيمة المضافة ${inv.vatRate}% (VAT)`, inv.vat) : ''
  ].join('');

  const qty = inv.items.reduce((n, it) => n + it.qty, 0);

  return `
<div class="inv-wrap">
  ${inv.status === 'void' ? '<div class="inv-void">ملغاة / VOID</div>' : ''}
  <div class="inv ${thermal ? 'thermal' : ''}">

    <div class="inv-top">
      <div class="inv-logo">${logoMarkup()}</div>
      <div class="inv-title">
        <div class="ar">${esc(o.nameAr)}</div>
        <div class="en">${esc(o.nameEn)}</div>
        ${db.settings.sloganAr ? `<div class="sl">${esc(db.settings.sloganAr)}</div>` : ''}
      </div>
      <div class="inv-badge">
        <div class="lab">رقم الفاتورة / Invoice No.</div>
        <div class="no">${inv.no}</div>
      </div>
    </div>

    <div class="inv-strip">
      <div><i>النوع</i>فاتورة ${inv.type === 'cash' ? 'نقداً' : 'على الحساب'} — إلكترونية</div>
      <div><i>التاريخ</i>${ltr(fmtDate(inv.date))}</div>
      <div><i>الوقت</i>${ltr(inv.time)}</div>
    </div>

    <div class="inv-strip">
      <div><i>السجل التجاري</i>${ltr(o.crNumber)}</div>
      <div><i>رقم قيد المنشأة</i>${ltr(o.entityNumber)}</div>
      <div><i>التسجيل الضريبي</i>${ltr(o.taxNumber)}</div>
    </div>

    <div class="inv-cust">
      <span><b>السيد / السادة</b> ${esc(inv.customer) || '—'}</span>
      ${inv.phone ? `<span><b>الجوال</b> ${ltr(inv.phone)}</span>` : ''}
      ${inv.note ? `<span><b>ملاحظات</b> ${esc(inv.note)}</span>` : ''}
    </div>

    <table class="inv-t">
      <thead>
        <tr>
          <th rowspan="2" style="width:6%">م</th>
          <th rowspan="2">التفاصيل<small>DESCRIPTION</small></th>
          <th rowspan="2" style="width:9%">الكمية<small>Qty.</small></th>
          <th colspan="2" style="width:20%">سعر الوحدة<small>Unit Price</small></th>
          <th colspan="2" style="width:20%">المبلغ<small>Amount</small></th>
        </tr>
        <tr>
          <th>ريال<small>QRs.</small></th><th class="sep">درهم<small>Dhs.</small></th>
          <th>ريال<small>QRs.</small></th><th class="sep">درهم<small>Dhs.</small></th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${sumRow(`المجموع (Subtotal) — عدد الوحدات: ${qty}`, inv.subtotal)}
        ${extras}
        ${sumRow('الإجمالي المستحق (TOTAL)', inv.total, 'total')}
      </tbody>
    </table>

    ${db.settings.showTafqeet ? `<div class="inv-tafqeet">${tafqeet(inv.total)}</div>` : ''}

    <div class="inv-bottom">
      <div class="inv-verify">
        ${qrImg ? `<img src="${qrImg}" alt="">` : ''}
        <div class="vt">
          <div><b>التحقق من الفاتورة</b></div>
          <div>معرّف الفاتورة: <code>${ltr(inv.uid)}</code></div>
          <div>بصمة التحقق: <code>${ltr(inv.hash)}</code></div>
        </div>
      </div>
      <div class="inv-signs">
        <div>المحاسب — Accountant</div>
        <div>توقيع المستلم — Receiver's Signature</div>
      </div>
    </div>

    <div class="inv-foot">
      <div><b>تليفون (Tel):</b> ${ltr(o.tel)} &nbsp;·&nbsp; <b>جوال (Mob):</b> ${ltr(o.mobile)}
        &nbsp;·&nbsp; <b>ص.ب (P.O.Box):</b> ${ltr(o.poBox)} — ${esc(o.city)} / ${esc(o.cityEn)}</div>
      <div class="l2">فاتورة إلكترونية صادرة آلياً من نظام نقاط البيع — معتمدة بدون توقيع أو ختم.
        This is a computer-generated electronic invoice.</div>
    </div>
  </div>
</div>`;
}

/* ══════════════ الطباعة والتصدير ══════════════ */
/** يطبع داخل إطار معزول يحتوي المستند وحده — أسرع بكثير من طباعة صفحة التطبيق
    كاملة، ويمنع تسرّب تنسيقات الواجهة إلى الورق. */
function printDoc(bodyHTML, css, pageRule) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0';
  document.body.appendChild(f);

  const d = f.contentDocument;
  d.open();
  d.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>
    *{box-sizing:border-box} body{margin:0;background:#fff;
      font-family:"Segoe UI",Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{${pageRule}}
    ${css}</style></head><body>${bodyHTML}</body></html>`);
  d.close();

  const cleanup = () => setTimeout(() => f.remove(), 800);
  const go = () => {
    f.contentWindow.addEventListener('afterprint', cleanup, { once: true });
    f.contentWindow.focus();
    f.contentWindow.print();
    setTimeout(cleanup, 60000);   // شبكة أمان لو لم يصل حدث انتهاء الطباعة
  };

  // ننتظر تحميل الصور (الشعار وكود QR) وإلا خرجت الفاتورة بدونها
  const imgs = [...d.images];
  Promise.all(imgs.map(i => i.complete ? null :
    new Promise(r => { i.onload = i.onerror = r; }))).then(() => setTimeout(go, 20));
}

function printInvoice(inv) {
  const thermal = db.settings.printSize === 'thermal';
  printDoc(invoiceHTML(inv), INVOICE_CSS,
    thermal ? 'size:72mm auto;margin:2mm' : 'size:A5;margin:6mm 7mm');
}

/* تنسيقات الفاتورة مضمّنة نصياً — عشان الملف المصدَّر يفتح على أي جهاز
   بدون الحاجة لملف app.css، ولأن المتصفح يمنع قراءة قواعد CSS من ملف محلي. */
/* الخط مضمّن نصياً أيضاً لأن الطباعة تجري في إطار معزول لا يرث تنسيقات الصفحة */
const PRINT_FONT = `@import url('fonts/cairo.css');`;

const INVOICE_CSS = PRINT_FONT + `
.inv{width:148mm;padding:7mm 8mm;background:#fff;color:#151515;margin:0 auto;
     font-family:'Cairo',"Segoe UI",Tahoma,Arial,sans-serif;font-size:9.5pt}
.inv-wrap{position:relative}

.inv-top{display:flex;align-items:center;gap:7px;border-bottom:2.5px solid #8B2231;padding-bottom:5px}
.inv-logo{width:17mm;height:17mm;flex:none}
.inv-logo svg,.inv-logo img{width:100%;height:100%;object-fit:contain;display:block}
.inv-title{flex:1;text-align:center;min-width:0}
.inv-title .ar{font-size:14.5pt;font-weight:800;line-height:1.2;white-space:nowrap}
.inv-title .en{font-size:9pt;font-weight:700;letter-spacing:.4px;color:#333;white-space:nowrap}
.inv-title .sl{font-size:8pt;color:#8B2231;font-weight:700;margin-top:1px}
.inv-badge{flex:none;text-align:center;border:1.5px solid #8B2231;border-radius:4px;padding:2px 6px;min-width:24mm}
.inv-badge .lab{font-size:6.5pt;color:#8B2231;font-weight:700;line-height:1.3}
.inv-badge .no{font-size:17pt;font-weight:800;color:#C00;line-height:1.15;direction:ltr}

.inv-strip{display:flex;border:1px solid #c4c4c4;border-radius:3px;overflow:hidden;margin-top:4px}
.inv-strip div{flex:1;padding:2px 6px;font-size:8.5pt;border-left:1px solid #dcdcdc;min-width:0}
.inv-strip div:last-child{border-left:0}
.inv-strip i{font-style:normal;color:#777;font-weight:700;font-size:7pt;display:block;line-height:1.3}

.inv-cust{border:1px solid #c4c4c4;border-radius:3px;padding:3px 7px;font-size:9.5pt;
          display:flex;gap:18px;flex-wrap:wrap;margin:4px 0}
.inv-cust b{color:#777;font-weight:700;font-size:7.5pt;display:block;line-height:1.3}

table.inv-t{width:100%;border-collapse:collapse;border:1.2px solid #555;margin-top:2px}
table.inv-t th,table.inv-t td{border:1px solid #b8b8b8;padding:2.5px 5px;font-size:10pt}
table.inv-t th{background:#F2E8E6;text-align:center;font-size:8pt;line-height:1.15;font-weight:700;color:#5A1720;border-color:#9a8c88}
table.inv-t th small{display:block;font-weight:400;font-size:7pt;color:#8a6a70}
table.inv-t td.d{text-align:right;line-height:1.3}
table.inv-t td.c{text-align:center;direction:ltr}
table.inv-t td.sep,table.inv-t th.sep{border-left-width:1.2px;border-left-color:#555}
table.inv-t td .en{font-size:7.5pt;color:#666;direction:ltr;float:left;padding-top:1px}
table.inv-t td.lbl{text-align:left;font-weight:700}
table.inv-t tr.sum td{background:#f6f6f6;font-size:10pt;font-weight:700}
table.inv-t tr.total td{background:#E9DDDA;font-size:12pt;font-weight:800;color:#5A1720;border-color:#555}

.inv-tafqeet{font-size:9.5pt;margin-top:4px;border:1px solid #555;border-radius:3px;padding:3px 7px;font-weight:700;background:#fafafa}

.inv-bottom{display:flex;gap:10px;align-items:stretch;margin-top:7px;min-width:0}
.inv-verify{flex:0 1 auto;min-width:0;display:flex;gap:6px;align-items:center;border:1px dashed #999;border-radius:3px;padding:4px 6px}
.inv-verify img{width:19mm;height:19mm;display:block}
.inv-verify .vt{font-size:6.8pt;line-height:1.75}
.inv-verify code{font-family:Consolas,monospace;font-size:6.8pt;word-break:break-all}
.inv-signs{flex:1 1 0;min-width:0;display:flex;gap:12px;align-items:flex-end}
.inv-signs div{flex:1;min-width:0;border-top:1px dotted #444;padding-top:2px;text-align:center;font-size:8pt;line-height:1.35}

.inv-foot{margin-top:7px;border-top:1.5px solid #8B2231;padding-top:3px;text-align:center;font-size:8pt;line-height:1.6}
.inv-foot b{color:#666}
.inv-foot .l2{font-size:7pt;color:#666}
.inv-void{position:absolute;inset:0;display:grid;place-items:center;font-size:46pt;
          color:rgba(190,0,0,.15);font-weight:800;transform:rotate(-18deg);pointer-events:none;z-index:2}

/* رول حراري 80 مم */
.inv.thermal{width:72mm;padding:3mm 2mm;font-size:8pt}
.inv.thermal .inv-top{flex-direction:column;gap:3px;text-align:center}
.inv.thermal .inv-logo{width:14mm;height:14mm}
.inv.thermal .inv-title .ar{font-size:11pt;white-space:normal}
.inv.thermal .inv-title .en{font-size:7.5pt}
.inv.thermal .inv-badge{min-width:0;padding:1px 6px}
.inv.thermal .inv-badge .no{font-size:12pt}
.inv.thermal .inv-strip{flex-direction:column}
.inv.thermal .inv-strip div{border-left:0;border-bottom:1px solid #dcdcdc}
.inv.thermal .inv-cust{flex-direction:column;gap:2px}
.inv.thermal table.inv-t th,.inv.thermal table.inv-t td{font-size:7.5pt;padding:1.5px 2px}
.inv.thermal table.inv-t tr.total td{font-size:9pt}
.inv.thermal .inv-tafqeet{font-size:7.5pt}
.inv.thermal .inv-signs{display:none}
.inv.thermal .inv-bottom{justify-content:center}
.inv.thermal .inv-verify img{width:16mm;height:16mm}
.inv.thermal .inv-foot{font-size:6.5pt}
`;

const REPORT_CSS = PRINT_FONT + `
.reg{width:100%;background:#fff;color:#000;font-family:'Cairo',"Segoe UI",Tahoma,sans-serif}
.reg h2{text-align:center;font-size:15pt;margin-bottom:2px}
.reg .rsub{text-align:center;font-size:9.5pt;margin-bottom:8px}
.reg .rorg{border:1px solid #000;padding:5px 8px;font-size:9pt;display:grid;
  grid-template-columns:repeat(3,1fr);gap:2px 12px;margin-bottom:8px}
.reg table{width:100%;border-collapse:collapse}
.reg th,.reg td{border:1px solid #333;padding:3px 5px;font-size:8.5pt;text-align:center}
.reg th{background:#eee;font-weight:700}
.reg td.d{text-align:right}
.reg tfoot td{font-weight:800;background:#f2f2f2;font-size:10pt}
.reg tbody tr:nth-child(even) td{background:#fafafa}
.reg .rfoot{margin-top:10px;font-size:8.5pt;display:flex;justify-content:space-between}
.reg .rh{font-size:11pt;margin:12px 0 4px;padding-bottom:2px;border-bottom:1.5px solid #8B2231;color:#5A1720}
.reg .rboxes{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:6px}
.reg .rbox{border:1px solid #999;border-radius:4px;padding:4px 6px;text-align:center}
.reg .rbox .l{font-size:7.5pt;color:#555;font-weight:700}
.reg .rbox .v{font-size:12pt;font-weight:800;line-height:1.2}
.reg .rbox .s{font-size:7pt;color:#666;min-height:9pt}
.reg .rnote{font-size:8pt;color:#555;margin-top:3px;line-height:1.5}
.reg thead{display:table-header-group}
.reg tr{break-inside:avoid}
`;

/* مصدر واحد للتنسيق: يُحقن في الصفحة ويُستخدم نصياً في إطار الطباعة والملف المصدَّر */
document.head.insertAdjacentHTML('beforeend', `<style>${INVOICE_CSS}${REPORT_CSS}</style>`);


/** ملف HTML مستقل قابل للأرشفة والإرسال بالإيميل — نسخة إلكترونية من الفاتورة */
function downloadInvoiceFile(inv) {
  const doc = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>فاتورة ${inv.no} — ${esc((inv.org || db.settings).nameAr)}</title>
<style>
body{background:#eee;margin:0;padding:18px;font-family:'Cairo',"Segoe UI",Tahoma,sans-serif}
.inv{box-shadow:0 2px 12px rgba(0,0,0,.15)}
${INVOICE_CSS}
@media print{body{background:#fff;padding:0}.inv{box-shadow:none}@page{size:A5;margin:0}}
</style></head><body>${invoiceHTML(inv, { size: 'a5' })}</body></html>`;
  downloadBlob(doc, `فاتورة-${inv.no}.html`, 'text/html;charset=utf-8');
}
function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ══════════════ شاشة الفواتير ══════════════ */
function filteredInvoices() {
  const q = $('#invSearch').value.trim().toLowerCase();
  const f = $('#invFilter').value, from = $('#invFrom').value, to = $('#invTo').value;
  return db.invoices.filter(v => {
    if (q && !(String(v.no).includes(q) || (v.customer || '').toLowerCase().includes(q) || (v.phone || '').includes(q))) return false;
    if (from && v.date < from) return false;
    if (to && v.date > to) return false;
    if (f === 'cash') return v.status === 'active' && v.type === 'cash';
    if (f === 'credit') return v.status === 'active' && v.type === 'credit' && !v.paid;
    if (f === 'paid') return v.status === 'active' && v.type === 'credit' && v.paid;
    if (f === 'void') return v.status === 'void';
    return true;
  });
}

function renderInvoices() {
  const list = filteredInvoices();
  const today = todayISO();
  const act = db.invoices.filter(v => v.status === 'active');
  const tSales = act.filter(v => v.date === today);
  const unpaid = act.filter(v => v.type === 'credit' && !v.paid);

  $('#invStats').innerHTML = `
    ${stat('مبيعات اليوم', money(tSales.reduce((s, v) => s + v.total, 0)) + ' ر.ق', tSales.length + ' فاتورة', 'g')}
    ${stat('نقداً اليوم', money(tSales.filter(v => v.type === 'cash').reduce((s, v) => s + v.total, 0)) + ' ر.ق', '', '')}
    ${stat('مستحقات آجلة', money(unpaid.reduce((s, v) => s + v.total, 0)) + ' ر.ق', unpaid.length + ' فاتورة غير محصّلة', 'w')}
    ${stat('إجمالي الفواتير', act.length, 'منذ بداية التشغيل', 'd')}`;

  $('#invBody').innerHTML = list.length ? list.map(v => `
    <tr>
      <td class="num"><b>${v.no}</b></td>
      <td class="num">${fmtDate(v.date)}</td>
      <td class="num">${v.time}</td>
      <td>${esc(v.customer) || '<span class="muted">—</span>'}${v.phone ? `<div class="muted" style="font-size:11.5px">${esc(v.phone)}</div>` : ''}</td>
      <td class="num">${v.items.length}</td>
      <td class="num"><b>${money(v.total)}</b></td>
      <td>${statusBadge(v)}</td>
      <td class="acts">
        <button class="btn btn-sm" data-v="${v.no}" data-a="view">عرض</button>
        <button class="btn btn-sm" data-v="${v.no}" data-a="print">طباعة</button>
        ${v.status === 'active' && v.type === 'credit' && !v.paid ? `<button class="btn btn-sm" data-v="${v.no}" data-a="pay">تحصيل</button>` : ''}
        ${v.status === 'active' ? `<button class="btn btn-sm btn-danger" data-v="${v.no}" data-a="void">إلغاء</button>` : ''}
      </td>
    </tr>`).join('')
    : `<tr><td colspan="8"><div class="empty">لا توجد فواتير مطابقة</div></td></tr>`;

  $('#invCount').textContent = `${list.length} فاتورة · إجمالي ${money(list.filter(v => v.status === 'active').reduce((s, v) => s + v.total, 0))} ر.ق`;
}
const stat = (lbl, val, sm, cls) => `<div class="stat ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sm">${sm || '&nbsp;'}</div></div>`;
function statusBadge(v) {
  if (v.status === 'void') return '<span class="badge b-void">ملغاة</span>';
  if (v.type === 'cash') return '<span class="badge b-cash">نقداً</span>';
  return v.paid ? '<span class="badge b-paid">آجل — محصّل</span>' : '<span class="badge b-credit">على الحساب</span>';
}

['#invSearch', '#invFilter', '#invFrom', '#invTo'].forEach(s => $(s).addEventListener('input', renderInvoices));
$('#btnInvReset').addEventListener('click', () => {
  $('#invSearch').value = ''; $('#invFilter').value = 'all'; $('#invFrom').value = $('#invTo').value = '';
  renderInvoices();
});

$('#invBody').addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const inv = db.invoices.find(v => v.no === +b.dataset.v);
  if (!inv) return;
  const a = b.dataset.a;
  if (a === 'view') openInvoice(inv);
  else if (a === 'print') printInvoice(inv);
  else if (a === 'pay') {
    inv.paid = true; inv.paidAt = new Date().toISOString();
    Sync.mark(inv); save(); Sync.run(false);
    renderInvoices(); toast(`تم تحصيل الفاتورة ${inv.no}`, 'ok');
  } else if (a === 'void') {
    const reason = prompt(`سبب إلغاء الفاتورة رقم ${inv.no}؟\n(الفاتورة تبقى محفوظة في السجل كملغاة ولا تُحذف)`);
    if (reason === null) return;
    inv.status = 'void'; inv.voidReason = reason.trim(); inv.voidedAt = new Date().toISOString();
    Sync.mark(inv); save(); Sync.run(false);
    renderInvoices(); toast(`تم إلغاء الفاتورة ${inv.no}`);
  }
});

let viewing = null;
function openInvoice(inv) {
  viewing = inv;
  $('#vmTitle').textContent = `فاتورة رقم ${inv.no} — ${fmtDate(inv.date)}`;
  $('#vmBody').innerHTML = invoiceHTML(inv, { size: 'a5' });
  $('#viewModal').classList.add('open');
}
$('#vmPrint').addEventListener('click', () => viewing && printInvoice(viewing));
$('#vmPdf').addEventListener('click', () => {
  if (!viewing) return;
  toast('في نافذة الطباعة اختر الوجهة: "حفظ كـ PDF" أو "Microsoft Print to PDF"');
  setTimeout(() => printInvoice(viewing), 900);
});
$('#vmHtml').addEventListener('click', () => viewing && downloadInvoiceFile(viewing));

/* ---------- سجل الفواتير الرسمي ---------- */
/** يبني سجل الفواتير الصادرة لفترة — مستند رسمي يُقدَّم للجهات الحكومية */
function registerHTML(list, from, to) {
  const o = db.settings;
  const act = list.filter(v => v.status === 'active');
  const sum = k => money(act.reduce((s, v) => s + (k(v) || 0), 0));

  return `<div class="reg">
    <h2>${esc(o.nameAr)} — ${esc(o.nameEn)}</h2>
    <div class="rsub">سجل الفواتير الإلكترونية الصادرة${from || to ? ` — للفترة من ${from ? fmtDate(from) : 'البداية'} إلى ${to ? fmtDate(to) : fmtDate(todayISO())}` : ''}</div>
    <div class="rorg">
      <div><b>السجل التجاري:</b> ${ltr(o.crNumber)}</div>
      <div><b>رقم قيد المنشأة:</b> ${ltr(o.entityNumber)}</div>
      <div><b>رقم التسجيل الضريبي:</b> ${ltr(o.taxNumber)}</div>
      <div><b>المالك:</b> ${esc(o.ownerName)}</div>
      <div><b>النشاط:</b> ${esc(o.activity || '')}</div>
      <div><b>الهاتف:</b> ${ltr(o.tel)}</div>
      <div><b>العنوان:</b> ص.ب ${ltr(o.poBox)} — ${esc(o.city)}</div>
    </div>
    <table>
      <thead><tr>
        <th>م</th><th>رقم الفاتورة</th><th>التاريخ</th><th>الوقت</th><th>العميل</th>
        <th>عدد الأصناف</th><th>المجموع</th><th>الخصم</th><th>التوصيل</th>
        <th>الإجمالي (ر.ق)</th><th>نوع الدفع</th><th>الحالة</th><th>بصمة التحقق</th>
      </tr></thead>
      <tbody>${list.map((v, i) => `<tr>
        <td>${i + 1}</td><td><b>${v.no}</b></td><td>${fmtDate(v.date)}</td><td>${v.time}</td>
        <td class="d">${esc(v.customer) || '—'}</td><td>${v.items.length}</td>
        <td>${money(v.subtotal)}</td><td>${money(v.discount)}</td><td>${money(v.delivery)}</td>
        <td><b>${money(v.total)}</b></td>
        <td>${v.type === 'cash' ? 'نقداً' : (v.paid ? 'آجل — محصّل' : 'على الحساب')}</td>
        <td>${v.status === 'void' ? 'ملغاة' : 'سارية'}</td><td>${esc(v.hash || '')}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr>
        <td colspan="6">الإجماليات (الفواتير السارية: ${act.length})</td>
        <td>${sum(v => v.subtotal)}</td><td>${sum(v => v.discount)}</td><td>${sum(v => v.delivery)}</td>
        <td>${sum(v => v.total)}</td><td colspan="3">ملغاة: ${list.length - act.length}</td>
      </tr></tfoot>
    </table>
    <div class="rfoot">
      <div>تاريخ إصدار السجل: ${fmtDate(todayISO())} — ${new Date().toTimeString().slice(0, 5)}</div>
      <div>صادر آلياً من نظام نقاط البيع — ${esc(o.nameEn)}</div>
    </div>
  </div>`;
}

$('#btnPrintRegister').addEventListener('click', () => {
  const list = filteredInvoices().slice().sort((a, b) => a.no - b.no);
  if (!list.length) return toast('لا توجد فواتير في النطاق المحدد', 'err');
  // السجل عريض (13 عموداً) فيُطبع أفقياً على A4
  printDoc(registerHTML(list, $('#invFrom').value, $('#invTo').value), REPORT_CSS,
    'size:A4 landscape;margin:8mm');
});

/* ---------- تصدير CSV ---------- */
$('#btnExportCsv').addEventListener('click', () => {
  const list = filteredInvoices().slice().sort((a, b) => a.no - b.no);
  if (!list.length) return toast('لا توجد فواتير للتصدير', 'err');
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['رقم الفاتورة', 'التاريخ', 'الوقت', 'العميل', 'الجوال', 'الأصناف',
    'المجموع', 'الخصم', 'التوصيل', 'الضريبة', 'الإجمالي', 'نوع الدفع', 'الحالة', 'معرّف الفاتورة', 'بصمة التحقق'];
  const rows = list.map(v => [v.no, v.date, v.time, v.customer, v.phone,
    v.items.map(i => `${i.ar} ×${i.qty}`).join(' + '),
    money(v.subtotal), money(v.discount), money(v.delivery), money(v.vat || 0), money(v.total),
    v.type === 'cash' ? 'نقداً' : (v.paid ? 'آجل محصّل' : 'على الحساب'),
    v.status === 'void' ? 'ملغاة' : 'سارية', v.uid, v.hash].map(q).join(','));
  downloadBlob('﻿sep=,\r\n' + [head.map(q).join(','), ...rows].join('\r\n'),
    `فواتير-${todayISO()}.csv`, 'text/csv;charset=utf-8');
  toast('تم تصدير الملف — يفتح مباشرة في Excel', 'ok');
});

/* ══════════════ إدارة الأصناف ══════════════ */
let editingProd = null;
function renderProducts() {
  const q = $('#pmSearch').value.trim().toLowerCase();
  const list = db.products.filter(p => !q || p.ar.toLowerCase().includes(q) || (p.en || '').toLowerCase().includes(q));
  $('#pmBody').innerHTML = list.map(p => `
    <tr>
      <td><b>${esc(p.ar)}</b></td>
      <td class="muted" style="direction:ltr;text-align:right">${esc(p.en)}</td>
      <td>${catLabel(p.cat)}</td>
      <td class="num">${money(p.price)}</td>
      <td class="num">${p.weight || '—'}</td>
      <td>${esc(p.state) || '—'}</td>
      <td>${esc(p.origin) || '—'}</td>
      <td>${p.active ? '<span class="badge b-cash">نعم</span>' : '<span class="badge b-void">لا</span>'}</td>
      <td class="acts">
        <button class="btn btn-sm" data-p="${p.id}" data-a="edit">تعديل</button>
        <button class="btn btn-sm btn-danger" data-p="${p.id}" data-a="del">حذف</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="9"><div class="empty">لا توجد أصناف</div></td></tr>`;
}
$('#pmSearch').addEventListener('input', renderProducts);
$('#btnAddProd').addEventListener('click', () => openProdModal(null));
$('#pmBody').addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const p = db.products.find(x => x.id === b.dataset.p);
  if (!p) return;
  if (b.dataset.a === 'edit') openProdModal(p);
  else if (confirm(`حذف الصنف "${p.ar}"؟\nالفواتير القديمة لن تتأثر.`)) {
    db.products = db.products.filter(x => x.id !== p.id);
    save(); renderProducts(); renderProdGrid(); toast('تم الحذف');
  }
});
function openProdModal(p) {
  editingProd = p;
  $('#pmTitle').textContent = p ? 'تعديل صنف' : 'إضافة صنف';
  $('#fCat').innerHTML = CATEGORIES.map(c => `<option value="${c.key}">${c.label}</option>`).join('');
  $('#fAr').value = p?.ar || ''; $('#fEn').value = p?.en || '';
  $('#fCat').value = p?.cat || activeCat; $('#fPrice').value = p?.price ?? '';
  $('#fWeight').value = p?.weight || ''; $('#fState').value = p?.state || '';
  $('#fOrigin').value = p?.origin || ''; $('#fActive').value = p ? (p.active ? '1' : '0') : '1';
  $('#prodModal').classList.add('open');
}
$('#btnProdSave').addEventListener('click', () => {
  const ar = $('#fAr').value.trim();
  if (!ar) return toast('اكتب اسم الصنف بالعربي', 'err');
  const data = {
    ar, en: $('#fEn').value.trim(), cat: $('#fCat').value,
    price: Math.max(0, +$('#fPrice').value || 0), weight: +$('#fWeight').value || 0,
    state: $('#fState').value, origin: $('#fOrigin').value.trim(), active: +$('#fActive').value
  };
  if (editingProd) Object.assign(editingProd, data);
  else db.products.push({ id: uid(), ...data });
  save(); closeModals(); renderProducts(); renderProdGrid();
  toast(editingProd ? 'تم تعديل الصنف' : 'تمت إضافة الصنف', 'ok');
});

/* ══════════════ التقارير ══════════════ */
$$('[data-quick]').forEach(b => b.addEventListener('click', () => {
  const d = new Date(), t = todayISO();
  const k = b.dataset.quick;
  if (k === 'today') { $('#rFrom').value = t; $('#rTo').value = t; }
  else if (k === 'week') { const s = new Date(d); s.setDate(d.getDate() - 6); $('#rFrom').value = s.toLocaleDateString('en-CA'); $('#rTo').value = t; }
  else if (k === 'month') { $('#rFrom').value = t.slice(0, 8) + '01'; $('#rTo').value = t; }
  else { $('#rFrom').value = t.slice(0, 4) + '-01-01'; $('#rTo').value = t; }
  renderReports();
}));
['#rFrom', '#rTo'].forEach(s => $(s).addEventListener('input', renderReports));

/** يجمّع أرقام فترة معيّنة: الفواتير، الكميات المباعة، الأصناف، الأقسام، والأيام */
function reportData(from, to) {
  const list = db.invoices.filter(v => v.status === 'active' && (!from || v.date >= from) && (!to || v.date <= to));
  const catOf = ar => (db.products.find(p => p.ar === ar) || {}).cat || 'extra';

  const items = {}, cats = {}, days = {};
  let units = 0;
  list.forEach(v => {
    const d = (days[v.date] = days[v.date] || { n: 0, cash: 0, credit: 0, units: 0, total: 0 });
    d.n++; d.total += v.total;
    if (v.type === 'cash') d.cash += v.total; else d.credit += v.total;
    v.items.forEach(it => {
      const val = it.qty * it.price, c = catOf(it.ar);
      units += it.qty; d.units += it.qty;
      const e = (items[it.ar] = items[it.ar] || { qty: 0, val: 0, cat: c });
      e.qty += it.qty; e.val += val;
      const g = (cats[c] = cats[c] || { qty: 0, val: 0 });
      g.qty += it.qty; g.val += val;
    });
  });

  const total = list.reduce((s, v) => s + v.total, 0);
  const itemsSorted = Object.entries(items).sort((x, y) => y[1].qty - x[1].qty || y[1].val - x[1].val);
  const itemsValue = itemsSorted.reduce((s, [, e]) => s + e.val, 0);
  return {
    list, total, units, items: itemsSorted, itemsValue, cats, days,
    cash: list.filter(v => v.type === 'cash').reduce((s, v) => s + v.total, 0),
    credit: list.filter(v => v.type === 'credit').reduce((s, v) => s + v.total, 0),
    unpaid: list.filter(v => v.type === 'credit' && !v.paid).reduce((s, v) => s + v.total, 0),
    discounts: list.reduce((s, v) => s + (v.discount || 0), 0),
    dayCount: Object.keys(days).length || 1
  };
}

const catLabel = k => (CATEGORIES.find(c => c.key === k) || {}).label || k;

function renderReports() {
  const from = $('#rFrom').value, to = $('#rTo').value;
  const r = reportData(from, to);

  $('#rStats').innerHTML = `
    ${stat('إجمالي المبيعات', money(r.total) + ' ر.ق', r.list.length + ' فاتورة', '')}
    ${stat('عدد الوجبات المباعة', r.units, 'إجمالي الوحدات في الفترة', 'g')}
    ${stat('نقداً', money(r.cash) + ' ر.ق', '', 'g')}
    ${stat('على الحساب', money(r.credit) + ' ر.ق', 'غير محصّل: ' + money(r.unpaid) + ' ر.ق', 'w')}
    ${stat('متوسط الفاتورة', money(r.list.length ? r.total / r.list.length : 0) + ' ر.ق',
        'متوسط ' + (r.list.length ? (r.units / r.list.length).toFixed(1) : 0) + ' وجبة/فاتورة', 'd')}
    ${stat('متوسط اليوم', money(r.total / r.dayCount) + ' ر.ق', r.dayCount + ' يوم عمل', 'd')}`;

  $('#catBreak').innerHTML = CATEGORIES.map(c => {
    const g = r.cats[c.key] || { qty: 0, val: 0 };
    const pct = r.itemsValue ? (g.val / r.itemsValue * 100) : 0;
    return `<div class="stat"><div class="lbl">${c.label}</div>
      <div class="val">${g.qty} <span style="font-size:13px;font-weight:600;color:var(--muted)">وحدة</span></div>
      <div class="sm">${money(g.val)} ر.ق · ${pct.toFixed(1)}% من المبيعات</div>
      <div class="pbar" style="margin-top:8px"><div style="width:${pct.toFixed(1)}%"></div></div></div>`;
  }).join('');

  const maxQty = r.items.length ? r.items[0][1].qty : 1;
  $('#topItems').innerHTML = r.items.length
    ? r.items.map(([name, e], i) => {
        const pct = r.itemsValue ? e.val / r.itemsValue * 100 : 0;
        return `<tr>
          <td class="num">${i + 1}</td>
          <td>${esc(name)}</td>
          <td class="muted" style="font-size:12.5px">${catLabel(e.cat)}</td>
          <td class="num"><b>${e.qty}</b></td>
          <td class="num">${money(e.val)}</td>
          <td><div style="display:flex;align-items:center;gap:7px">
            <div class="pbar" style="flex:1"><div style="width:${(e.qty / maxQty * 100).toFixed(1)}%"></div></div>
            <span class="muted" style="font-size:11.5px;min-width:36px">${pct.toFixed(1)}%</span></div></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="6"><div class="empty">لا توجد بيانات في هذه الفترة</div></td></tr>`;

  const dayRows = Object.entries(r.days).sort((a, b) => b[0].localeCompare(a[0]));
  $('#dailyRows').innerHTML = dayRows.length
    ? dayRows.map(([d, v]) => `<tr><td class="num">${fmtDate(d)}</td><td class="num">${v.n}</td>
        <td class="num">${money(v.cash)}</td><td class="num">${money(v.credit)}</td><td class="num"><b>${money(v.total)}</b></td></tr>`).join('')
    : `<tr><td colspan="5"><div class="empty">لا توجد بيانات</div></td></tr>`;
}

/** تقرير مبيعات قابل للطباعة — الكميات المباعة والأصناف والأقسام والأيام */
function reportHTML(from, to) {
  const r = reportData(from, to), o = db.settings;
  const period = `من ${from ? fmtDate(from) : 'البداية'} إلى ${to ? fmtDate(to) : fmtDate(todayISO())}`;
  const box = (l, v, s2) => `<div class="rbox"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s2 || ''}</div></div>`;

  return `<div class="reg rep">
    <h2>${esc(o.nameAr)} — ${esc(o.nameEn)}</h2>
    <div class="rsub">تقرير المبيعات — ${period}</div>
    <div class="rboxes">
      ${box('إجمالي المبيعات', money(r.total) + ' ر.ق', r.list.length + ' فاتورة')}
      ${box('عدد الوجبات المباعة', r.units, 'وحدة')}
      ${box('نقداً', money(r.cash) + ' ر.ق', '')}
      ${box('على الحساب', money(r.credit) + ' ر.ق', 'غير محصّل: ' + money(r.unpaid))}
      ${box('متوسط الفاتورة', money(r.list.length ? r.total / r.list.length : 0) + ' ر.ق', '')}
      ${box('متوسط اليوم', money(r.total / r.dayCount) + ' ر.ق', r.dayCount + ' يوم')}
    </div>

    <h3 class="rh">المبيعات حسب القسم</h3>
    <table><thead><tr><th>القسم</th><th>الكمية المباعة</th><th>القيمة (ر.ق)</th><th>النسبة</th></tr></thead>
      <tbody>${CATEGORIES.map(c => {
        const g = r.cats[c.key] || { qty: 0, val: 0 };
        return `<tr><td class="d">${c.label}</td><td>${g.qty}</td><td>${money(g.val)}</td>
          <td>${r.itemsValue ? (g.val / r.itemsValue * 100).toFixed(1) : '0.0'}%</td></tr>`;
      }).join('')}</tbody></table>

    <h3 class="rh">الأصناف المباعة — مرتّبة بالأكثر مبيعاً</h3>
    <table><thead><tr><th>#</th><th>الصنف</th><th>القسم</th><th>الكمية</th><th>القيمة (ر.ق)</th><th>النسبة</th></tr></thead>
      <tbody>${r.items.map(([n, e], i) => `<tr><td>${i + 1}</td><td class="d">${esc(n)}</td>
        <td>${catLabel(e.cat)}</td><td><b>${e.qty}</b></td><td>${money(e.val)}</td>
        <td>${r.itemsValue ? (e.val / r.itemsValue * 100).toFixed(1) : '0.0'}%</td></tr>`).join('')
        || '<tr><td colspan="6">لا توجد بيانات</td></tr>'}</tbody>
      <tfoot><tr><td colspan="3">الإجمالي</td><td>${r.units}</td><td>${money(r.itemsValue)}</td><td>100%</td></tr></tfoot>
    </table>
    <div class="rnote">* قيمة الأصناف (${money(r.itemsValue)} ر.ق) هي سعر البيع قبل الخصومات ورسوم التوصيل.
      الفرق عن إجمالي المبيعات (${money(r.total)} ر.ق) ناتج عن رسوم التوصيل مطروحاً منها الخصومات
      (إجمالي الخصومات في الفترة: ${money(r.discounts)} ر.ق).</div>

    <h3 class="rh">المبيعات اليومية</h3>
    <table><thead><tr><th>التاريخ</th><th>عدد الفواتير</th><th>الوجبات</th><th>نقداً</th><th>آجل</th><th>الإجمالي (ر.ق)</th></tr></thead>
      <tbody>${Object.entries(r.days).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) =>
        `<tr><td>${fmtDate(d)}</td><td>${v.n}</td><td>${v.units}</td><td>${money(v.cash)}</td>
          <td>${money(v.credit)}</td><td><b>${money(v.total)}</b></td></tr>`).join('')
        || '<tr><td colspan="6">لا توجد بيانات</td></tr>'}</tbody></table>

    <div class="rfoot">
      <div>تاريخ إصدار التقرير: ${fmtDate(todayISO())} — ${new Date().toTimeString().slice(0, 5)}</div>
      <div>صادر آلياً من نظام نقاط البيع — ${esc(o.nameEn)}</div>
    </div>
  </div>`;
}

$('#btnPrintReport').addEventListener('click', () => {
  printDoc(reportHTML($('#rFrom').value, $('#rTo').value), REPORT_CSS, 'size:A4;margin:10mm');
});

$('#btnReportCsv').addEventListener('click', () => {
  const r = reportData($('#rFrom').value, $('#rTo').value);
  if (!r.items.length) return toast('لا توجد مبيعات في هذه الفترة', 'err');
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = r.items.map(([n, e], i) => [i + 1, n, catLabel(e.cat), e.qty, money(e.val),
    (r.itemsValue ? e.val / r.itemsValue * 100 : 0).toFixed(1) + '%'].map(q).join(','));
  downloadBlob('\ufeffsep=,\r\n' +
    [['#', 'الصنف', 'القسم', 'الكمية المباعة', 'القيمة (ر.ق)', 'النسبة'].map(q).join(','), ...rows,
     ['', 'الإجمالي', '', r.units, money(r.itemsValue), '100%'].map(q).join(',')].join('\r\n'),
    `تقرير-الأصناف-${$('#rFrom').value || 'الكل'}_${$('#rTo').value || todayISO()}.csv`,
    'text/csv;charset=utf-8');
  toast('تم تصدير تقرير الأصناف', 'ok');
});

/* ══════════════ الإعدادات والنسخ الاحتياطي ══════════════ */
const SETTINGS_MAP = {
  '#sNameAr': 'nameAr', '#sNameEn': 'nameEn', '#sCr': 'crNumber', '#sEntity': 'entityNumber',
  '#sTax': 'taxNumber', '#sOwner': 'ownerName', '#sTel': 'tel', '#sMobile': 'mobile',
  '#sPo': 'poBox', '#sCity': 'city', '#sSlogan': 'sloganAr', '#sActivity': 'activity'
};
function fillSettings() {
  const s = db.settings;
  Object.entries(SETTINGS_MAP).forEach(([sel, key]) => $(sel).value = s[key] || '');
  $('#sNextNo').value = s.nextInvoiceNo;
  $('#sPrintSize').value = s.printSize;
  $('#sTafqeet').value = s.showTafqeet ? '1' : '0';
  $('#sVat').value = s.vatEnabled ? '1' : '0';
  $('#sVatRate').value = s.vatRate;
  renderLogoPreview();
  const sc = db.settings.sync || {};
  $('#sSyncUrl').value = sc.url || '';
  $('#sSyncKey').value = sc.key || '';
  $('#sSyncOn').checked = !!sc.enabled;
  $('#syncNote').innerHTML = sc.lastError
    ? `<b>آخر خطأ:</b> ${esc(sc.lastError)}`
    : (sc.lastOk
        ? `آخر مزامنة ناجحة: <b>${new Date(sc.lastOk).toLocaleString('ar-QA')}</b>`
        : 'لم تتم أي مزامنة بعد.');
  $('#syncInfo').textContent = Sync.configured()
    ? `في انتظار الرفع: ${Sync.pending().length}` : 'غير مفعّلة';
  $('#backupNote').innerHTML = db.lastBackup
    ? `آخر نسخة احتياطية: <b>${fmtDate(db.lastBackup.slice(0, 10))}</b> — عدد الفواتير المحفوظة: <b>${db.invoices.length}</b>`
    : `لم تأخذ نسخة احتياطية بعد. عدد الفواتير المحفوظة: <b>${db.invoices.length}</b>`;
}
$('#btnSaveSettings').addEventListener('click', () => {
  const s = db.settings;
  Object.entries(SETTINGS_MAP).forEach(([sel, key]) => s[key] = $(sel).value.trim());
  s.nextInvoiceNo = Math.max(1, Math.floor(+$('#sNextNo').value || 1));
  s.printSize = $('#sPrintSize').value;
  s.showTafqeet = $('#sTafqeet').value === '1';
  s.vatEnabled = $('#sVat').value === '1';
  s.vatRate = Math.max(0, +$('#sVatRate').value || 0);
  s.sync = {
    ...(s.sync || {}),
    url: $('#sSyncUrl').value.trim(),
    key: $('#sSyncKey').value.trim(),
    enabled: $('#sSyncOn').checked
  };
  save(); applyBranding(); clearCart(); Sync.render(); Sync.run(false);
  toast('تم حفظ الإعدادات', 'ok');
});

/* ---------- شعار المطبخ ---------- */
function renderLogoPreview() {
  $('#logoPreview').innerHTML = db.settings.logo
    ? `<img src="${db.settings.logo}" style="width:100%;height:100%;object-fit:contain">`
    : LOGO_SVG;
}
$('#btnLogo').addEventListener('click', () => $('#logoFile').click());
$('#logoFile').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const img = new Image();
    img.onload = () => {
      // تصغير الشعار قبل الحفظ حتى لا يستهلك مساحة التخزين
      const max = 320, sc = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      db.settings.logo = cv.toDataURL('image/png');
      save(); renderLogoPreview();
      toast('تم حفظ الشعار — سيظهر على الفواتير الجديدة والمطبوعة', 'ok');
    };
    img.onerror = () => toast('تعذّرت قراءة الصورة', 'err');
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
  e.target.value = '';
});
$('#btnLogoClear').addEventListener('click', () => {
  db.settings.logo = ''; save(); renderLogoPreview();
  toast('رجع الشعار الافتراضي');
});

/* ---------- المزامنة السحابية ---------- */
$('#btnSyncNow').addEventListener('click', () => {
  if (!Sync.configured()) return toast('احفظ رابط النشرة والمفتاح وفعّل المزامنة أولاً', 'err');
  Sync.run(true).then(fillSettings);
});
$('#btnSyncTest').addEventListener('click', async () => {
  const url = $('#sSyncUrl').value.trim(), key = $('#sSyncKey').value.trim();
  if (!url || !key) return toast('اكتب رابط النشرة والمفتاح', 'err');
  const prev = db.settings.sync;
  db.settings.sync = { ...prev, url, key, enabled: true };   // اختبار مؤقت بالقيم المكتوبة
  try {
    const n = await Sync.test();
    toast(`الاتصال سليم — يوجد ${n} فاتورة على السحابة`, 'ok');
  } catch (e) {
    toast('فشل الاتصال: ' + e.message, 'err');
  } finally {
    db.settings.sync = prev;
  }
});

$('#btnBackup').addEventListener('click', () => {
  db.lastBackup = new Date().toISOString(); save();
  downloadBlob(JSON.stringify(db, null, 2), `نسخة-احتياطية-${todayISO()}.json`, 'application/json');
  fillSettings(); toast('تم تنزيل النسخة الاحتياطية', 'ok');
});
$('#btnRestore').addEventListener('click', () => $('#restoreFile').click());
$('#restoreFile').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (!d.settings || !Array.isArray(d.products)) throw new Error('ملف غير صالح');
      if (!confirm(`استعادة ${d.invoices?.length || 0} فاتورة و${d.products.length} صنف؟\nسيتم استبدال البيانات الحالية.`)) return;
      db = d;
      normalize();
      save();
      applyBranding(); clearCart(); renderCatTabs(); renderProdGrid(); fillSettings();
      toast('تمت الاستعادة بنجاح', 'ok');
    } catch (err) { toast('تعذّر قراءة الملف: ' + err.message, 'err'); }
    e.target.value = '';
  };
  rd.readAsText(f);
});
$('#btnWipe').addEventListener('click', () => {
  if (!confirm('سيتم مسح كل الفواتير والأصناف والإعدادات نهائياً.\nهل أخذت نسخة احتياطية؟')) return;
  if (!confirm('تأكيد أخير: مسح كل البيانات؟')) return;
  localStorage.removeItem(STORE_KEY);
  if (idb) { idb.close(); indexedDB.deleteDatabase(IDB_NAME); }
  setTimeout(() => location.reload(), 250);
});

/* ══════════════ النوافذ المنبثقة ══════════════ */
function closeModals() { $$('.modal').forEach(m => m.classList.remove('open')); }
document.addEventListener('click', e => {
  if (e.target.matches('[data-close]') || e.target.classList.contains('modal')) closeModals();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });

/* ══════════════ التشغيل ══════════════ */
/** يعلن ارتفاع الشريط العلوي الفعلي حتى تلتصق سلة الفاتورة تحته مباشرة */
function measureAppbar() {
  const bar = $('.appbar');
  if (bar) document.documentElement.style.setProperty('--appbar-h', bar.offsetHeight + 'px');
}

function applyBranding() {
  $('#hdrNameAr').textContent = db.settings.nameAr;
  $('#hdrNameEn').textContent = db.settings.nameEn;
  document.title = db.settings.nameAr + ' — نظام نقاط البيع';
}
function tick() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleDateString('ar-QA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    + ' · ' + d.toTimeString().slice(0, 5);
}

(async function start() {
  await load();
  applyBranding();
  renderCatTabs();
  renderProdGrid();
  clearCart();
  $('#rFrom').value = todayISO().slice(0, 8) + '01';
  $('#rTo').value = todayISO();
  tick(); setInterval(tick, 20000);
  measureAppbar();
  addEventListener('resize', measureAppbar);
  Sync.start();

  // ضمان كتابة أي تعديل معلّق قبل إغلاق النافذة
  addEventListener('pagehide', flush);

  // تشغيل النظام بدون إنترنت وإتاحة تثبيته كتطبيق (يتطلب تشغيله من خادم، لا من ملف مباشر)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();

/* زر تثبيت التطبيق — يظهر في الإعدادات عندما يسمح المتصفح بالتثبيت */
let deferredInstall = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  const b = $('#btnInstall');
  if (b) b.hidden = false;
});
$('#btnInstall').addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  $('#btnInstall').hidden = true;
});
