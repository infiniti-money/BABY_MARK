import test from 'node:test';import assert from 'node:assert/strict';import {createD1} from './helpers/d1.mjs';import {seedDemo} from './helpers/demo.mjs';import * as auth from '../../functions/api/auth/[action].js';import * as payroll from '../../functions/api/admin/payroll.js';import * as scheduler from '../../functions/api/maintenance/rosters.js';
test('14-store demo: 31 accounts, 280 future shifts, scoped login and monthly closing',async()=>{const db=await createD1();try{
 const cron='a'.repeat(64),d=await seedDemo(db,cron);assert.equal(d.accounts.length,31);assert.equal(d.created,280);
 const env={DB:db,ROSTER_CRON_SECRET:cron};const request=(path,body,token)=>new Request('https://test.invalid/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const login=async username=>{const r=await auth.onRequestPost({env,params:{action:'login'},request:request('login',{username,secret:d.secret})});assert.equal(r.status,200);return (await r.json()).token};
 const admin=await login('demo-admin'),staff=await login('demo-01-a'),manager=await login('demo-ql-01');
 for(const token of [staff,manager])assert.equal((await payroll.onRequestGet({env,request:request('payroll?month='+d.prevMonth,null,token)})).status,403);
 const draft=await (await payroll.onRequestGet({env,request:request('payroll?month='+d.prevMonth,null,admin)})).json();assert.equal(draft.data.missing_rates,0);assert.equal(draft.data.pending,0);assert.equal(draft.data.rows.length,30);assert.equal(draft.data.leave_shifts,14);assert.equal(draft.data.absences,14);
 assert.equal((await payroll.onRequestPost({env,request:request('payroll',{action:'close',month:d.prevMonth,reviewed:true,reason:'DEMO đã đối soát',expected_revision:0},admin)})).status,201);
 const repeat=await (await scheduler.onRequestPost({env,request:request('maintenance/rosters?branch_id=BM-001',{},cron)})).json();assert.equal(repeat.created,0);assert.equal(repeat.skipped,20);assert.equal(repeat.failed,0);
 await assert.rejects(seedDemo(db,cron),/empty profile/);
 }finally{db.close()}});
