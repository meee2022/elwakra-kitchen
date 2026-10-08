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
  it("takes card sales as paid on the spot and reports them apart from cash",async()=>{
    const {t,login}=await setup("cashier");
    const push=(over:object)=>t.mutation(api.invoices.push,{token:login.token,invoices:[{...invoice,...over}]});
    await push({uid:"card-1",type:"card",paid:true});
    await expect(push({uid:"card-2",type:"card",paid:false})).rejects.toThrow("Invalid invoice state");
    await expect(push({uid:"cheque-1",type:"cheque",paid:true})).rejects.toThrow("Invalid invoice state");
    await t.mutation(internal.authSessions.provision,{username:"boss",passwordHash:hash,role:"manager"});
    const boss=await t.action(api.auth.login,{username:"boss",password});
    const r=await t.query(api.invoices.summary,{token:boss.token});
    expect(r.card).toBe(10);expect(r.cash).toBe(0);expect(r.total).toBe(10);
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

describe("account management",()=>{
  const fresh="another-good-password";
  const signIn=(t:any,username:string,pw:string)=>t.action(api.auth.login,{username,password:pw});
  it("is closed to cashiers and to callers without a session",async()=>{
    const {t,login}=await setup("cashier");const token=login.token;
    await expect(t.query(api.authSessions.accounts,{token})).rejects.toThrow("FORBIDDEN");
    await expect(t.action(api.auth.createAccount,{token,password,username:"sara",role:"manager",newPassword:fresh})).rejects.toThrow("FORBIDDEN");
    await expect(t.action(api.auth.setPassword,{token,password,username:"cashier",newPassword:fresh})).rejects.toThrow("FORBIDDEN");
    await expect(t.action(api.auth.setDisabled,{token,password,username:"cashier",disabled:false})).rejects.toThrow("FORBIDDEN");
    await expect(t.action(api.auth.createAccount,{token:"0".repeat(64),password,username:"sara",role:"cashier",newPassword:fresh})).rejects.toThrow("AUTH_REQUIRED");
    expect((await t.run(ctx=>ctx.db.query("users").collect())).length).toBe(1);
  });
  it("lets a manager add an account that can sign in, and lists accounts without their hashes",async()=>{
    const {t,login}=await setup();
    await t.action(api.auth.createAccount,{token:login.token,password,username:" Sara ",role:"cashier",newPassword:fresh});
    expect((await signIn(t,"sara",fresh)).role).toBe("cashier");
    const list=await t.query(api.authSessions.accounts,{token:login.token});
    expect(list).toEqual([{username:"manager",role:"manager",disabled:false},{username:"sara",role:"cashier",disabled:false}]);
  });
  it("rejects a wrong manager password, duplicate names, bad names and short passwords",async()=>{
    const {t,login}=await setup();const base={token:login.token,password,username:"sara",role:"cashier" as const,newPassword:fresh};
    await expect(t.action(api.auth.createAccount,{...base,password:"not-the-password"})).rejects.toThrow("WRONG_PASSWORD");
    await expect(t.action(api.auth.createAccount,{...base,username:"manager"})).rejects.toThrow("USERNAME_TAKEN");
    await expect(t.action(api.auth.createAccount,{...base,username:"a b"})).rejects.toThrow("INVALID_USERNAME");
    await expect(t.action(api.auth.createAccount,{...base,newPassword:"short"})).rejects.toThrow("WEAK_PASSWORD");
    await expect(t.action(api.auth.setPassword,{token:login.token,password,username:"nobody",newPassword:fresh})).rejects.toThrow("NOT_FOUND");
    expect((await t.run(ctx=>ctx.db.query("users").collect())).length).toBe(1);
  });
  it("resets a password and closes that account's sessions",async()=>{
    const {t,login}=await setup();
    await t.action(api.auth.createAccount,{token:login.token,password,username:"sara",role:"cashier",newPassword:fresh});
    const sara=await signIn(t,"sara",fresh);
    await t.action(api.auth.setPassword,{token:login.token,password,username:"sara",newPassword:"a-third-password"});
    await expect(t.query(api.authSessions.me,{token:sara.token})).rejects.toThrow("AUTH_REQUIRED");
    expect((await signIn(t,"sara",fresh)).error).toBe("INVALID_CREDENTIALS");
    expect((await signIn(t,"sara","a-third-password")).role).toBe("cashier");
  });
  it("disables and re-enables an account, but never the manager's own",async()=>{
    const {t,login}=await setup();
    await t.action(api.auth.createAccount,{token:login.token,password,username:"sara",role:"manager",newPassword:fresh});
    const sara=await signIn(t,"sara",fresh);
    await t.action(api.auth.setDisabled,{token:login.token,password,username:"sara",disabled:true});
    await expect(t.query(api.authSessions.me,{token:sara.token})).rejects.toThrow("AUTH_REQUIRED");
    expect((await signIn(t,"sara",fresh)).error).toBe("INVALID_CREDENTIALS");
    await t.action(api.auth.setDisabled,{token:login.token,password,username:"sara",disabled:false});
    expect((await signIn(t,"sara",fresh)).role).toBe("manager");
    await expect(t.action(api.auth.setDisabled,{token:login.token,password,username:"manager",disabled:true})).rejects.toThrow("CANNOT_DISABLE_SELF");
  });
  it("limits wrong manager passwords without charging successful changes",async()=>{
    const {t,login}=await setup();const base={token:login.token,password,role:"cashier" as const,newPassword:fresh};
    for(let i=0;i<7;i++)await t.action(api.auth.createAccount,{...base,username:"cashier"+i});
    for(let i=0;i<5;i++)await expect(t.action(api.auth.createAccount,{...base,username:"x"+i+"yz",password:"not-the-password"})).rejects.toThrow("WRONG_PASSWORD");
    await expect(t.action(api.auth.createAccount,{...base,username:"late"})).rejects.toThrow("TOO_MANY_ATTEMPTS");
  });
});

describe("manager mirror of the cloud",()=>{
  const inv=(n:number,over:object={})=>({...invoice,uid:"m-"+n,no:n,hash:"h"+n,...over});
  it("is closed to cashiers and to callers without a session",async()=>{
    const {t,login}=await setup("cashier");
    await expect(t.query(api.invoices.changes,{token:login.token,since:0})).rejects.toThrow("FORBIDDEN");
    await expect(t.query(api.invoices.changes,{token:"0".repeat(64),since:0})).rejects.toThrow("AUTH_REQUIRED");
  });
  it("returns only what arrived or changed after the given moment, without server fields",async()=>{
    const {t,login}=await setup();const token=login.token;
    await t.mutation(api.invoices.push,{token,invoices:[inv(1),inv(2)]});
    const first=await t.query(api.invoices.changes,{token,since:0});
    expect(first.rows.map((r:any)=>r.uid)).toEqual(["m-1","m-2"]);expect(first.more).toBe(false);
    expect(Object.keys(first.rows[0]).filter(k=>k.startsWith("_"))).toEqual([]);
    expect((await t.query(api.invoices.changes,{token,since:first.next})).rows).toEqual([]);
    await new Promise(r=>setTimeout(r,5));
    await t.mutation(api.invoices.push,{token,invoices:[inv(1,{status:"void"}),inv(3)]});
    const second=await t.query(api.invoices.changes,{token,since:first.next});
    expect(second.rows.map((r:any)=>r.uid+":"+r.status).sort()).toEqual(["m-1:void","m-3:active"]);
  });
  it("never splits invoices that arrived together across pages",async()=>{
    const {t,login}=await setup();const token=login.token;
    await t.mutation(api.invoices.push,{token,invoices:[inv(1),inv(2),inv(3)]});   // one push: one arrival time
    await new Promise(r=>setTimeout(r,5));
    await t.mutation(api.invoices.push,{token,invoices:[inv(4)]});
    const page=await t.query(api.invoices.changes,{token,since:0,limit:2});
    expect(page.rows.map((r:any)=>r.no).sort()).toEqual([1,2,3]);expect(page.more).toBe(true);
    const rest=await t.query(api.invoices.changes,{token,since:page.next,limit:2});
    expect(rest.rows.map((r:any)=>r.no)).toEqual([4]);expect(rest.more).toBe(false);
  });
});
