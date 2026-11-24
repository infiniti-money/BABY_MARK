import test from 'node:test';import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import {hrReadiness,rosterReadiness} from '../lib/hr-readiness.mjs';
import {attendanceExceptions,groupBranchReports} from '../lib/attendance-exceptions.mjs';
import * as health from '../../functions/api/cloudflare/health.js';
import * as alerts from '../../functions/api/alerts.js';
import * as reports from '../../functions/api/reports.js';
test('HR checks all five migration objects without leaking secret',async()=>{const f=await appFixture();try{
 const check=async()=> (await (await health.onRequestGet({env:f.env})).json()).hr_ready;
 assert.equal(await check(),true);await f.db.exec('DROP TRIGGER payroll_closings_immutable_update');assert.equal(await check(),false);assert.deepEqual((await hrReadiness(f.db)).missing,['payroll_closings_immutable_update']);
 await f.db.exec('DROP TABLE payroll_inputs');assert.equal(await check(),false);
 const r=await rosterReadiness({...f.env,ROSTER_CRON_SECRET:'a'.repeat(64)},await hrReadiness(f.db));assert.equal(r.secret_ready,true);assert.equal(r.enabled,0);assert.equal(JSON.stringify(r).includes('a'.repeat(64)),false);
 }finally{f.close()}});
test('exception classification covers missing records, approved leave and corrected times',()=>{
 const a={starts_at:1000000,ends_at:4600000,grace_minutes:5,branch_id:'b',branch_code:'B',branch_name:'Branch'};
 assert.deepEqual(attendanceExceptions(a,2000000),['MISSING_IN']);assert.deepEqual(attendanceExceptions(a,5000000),['ABSENT_RECORD']);
 assert.deepEqual(attendanceExceptions({...a,in_at:1000000},5000000),['MISSING_OUT']);
 assert.deepEqual(attendanceExceptions({...a,in_at:1600000,out_at:4000000,in_status:'OUTSIDE'},5000000),['LATE','EARLY','OUTSIDE']);
 assert.deepEqual(attendanceExceptions({...a,request_kind:'LEAVE',request_state:'APPROVED'},5000000),[]);
 assert.deepEqual(attendanceExceptions({...a,request_kind:'CORRECTION',request_state:'APPROVED',proposed_in:1000000,proposed_out:4600000},5000000),[]);
 assert.deepEqual(attendanceExceptions({...a,extra_state:'PENDING'},5000000),[]);
 const [b]=groupBranchReports([a,{...a,in_at:1000000,out_at:4600000},{...a,extra_state:'PENDING'}],5000000);assert.equal(b.scheduled,2);assert.equal(b.completed,1);assert.equal(b.absent,1);assert.equal(b.pending,1);assert.equal(b.minutes,60);
});
test('reports and exceptions respect role/store scope',async()=>{const f=await appFixture();try{
 await f.db.exec('UPDATE system_settings SET late_alerts=1 WHERE id=1');
 const query='?from='+f.workDate+'&to='+f.workDate;
 const res=await f.call(alerts,'manager',{method:'GET',query});assert.equal(res.status,200);const ar=await res.json();assert.equal(ar.alerts.length,1);assert.equal(ar.alerts[0].id,f.assignment);assert.deepEqual(ar.alerts[0].flags,['MISSING_IN']);
 assert.equal((await f.call(alerts,'staff',{method:'GET',query})).status,403);
 const d=await (await f.call(reports,'manager',{method:'GET',query})).json();assert.deepEqual(d.branches.map(b=>b.branch_id),['BM-001']);assert.ok(Number.isFinite(d.computed_at));assert.deepEqual(d.rows[0].exception_flags,['MISSING_IN']);
 const all=await (await f.call(reports,'admin',{method:'GET',query})).json();assert.equal(all.branches.length,2);
 }finally{f.close()}});
