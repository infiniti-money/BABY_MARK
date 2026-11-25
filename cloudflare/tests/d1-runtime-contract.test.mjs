import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeFixture} from './helpers/runtime.mjs';
import {photoForm} from './helpers/app.mjs';
import {dayVN,shiftInterval} from '../lib/access.mjs';

// Exercise the actual handlers inside workerd, including D1's trigger-inclusive
// metadata. The faster SQLite adapter intentionally reports direct changes only.
test('worker-native D1 responses match committed business rows with payroll triggers',async t=>{
 const f=await runtimeFixture();t.after(()=>f.close());
 const json=async(response,status)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
 const count=async(sql,...args)=>(await f.db.prepare(sql).bind(...args).first()).n;

 await t.test('D1 metadata includes trigger writes while RETURNING identifies one direct row',async()=>{
  const result=await json(await f.call('/__metadata','admin'),200);
  assert.equal(result.meta.changes,2);assert.deepEqual(result.results,[{id:'BM-001'}]);
 });
 await t.test('bulk scheduling and future leave report exact counts and retain access checks',async()=>{
  const date=dayVN(Date.now()+10*86400000),body={action:'bulk',user_ids:[f.ids.staff,f.ids.other],branch_id:'BM-001',shift_id:'test-day',from:date,to:date,weekdays:[1,2,3,4,5,6,7]};
  assert.equal((await f.call('/admin/resources','staff',{resource:'assignments',body})).status,403);
  assert.deepEqual(await json(await f.call('/admin/resources','admin',{resource:'assignments',body}),201),{created:2});
  assert.equal(await count('SELECT COUNT(*) n FROM assignments WHERE work_date=?',date),2);
  assert.deepEqual(await json(await f.call('/workforce','staff',{body:{action:'leave-range',from:date,to:date,reason:'Đơn nghỉ thử nghiệm D1'}}),201),{created:1});
  assert.equal(await count('SELECT COUNT(*) n FROM workforce_requests WHERE user_id=?',f.ids.staff),1);
  assert.equal((await f.call('/workforce','staff',{body:{action:'leave-range',from:date,to:date,reason:'Không tạo lại đơn đang chờ'}})).status,400);
 });
 await t.test('radius, presets and fixed rosters count direct rows, including no-op repeats',async()=>{
  const radius={resource:'branches',body:{action:'set-radius-all',allowed_radius:123}};
  assert.deepEqual(await json(await f.call('/admin/resources','admin',radius),200),{updated:14});
  assert.deepEqual(await json(await f.call('/admin/resources','admin',radius),200),{updated:0});
  assert.deepEqual(await json(await f.call('/rosters','admin',{body:{action:'presets'}}),200),{created:3});
  assert.deepEqual(await json(await f.call('/rosters','admin',{body:{action:'presets'}}),200),{created:0});
  const allDay={resource:'shifts',body:{action:'all-day-preset'}};
  assert.deepEqual(await json(await f.call('/admin/resources','admin',allDay),200),{id:'BM-ALLDAY',created:1});
  assert.deepEqual(await json(await f.call('/admin/resources','admin',allDay),200),{id:'BM-ALLDAY',created:0});
  await f.db.prepare("UPDATE profiles SET department='Bán hàng' WHERE id IN (?,?)").bind(f.ids.staff,f.ids.other).run();
  await json(await f.call('/rosters','admin',{body:{action:'save',branch_id:'BM-001',morning_user_id:f.ids.staff,evening_user_id:f.ids.other,morning_shift_id:'BM-MORNING',evening_shift_id:'BM-EVENING',handover:'split'}}),200);
  const from=dayVN(Date.now()+12*86400000),body={action:'generate',branch_id:'BM-001',from,to:from,weekdays:[1,2,3,4,5,6,7]};
  assert.deepEqual(await json(await f.call('/rosters','admin',{body}),201),{created:2,existing:0});
  assert.deepEqual(await json(await f.call('/rosters','admin',{body:{...body,action:'generate-missing'}}),201),{created:0,existing:2});
  assert.equal(await count('SELECT COUNT(*) n FROM assignments WHERE work_date=?',from),2);
 });
 await t.test('ending employment succeeds once with one audit and preserves admin-only access',async()=>{
  const user=crypto.randomUUID();await f.db.prepare("INSERT INTO profiles(id,employee_code,full_name,role,active) VALUES(?,'RT-PERIOD','Kiểm thử giai đoạn','staff',1)").bind(user).run();
  const {id}=await json(await f.call('/employment','admin',{body:{action:'start',user_id:user,start_date:'2020-01-01'}}),201);
  const body={action:'end',user_id:user,id,end_date:'2020-01-31'};
  assert.equal((await f.call('/employment','staff',{body})).status,403);
  await json(await f.call('/employment','admin',{body}),200);
  assert.equal((await f.db.prepare('SELECT end_date FROM employment_periods WHERE id=?').bind(id).first()).end_date,body.end_date);
  assert.equal((await f.call('/employment','admin',{body})).status,409);
  assert.equal(await count("SELECT COUNT(*) n FROM management_audit WHERE resource='employment' AND action='END' AND resource_id=?",id),1);
 });
 await t.test('attendance returns normal creation, replays idempotently and keeps ownership checks',async()=>{
  const body={assignment_id:f.assignment,type:'IN',lat:20,lng:106,accuracy:8};
  assert.equal((await f.call('/attendance/prepare','other',{body})).status,404);
  const challenge=await json(await f.call('/attendance/prepare','staff',{body}),201);
  const created=await json(await f.call('/attendance/submit','staff',{form:photoForm(challenge.challenge_id)}),201);
  assert.equal(created.idempotent,undefined);assert.equal(created.attendance.user_id,f.ids.staff);
  const replay=await json(await f.call('/attendance/submit','staff',{form:photoForm(challenge.challenge_id)}),200);
  assert.equal(replay.idempotent,true);assert.equal(replay.attendance.id,created.attendance.id);
  assert.equal(await count('SELECT COUNT(*) n FROM attendances WHERE assignment_id=?',f.assignment),1);
 });
 await t.test('extra decision succeeds, self-review fails and replay never creates another audit',async()=>{
  await f.db.prepare("INSERT INTO extra_attendance(assignment_id,kind,reason,created_at) VALUES(?,'EXTRA','Kiểm thử quyết định',?)").bind(f.otherAssignment,Date.now()).run();
  const body={action:'decide',assignment_id:f.otherAssignment,state:'REJECTED',note:'Không đủ thông tin xác minh'};
  assert.equal((await f.call('/extra','staff',{body})).status,403);
  assert.equal((await f.call('/extra','manager',{body})).status,409);
  const own=crypto.randomUUID();await f.db.prepare('INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) SELECT ?,?,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes FROM assignments WHERE id=?').bind(own,f.ids.manager,f.assignment).run();
  await f.db.prepare("INSERT INTO extra_attendance(assignment_id,kind,reason,created_at) VALUES(?,'EXTRA','Ca riêng của quản lý',?)").bind(own,Date.now()).run();
  assert.equal((await f.call('/extra','manager',{body:{...body,assignment_id:own}})).status,409);
  assert.equal((await f.db.prepare('SELECT state FROM extra_attendance WHERE assignment_id=?').bind(own).first()).state,'PENDING');
  await json(await f.call('/extra','admin',{body}),200);
  assert.equal((await f.db.prepare('SELECT state FROM extra_attendance WHERE assignment_id=?').bind(f.otherAssignment).first()).state,'REJECTED');
  assert.equal((await f.call('/extra','admin',{body})).status,409);
  assert.equal(await count("SELECT COUNT(*) n FROM management_audit WHERE resource='extra-attendance' AND resource_id=?",f.otherAssignment),1);
 });
 await t.test('work-unit review persists the reviewed amount and rejects stale retries',async()=>{
  const month=new Date(Date.parse(dayVN().slice(0,7)+'-01T00:00:00Z')-35*86400000).toISOString().slice(0,7),day=month+'-10',interval=shiftInterval(day,'07:00','21:30'),id=crypto.randomUUID();
  await f.db.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,'BM-001','BM-ALLDAY',?,?,?,5)").bind(id,f.ids.staff,day,interval.starts_at,interval.ends_at).run();
  for(const [type,stamp] of [['IN',interval.starts_at],['OUT',interval.starts_at+300000]]){
   const mark=crypto.randomUUID();await f.db.prepare("INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status) VALUES(?,?,?,?,?,20,106,5,0,?,'ON_TIME')").bind(mark,id,f.ids.staff,type,stamp,'timemark/'+mark+'.jpg').run();
  }
  const draft=await json(await f.call('/payroll','admin',{method:'GET',query:'?month='+month}),200);
  const body={action:'review-units',month,assignment_id:id,units:0.5,reason:'Đã đối soát theo ca thực tế',reviewed:true,expected_source_version:draft.data.source_version};
  assert.equal((await f.call('/payroll','manager',{body})).status,403);
  await json(await f.call('/payroll','admin',{body}),201);
  assert.equal((await f.call('/payroll','admin',{body})).status,409);
  const saved=await json(await f.call('/payroll','admin',{method:'GET',query:'?month='+month}),200);
  assert.equal(saved.data.rows.find(r=>r.id===f.ids.staff).work_units,0.5);
  assert.equal(await count("SELECT COUNT(*) n FROM management_audit WHERE resource='payroll' AND action='REVIEW_UNITS' AND resource_id=?",id),1);
 });
 await t.test('existing retention reports one removed assignment despite its epoch trigger',async()=>{
  const old=shiftInterval('2020-02-01','08:00','16:00');await f.db.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES('old-runtime',?,'BM-001','test-day','2020-02-01',?,?,5)").bind(f.ids.staff,old.starts_at,old.ends_at).run();
  const before=await count('SELECT COUNT(*) n FROM assignments'),result=await json(await f.call('/__retention','admin'),200);
  assert.equal(result.assignments_removed,1);assert.equal(await count('SELECT COUNT(*) n FROM assignments'),before-1);
  assert.equal((await json(await f.call('/__retention','admin'),200)).assignments_removed,0);
 });
});
