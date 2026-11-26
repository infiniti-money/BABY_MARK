import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import {dayVN,shiftInterval} from '../lib/access.mjs';
import * as workforce from '../../functions/api/workforce.js';
import * as extra from '../../functions/api/extra-attendance.js';
import * as employment from '../../functions/api/admin/employment.js';
import * as handover from '../../functions/api/handover.js';
function beforeBatch(f,prefix,mutate){
 const batch=f.db.batch.bind(f.db);let fired=false;
 f.db.batch=async statements=>{if(!fired&&statements[0]._sql.startsWith(prefix)){fired=true;await mutate();}return batch(statements);};return ()=>fired;
}
const revoke=(f,who)=>f.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(f.ids[who]).run();
const count=async(f,table)=> (await f.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n;
async function future(f,delta=1){const day=dayVN(Date.now()+delta*86400000),a=shiftInterval(day,'08:00','16:00'),id=crypto.randomUUID();await f.db.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,'BM-001','test-day',?,?,?,5)").bind(id,f.ids.staff,day,a.starts_at,a.ends_at).run();return {id,day};}
test('revoked staff cannot submit a single leave or correction and no audit is appended',async()=>{
 for(const kind of ['LEAVE','CORRECTION']){const f=await appFixture();try{
 const assignment=await f.db.prepare('SELECT * FROM assignments WHERE id=?').bind(f.assignment).first();
 const fired=beforeBatch(f,'INSERT INTO workforce_requests',()=>revoke(f,'staff'));
 const body={assignment_id:f.assignment,kind,reason:'Kiểm thử phiên hết hạn',...(kind==='CORRECTION'?{proposed_in:assignment.starts_at,proposed_out:Date.now()-1000}:{})};
 assert.equal((await f.call(workforce,'staff',{body})).status,409);assert.ok(fired());assert.equal(await count(f,'workforce_requests'),0);assert.equal(await count(f,'management_audit'),0);
 }finally{f.close()}}
});
test('range leave revoked before SQL creates neither requests nor audit',async()=>{const f=await appFixture();try{
 const a=await future(f);const fired=beforeBatch(f,'INSERT INTO workforce_requests',()=>revoke(f,'staff'));
 assert.equal((await f.call(workforce,'staff',{body:{action:'leave-range',from:a.day,to:a.day,reason:'Kiểm thử nghỉ phép'}})).status,409);assert.ok(fired());assert.equal(await count(f,'workforce_requests'),0);assert.equal(await count(f,'management_audit'),0);
 }finally{f.close()}});
test('range leave records actual successful count after a schedule changes',async()=>{const f=await appFixture();try{
 const a=await future(f,1),b=await future(f,2);const changed=beforeBatch(f,'INSERT INTO workforce_requests',()=>f.db.prepare('DELETE FROM assignments WHERE id=?').bind(b.id).run());
 const response=await f.call(workforce,'staff',{body:{action:'leave-range',from:a.day,to:b.day,reason:'Kiểm thử nghỉ phép'}});assert.equal(response.status,201);assert.deepEqual(await response.json(),{created:1});assert.ok(changed());
 const audit=JSON.parse((await f.db.prepare("SELECT details_json FROM management_audit WHERE action='LEAVE_RANGE'").first()).details_json);assert.equal(audit.requested,2);assert.equal(audit.created,1);
 }finally{f.close()}});
test('manager losing branch authorization before supplemental shift write creates no orphan',async()=>{const f=await appFixture();try{
 const now=Date.now(),clock=t=>new Date(t+7*3600000).toISOString().slice(11,16),start=now-60000,end=now+3600000;
 await f.db.prepare("INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES('race-extra','Ca kiểm thử',?,?,0)").bind(clock(start),clock(end)).run();
 const before=await count(f,'assignments'),fired=beforeBatch(f,'INSERT INTO assignments',()=>f.db.prepare('DELETE FROM branch_managers WHERE user_id=?').bind(f.ids.manager).run());
 const response=await f.call(extra,'manager',{body:{action:'create',branch_id:'BM-001',shift_id:'race-extra',work_date:dayVN(start),kind:'EXTRA',reason:'Kiểm thử quyền cửa hàng'}});assert.equal(response.status,409);assert.ok(fired());assert.equal(await count(f,'assignments'),before);assert.equal(await count(f,'extra_attendance'),0);
 }finally{f.close()}});
test('revoked admin cannot open or end employment periods or append audit',async()=>{for(const action of ['start','end']){const f=await appFixture();try{
 const body={action,user_id:f.ids.staff,start_date:'2026-01-01'};
 if(action==='end'){const first=await f.call(employment,'admin',{body:{...body,action:'start'}});assert.equal(first.status,201);body.id=(await first.json()).id;body.end_date='2026-02-01';}
 const before=await count(f,'management_audit'),fired=beforeBatch(f,action==='start'?'INSERT INTO employment_periods':'UPDATE employment_periods',()=>revoke(f,'admin'));
 assert.equal((await f.call(employment,'admin',{body})).status,409);assert.ok(fired());assert.equal(await count(f,'management_audit'),before);
 if(action==='start')assert.equal(await count(f,'employment_periods'),0);else assert.equal((await f.db.prepare('SELECT end_date FROM employment_periods WHERE id=?').bind(body.id).first()).end_date,null);
 }finally{f.close()}}});
test('revoked worker cannot post handover after a valid checkout',async()=>{const f=await appFixture();try{
 const id=crypto.randomUUID();await f.db.prepare("INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status) VALUES(?,?,?,'OUT',?,20,106,5,0,?,'ON_TIME')").bind(id,f.assignment,f.ids.staff,Date.now()-1000,'timemark/'+id+'.jpg').run();
 const prepare=f.db.prepare.bind(f.db);let fired=false;
 f.db.prepare=(sql,...args)=>{const p=prepare(sql,...args);if(!sql.startsWith('INSERT INTO shift_handover'))return p;const bind=p.bind;p.bind=(...values)=>{const q=bind(...values),first=q.first;q.first=async()=>{fired=true;await prepare('DELETE FROM sessions WHERE user_id=?').bind(f.ids.staff).run();return first()};return q};return p;};
 assert.equal((await f.call(handover,'staff',{body:{assignment_id:f.assignment,message:'Kiểm thử bàn giao'}})).status,409);assert.ok(fired);assert.equal(await count(f,'shift_handover'),0);
 }finally{f.close()}});
