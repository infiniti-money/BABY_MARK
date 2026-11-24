import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './helpers/d1.mjs';
import {attendanceCutoff,pruneAttendance} from '../lib/attendance-retention.mjs';
import * as maintenance from '../../functions/api/maintenance/attendance-retention.js';

const DAY=86400000;
async function fixture(now=Date.parse('2026-11-24T10:00:00Z')){
 const db=await createD1(),s=db.sqlite,cutoff=attendanceCutoff(now);
 s.prepare("INSERT INTO profiles(id,employee_code,full_name,role) VALUES('admin','ADMIN','Quản trị','admin'),('staff','BM001','Nhân viên','staff')").run();
 s.prepare("INSERT INTO shifts(id,name,start_time,end_time) VALUES('shift','Ca ngày','08:00','16:00')").run();
 const addAssignment=(id,days=1)=>{
  const end=cutoff-days*DAY,start=end-8*3600000,date=new Date(start+7*3600000).toISOString().slice(0,10);
  s.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at) VALUES(?,'staff','BM-001','shift',?,?,?)").run(id,date,start,end);return {start,end};
 };
 const addAttendance=(id,assignment,timestamp=cutoff-DAY,inventoryState='expired')=>{
  const path='timemark/'+id+'.jpg';
  s.prepare("INSERT INTO photo_inventory(photo_path,byte_size,captured_at,expires_at,state) VALUES(?,100,?,?,?)").run(path,timestamp,timestamp+60*DAY,inventoryState);
  s.prepare("INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status) VALUES(?,?,'staff','IN',?,0,0,5,0,?,'ON_TIME')").run(id,assignment,timestamp,path);return path;
 };
 const addRequest=(id,assignment,state='PENDING',{created=cutoff-90*DAY,decided=cutoff-80*DAY}={})=>s.prepare("INSERT INTO workforce_requests(id,assignment_id,user_id,kind,reason,state,created_at,decided_by,decided_at) VALUES(?,?,'staff','LEAVE','Việc gia đình',?,?,?,?)").run(id,assignment,state,created,state==='PENDING'?null:'admin',state==='PENDING'?null:decided);
 const addChallenge=(id,assignment,state='READY')=>s.prepare("INSERT INTO attendance_challenges(id,user_id,assignment_id,type,created_at,expires_at,state,metadata_json,plan_hash) VALUES(?,'staff',?,'IN',?,?,?,'{}',?)").run(id,assignment,cutoff-90*DAY,cutoff-90*DAY+90000,state,'a'.repeat(64));
 return {db,s,now,cutoff,addAssignment,addAttendance,addRequest,addChallenge,close:()=>db.close()};
}
const count=(s,table)=>s.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('real SQL retention removes dependent records in one batch and clears old completed challenges',async()=>{
 const f=await fixture();try{
  const original=f.addAssignment('eligible',3);const photo=f.addAttendance('old','eligible',original.start);
  f.addChallenge('completed-challenge','eligible','COMPLETED');
  f.addRequest('old-rejected','eligible','REJECTED');
  f.s.prepare("INSERT INTO attendance_notifications(id,recipient_id,assignment_id,kind,title,body,created_at) VALUES('notice','staff','eligible','SUCCESS_IN','Đã ghi nhận','Chi tiết',?)").run(f.cutoff-DAY);
  f.s.prepare("INSERT INTO push_devices(token,user_id,updated_at) VALUES('test-device','staff',?)").run(f.cutoff-DAY);
  f.s.prepare("INSERT INTO push_deliveries(id,notification_id,token,updated_at) VALUES('delivery','notice','test-device',?)").run(f.cutoff-DAY);
  f.addAssignment('keep-stored-inventory',4);const storedPhoto=f.addAttendance('unknown-kv','keep-stored-inventory',f.cutoff-4*DAY,'stored');
  const result=await pruneAttendance(f.db,f.now);
  assert.equal(result.assignments_removed,2);assert.equal(result.cutoff_at,f.cutoff);
  for(const table of ['assignments','attendances','attendance_challenges','workforce_requests','attendance_notifications','push_deliveries','retention_candidates'])assert.equal(count(f.s,table),0,table);
  assert.equal(f.s.prepare('SELECT photo_path FROM photo_inventory WHERE photo_path=?').get(photo),undefined);
  assert.equal(f.s.prepare('SELECT state FROM photo_inventory WHERE photo_path=?').get(storedPhoto).state,'stored');
  assert.equal(count(f.s,'push_devices'),1);assert.equal(f.s.prepare('SELECT assignments_removed FROM retention_runs WHERE id=?').get(result.run_id).assignments_removed,2);
 }finally{f.close()}
});

test('two-year cutoff preserves boundary, pending disputes, recent evidence and PROCESSING challenges',async()=>{
 const f=await fixture();try{
  f.addAssignment('boundary',0);
  f.addAssignment('pending',1);f.addRequest('pending-request','pending');
  f.addAssignment('recent-decision',2);f.addRequest('decided-request','recent-decision','REJECTED',{decided:f.cutoff+1});
  f.addAssignment('recent-request',3);f.addRequest('created-request','recent-request','REJECTED',{created:f.cutoff+1,decided:f.cutoff+2});
  f.addAssignment('recent-attendance',4);f.addAttendance('recent-log','recent-attendance',f.cutoff+1);
  f.addAssignment('recent-notice',5);f.s.prepare("INSERT INTO attendance_notifications(id,recipient_id,assignment_id,kind,title,body,created_at) VALUES('notice','staff','recent-notice','REMIND_IN','Nhắc ca','Chi tiết',?)").run(f.cutoff+1);
  f.addAssignment('processing',6);f.addChallenge('processing-challenge','processing','PROCESSING');
  f.addAssignment('removable-ready',7);f.addChallenge('ready-challenge','removable-ready','READY');
  const result=await pruneAttendance(f.db,f.now);
  assert.equal(result.assignments_removed,1);
  assert.equal(f.s.prepare('SELECT id FROM assignments WHERE id=?').get('removable-ready'),undefined);
  assert.equal(count(f.s,'assignments'),7);assert.equal(f.s.prepare('SELECT state FROM attendance_challenges WHERE id=?').get('processing-challenge').state,'PROCESSING');
 }finally{f.close()}
});

test('cleanup is bounded to fifty assignments and repeat calls finish the remaining batch',async()=>{
 const f=await fixture();try{
  for(let index=1;index<=51;index++)f.addAssignment('old-'+index,index);
  const first=await pruneAttendance(f.db,f.now);assert.equal(first.assignments_removed,50);assert.equal(count(f.s,'assignments'),1);
  assert.equal(f.s.prepare('SELECT id FROM assignments').get().id,'old-1');
  assert.equal((await pruneAttendance(f.db,f.now)).assignments_removed,1);assert.equal((await pruneAttendance(f.db,f.now)).assignments_removed,0);
  assert.equal(count(f.s,'retention_runs'),3);assert.equal(count(f.s,'retention_candidates'),0);
 }finally{f.close()}
});

test('failed cleanup rolls back attendance, retired inventory, candidates and audit run atomically',async()=>{
 const f=await fixture();try{
  const old=f.addAssignment('eligible');const photo=f.addAttendance('old','eligible',old.start);f.addChallenge('old-challenge','eligible','COMPLETED');
  f.s.exec("CREATE TRIGGER test_retention_failure BEFORE DELETE ON assignments BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END");
  await assert.rejects(pruneAttendance(f.db,f.now),/TEST_FAILURE/);
  assert.equal(count(f.s,'assignments'),1);assert.equal(count(f.s,'attendances'),1);assert.equal(count(f.s,'attendance_challenges'),1);assert.equal(count(f.s,'retention_candidates'),0);assert.equal(count(f.s,'retention_runs'),0);
  assert.equal(f.s.prepare('SELECT state FROM photo_inventory WHERE photo_path=?').get(photo).state,'expired');
 }finally{f.close()}
});

test('calendar-year cutoff clamps leap dates and retains the exact Vietnam midnight boundary',async()=>{
 const now=Date.parse('2028-02-29T01:00:00Z'),f=await fixture(now);try{
  assert.equal(new Date(f.cutoff).toISOString(),'2026-02-27T17:00:00.000Z');
  f.addAssignment('boundary',0);f.addAssignment('before',1);
  const result=await pruneAttendance(f.db,now);assert.equal(result.assignments_removed,1);assert.equal(f.s.prepare('SELECT id FROM assignments').get().id,'boundary');
 }finally{f.close()}
});

test('maintenance has no GET deletion; POST needs explicit enable flag and matching secret',async()=>{
 const f=await fixture(Date.now());try{
  f.addAssignment('eligible');const secret='ephemeral-test-secret-32-characters-minimum';
  assert.equal(typeof maintenance.onRequestGet,'undefined');
  const call=env=>maintenance.onRequestPost({request:new Request('https://test.invalid/api/maintenance/attendance-retention',{method:'POST',headers:{authorization:'Bearer '+secret}}),env:{DB:f.db,RETENTION_SECRET:secret,...env}});
  assert.equal((await call({})).status,503);assert.equal((await call({ATTENDANCE_RETENTION_ENABLED:'false'})).status,503);
  assert.equal((await call({ATTENDANCE_RETENTION_ENABLED:'true',RETENTION_SECRET:'wrong-secret-but-long-enough-for-validation'})).status,401);assert.equal(count(f.s,'assignments'),1);
  const response=await call({ATTENDANCE_RETENTION_ENABLED:'true'});assert.equal(response.status,200);assert.equal((await response.json()).assignments_removed,1);assert.equal(count(f.s,'assignments'),0);
 }finally{f.close()}
});

test('D1 active employee guard atomically caps staff plus managers at fifty, including reactivation',async()=>{
 const f=await fixture();try{
  const insert=f.s.prepare('INSERT INTO profiles(id,employee_code,full_name,role,active) VALUES(?,?,?,?,?)');
  for(let index=2;index<=50;index++)insert.run('employee-'+index,'BM'+index,'Nhân viên '+index,index%2?'manager':'staff',1);
  assert.throws(()=>insert.run('extra','EXTRA','Vượt giới hạn','staff',1),/EMPLOYEE_CAPACITY_50/);
  insert.run('disabled','DISABLED','Đã khóa','staff',0);
  assert.throws(()=>f.s.prepare("UPDATE profiles SET active=1 WHERE id='disabled'").run(),/EMPLOYEE_CAPACITY_50/);
  assert.throws(()=>f.s.prepare("UPDATE profiles SET role='staff' WHERE id='admin'").run(),/EMPLOYEE_CAPACITY_50/);
  f.s.prepare("UPDATE profiles SET active=0 WHERE id='employee-2'").run();
  f.s.prepare("UPDATE profiles SET active=1 WHERE id='disabled'").run();
  assert.equal(f.s.prepare("SELECT COUNT(*) AS n FROM profiles WHERE active=1 AND role<>'admin'").get().n,50);
 }finally{f.close()}
});
