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
  replaces: v.optional(v.number()),     // this invoice replaces an earlier one (edit after issue)
  replacedBy: v.optional(v.number()),   // this cancelled invoice was replaced by that one
  eventAt: v.optional(v.string()),      // bookings, see SPEC-bookings.md
  booking: v.optional(v.object({ items: v.array(v.object({ ar: v.string(), en: v.string(), qty: v.number(), price: v.number() })), total: v.number(), closed: v.optional(v.boolean()) })),
  deposit: v.optional(v.number()),
  depositNo: v.optional(v.number()),
  depositUid: v.optional(v.string()),
  hash: v.string(),
  org: v.any(),
};

// The database returns object keys in its own order, so compare by value rather than by key order.
const canon = (x: unknown): string => JSON.stringify(x, (_k, val) =>
  val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a < b ? -1 : 1)) : val);

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
          const same = Object.keys(invoiceFields).every(k => canon((existing as any)[k]) === canon((inv as any)[k]));
          if (!same) throw new Error("FORBIDDEN: cashier cannot modify existing invoices");
          saved.push(inv.uid); continue;
        }
        // Card and cash are settled on the spot; only credit starts unpaid.
        if (inv.status !== "active" || !["cash", "card", "credit"].includes(inv.type) || inv.paid !== (inv.type !== "credit")) throw new Error("Invalid invoice state");
      }
      // Two devices can issue the same number on the same day. The fingerprint covers the
      // date, time, total and items, so a mismatch means a different invoice, not an update.
      if (existing && existing.hash !== inv.hash) throw new ConvexError("UID_CONFLICT");
      if (!inv.items.length || inv.items.some(i => !Number.isFinite(i.qty) || i.qty <= 0 || !Number.isFinite(i.price) || i.price < 0)) throw new Error("Invalid invoice items");
      const subtotal = inv.items.reduce((n,i)=>n+i.qty*i.price,0);
      const base = Math.max(0, subtotal-inv.discount)+inv.delivery;
      const deposit = inv.deposit ?? 0;   // a booking's final invoice: paid in advance, taken off the total
      if ([inv.subtotal,inv.total,inv.vat,inv.discount,inv.delivery,inv.vatRate,deposit].some(n=>!Number.isFinite(n)||n<0) || deposit>base+inv.vat+0.011 || Math.abs(inv.subtotal-subtotal)>0.011 || Math.abs(inv.vat-base*inv.vatRate/100)>0.011 || Math.abs(inv.total-(base+inv.vat-deposit))>0.011) throw new Error("Invalid invoice totals");
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

/** Public check behind the QR on printed invoices: no account needed, an exact fingerprint
    match required, and nothing about the customer (name, phone, note) in the answer. */
export const verify = query({
  args: { uid: v.string(), hash: v.string() },
  handler: async (ctx, a) => {
    if (a.uid.length > 80 || a.hash.length > 20) return { found: false };
    const r = await ctx.db.query("invoices").withIndex("by_uid", (q) => q.eq("uid", a.uid)).unique();
    if (!r || r.hash !== a.hash) return { found: false };
    // The items and amounts let the checker compare with the paper; who bought is never returned.
    return { found: true, no: r.no, date: r.date, time: r.time, type: r.type, status: r.status,
             items: r.items.map(i => ({ ar: i.ar, en: i.en, qty: i.qty, price: i.price })),
             subtotal: r.subtotal, discount: r.discount, delivery: r.delivery, vatRate: r.vatRate, vat: r.vat, total: r.total, deposit: r.deposit ?? 0,
             hash: r.hash, nameAr: String(r.org?.nameAr ?? ""), nameEn: String(r.org?.nameEn ?? ""), crNumber: String(r.org?.crNumber ?? "") };
  },
});

/** One day's takings across every device, for the end-of-day message to the owner. Totals only,
    so the cashier who closes the day can send it; the detailed reports stay with managers. */
export const daySummary = query({
  args: { token: v.optional(v.string()), date: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const rows = await ctx.db.query("invoices").withIndex("by_date", (q) => q.eq("date", args.date)).collect();
    const active = rows.filter((r) => r.status === "active");
    const sum = (list: typeof rows) => list.reduce((n, r) => n + r.total, 0);
    return { date: args.date, count: active.length, voids: rows.length - active.length,
      cash: sum(active.filter((r) => r.type === "cash")), card: sum(active.filter((r) => r.type === "card")),
      credit: sum(active.filter((r) => r.type === "credit")), deposits: sum(active.filter((r) => r.booking)), total: sum(active) };
  },
});

/** Bookings still to come, for every signed-in account: deposit invoices with an event that are
    active, not closed by a manager, and not yet followed by their final invoice. */
export const bookings = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const rows = await ctx.db.query("invoices").withIndex("by_eventAt", (q) => q.gt("eventAt", "")).collect();
    const open = [];
    for (const r of rows) {
      if (r.status !== "active" || !r.booking || r.booking.closed) continue;
      const done = await ctx.db.query("invoices").withIndex("by_depositUid", (q) => q.eq("depositUid", r.uid)).collect();
      if (done.some((f) => f.status === "active")) continue;
      const { _id, _creationTime, syncedAt, ...inv } = r;
      open.push(inv);
    }
    return open;
  },
});

/** Invoices that arrived or changed after `since`, oldest first, so a manager's device can mirror the cloud. */
export const changes = query({
  args: { token: v.string(), since: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token, true);
    const page = Math.min(Math.max(1, Math.floor(args.limit ?? 200)), 200);
    let rows = await ctx.db.query("invoices").withIndex("by_syncedAt", (q) => q.gt("syncedAt", args.since)).take(page);
    const more = rows.length === page;
    if (more) {
      // One push stamps all its invoices with the same time. Finish that group, or the caller's
      // next "after this time" request would skip the ones left behind.
      const last = rows[page - 1].syncedAt;
      rows = [
        ...rows.filter((r) => r.syncedAt < last),
        ...(await ctx.db.query("invoices").withIndex("by_syncedAt", (q) => q.eq("syncedAt", last)).collect()),
      ];
    }
    return {
      rows: rows.map(({ _id, _creationTime, syncedAt, ...inv }) => inv),
      next: rows.length ? rows[rows.length - 1].syncedAt : args.since,
      more,
    };
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
      card: active.filter((r) => r.type === "card").reduce((s, r) => s + r.total, 0),
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
