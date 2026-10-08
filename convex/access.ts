import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";
export const tokenHash = (token: string) => bytesToHex(sha256(token));
export async function requireSession(ctx: Pick<QueryCtx, "db">, token?: string, manager = false) {
  if (!token || token.length !== 64) throw new ConvexError("AUTH_REQUIRED");
  const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("tokenHash", tokenHash(token))).unique();
  if (!session || session.expiresAt <= Date.now()) throw new ConvexError("AUTH_REQUIRED");
  const user = await ctx.db.get(session.userId);
  if (!user || user.disabled) throw new ConvexError("AUTH_REQUIRED");
  if (manager && user.role !== "manager") throw new ConvexError("FORBIDDEN");
  return { user, session };
}
