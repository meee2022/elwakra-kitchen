import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { scryptSync } from "node:crypto";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
const password = "test-only-strong-password";
const salt = "2".repeat(32);
const hash = "scrypt:"+salt+":"+scryptSync(password,salt,64).toString("hex");

async function setup(){
  const t=convexTest(schema,modules);
  for(const role of ["manager","cashier"] as const) await t.mutation(internal.authSessions.provision,{username:role,passwordHash:hash,role});
  const manager=(await t.action(api.auth.login,{username:"manager",password})).token;
  const cashier=(await t.action(api.auth.login,{username:"cashier",password})).token;
  return {t,manager,cashier};
}
const base={date:"2026-10-24",time:"12:00",createdAt:"2026-10-24T09:00:00Z",customer:"Test",phone:"5555",type:"cash",paid:true,paidAt:null,
  discount:0,delivery:0,vatRate:0,vat:0,note:"",status:"active",org:{}};
const planned=[{ar:"Feast",en:"Feast",qty:1,price:3500}];
// The deposit invoice: one line for the deposit, with the booking riding on it.
const deposit={...base,uid:"dep-1",no:1,hash:"d1",items:[{ar:"Deposit",en:"Deposit",qty:1,price:2000}],subtotal:2000,total:2000,
  eventAt:"2026-10-27T19:00",booking:{items:planned,total:3500}};
// The final invoice on the event day: the whole order less the deposit.
const final={...base,uid:"fin-1",no:2,hash:"f1",date:"2026-10-27",items:planned,subtotal:3500,total:1500,deposit:2000,depositNo:1,depositUid:"dep-1"};

describe("end-of-day takings",()=>{
  it("totals one day across devices for any account, deposits included",async()=>{
    const {t,manager,cashier}=await setup();
    await t.mutation(api.invoices.push,{token:cashier,invoices:[deposit,{...base,uid:"c-1",no:5,hash:"c1",type:"card",items:[{ar:"A",en:"A",qty:2,price:30}],subtotal:60,total:60}]});
    await t.mutation(api.invoices.push,{token:manager,invoices:[{...base,uid:"m-1",no:6,hash:"m1",status:"void",items:[{ar:"A",en:"A",qty:1,price:30}],subtotal:30,total:30},
      {...base,uid:"old",no:7,hash:"o1",date:"2026-10-23",items:[{ar:"A",en:"A",qty:1,price:99}],subtotal:99,total:99}]});
    const day=await t.query(api.invoices.daySummary,{token:cashier,date:"2026-10-24"});
    expect(day).toEqual({date:"2026-10-24",count:2,voids:1,cash:2000,card:60,credit:0,deposits:2000,total:2060});
    await expect(t.query(api.invoices.daySummary,{date:"2026-10-24"})).rejects.toThrow("AUTH_REQUIRED");
  });
});

describe("bookings with a deposit",()=>{
  it("lets a cashier take a deposit and lists the booking for every account",async()=>{
    const {t,manager,cashier}=await setup();
    await t.mutation(api.invoices.push,{token:cashier,invoices:[deposit]});
    for(const token of [manager,cashier]){
      const list=await t.query(api.invoices.bookings,{token});
      expect(list.map(b=>[b.uid,b.eventAt,b.booking?.total,b.total])).toEqual([["dep-1","2026-10-27T19:00",3500,2000]]);
    }
    await expect(t.query(api.invoices.bookings,{})).rejects.toThrow("AUTH_REQUIRED");
  });
  it("accepts a final invoice that takes the deposit off, and refuses wrong totals",async()=>{
    const {t,cashier}=await setup();
    await t.mutation(api.invoices.push,{token:cashier,invoices:[deposit]});
    await expect(t.mutation(api.invoices.push,{token:cashier,invoices:[{...final,total:3500}]})).rejects.toThrow("Invalid invoice totals");
    await expect(t.mutation(api.invoices.push,{token:cashier,invoices:[{...final,deposit:4000,total:-500}]})).rejects.toThrow("Invalid invoice totals");
    await t.mutation(api.invoices.push,{token:cashier,invoices:[final]});
    expect(await t.query(api.invoices.bookings,{token:cashier})).toEqual([]);   // carried out: off the list
  });
  it("drops cancelled or closed bookings, and only a manager can close one",async()=>{
    const {t,manager,cashier}=await setup();
    await t.mutation(api.invoices.push,{token:cashier,invoices:[deposit,{...deposit,uid:"dep-2",no:3,hash:"d2"}]});
    const closed={...deposit,booking:{...deposit.booking,closed:true}};
    await expect(t.mutation(api.invoices.push,{token:cashier,invoices:[closed]})).rejects.toThrow("FORBIDDEN");
    await t.mutation(api.invoices.push,{token:manager,invoices:[closed,{...deposit,uid:"dep-2",no:3,hash:"d2",status:"void"}]});
    expect(await t.query(api.invoices.bookings,{token:manager})).toEqual([]);
  });
});
