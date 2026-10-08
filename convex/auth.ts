"use node";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
export const login = action({args:{username:v.string(),password:v.string()},handler:async(ctx,args):Promise<any>=>{
  if(args.username.length>80 || args.password.length>256)return {error:"INVALID_CREDENTIALS"};
  const attempt = await ctx.runMutation(internal.authSessions.reserveAttempt,{username:args.username.trim().toLowerCase()});
  if(attempt.error)return {error:attempt.error};
  const user = attempt.user;
  const parts = (user?.passwordHash || "scrypt:"+"0".repeat(32)+":"+"0".repeat(128)).split(":");
  const hash = await derive(args.password,parts[1],64) as Buffer;
  const valid = timingSafeEqual(hash,Buffer.from(parts[2],"hex"));
  if(!valid || !user || user.disabled)return {error:"INVALID_CREDENTIALS"};
  const token=randomBytes(32).toString("hex");
  const profile=await ctx.runMutation(internal.authSessions.create,{userId:user._id,passwordHash:user.passwordHash,tokenHash:createHash("sha256").update(token).digest("hex")});
  return {token,...profile};
}});

/* ── Account management (see authSessions.ts). Every change re-confirms the acting manager's own
      password, so an unattended dashboard cannot mint or take over accounts. ── */
async function confirmManager(ctx: ActionCtx, token: string, password: string): Promise<string> {
  const me = await ctx.runQuery(internal.authSessions.manager, {token});
  const attempt = await ctx.runMutation(internal.authSessions.reserveAttempt, {username: me.username});
  if (attempt.error) throw new ConvexError(attempt.error);
  const parts = me.passwordHash.split(":");
  if (password.length > 256 || !timingSafeEqual(await derive(password, parts[1], 64) as Buffer, Buffer.from(parts[2], "hex")))
    throw new ConvexError("WRONG_PASSWORD");
  return me.passwordHash;
}
// Input is checked before the password confirmation so that a typo never costs the manager an attempt.
const checkNew = (password: string) => { if (password.length < 8 || password.length > 256) throw new ConvexError("WEAK_PASSWORD"); };
async function hashNew(password: string) {
  const salt = randomBytes(16).toString("hex");
  return "scrypt:" + salt + ":" + (await derive(password, salt, 64) as Buffer).toString("hex");
}
const settle = (result: {error?: string}) => { if (result.error) throw new ConvexError(result.error); return null; };
const role = v.union(v.literal("manager"), v.literal("cashier"));

export const createAccount = action({args:{token:v.string(),password:v.string(),username:v.string(),role,newPassword:v.string()},handler:async(ctx,a):Promise<null>=>{
  const username = a.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new ConvexError("INVALID_USERNAME");
  checkNew(a.newPassword);
  const managerHash = await confirmManager(ctx, a.token, a.password);
  return settle(await ctx.runMutation(internal.authSessions.addAccount, {token:a.token, managerHash, username, role:a.role, passwordHash:await hashNew(a.newPassword)}));
}});
export const setPassword = action({args:{token:v.string(),password:v.string(),username:v.string(),newPassword:v.string()},handler:async(ctx,a):Promise<null>=>{
  checkNew(a.newPassword);
  const managerHash = await confirmManager(ctx, a.token, a.password);
  return settle(await ctx.runMutation(internal.authSessions.updateAccount, {token:a.token, managerHash, username:a.username, passwordHash:await hashNew(a.newPassword)}));
}});
export const setDisabled = action({args:{token:v.string(),password:v.string(),username:v.string(),disabled:v.boolean()},handler:async(ctx,a):Promise<null>=>{
  const managerHash = await confirmManager(ctx, a.token, a.password);
  return settle(await ctx.runMutation(internal.authSessions.updateAccount, {token:a.token, managerHash, username:a.username, disabled:a.disabled}));
}});
