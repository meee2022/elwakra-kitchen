import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireSession } from "./access";

/* One shared menu (items, prices) and the establishment details printed on invoices, so every device
   sells and prints the same thing. Any account reads it; only managers change it. */

const ORG_KEYS = ["nameAr", "nameEn", "crNumber", "entityNumber", "taxNumber", "ownerName", "tel", "mobile", "poBox", "city", "sloganAr", "activity"];
const CATS = ["meals", "banquet", "extra"];
const product = v.object({
  id: v.string(), ar: v.string(), en: v.string(), cat: v.string(), price: v.number(),
  weight: v.number(), state: v.string(), origin: v.string(), active: v.number(),
});

export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireSession(ctx, token);
    const doc = await ctx.db.query("catalog").first();
    return doc ? { version: doc.version, products: doc.products, org: doc.org } : null;
  },
});

export const save = mutation({
  args: { token: v.string(), baseVersion: v.number(), products: v.array(product), org: v.record(v.string(), v.string()) },
  handler: async (ctx, a) => {
    const { user } = await requireSession(ctx, a.token, true);
    const badItem = (p: typeof a.products[number]) =>
      !p.ar.trim() || p.ar.length > 80 || p.en.length > 80 || p.id.length > 40 || !CATS.includes(p.cat) ||
      !Number.isFinite(p.price) || p.price < 0 || p.price > 100000;
    if (a.products.length > 500 || a.products.some(badItem) ||
        Object.keys(a.org).some(k => !ORG_KEYS.includes(k)) || Object.values(a.org).some(s => s.length > 200))
      throw new ConvexError("INVALID_CATALOG");
    // Saving over a copy someone else has replaced in the meantime would silently undo their change.
    const doc = await ctx.db.query("catalog").first();
    if ((doc?.version ?? 0) !== a.baseVersion) throw new ConvexError("CATALOG_CONFLICT");
    const row = { products: a.products, org: a.org, version: a.baseVersion + 1, updatedAt: Date.now(), updatedBy: user.username };
    if (doc) await ctx.db.patch(doc._id, row); else await ctx.db.insert("catalog", row);
    return { version: row.version };
  },
});
