import test from 'node:test';import assert from 'node:assert/strict';import {appFixture} from './helpers/app.mjs';import {dayVN,shiftInterval} from '../lib/access.mjs';import * as api from '../../functions/api/admin/payroll.js';
test('manual partial full-day review is scoped, append-only and invalidated when evidence changes',async()=>{const f=await appFixture();try{
 const month=new Date(Date.parse(dayVN().slice(0,7)+'-01T00:00:00Z')-35*86400000).toISOString().slice(0,7),day=month+'-10',a=shiftInterval(day,'07:00','21:30'),id=crypto.randomUUID();
 await f.db.prepare("INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES('BM-ALLDAY','Ca cả ngày','07:00','21:30',5)").run();
 await f.db.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,'BM-001','BM-ALLDAY',?,?,?,5)").bind(id,f.ids.staff,day,a.starts_at,a.ends_at).run();
 for(const [type,stamp] of [['IN',a.starts_at],['OUT',a.starts_at+300000]]){const x=crypto.randomUUID();await f.db.prepare("INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status) VALUES(?,?,?,?,?,20,106,5,0,?,'ON_TIME')").bind(x,id,f.ids.staff,type,stamp,'timemark/'+x+'.jpg').run();}
 const get=async()=> (await (await f.call(api,'admin',{method:'GET',query:'?month='+month})).json()).data;
 const d=await get();assert.equal(d.issues,1);assert.equal(d.work_unit_reviews[0].review_required,true);
 const body={action:'review-units',month,assignment_id:id,units:0.5,reason:'Đã đối soát chính sách',reviewed:true,expected_source_version:d.source_version};
 assert.equal((await f.call(api,'staff',{body})).status,403);assert.equal((await f.call(api,'admin',{body})).status,201);
 const after=await get();assert.equal(after.issues,0);assert.equal(after.rows.find(x=>x.id===f.ids.staff).work_units,0.5);assert.equal(after.work_unit_reviews[0].review_required,false);
 assert.equal((await f.call(api,'admin',{body})).status,409);
 await f.db.prepare("UPDATE attendances SET server_timestamp=server_timestamp+60000 WHERE assignment_id=? AND type='OUT'").bind(id).run();
 const changed=await get();assert.equal(changed.issues,1);assert.equal(changed.rows.find(x=>x.id===f.ids.staff).work_units,0);
 }finally{f.close()}});
