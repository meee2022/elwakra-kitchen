import { requireSession } from "./access";
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";

/* Server authorization: only unexpired account sessions are accepted. Legacy shared keys never grant access. */



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
    token: v.optional(v.string()), key: v.optional(v.string()),
    invoices: v.array(v.object(invoiceFields)),
  },
  handler: async (ctx, args) => {
    const { user } = await requireSession(ctx, args.token);
    if (args.invoices.length > 25) throw new Error("Batch too large");
    const saved: string[] = [];
    const now = Date.now();

    for (const inv of args.invoices) {
      const existing = await ctx.db
        .query("invoices")
        .withIndex("by_uid", (q) => q.eq("uid", inv.uid))
        .unique();

      if (user.role === "cashier") {
        if (existing) {
          const same = Object.keys(invoiceFields).every(k => JSON.stringify((existing as any)[k]) === JSON.stringify((inv as any)[k]));
          if (!same) throw new Error("FORBIDDEN: cashier cannot modify existing invoices");
          saved.push(inv.uid); continue;
        }
        if (inv.status !== "active" || (inv.type !== "cash" && inv.type !== "credit") || inv.paid !== (inv.type === "cash")) throw new Error("Invalid invoice state");
      }
      // Two devices can issue the same number on the same day. The fingerprint covers the
      // date, time, total and items, so a mismatch means a different invoice, not an update.
      if (existing && existing.hash !== inv.hash) throw new ConvexError("UID_CONFLICT");
      if (!inv.items.length || inv.items.some(i => !Number.isFinite(i.qty) || i.qty <= 0 || !Number.isFinite(i.price) || i.price < 0)) throw new Error("Invalid invoice items");
      const subtotal = inv.items.reduce((n,i)=>n+i.qty*i.price,0);
      const base = Math.max(0, subtotal-inv.discount)+inv.delivery;
      if ([inv.subtotal,inv.total,inv.vat,inv.discount,inv.delivery,inv.vatRate].some(n=>!Number.isFinite(n)||n<0) || Math.abs(inv.subtotal-subtotal)>0.011 || Math.abs(inv.vat-base*inv.vatRate/100)>0.011 || Math.abs(inv.total-(base+inv.vat))>0.011) throw new Error("Invalid invoice totals");
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
    token: v.optional(v.string()), key: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token, true);
    let rows = await ctx.db.query("invoices").withIndex("by_date").order("desc").collect();

    if (args.from) rows = rows.filter((r) => r.date >= args.from!);
    if (args.to) rows = rows.filter((r) => r.date <= args.to!);

    rows.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    return rows.slice(0, args.limit ?? 300);
  },
});

/** ملخّص فترة: الإجماليات والكميات والأصناف الأكثر مبيعاً. */
export const summary = query({
  args: { token: v.optional(v.string()), key: v.optional(v.string()), from: v.optional(v.string()), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token, true);
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
  args: { token: v.optional(v.string()), key: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token, true);
    const rows = await ctx.db.query("invoices").collect();
    return rows.map((r) => ({ uid: r.uid, hash: r.hash, status: r.status, paid: r.paid }));
  },
});
