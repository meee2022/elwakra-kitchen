/* ============================================================
   المزامنة السحابية (Convex)
   نقطة البيع تشتغل محلياً دائماً — المزامنة إضافة فوقها، لا تعطّلها.
   الفاتورة تُعلَّم "غير مزامَنة" عند إنشائها أو تعديلها، وتُرفع أول
   ما يتوفّر الإنترنت. الرفع بمطابقة المعرّف الفريد فلا يتكرر شيء.
   ============================================================ */
'use strict';

const Sync = (function () {
  const BATCH = 25;
  let timer = null;
  let inFlight = null;      // عملية الرفع الجارية حالياً
  let again = false;        // وصل طلب رفع أثناء الجاري — يُنفَّذ بعده

  const cfg = () => db.settings.sync || (db.settings.sync = { url: '', key: '', enabled: false });
  const configured = () => { const c = cfg(); return c.enabled && !!c.url && !!c.key; };

  /** الفواتير التي تغيّرت محلياً ولم تُرفع بعد */
  const pending = () => db.invoices.filter(v => v._syncHash !== v._stateHash || !v._synced);

  /** بصمة حالة الفاتورة — تتغيّر عند التحصيل أو الإلغاء فتُعاد المزامنة */
  const stateHash = v => `${v.hash}|${v.status}|${v.paid ? 1 : 0}`;

  /** تُنادى بعد أي تغيير على فاتورة */
  function mark(inv) {
    inv._stateHash = stateHash(inv);
    inv._synced = false;
  }

  /** نداء دالة على النشرة. kind: 'query' للقراءة، 'mutation' للكتابة. */
  async function call(fn, args, kind = 'query') {
    const c = cfg();
    const base = c.url.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fn, args: { key: c.key, ...args }, format: 'json' })
    });
    if (!res.ok) throw new Error(`الخادم رد بالحالة ${res.status}`);
    const out = await res.json();
    if (out.status !== 'success') throw new Error(out.errorMessage || 'خطأ غير معروف من الخادم');
    return out.value;
  }

  /** ينظّف الفاتورة من الحقول المحلية ويضبط أنواعها كما يتوقّعها الخادم */
  function forWire(v) {
    return {
      uid: String(v.uid), no: Number(v.no), date: String(v.date), time: String(v.time),
      createdAt: String(v.createdAt || ''),
      customer: String(v.customer || ''), phone: String(v.phone || ''),
      type: String(v.type), paid: !!v.paid, paidAt: v.paidAt ? String(v.paidAt) : null,
      items: (v.items || []).map(i => ({
        ar: String(i.ar), en: String(i.en || ''), qty: Number(i.qty), price: Number(i.price)
      })),
      subtotal: Number(v.subtotal || 0), discount: Number(v.discount || 0),
      delivery: Number(v.delivery || 0), vatRate: Number(v.vatRate || 0),
      vat: Number(v.vat || 0), total: Number(v.total || 0),
      note: String(v.note || ''), status: String(v.status || 'active'),
      ...(v.voidReason ? { voidReason: String(v.voidReason) } : {}),
      ...(v.voidedAt ? { voidedAt: String(v.voidedAt) } : {}),
      hash: String(v.hash || ''), org: v.org || {}
    };
  }

  /** يضمن رفعة واحدة في كل لحظة: الطلبات المتزامنة تنتظر الجارية،
      وأي طلب وصل أثناءها يُنفَّذ بعدها بدل أن يضيع. */
  function run(manual) {
    if (!configured()) { render(); return Promise.resolve(); }
    if (inFlight) { again = true; return inFlight; }

    inFlight = doRun(manual).finally(() => {
      inFlight = null;
      if (again) { again = false; run(false); }
    });
    return inFlight;
  }

  async function doRun(manual) {
    if (!navigator.onLine) { render('offline'); return; }

    const queue = pending();
    if (!queue.length) { render('ok'); return; }

    render('working');
    try {
      for (let i = 0; i < queue.length; i += BATCH) {
        const chunk = queue.slice(i, i + BATCH);
        await call('invoices:push', { invoices: chunk.map(forWire) }, 'mutation');
        chunk.forEach(v => { v._synced = true; v._syncHash = stateHash(v); });
        save();
      }
      db.settings.sync.lastOk = new Date().toISOString();
      db.settings.sync.lastError = '';
      save();
      render('ok');
      if (manual) toast(`تمت مزامنة ${queue.length} فاتورة`, 'ok');
    } catch (e) {
      db.settings.sync.lastError = e.message;
      save();
      render('error');
      if (manual) toast('تعذّرت المزامنة: ' + e.message, 'err');
    }
  }

  /** مؤشّر الحالة في الشريط العلوي */
  function render(state) {
    const el = document.querySelector('#syncBadge');
    if (!el) return;
    if (!configured()) { el.hidden = true; return; }
    el.hidden = false;

    const n = pending().length;
    const s = state || (inFlight ? 'working' : (!navigator.onLine ? 'offline' : (n ? 'pending' : 'ok')));
    const map = {
      ok:      ['متزامن', 's-ok'],
      pending: [`في انتظار الرفع: ${n}`, 's-pending'],
      working: ['جاري الرفع…', 's-pending'],
      offline: [n ? `بدون إنترنت — ${n} في الانتظار` : 'بدون إنترنت', 's-off'],
      error:   ['تعذّرت المزامنة', 's-err']
    };
    const [text, cls] = map[s] || map.ok;
    el.className = 'sync-badge ' + cls;
    el.textContent = text;
    el.title = db.settings.sync.lastError || (db.settings.sync.lastOk
      ? 'آخر مزامنة ناجحة: ' + new Date(db.settings.sync.lastOk).toLocaleString('ar-QA') : '');
  }

  /** اختبار الاتصال بالنشرة قبل التفعيل */
  async function test() {
    const known = await call('invoices:knownUids', {});
    return known.length;
  }

  function start() {
    // الفواتير القديمة (قبل تفعيل المزامنة) تُعتبر غير مرفوعة
    db.invoices.forEach(v => { if (!v._stateHash) v._stateHash = stateHash(v); });
    render();
    clearInterval(timer);
    timer = setInterval(() => run(false), 60000);
    addEventListener('online', () => run(false));
    run(false);
  }

  return { start, run, mark, render, test, pending, configured, call };
})();
