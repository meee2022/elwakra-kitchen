import { mutation } from "./_generated/server";
import { v } from "convex/values";

/* ============================================================
   أدوات إدارية — تُستخدم قبل بدء التشغيل الفعلي لمسح بيانات التجربة.
   محمية بنفس مفتاح المزامنة، وتتطلب تأكيداً نصياً صريحاً.
   ============================================================ */

function assertKey(key: string) {
  const expected = process.env.SYNC_KEY;
  if (!expected) throw new Error("لم يُضبط SYNC_KEY في إعدادات Convex.");
  if (key !== expected) throw new Error("مفتاح المزامنة غير صحيح.");
}

/** يمسح كل الفواتير من السحابة. لا يمس بيانات جهاز الكاشير. */
export const wipeAll = mutation({
  args: { key: v.string(), confirm: v.string() },
  handler: async (ctx, args) => {
    assertKey(args.key);
    if (args.confirm !== "امسح كل الفواتير") {
      throw new Error('التأكيد غير صحيح — أرسل confirm بالنص: "امسح كل الفواتير"');
    }
    const rows = await ctx.db.query("invoices").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return { deleted: rows.length };
  },
});
