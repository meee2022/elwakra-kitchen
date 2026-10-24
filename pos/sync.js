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
  const configured = () => { const c = cfg(); return c.enabled && Auth.active(); };

  /** الفواتير التي تغيّرت محلياً ولم تُرفع بعد */
  const pending = () => db.invoices.filter(v => (Auth.isManager() || v._createdBy === Auth.profile()?.username) && (v._syncHash !== v._stateHash || !v._synced));

  /** بصمة حالة الفاتورة — تتغيّر عند التحصيل أو الإلغاء فتُعاد المزامنة */
  const stateHash = v => `${v.hash}|${v.status}|${v.paid ? 1 : 0}`;

  /** تُنادى بعد أي تغيير على فاتورة */
  function mark(inv) {
    inv._stateHash = stateHash(inv);
    inv._synced = false;
  }

  /** نداء دالة على النشرة. kind: 'query' للقراءة، 'mutation' للكتابة. */
  async function call(fn, args, kind = 'query') {
    return Auth.call(fn, args, kind);
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
      ...(v.replaces ? { replaces: Number(v.replaces) } : {}),
      ...(v.replacedBy ? { replacedBy: Number(v.replacedBy) } : {}),
      // bookings (SPEC-bookings.md): the deposit invoice carries the event, the final one the deposit
      ...(v.eventAt ? { eventAt: String(v.eventAt) } : {}),
      ...(v.booking ? { booking: { items: v.booking.items.map(i => ({ ar: String(i.ar), en: String(i.en || ''), qty: Number(i.qty), price: Number(i.price) })),
        total: Number(v.booking.total), ...(v.booking.closed ? { closed: true } : {}) } } : {}),
      ...(v.deposit ? { deposit: Number(v.deposit), depositNo: Number(v.depositNo), depositUid: String(v.depositUid) } : {}),
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

  /** Managers mirror the cloud: sales made on any device appear here on their own, and cancelling
      or collecting elsewhere follows. Nothing local is ever removed. Returns how many invoices changed. */
  async function pull() {
    if (!Auth.isManager()) return 0;
    let changed = 0;
    for (let more = true; more;) {
      const got = await call('invoices:changes', { since: cfg().pulledAt || 0 });
      for (const inv of got.rows) {
        const mine = db.invoices.find(v => v.uid === inv.uid);
        if (mine && (!mine._synced || mine._syncHash !== mine._stateHash)) continue;   // a local change not pushed yet wins
        if (mine && stateHash(mine) === stateHash(inv)) continue;                      // our own push coming back
        const fresh = { ...inv, _stateHash: stateHash(inv), _syncHash: stateHash(inv), _synced: true };
        if (mine) Object.assign(mine, fresh); else db.invoices.push(fresh);
        changed++;
      }
      if (got.rows.length) { cfg().pulledAt = got.next; save(); }
      more = got.more;
    }
    if (changed) {
      db.invoices.sort((x, y) => y.no - x.no);
      // Keep this device's counter clear of numbers already issued elsewhere.
      db.settings.nextInvoiceNo = Math.max(db.settings.nextInvoiceNo, db.invoices[0].no + 1);
      save();
      dispatchEvent(new Event('invoices-pulled'));
    }
    return changed;
  }

  /* The shared menu (items, prices, establishment details): every device follows the cloud copy,
     and a manager's edits go up first. The first manager to find the cloud empty seeds it. */
  const ORG_KEYS = ['nameAr', 'nameEn', 'crNumber', 'entityNumber', 'taxNumber', 'ownerName', 'tel', 'mobile', 'poBox', 'city', 'sloganAr', 'activity'];

  /* A manager's edits are kept as operations and replayed on the latest cloud copy. Replacing the whole
     list instead lost edits two ways: a sync already under way wrote the older cloud list back over a
     fresh delete, and a device that had not fetched the newest copy had its save refused and dropped. */
  function applyOps(menu, ops) {
    const products = menu.products.map(p => ({ ...p })), org = { ...menu.org };
    for (const op of ops) {
      const i = products.findIndex(p => p.id === (op.item ? op.item.id : op.id));
      if (op.op === 'delete') { if (i >= 0) products.splice(i, 1); }
      else if (op.op === 'upsert') {
        if (i >= 0) products[i] = op.item;
        else {
          const after = products.findIndex(p => p.id === op.after);
          products.splice(after < 0 ? products.length : after + 1, 0, op.item);
        }
      } else if (op.op === 'org') Object.assign(org, op.org);
    }
    return { products, org };
  }
  const itemForWire = p => ({
    id: String(p.id), ar: String(p.ar), en: String(p.en || ''), cat: String(p.cat), price: Number(p.price) || 0,
    weight: Number(p.weight) || 0, state: String(p.state || ''), origin: String(p.origin || ''), active: p.active ? 1 : 0
  });

  /** Called after a manager adds, edits or deletes an item, or changes establishment details. */
  function menuChanged(op) {
    const c = cfg();
    c.menuOps = [...(c.menuOps || []), op.item ? { ...op, item: itemForWire(op.item) } : op];
    save(); run(false);
  }

  function adopt(menu, version) {
    const c = cfg();
    const changed = version !== c.menuVersion || JSON.stringify(menu.products) !== JSON.stringify(db.products);
    db.products = menu.products;
    ORG_KEYS.forEach(k => { if (k in menu.org) db.settings[k] = menu.org[k]; });
    c.menuVersion = version;
    save();
    if (changed) dispatchEvent(new Event('menu-pulled'));
  }

  async function syncMenu() {
    const c = cfg();
    delete c.menuDirty;                                    // replaced by menuOps
    if (!Auth.isManager()) c.menuOps = [];                 // only managers change the menu
    for (let tries = 0; tries < 3; tries++) {
      const doc = await call('catalog:get', {});
      const ops = c.menuOps || [];
      if (!doc && !Auth.isManager()) return;
      if (doc && !ops.length) { if (doc.version !== c.menuVersion) adopt(doc, doc.version); return; }
      // First manager to find the cloud empty seeds it with this device's list; otherwise replay the edits.
      const next = doc ? applyOps(doc, ops)
        : { products: db.products.map(itemForWire), org: Object.fromEntries(ORG_KEYS.map(k => [k, String(db.settings[k] || '')])) };
      try {
        const { version } = await call('catalog:save', { baseVersion: doc ? doc.version : 0, ...next }, 'mutation');
        c.menuOps = (c.menuOps || []).slice(ops.length);   // edits made meanwhile wait for the next round
        adopt(c.menuOps.length ? applyOps(next, c.menuOps) : next, version);
        return;
      } catch (e) {
        if (!e.message.includes('CATALOG_CONFLICT')) throw e;   // someone saved in between: fetch and replay again
      }
    }
  }

  async function doRun(manual) {
    if (!navigator.onLine) { render('offline'); return; }

    const queue = pending();
    if (queue.length) render('working');
    try {
      for (let i = 0; i < queue.length; i += BATCH) {
        const chunk = queue.slice(i, i + BATCH);
        await call('invoices:push', { invoices: chunk.map(forWire) }, 'mutation');
        chunk.forEach(v => { v._synced = true; v._syncHash = stateHash(v); });
        save();
      }
      await syncMenu();
      const moved = queue.length + await pull();
      // This runs every few seconds for a manager: only touch storage when something happened.
      if (moved || db.settings.sync.lastError) {
        db.settings.sync.lastOk = new Date().toISOString();
        db.settings.sync.lastError = '';
        save();
      }
      render('ok');
      if (manual && moved) toast(I18n.t2('تمت مزامنة {0} فاتورة', moved), 'ok');
    } catch (e) {
      // A number already used by a different invoice in the cloud: say so plainly, it needs a person.
      const error = e.message.includes('UID_CONFLICT')
        ? t('رقم فاتورة مستخدم في السحابة لفاتورة مختلفة — راجع رقم الفاتورة القادمة في الإعدادات.')
        : e.message;
      if (error !== db.settings.sync.lastError) { db.settings.sync.lastError = error; save(); }
      render('error');
      if (manual) toast(t('تعذّرت المزامنة: ') + e.message, 'err');
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
      ok:      [t('متزامن'), 's-ok'],
      pending: [t('في انتظار الرفع: ') + n, 's-pending'],
      working: [t('جاري الرفع…'), 's-pending'],
      offline: [n ? I18n.t2('بدون إنترنت — {0} في الانتظار', n) : t('بدون إنترنت'), 's-off'],
      error:   [t('تعذّرت المزامنة'), 's-err']
    };
    const [text, cls] = map[s] || map.ok;
    el.className = 'sync-badge ' + cls;
    el.textContent = text;
    el.title = db.settings.sync.lastError || (db.settings.sync.lastOk
      ? t('آخر مزامنة ناجحة: ') + new Date(db.settings.sync.lastOk).toLocaleString(I18n.get() === 'en' ? 'en-GB' : 'ar-QA') : '');
  }

  /** اختبار الاتصال بالنشرة قبل التفعيل */
  async function test() {
    await Auth.call('authSessions:me');
    return 0;
  }

  function start() {
    // الفواتير القديمة (قبل تفعيل المزامنة) تُعتبر غير مرفوعة
    db.invoices.forEach(v => { if (!v._stateHash) v._stateHash = stateHash(v); });
    render();
    clearInterval(timer);
    // A manager follows sales as they happen; a till only needs to retry uploads.
    timer = setInterval(() => { if (!document.hidden) run(false); }, Auth.isManager() ? 10000 : 60000);
    addEventListener('online', () => run(false));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(false); });
    run(false);
  }

  return { start, run, mark, render, test, pending, configured, call, menuChanged };
})();
