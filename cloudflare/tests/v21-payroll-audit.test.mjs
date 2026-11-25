import test from 'node:test';import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import {findAttendanceOverlaps} from '../lib/payroll.mjs';
import {calculatePay} from '../lib/payroll-components.mjs';
import {dayVN,shiftInterval} from '../lib/access.mjs';
import * as api from '../../functions/api/admin/payroll.js';
test('payroll flags overlapping actual hours, including nested ranges, without flagging adjacent or other users',()=>{
 const base={user_id:'u',work_date:'2026-10-01',starts_at:0,ends_at:36000000,grace_minutes:5};
 const row=(id,i,o,fields={})=>({...base,id,in_at:i*60000,out_at:o*60000,...fields});
 const x=findAttendanceOverlaps([row('a',0,100),row('b',20,30),row('c',50,150),row('d',150,200),row('other',20,50,{user_id:'v'}),row('pending',20,50,{request_state:'PENDING'}),row('outside',20,50,{in_status:'OUTSIDE'})],Date.now());
 assert.deepEqual([...x.ids].sort(),['a','b','c']);assert.equal(x.pairs.length,2);assert.deepEqual(x.pairs.map(p=>p.overlap_minutes),[10,50]);
});
test('payroll golden cases preserve rates, no silent overtime payment or deductions',()=>{
 const row={regular_minutes:420,work_units:2,overtime_minutes:90},input={hourly_rate:30000,additions:10000,deductions:5000};
 assert.equal(calculatePay(row,input,{}).estimated_total,215000);
 const paid=calculatePay(row,input,{salary_mode:'unit',unit_rate:200000,overtime_rate:60000,overtime_approved_minutes:60});
 assert.equal(paid.estimated_total,465000);assert.equal(paid.overtime_paid_minutes,60);
 const changed=calculatePay({...row,overtime_minutes:30},input,{salary_mode:'month',monthly_base:5000000,overtime_rate:60000,overtime_approved_minutes:60});
 assert.equal(changed.overtime_review_required,true);assert.equal(changed.estimated_total,5035000);
 assert.equal(calculatePay(row,null,{}).estimated_total,null);
});
test('month boundary overlapping attendance blocks closing; export marks draft and pending',async()=>{const f=await appFixture();try{
 const month=new Date(Date.parse(dayVN().slice(0,7)+'-01T00:00:00Z')-35*86400000).toISOString().slice(0,7);
 const first=month+'-01',prev=new Date(Date.parse(first+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const a=shiftInterval(prev,'20:00','04:00'),b=shiftInterval(first,'04:00','12:00');
 for(const [day,interval,entry,exit] of [[prev,a,a.starts_at,a.ends_at+3600000],[first,b,b.starts_at,b.ends_at]]){
  const id=crypto.randomUUID();await f.db.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,'BM-001','test-day',?,?,?,5)").bind(id,f.ids.staff,day,interval.starts_at,interval.ends_at).run();
  for(const [type,stamp] of [['IN',entry],['OUT',exit]]){const x=crypto.randomUUID();await f.db.prepare("INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status) VALUES(?,?,?,?,?,20,106,5,0,?,'ON_TIME')").bind(x,id,f.ids.staff,type,stamp,'timemark/'+x+'.jpg').run();}
 }
 for(const user_id of [f.ids.staff,f.ids.other,f.ids.manager])assert.equal((await f.call(api,'admin',{body:{month,action:'save-input',user_id,hourly_rate:30000,additions:0,deductions:0,note:''}})).status,200);
 const d=(await (await f.call(api,'admin',{method:'GET',query:'?month='+month})).json()).data;
 assert.equal(d.overlap_count,1);assert.equal(d.issues,1);assert.equal(d.rows.find(r=>r.id===f.ids.staff).worked_minutes,480);
 const close=await f.call(api,'admin',{body:{month,action:'close',expected_revision:0,expected_source_version:d.source_version,reason:'Local test review',reviewed:true}});assert.equal(close.status,409);assert.match((await close.json()).error,/trùng nhau/);
 const exportResponse=await f.call(api,'admin',{method:'GET',query:'?month='+month+'&format=csv'});assert.equal(exportResponse.status,200);const csv=await exportResponse.text();assert.match(csv,/Ca chờ duyệt/);assert.match(csv,/Dự thảo/);assert.match(csv,/Phiên bản nguồn/);
 }finally{f.close()}});
