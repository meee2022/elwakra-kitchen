import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireSession, tokenHash } from "./access";

export const reserveAttempt = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, {username}) => {
    const user = await ctx.db.query("users").withIndex("by_username", q => q.eq("username", username)).unique();
    const now = Date.now();
    for (const bucket of ["global", user ? "user:" + user._id : "unknown"]) {
      const limit = bucket === "global" ? 50 : 5;
      const windowMs = bucket === "global" ? 60000 : 15 * 60000;
      const row = await ctx.db.query("loginAttempts").withIndex("by_bucket", q => q.eq("bucket", bucket)).unique();
      if (row && row.until > now && row.count >= limit) return { error: "TOO_MANY_ATTEMPTS" as const };
      if (row) await ctx.db.patch(row._id, row.until > now ? {count: row.count + 1} : {count: 1, until: now + windowMs});
      else await ctx.db.insert("loginAttempts", {bucket, count: 1, until: now + windowMs});
    }
    return { user };
  }
});
export const create = internalMutation({
  args: { userId: v.id("users"), passwordHash: v.string(), tokenHash: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.disabled || user.passwordHash !== args.passwordHash) throw new Error("AUTH_REQUIRED");
    const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
    const id = await ctx.db.insert("sessions", {userId: user._id, tokenHash: args.tokenHash, expiresAt});
    await ctx.scheduler.runAt(expiresAt, internal.authSessions.remove, {id});
    const attempt = await ctx.db.query("loginAttempts").withIndex("by_bucket", q => q.eq("bucket", "user:" + user._id)).unique();
    if (attempt) await ctx.db.delete(attempt._id);
    return { username: user.username, role: user.role, expiresAt };
  }
});
export const remove = internalMutation({args:{id:v.id("sessions")},handler:async(ctx,{id})=>{if(await ctx.db.get(id))await ctx.db.delete(id);}});
export const me = query({ args: {token:v.string()}, handler:async(ctx,{token})=>{
  const {user,session}=await requireSession(ctx,token);
  return {username:user.username,role:user.role,expiresAt:session.expiresAt};
}});
export const logout = mutation({args:{token:v.string()},handler:async(ctx,{token})=>{
  const session=await ctx.db.query("sessions").withIndex("by_token",q=>q.eq("tokenHash",tokenHash(token))).unique();
  if(session)await ctx.db.delete(session._id);
}});
// Provisioning is internal-only and never overwrites an existing account.
export const provision = internalMutation({args:{username:v.string(),passwordHash:v.string(),role:v.union(v.literal("manager"),v.literal("cashier"))},handler:async(ctx,args)=>{
  if(!/^[a-z0-9._-]{3,40}$/.test(args.username) || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(args.passwordHash))throw new Error("Invalid account");
  const existing=await ctx.db.query("users").withIndex("by_username",q=>q.eq("username",args.username)).unique();
  if(existing)throw new Error("Account already exists; use an explicit recovery operation");
  await ctx.db.insert("users",{...args,disabled:false});
  return {username:args.username,role:args.role};
}});

/* ── Account management: managers only. Every change is made through an action in auth.ts,
      which first re-confirms the acting manager's own password. ── */
export const accounts = query({ args: {token:v.string()}, handler: async (ctx, {token}) => {
  await requireSession(ctx, token, true);
  return (await ctx.db.query("users").collect())
    .map(u => ({username: u.username, role: u.role, disabled: u.disabled}))   // never the hash
    .sort((a, b) => a.username.localeCompare(b.username));
}});
export const manager = internalQuery({ args: {token:v.string()}, handler: async (ctx, {token}) => {
  const {user} = await requireSession(ctx, token, true);
  return {username: user.username, passwordHash: user.passwordHash};
}});
// The action verified the manager's password against managerHash a moment ago. Make sure that is
// still the session's password, then forget the attempt the check cost.
async function confirmed(ctx: MutationCtx, token: string, managerHash: string) {
  const {user} = await requireSession(ctx, token, true);
  if (user.passwordHash !== managerHash) throw new ConvexError("AUTH_REQUIRED");
  const attempt = await ctx.db.query("loginAttempts").withIndex("by_bucket", q => q.eq("bucket", "user:" + user._id)).unique();
  if (attempt) await ctx.db.delete(attempt._id);
  return user;
}
const byName = (ctx: MutationCtx, username: string) =>
  ctx.db.query("users").withIndex("by_username", q => q.eq("username", username)).unique();
// Refusals are returned, not thrown, so the cleared attempt above is not rolled back with them.
export const addAccount = internalMutation({
  args: {token:v.string(), managerHash:v.string(), username:v.string(), role:v.union(v.literal("manager"),v.literal("cashier")), passwordHash:v.string()},
  handler: async (ctx, a) => {
    const me = await confirmed(ctx, a.token, a.managerHash);
    if (await byName(ctx, a.username)) return {error: "USERNAME_TAKEN"};
    await ctx.db.insert("users", {username: a.username, passwordHash: a.passwordHash, role: a.role, disabled: false});
    console.log(`account ${a.username} (${a.role}) created by ${me.username}`);
    return {};
  }
});
export const updateAccount = internalMutation({
  args: {token:v.string(), managerHash:v.string(), username:v.string(), passwordHash:v.optional(v.string()), disabled:v.optional(v.boolean())},
  handler: async (ctx, a) => {
    const me = await confirmed(ctx, a.token, a.managerHash);
    const target = await byName(ctx, a.username);
    if (!target) return {error: "NOT_FOUND"};
    // The acting manager is active, so refusing this keeps at least one manager able to sign in.
    if (a.disabled && target._id === me._id) return {error: "CANNOT_DISABLE_SELF"};
    await ctx.db.patch(target._id, a.passwordHash ? {passwordHash: a.passwordHash} : {disabled: !!a.disabled});
    if (a.passwordHash || a.disabled)
      for (const s of await ctx.db.query("sessions").collect()) if (s.userId === target._id) await ctx.db.delete(s._id);
    console.log(`account ${a.username} ${a.passwordHash ? "password reset" : a.disabled ? "disabled" : "enabled"} by ${me.username}`);
    return {};
  }
});
