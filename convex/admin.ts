import { requireSession } from "./access";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/* Server authorization: only unexpired account sessions are accepted. Legacy shared keys never grant access. */



/** Erases every invoice in the cloud and records when, so each device clears its own copy on its next sync. */
export const wipeAll = mutation({
  args: { token: v.optional(v.string()), key: v.optional(v.string()), confirm: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token, true);
    if (args.confirm !== "امسح كل الفواتير") {
      throw new Error('التأكيد غير صحيح — أرسل confirm بالنص: "امسح كل الفواتير"');
    }
    const rows = await ctx.db.query("invoices").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    const at = Date.now();
    await ctx.db.insert("wipes", { at });
    return { deleted: rows.length, at };
  },
});

/** When the invoices were last zeroed, or null. Any signed-in device follows it. */
export const lastWipe = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const row = await ctx.db.query("wipes").order("desc").first();
    return row ? row.at : null;
  },
});
