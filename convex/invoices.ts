import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/* ============================================================
   دوال المزامنة والمتابعة.
   كل دالة محمية بمفتاح سري مخزّن في متغيّرات بيئة Convex باسم SYNC_KEY،
   لأن الدوال العامة قابلة للنداء من أي جهة تعرف رابط النشرة.
   ============================================================ */

function assertKey(key: string) {
  const expected = process.env.SYNC_KEY;
  if (!expected) {
    throw new Error("لم يُضبط SYNC_KEY في إعدادات Convex — أضفه قبل الاستخدام.");
  }
  if (key !== expected) {
    throw new Error("مفتاح المزامنة غير صحيح.");
  }
}

const invoiceFields = {
  uid: v.string(),
  no: v.number(),
  date: v.string(),
  time: v.string(),
  createdAt: v.string(),
  customer: v.string(),
  phone: v.string(),
  type: v.string(),
  paid: v.boolean(),
  paidAt: v.union(v.string(), v.null()),
  items: v.array(v.object({ ar: v.string(), en: v.string(), qty: v.number(), price: v.number() })),
  subtotal: v.number(),
  discount: v.number(),
  delivery: v.number(),
  vatRate: v.number(),
  vat: v.number(),
  total: v.number(),
  note: v.string(),
  status: v.string(),
  voidReason: v.optional(v.string()),
  voidedAt: v.optional(v.string()),
  hash: v.string(),
  org: v.any(),
};

/** يرفع دفعة فواتير: يُنشئ الجديد ويحدّث الموجود بمطابقة المعرّف الفريد. */
export const push = mutation({
  args: {
    key: v.string(),
    invoices: v.array(v.object(invoiceFields)),
  },
  handler: async (ctx, args) => {
    assertKey(args.key);
    const saved: string[] = [];
    const now = Date.now();

    for (const inv of args.invoices) {
      const existing = await ctx.db
        .query("invoices")
        .withIndex("by_uid", (q) => q.eq("uid", inv.uid))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { ...inv, syncedAt: now });
      } else {
        await ctx.db.insert("invoices", { ...inv, syncedAt: now });
      }
      saved.push(inv.uid);
    }
    return { saved, count: saved.length };
  },
});

/** فواتير فترة — للوحة متابعة المالك. */
export const list = query({
  args: {
    key: v.string(),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertKey(args.key);
    let rows = await ctx.db.query("invoices").withIndex("by_date").order("desc").collect();

    if (args.from) rows = rows.filter((r) => r.date >= args.from!);
    if (args.to) rows = rows.filter((r) => r.date <= args.to!);

    rows.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    return rows.slice(0, args.limit ?? 300);
  },
});

/** ملخّص فترة: الإجماليات والكميات والأصناف الأكثر مبيعاً. */
export const summary = query({
  args: { key: v.string(), from: v.optional(v.string()), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertKey(args.key);
    let rows = await ctx.db.query("invoices").collect();

    if (args.from) rows = rows.filter((r) => r.date >= args.from!);
    if (args.to) rows = rows.filter((r) => r.date <= args.to!);

    const active = rows.filter((r) => r.status === "active");
    const items: Record<string, { qty: number; val: number }> = {};
    const days: Record<string, { n: number; total: number; units: number }> = {};
    let units = 0;

    for (const r of active) {
      const d = (days[r.date] ??= { n: 0, total: 0, units: 0 });
      d.n++;
      d.total += r.total;
      for (const it of r.items) {
        units += it.qty;
        d.units += it.qty;
        const e = (items[it.ar] ??= { qty: 0, val: 0 });
        e.qty += it.qty;
        e.val += it.qty * it.price;
      }
    }

    const sum = (f: (r: (typeof active)[number]) => number) =>
      active.reduce((s, r) => s + f(r), 0);

    return {
      invoices: active.length,
      voided: rows.length - active.length,
      units,
      total: sum((r) => r.total),
      cash: active.filter((r) => r.type === "cash").reduce((s, r) => s + r.total, 0),
      credit: active.filter((r) => r.type === "credit").reduce((s, r) => s + r.total, 0),
      unpaid: active
        .filter((r) => r.type === "credit" && !r.paid)
        .reduce((s, r) => s + r.total, 0),
      discounts: sum((r) => r.discount),
      topItems: Object.entries(items)
        .map(([ar, e]) => ({ ar, ...e }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 25),
      days: Object.entries(days)
        .map(([date, d]) => ({ date, ...d }))
        .sort((a, b) => b.date.localeCompare(a.date)),
      lastSync: rows.length ? Math.max(...rows.map((r) => r.syncedAt)) : null,
    };
  },
});

/** المعرّفات الموجودة سحابياً — تستخدمها نقطة البيع لمعرفة ما لم يُرفع بعد. */
export const knownUids = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    assertKey(args.key);
    const rows = await ctx.db.query("invoices").collect();
    return rows.map((r) => ({ uid: r.uid, hash: r.hash, status: r.status, paid: r.paid }));
  },
});
