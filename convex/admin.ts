import { requireSession } from "./access";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

/* Server authorization: only unexpired account sessions are accepted. Legacy shared keys never grant access. */



/** يمسح كل الفواتير من السحابة. لا يمس بيانات جهاز الكاشير. */
export const wipeAll = mutation({
  args: { token: v.optional(v.string()), key: v.optional(v.string()), confirm: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token, true);
    if (args.confirm !== "امسح كل الفواتير") {
      throw new Error('التأكيد غير صحيح — أرسل confirm بالنص: "امسح كل الفواتير"');
    }
    const rows = await ctx.db.query("invoices").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return { deleted: rows.length };
  },
});
