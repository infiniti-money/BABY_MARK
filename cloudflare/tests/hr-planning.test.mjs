import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import * as rosters from '../../functions/api/admin/rosters.js';
import * as scheduler from '../../functions/api/maintenance/rosters.js';
import * as workforce from '../../functions/api/workforce.js';
import * as payroll from '../../functions/api/admin/payroll.js';
import {dayVN,shiftInterval} from '../lib/access.mjs';
test('opt-in scheduler respects weekdays, keeps existing slots and creates future leave requests',async()=>{
 const f=await appFixture();try{
 const call=body=>f.call(rosters,'admin',{body});
 await call({action:'presets'});
 await f.db.prepare("UPDATE profiles SET department='Bán hàng' WHERE id IN (?,?)").bind(f.ids.staff,f.ids.other).run();
 assert.equal((await call({action:'save',branch_id:'BM-001',morning_user_id:f.ids.staff,evening_user_id:f.ids.other,morning_shift_id:'BM-MORNING',evening_shift_id:'BM-EVENING',handover:'split'})).status,200);
 const config={action:'auto-save',branch_id:'BM-001',enabled:true,weekdays:[1,2,3,4,5]};
 assert.equal((await f.call(rosters,'staff',{body:config})).status,403);
 assert.equal((await call(config)).status,200);
 const secret='a'.repeat(40),env={...f.env,ROSTER_CRON_SECRET:secret};
 const run=(query='',token=secret)=>scheduler.onRequestPost({env,request:new Request('https://test.invalid/api/maintenance/rosters'+query,{method:'POST',headers:{Authorization:'Bearer '+token}})});
 assert.equal((await run('','bad')).status,401);
 assert.deepEqual((await (await run()).json()).branches,['BM-001']);
 const first=await (await run('?branch_id=BM-001')).json();assert.equal(first.created,20);assert.equal(first.failed,0);
 const again=await (await run('?branch_id=BM-001')).json();assert.equal(again.created,0);assert.equal(again.skipped,20);
 const leave=await f.call(workforce,'staff',{body:{action:'leave-range',from:first.from,to:first.to,reason:'Nghỉ việc gia đình'}});
 assert.equal(leave.status,201);assert.equal((await leave.json()).created,10);
 assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM workforce_requests WHERE user_id=? AND kind='LEAVE' AND state='PENDING'").bind(f.ids.staff).first()).n,10);
 assert.equal((await call({...config,enabled:false})).status,200);
 assert.deepEqual((await (await run()).json()).branches,[]);
 assert.equal((await run('?branch_id=BM-001')).status,409);
 }finally{f.close()}
});
test('payroll uses explicit rate, regular time and immutable revisions',async()=>{
 const f=await appFixture();try{
 const month=new Date(Date.parse(dayVN().slice(0,7)+'-01T00:00:00Z')-35*86400000).toISOString().slice(0,7),day=month+'-10',interval=shiftInterval(day,'08:00','16:00'),assignment=crypto.randomUUID();
 await f.db.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,'BM-001','test-day',?,?,?,5)").bind(assignment,f.ids.staff,day,interval.starts_at,interval.ends_at).run();
 for(const [type,stamp] of [['IN',interval.starts_at-3600000],['OUT',interval.ends_at+3600000]]){
  const id=crypto.randomUUID();await f.db.prepare("INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status) VALUES(?,?,?,?,?,20,106,5,0,?,'ON_TIME')").bind(id,assignment,f.ids.staff,type,stamp,'timemark/'+id+'.jpg').run();
 }
 const get=(who='admin',q='')=>f.call(payroll,who,{method:'GET',query:'?month='+month+q});
 const post=body=>f.call(payroll,'admin',{body:{month,...body}});
 assert.equal((await get('staff')).status,403);
 assert.equal((await get('manager')).status,403);
 assert.equal((await post({action:'close',expected_revision:0,reviewed:true,reason:'Đối soát tháng'})).status,409);
 for(const user_id of [f.ids.staff,f.ids.other,f.ids.manager])assert.equal((await post({action:'save-input',user_id,hourly_rate:30000,additions:0,deductions:0,note:''})).status,200);
 const live=(await (await get()).json()).data,d=live.rows.find(r=>r.id===f.ids.staff);
 assert.equal(live.attendance_detail.version,1);const detail=live.attendance_detail.records.find(a=>a[0]===f.ids.staff);assert.equal(detail[14],600);assert.equal(detail[15],480);assert.equal(detail[17],60);
 assert.equal(d.regular_minutes,480);assert.equal(d.worked_minutes,600);assert.equal(d.extra_minutes,120);assert.equal(d.estimated_total,240000);
 assert.equal((await post({action:'close',expected_revision:0,reviewed:true,reason:'Đối soát tháng'})).status,201);
 assert.equal((await post({action:'save-input',user_id:f.ids.staff,hourly_rate:40000,additions:0,deductions:0,note:''})).status,200);
 const closed=(await (await get('admin','&revision=1')).json()).data,frozen=closed.rows.find(r=>r.id===f.ids.staff);assert.equal(frozen.estimated_total,240000);assert.deepEqual(closed.attendance_detail,live.attendance_detail);
 assert.equal((await post({action:'close',expected_revision:0,reviewed:true,reason:'Đối soát lại'})).status,409);
 assert.equal((await post({action:'close',expected_revision:1,reviewed:true,reason:'Đối soát lại'})).status,201);
 await assert.rejects(f.db.prepare("UPDATE payroll_closings SET reason='Changed' WHERE month=?").bind(month).run(),/PAYROLL_SNAPSHOT_IMMUTABLE/);
 }finally{f.close()}
});
