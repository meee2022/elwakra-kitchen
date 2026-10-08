import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { scryptSync } from "node:crypto";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { tokenHash } from "../convex/access";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
const password = "test-only-strong-password";
const salt = "1".repeat(32);
const hash = "scrypt:"+salt+":"+scryptSync(password,salt,64).toString("hex");
async function setup(role:"manager"|"cashier"="manager"){
  const t=convexTest(schema,modules);
  await t.mutation(internal.authSessions.provision,{username:role,passwordHash:hash,role});
  const login=await t.action(api.auth.login,{username:role,password});
  return {t,login};
}
const invoice={uid:"test-only",no:1,date:"2026-10-07",time:"12:00",createdAt:"2026-10-07T09:00:00Z",customer:"Test",phone:"",type:"cash",paid:true,paidAt:null,items:[{ar:"Test",en:"Test",qty:1,price:10}],subtotal:10,discount:0,delivery:0,vatRate:0,vat:0,total:10,note:"",status:"active",hash:"test",org:{}};
describe("account access controls",()=>{
  it("rejects anonymous calls and the old shared key on every data endpoint",async()=>{
    const t=convexTest(schema,modules);
    for(const args of [{},{key:"old-sync-key"}]){
      await expect(t.query(api.invoices.summary,args)).rejects.toThrow("AUTH_REQUIRED");
      await expect(t.query(api.invoices.list,args)).rejects.toThrow("AUTH_REQUIRED");
      await expect(t.query(api.invoices.knownUids,args)).rejects.toThrow("AUTH_REQUIRED");
      await expect(t.mutation(api.invoices.push,{...args,invoices:[invoice]})).rejects.toThrow("AUTH_REQUIRED");
      await expect(t.mutation(api.admin.wipeAll,{...args,confirm:"امسح كل الفواتير"})).rejects.toThrow("AUTH_REQUIRED");
    }
  });
  it("stores only a token digest and grants the server role",async()=>{
    const {t,login}=await setup();expect(login.role).toBe("manager");expect(login.token).toHaveLength(64);
    const session=await t.run(ctx=>ctx.db.query("sessions").unique());
    expect(session?.tokenHash).toBe(tokenHash(login.token));expect(JSON.stringify(session)).not.toContain(login.token);
    expect((await t.query(api.authSessions.me,{token:login.token})).role).toBe("manager");
  });
  it("allows manager reporting",async()=>{
    const {t,login}=await setup();await t.mutation(api.invoices.push,{token:login.token,invoices:[invoice]});
    expect((await t.query(api.invoices.summary,{token:login.token})).total).toBe(10);
  });
  it("prevents cashier reporting and deletion even with direct API requests",async()=>{
    const {t,login}=await setup("cashier");const args={token:login.token};
    await expect(t.query(api.invoices.summary,args)).rejects.toThrow("FORBIDDEN");
    await expect(t.query(api.invoices.list,args)).rejects.toThrow("FORBIDDEN");
    await expect(t.query(api.invoices.knownUids,args)).rejects.toThrow("FORBIDDEN");
    await expect(t.mutation(api.admin.wipeAll,{...args,confirm:"امسح كل الفواتير"})).rejects.toThrow("FORBIDDEN");
  });
  it("allows cashier new sales and idempotent retry, but forbids overwrites",async()=>{
    const {t,login}=await setup("cashier");const args={token:login.token,invoices:[invoice]};
    await t.mutation(api.invoices.push,args);await t.mutation(api.invoices.push,args);
    await expect(t.mutation(api.invoices.push,{...args,invoices:[{...invoice,status:"void"}]})).rejects.toThrow("FORBIDDEN");
    expect((await t.run(ctx=>ctx.db.query("invoices").collect())).length).toBe(1);
  });
  it("refuses to overwrite a different invoice that reuses a number, yet still lets its state change",async()=>{
    const {t,login}=await setup();
    await t.mutation(api.invoices.push,{token:login.token,invoices:[invoice]});
    // A second device issuing its own invoice under the same number must not replace the first.
    const clash={...invoice,time:"13:30",customer:"Someone else",hash:"OTHERHASH"};
    await expect(t.mutation(api.invoices.push,{token:login.token,invoices:[clash]})).rejects.toThrow("UID_CONFLICT");
    // The same invoice being cancelled is a legitimate update.
    await t.mutation(api.invoices.push,{token:login.token,invoices:[{...invoice,status:"void"}]});
    const row=await t.run(ctx=>ctx.db.query("invoices").unique());
    expect(row?.customer).toBe("Test");expect(row?.status).toBe("void");
  });
  it("checks amounts on the server",async()=>{
    const {t,login}=await setup("cashier");
    await expect(t.mutation(api.invoices.push,{token:login.token,invoices:[{...invoice,total:999}]})).rejects.toThrow("Invalid invoice totals");
  });
  it("rejects non-finite amounts",async()=>{
    const {t,login}=await setup("cashier");
    await expect(t.mutation(api.invoices.push,{token:login.token,invoices:[{...invoice,total:NaN}]})).rejects.toThrow("Invalid invoice totals");
  });
  it("revokes access on logout",async()=>{
    const {t,login}=await setup();await t.mutation(api.authSessions.logout,{token:login.token});
    await expect(t.query(api.invoices.summary,{token:login.token})).rejects.toThrow("AUTH_REQUIRED");
  });
  it("rejects expired sessions and disabled users",async()=>{
    const {t,login}=await setup();
    await t.run(async ctx=>{const u=await ctx.db.query("users").unique();await ctx.db.patch(u!._id,{disabled:true});});
    await expect(t.query(api.authSessions.me,{token:login.token})).rejects.toThrow("AUTH_REQUIRED");
    await t.run(async ctx=>{const u=await ctx.db.query("users").unique();await ctx.db.patch(u!._id,{disabled:false});const s=await ctx.db.query("sessions").unique();await ctx.db.patch(s!._id,{expiresAt:Date.now()-1});});
    await expect(t.query(api.authSessions.me,{token:login.token})).rejects.toThrow("AUTH_REQUIRED");
  });
  it("uses generic failures and throttles repeated guesses",async()=>{
    const t=convexTest(schema,modules);
    await t.mutation(internal.authSessions.provision,{username:"manager",passwordHash:hash,role:"manager"});
    for(let i=0;i<5;i++)expect(await t.action(api.auth.login,{username:"manager",password:"wrong"})).toEqual({error:"INVALID_CREDENTIALS"});
    expect(await t.action(api.auth.login,{username:"manager",password})).toEqual({error:"TOO_MANY_ATTEMPTS"});
    expect(await t.action(api.auth.login,{username:"missing-user",password})).toEqual({error:"INVALID_CREDENTIALS"});
  });
});
