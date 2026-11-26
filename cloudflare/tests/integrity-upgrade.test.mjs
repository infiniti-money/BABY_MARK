import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import * as extra from '../../functions/api/extra-attendance.js';
import {dayVN} from '../lib/access.mjs';

test('extra attendance rejects overlap with an existing assignment', async()=>{
 const f=await appFixture();
 try{
  const now=Date.now(), start=new Date(now+7*3600000-60000).toISOString().slice(11,16), end=new Date(now+7*3600000+3600000).toISOString().slice(11,16);
  await f.db.prepare('INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES(?,?,?,?,0)').bind('overlap-extra','Ca chồng lịch',start,end).run();
  const response=await f.call(extra,'staff',{body:{action:'create',branch_id:'BM-001',shift_id:'overlap-extra',work_date:dayVN(now-60000),kind:'EXTRA',reason:'Ca này bị chồng lịch'}});
  assert.equal(response.status,409);
  assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM extra_attendance WHERE kind='EXTRA'").first()).n,0);
 }finally{f.close()}
});

test('D1 rejects attendance ownership mismatch and audit mutation', async()=>{
 const f=await appFixture();
 try{
  const values=['mismatch',f.assignment,f.ids.other,'IN',Date.now(),20,106,5,1,'','ON_TIME',0,0];
  await assert.rejects(()=>f.db.prepare('INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,address_text,status,late_minutes,early_minutes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...values).run(),/attendance user does not match assignment/);
  await f.db.prepare("INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at) VALUES('immutable-audit',?,'test','x','CREATE','{}',?)").bind(f.ids.admin,Date.now()).run();
  await assert.rejects(()=>f.db.prepare("UPDATE management_audit SET action='CHANGED' WHERE id='immutable-audit'").run(),/management_audit is append-only/);
  await assert.rejects(()=>f.db.prepare("DELETE FROM management_audit WHERE id='immutable-audit'").run(),/management_audit is append-only/);
 }finally{f.close()}
});
