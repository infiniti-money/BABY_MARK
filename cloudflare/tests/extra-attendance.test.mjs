import test from 'node:test';import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import * as api from '../../functions/api/extra-attendance.js';
import {dayVN} from '../lib/access.mjs';
import {readAssignments,summarizeAssignment} from '../lib/reports.mjs';

test('extra decision succeeds with D1 trigger-inclusive changes and rejects a replay without another audit',async()=>{
 const f=await appFixture();try{
  const now=Date.now(),clock=t=>new Date(t+7*3600000).toISOString().slice(11,16),start=now-60000,end=now+3600000;
  await f.db.prepare("INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES('trigger-extra','Ca kiểm thử trigger',?,?,0)").bind(clock(start),clock(end)).run();
  const created=await f.call(api,'manager',{body:{action:'create',branch_id:'BM-001',shift_id:'trigger-extra',work_date:dayVN(start),kind:'EXTRA',reason:'Kiểm thử phản hồi quyết định'}});assert.equal(created.status,201);const {assignment_id}=await created.json();
  const batch=f.db.batch.bind(f.db);f.db.batch=async statements=>{const result=await batch(statements);for(const [i,s] of statements.entries())if(s._sql.startsWith('UPDATE extra_attendance'))result[i].meta.changes+=2;return result;};
  assert.equal((await f.call(api,'admin',{body:{action:'decide',assignment_id,state:'APPROVED'}})).status,200);
  assert.equal((await f.db.prepare('SELECT state FROM extra_attendance WHERE assignment_id=?').bind(assignment_id).first()).state,'APPROVED');
  const count=await f.db.prepare("SELECT COUNT(*) n FROM management_audit WHERE resource='extra-attendance'").first();
  assert.equal((await f.call(api,'admin',{body:{action:'decide',assignment_id,state:'REJECTED',note:'Thử gửi lại'}})).status,409);
  assert.deepEqual(await f.db.prepare("SELECT COUNT(*) n FROM management_audit WHERE resource='extra-attendance'").first(),count);
 }finally{f.close();}
});
test('extra attendance is own, scoped, reviewable and excluded from totals until approved',async()=>{
 const f=await appFixture();try{
 const now=Date.now(),start=new Date(now+7*3600000-60000).toISOString().slice(11,16),end=new Date(now+7*3600000+3600000).toISOString().slice(11,16),date=dayVN(now-60000);
 await f.db.prepare('INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES(?,?,?,?,0)').bind('test-extra','Ca bổ sung',start,end).run();
 const body={action:'create',branch_id:'BM-001',shift_id:'test-extra',work_date:date,kind:'COVER',replaced_name:'Nhân viên A',reason:'Thay ca đột xuất'};
 assert.equal((await f.call(api,'staff',{body})).status,409);
 const created=await f.call(api,'manager',{body});assert.equal(created.status,201);const {assignment_id}=await created.json();
 assert.equal((await f.call(api,'manager',{body:{action:'decide',assignment_id,state:'APPROVED'}})).status,409);
 assert.equal((await f.call(api,'staff',{body:{action:'decide',assignment_id,state:'APPROVED'}})).status,403);
 const pending=await f.db.prepare('SELECT * FROM extra_attendance WHERE assignment_id=?').bind(assignment_id).first();assert.equal(pending.state,'PENDING');
 assert.equal(summarizeAssignment({extra_state:'PENDING',in_at:now,out_at:now+60000}).minutes,0);
 assert.equal((await f.call(api,'admin',{body:{action:'decide',assignment_id,state:'APPROVED'}})).status,200);
 assert.equal((await f.db.prepare('SELECT state FROM extra_attendance WHERE assignment_id=?').bind(assignment_id).first()).state,'APPROVED');
 }finally{f.close()}
});
