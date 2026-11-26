import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import {dayVN,shiftInterval} from '../lib/access.mjs';
import * as api from '../../functions/api/admin/payroll.js';
const month=()=>new Date(Date.parse(dayVN().slice(0,7)+'-01T00:00:00Z')-35*86400000).toISOString().slice(0,7);
const input=(id,m)=>({action:'save-input',month:m,user_id:id,hourly_rate:30000,additions:0,deductions:0,note:''});
function revokeBeforeBatch(f,prefix){
 const batch=f.db.batch.bind(f.db);let injected=false;
 f.db.batch=async statements=>{if(!injected&&statements[0]._sql.startsWith(prefix)){injected=true;await f.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(f.ids.admin).run();}return batch(statements);};
 return ()=>injected;
}
test('revoked administrator cannot save payroll input or append audit at SQL write boundary',async()=>{const f=await appFixture();try{
 const m=month(),revoked=revokeBeforeBatch(f,'INSERT INTO payroll_inputs');
 const result=await f.call(api,'admin',{body:input(f.ids.staff,m)});assert.equal(result.status,409);assert.ok(revoked());
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM payroll_inputs').first()).n,0);
 assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM management_audit WHERE resource='payroll'").first()).n,0);
 }finally{f.close()}});
test('revoked administrator cannot close an otherwise valid payroll draft',async()=>{const f=await appFixture();try{
 const m=month();for(const id of [f.ids.staff,f.ids.other,f.ids.manager])assert.equal((await f.call(api,'admin',{body:input(id,m)})).status,200);
 const draft=(await (await f.call(api,'admin',{method:'GET',query:'?month='+m})).json()).data;assert.equal(draft.issues,0);
 const revoked=revokeBeforeBatch(f,'INSERT INTO payroll_closings');
 const result=await f.call(api,'admin',{body:{action:'close',month:m,expected_revision:0,expected_source_version:draft.source_version,reviewed:true,reason:'Đối soát tháng'}});assert.equal(result.status,409);assert.ok(revoked());
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM payroll_closings').first()).n,0);
 assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM management_audit WHERE action='CLOSE'").first()).n,0);
 }finally{f.close()}});
test('revoked administrator cannot append a manual work-unit decision',async()=>{const f=await appFixture();try{
 const m=month(),day=m+'-10',a=shiftInterval(day,'07:00','21:30'),id=crypto.randomUUID();
 await f.db.prepare("INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES('BM-ALLDAY','Ca cả ngày','07:00','21:30',5)").run();
 await f.db.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,'BM-001','BM-ALLDAY',?,?,?,5)").bind(id,f.ids.staff,day,a.starts_at,a.ends_at).run();
 for(const [type,time] of [['IN',a.starts_at],['OUT',a.starts_at+300000]]){const x=crypto.randomUUID();await f.db.prepare("INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status) VALUES(?,?,?,?,?,20,106,5,0,?,'ON_TIME')").bind(x,id,f.ids.staff,type,time,'timemark/'+x+'.jpg').run();}
 const draft=(await (await f.call(api,'admin',{method:'GET',query:'?month='+m})).json()).data;
 const revoked=revokeBeforeBatch(f,'INSERT INTO work_unit_reviews');
 assert.equal((await f.call(api,'admin',{body:{action:'review-units',month:m,assignment_id:id,units:0.5,reviewed:true,reason:'Đối soát công',expected_source_version:draft.source_version}})).status,409);assert.ok(revoked());
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM work_unit_reviews').first()).n,0);
 assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM management_audit WHERE action='REVIEW_UNITS'").first()).n,0);
 }finally{f.close()}});
