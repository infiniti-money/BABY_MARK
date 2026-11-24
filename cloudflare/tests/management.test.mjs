import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './helpers/d1.mjs';
import {digest} from '../lib/auth.mjs';
import {shiftInterval,csvCell} from '../lib/access.mjs';
import {summarizeAssignment,summarizeReport} from '../lib/reports.mjs';
import * as admin from '../../functions/api/admin/[resource].js';
import * as assignments from '../../functions/api/assignments.js';
import * as reports from '../../functions/api/reports.js';
import * as workforce from '../../functions/api/workforce.js';

async function fixture(){
 const db=await createD1(),sqlite=db.sqlite,tokens={};
 for(const [id,role] of [['admin','admin'],['manager','manager'],['staff','staff'],['other','staff']]){
  sqlite.prepare('INSERT INTO profiles(id,employee_code,full_name,role) VALUES(?,?,?,?)').run(id,id,id==='staff'?'=HYPERLINK("https://example.test")':id,role);
  sqlite.prepare('INSERT INTO credentials(user_id,username,salt,secret_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,'a'.repeat(32),'b'.repeat(64),0,0);
  const token=(id==='admin'?'a':id==='manager'?'b':id==='staff'?'c':'d').repeat(64);tokens[id]=token;
  sqlite.prepare('INSERT INTO sessions(token_hash,user_id,credential_version,created_at,expires_at) VALUES(?,?,1,?,?)').run(await digest('babymark-session-v1:'+token),id,Date.now(),Date.now()+3600000);
 }
 sqlite.prepare('INSERT INTO branch_managers(user_id,branch_id) VALUES(?,?)').run('manager','BM-001');
 sqlite.prepare('INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES(?,?,?,?,?)').run('day','Ca ngày','08:00','16:00',5);
 sqlite.prepare('INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES(?,?,?,?,?)').run('night','Ca đêm','22:00','06:00',0);
 const env={DB:db};
 const call=async(module,who,{method='GET',resource,body,query=''}={})=>{
  const headers={};if(who)headers.authorization='Bearer '+tokens[who];if(body!==undefined)headers['content-type']='application/json';
  return module['onRequest'+(method==='POST'?'Post':'Get')]({request:new Request('https://test.invalid/api/test'+query,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})}),env,params:{resource}});
 };
 const addAssignment=(id,user,branch,date='2026-11-24',shift='day')=>{
  const interval=shiftInterval(date,shift==='day'?'08:00':'22:00',shift==='day'?'16:00':'06:00');
  sqlite.prepare('INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,?,?,?,?,?,?)').run(id,user,branch,shift,date,interval.starts_at,interval.ends_at,shift==='day'?5:0);return interval;
 };
 const addAttendance=(id,assignment,user,type,time)=>sqlite.prepare('INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status) VALUES(?,?,?,?,?,0,0,5,0,?,?)').run(id,assignment,user,type,time,'timemark/'+id+'.jpg','ON_TIME');
 return {sqlite,db,call,addAssignment,addAttendance,close:()=>sqlite.close()};
}

test('admin routes require active administrator and reject invalid GPS',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call(admin,null,{resource:'branches'})).status,401);
  assert.equal((await f.call(admin,'staff',{resource:'branches'})).status,403);
  assert.equal((await f.call(admin,'manager',{resource:'branches'})).status,403);
  const result=await f.call(admin,'admin',{resource:'branches'});assert.equal(result.status,200);assert.equal((await result.json()).branches.length,14);
  assert.equal((await f.call(admin,'admin',{method:'POST',resource:'branches',body:{id:'BM-001',code:'BM-001',name:'Test',latitude:91,longitude:106,allowed_radius:100}})).status,400);
  assert.equal((await f.call(admin,'admin',{method:'POST',resource:'branches',body:{id:'BM-001',code:'BM-001',name:'Đã xác minh',latitude:20,longitude:106,allowed_radius:100,address_text:'Địa chỉ quản trị viên'}})).status,200);
  assert.equal(f.sqlite.prepare('SELECT address_text FROM branches WHERE id=?').get('BM-001').address_text,'Địa chỉ quản trị viên');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM management_audit').get().n,1);
  assert.equal((await f.call(admin,'admin',{method:'POST',resource:'branches',body:{code:'BM-015',name:'Vượt giới hạn cửa hàng',latitude:null,longitude:null,allowed_radius:100}})).status,409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM branches').get().n,14);
 }finally{f.close()}
});

test('Vietnam overnight schedules are derived on server; overlap and invalid days rejected',async()=>{
 const f=await fixture();try{
  let result=await f.call(admin,'admin',{method:'POST',resource:'assignments',body:{user_id:'staff',branch_id:'BM-001',shift_id:'night',work_date:'2026-11-24'}});
  assert.equal(result.status,201);const row=await result.json();assert.equal(row.ends_at-row.starts_at,8*3600000);assert.equal(new Date(row.starts_at).toISOString(),'2026-11-24T15:00:00.000Z');
  assert.equal((await f.call(admin,'admin',{method:'POST',resource:'assignments',body:{user_id:'staff',branch_id:'BM-002',shift_id:'night',work_date:'2026-11-24'}})).status,409);
  assert.equal((await f.call(admin,'admin',{method:'POST',resource:'assignments',body:{user_id:'staff',branch_id:'BM-001',shift_id:'day',work_date:'2026-02-30'}})).status,400);
  f.addAttendance('in',row.id,'staff','IN',row.starts_at);
  assert.equal((await f.call(admin,'admin',{method:'POST',resource:'assignments',body:{id:row.id,user_id:'staff',branch_id:'BM-002',shift_id:'night',work_date:'2026-11-24'}})).status,409);
 }finally{f.close()}
});

test('staff own records and managers branch scopes survive user and branch filter tampering',async()=>{
 const f=await fixture();try{
  f.addAssignment('own','staff','BM-001');f.addAssignment('other','other','BM-002');f.addAssignment('visible','other','BM-001','2026-11-25');
  const query='?from=2026-11-24&to=2026-11-25';
  const own=await (await f.call(assignments,'staff',{query})).json();assert.deepEqual(own.assignments.map(row=>row.id),['own']);
  const managed=await (await f.call(reports,'manager',{query})).json();assert.deepEqual(managed.rows.map(row=>row.id),['own','visible']);
  const stolen=await (await f.call(reports,'staff',{query:query+'&user_id=other'})).json();assert.equal(stolen.rows.length,0);
  const unmanaged=await (await f.call(reports,'manager',{query:query+'&branch_id=BM-002'})).json();assert.equal(unmanaged.rows.length,0);
  f.sqlite.prepare('UPDATE profiles SET active=0 WHERE id=?').run('staff');assert.equal((await f.call(assignments,'staff',{query})).status,401);
 }finally{f.close()}
});

test('CSV export is scoped, escapes formulas and refuses unreasonable date windows',async()=>{
 const f=await fixture();try{
  f.addAssignment('own','staff','BM-001');
  const result=await f.call(reports,'staff',{query:'?from=2026-11-24&to=2026-11-24&format=csv'});
  assert.equal(result.status,200);assert.match(result.headers.get('content-type'),/text\/csv/);assert.match(await result.text(),/"'=HYPERLINK/);
  assert.equal((await f.call(reports,'admin',{query:'?from=2026-01-01&to=2026-12-31'})).status,400);
  assert.equal(csvCell(' \t=1+1'),'"\' \t=1+1"');assert.equal(csvCell('a"b'),'"a""b"');
 }finally{f.close()}
});

test('leave approval prevents attendance and preserves original records; own approval forbidden',async()=>{
 const f=await fixture();try{
  const interval=f.addAssignment('own','staff','BM-001');
  let result=await f.call(workforce,'staff',{method:'POST',body:{assignment_id:'own',kind:'LEAVE',reason:'Việc gia đình'}});assert.equal(result.status,201);const request=await result.json();
  assert.equal((await f.call(workforce,'staff',{method:'POST',body:{action:'decide',id:request.id,state:'APPROVED',decision_note:'Đồng ý'}})).status,403);
  assert.equal((await f.call(workforce,'manager',{method:'POST',body:{action:'decide',id:request.id,state:'APPROVED',decision_note:'Đồng ý nghỉ'}})).status,200);
  assert.throws(()=>f.addAttendance('in','own','staff','IN',interval.starts_at),/APPROVED_LEAVE/);
  assert.equal((await f.call(workforce,'admin',{method:'POST',body:{action:'decide',id:request.id,state:'REJECTED',decision_note:'Đổi ý'}})).status,409);
  f.addAssignment('manager-own','manager','BM-001','2026-11-25');result=await f.call(workforce,'manager',{method:'POST',body:{assignment_id:'manager-own',kind:'LEAVE',reason:'Việc cá nhân'}});const ownRequest=await result.json();
  assert.equal((await f.call(workforce,'manager',{method:'POST',body:{action:'decide',id:ownRequest.id,state:'APPROVED',decision_note:'Tự đồng ý'}})).status,403);
 }finally{f.close()}
});

test('attendance inserted before leave approval atomically rejects approval; correction remains separate',async()=>{
 const f=await fixture();try{
  const interval=f.addAssignment('own','staff','BM-001','2020-01-01');
  let result=await f.call(workforce,'staff',{method:'POST',body:{assignment_id:'own',kind:'LEAVE',reason:'Việc gia đình'}});const pending=await result.json();
  f.addAttendance('in','own','staff','IN',interval.starts_at);
  assert.equal((await f.call(workforce,'admin',{method:'POST',body:{action:'decide',id:pending.id,state:'APPROVED',decision_note:'Đồng ý'}})).status,409);
  assert.equal(f.sqlite.prepare('SELECT state FROM workforce_requests WHERE id=?').get(pending.id).state,'PENDING');
  assert.equal((await f.call(workforce,'admin',{method:'POST',body:{action:'decide',id:pending.id,state:'REJECTED',decision_note:'Đã đi làm'}})).status,200);
  result=await f.call(workforce,'staff',{method:'POST',body:{assignment_id:'own',kind:'CORRECTION',reason:'Quên chấm ra',proposed_in:interval.starts_at,proposed_out:interval.ends_at}});assert.equal(result.status,201);const correction=await result.json();
  assert.equal((await f.call(workforce,'manager',{method:'POST',body:{action:'decide',id:correction.id,state:'APPROVED',decision_note:'Đã đối soát'}})).status,200);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM attendances').get().n,1);
  result=await f.call(reports,'staff',{query:'?from=2020-01-01&to=2020-01-01'});const report=await result.json();assert.equal(report.rows[0].summary.adjusted,true);assert.equal(report.summary.minutes,480);assert.equal(report.rows[0].out_at,null);
  const csv=await (await f.call(reports,'staff',{query:'?from=2020-01-01&to=2020-01-01&format=csv'})).text();
  assert.match(csv,/Vào điều chỉnh đã duyệt/);assert.match(csv,/"2020-01-01 08:00:00","","2020-01-01 08:00:00","2020-01-01 16:00:00"/);
 }finally{f.close()}
});

test('summary counts employee-days, preserves outside flags and approved leave separately',()=>{
 const base={starts_at:0,ends_at:8*3600000,grace_minutes:5,in_at:0,out_at:8*3600000,in_status:'ON_TIME',out_status:'ON_TIME'};
 assert.equal(summarizeAssignment(base,9*3600000).minutes,480);
 assert.equal(summarizeAssignment({...base,in_status:'OUTSIDE'},9*3600000).minutes,0);
 assert.equal(summarizeAssignment({...base,request_kind:'LEAVE',request_state:'APPROVED'},9*3600000).leave,1);
 const summary=summarizeReport([{user_id:'one',work_date:'2026-11-24',summary:summarizeAssignment(base)},{user_id:'two',work_date:'2026-11-24',summary:summarizeAssignment(base)}]);assert.equal(summary.days,2);assert.equal(summary.minutes,960);
});

test('manager scope revoked during approval cannot change request or append a decision audit',async()=>{
 const f=await fixture();try{
  f.addAssignment('pending-scope','staff','BM-001');
  const submitted=await f.call(workforce,'staff',{method:'POST',body:{assignment_id:'pending-scope',kind:'LEAVE',reason:'Nghỉ kiểm thử quyền'}});const request=await submitted.json();
  const original=f.db.batch.bind(f.db);let revoked=false;
  f.db.batch=async statements=>{
   if(statements[0]._sql.startsWith('UPDATE workforce_requests')){f.sqlite.prepare("DELETE FROM branch_managers WHERE user_id='manager'").run();revoked=true;}
   return original(statements);
  };
  const response=await f.call(workforce,'manager',{method:'POST',body:{action:'decide',id:request.id,state:'APPROVED',decision_note:'Chưa kịp thu hồi quyền'}});
  assert.equal(revoked,true);assert.equal(response.status,409);assert.equal(f.sqlite.prepare('SELECT state FROM workforce_requests WHERE id=?').get(request.id).state,'PENDING');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM management_audit WHERE action='DECIDE'").get().n,0);
 }finally{f.close();}
});

test('admin can remove unused stores only; history, manager scope and audit are preserved',async()=>{
 const f=await fixture();try{
  const remove=(who,id)=>f.call(admin,who,{method:'POST',resource:'branches',body:{id,action:'delete-unused'}});
  assert.equal((await remove('staff','BM-003')).status,403);
  assert.equal((await remove('admin','BM-001')).status,409);
  f.addAssignment('history','staff','BM-002');
  assert.equal((await remove('admin','BM-002')).status,409);
  assert.equal((await remove('admin','BM-003')).status,200);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM branches').get().n,13);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM management_audit WHERE action='DELETE_UNUSED'").get().n,1);
  assert.equal((await remove('admin','BM-003')).status,409);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM management_audit WHERE action='DELETE_UNUSED'").get().n,1);
  assert.equal((await f.call(admin,'admin',{method:'POST',resource:'branches',body:{code:'BM-015',name:'Cửa hàng mới',latitude:null,longitude:null,allowed_radius:100}})).status,201);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM branches').get().n,14);
 }finally{f.close();}
});
