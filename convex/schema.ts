import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/* ============================================================
   مطابخ الجنوب — قاعدة البيانات السحابية
   مرآة للفواتير الصادرة من نقطة البيع، للمتابعة والنسخ الاحتياطي.
   المصدر الرسمي يبقى جهاز الكاشير؛ هذه نسخة مزامَنة.
   ============================================================ */

const invoiceItem = v.object({
  ar: v.string(),
  en: v.string(),
  qty: v.number(),
  price: v.number(),
});

export default defineSchema({
  users: defineTable({ username: v.string(), passwordHash: v.string(), role: v.union(v.literal("manager"), v.literal("cashier")), disabled: v.boolean() }).index("by_username", ["username"]),
  sessions: defineTable({ tokenHash: v.string(), userId: v.id("users"), expiresAt: v.number() }).index("by_token", ["tokenHash"]),
  loginAttempts: defineTable({ bucket: v.string(), count: v.number(), until: v.number() }).index("by_bucket", ["bucket"]),
  invoices: defineTable({
    // المعرّف الفريد الصادر من نقطة البيع — مفتاح المطابقة عند المزامنة
    uid: v.string(),
    no: v.number(),
    date: v.string(),          // YYYY-MM-DD
    time: v.string(),          // HH:MM
    createdAt: v.string(),

    customer: v.string(),
    phone: v.string(),

    type: v.string(),          // cash | card | credit
    paid: v.boolean(),
    paidAt: v.union(v.string(), v.null()),

    items: v.array(invoiceItem),
    subtotal: v.number(),
    discount: v.number(),
    delivery: v.number(),
    vatRate: v.number(),
    vat: v.number(),
    total: v.number(),

    note: v.string(),
    status: v.string(),        // active | void
    voidReason: v.optional(v.string()),
    voidedAt: v.optional(v.string()),

    hash: v.string(),          // بصمة التحقق المطبوعة على الفاتورة
    org: v.any(),              // لقطة بيانات المنشأة وقت الإصدار

    syncedAt: v.number(),      // وقت وصول آخر نسخة من هذه الفاتورة
  })
    .index("by_uid", ["uid"])
    .index("by_date", ["date"])
    .index("by_syncedAt", ["syncedAt"]),   // lets a manager's device ask "what changed since I last looked"
});
