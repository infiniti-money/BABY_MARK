import test from 'node:test';import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';import {summarizeAssignment} from '../lib/reports.mjs';import {shiftInterval,dayVN} from '../lib/access.mjs';import * as payroll from '../../functions/api/admin/payroll.js';
test('full-day partial attendance never receives automatic two units',()=>{const a={shift_id:'BM-ALLDAY',starts_at:0,ends_at:52200000,grace_minutes:5,in_at:0,out_at:300000};assert.equal(summarizeAssignment(a).work_units,0);assert.equal(summarizeAssignment(a).work_unit_review,true);assert.equal(summarizeAssignment({...a,out_at:52200000}).work_units,2);});
test('close rejects anomalies, stale review version and mutation at commit',async()=>{const f=await appFixture();try{
 const month=new Date(Date.parse(dayVN().slice(0,7)+'-01T00:00:00Z')-35*86400000).toISOString().slice(0,7),day=month+'-10',a=shiftInterval(day,'08:00','16:00'),id=crypto.randomUUID();
 await f.db.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,'BM-001','test-day',?,?,?,5)").bind(id,f.ids.staff,day,a.starts_at,a.ends_at).run();
 const add=async(type,stamp)=>{const x=crypto.randomUUID();await f.db.prepare("INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status) VALUES(?,?,?,?,?,20,106,5,0,?,'ON_TIME')").bind(x,id,f.ids.staff,type,stamp,'timemark/'+x+'.jpg').run();};
 const get=async()=> (await (await f.call(payroll,'admin',{method:'GET',query:'?month='+month})).json()).data;
 const post=body=>f.call(payroll,'admin',{body:{month,...body}});
 for(const user_id of [f.ids.staff,f.ids.other,f.ids.manager])assert.equal((await post({action:'save-input',user_id,hourly_rate:30000,additions:0,deductions:0,note:''})).status,200);
 await add('IN',a.starts_at);const d=await get(),close={action:'close',expected_revision:0,reviewed:true,reason:'Đối soát tháng',expected_source_version:d.source_version};assert.equal(d.issues,1);assert.equal((await post(close)).status,409);
 await add('OUT',a.ends_at);assert.equal((await post(close)).status,409);
 const current=await get();assert.equal(current.issues,0);
 const original=f.db.batch.bind(f.db);let injected=false;f.db.batch=async stmts=>{if(!injected&&stmts[0]._sql.startsWith('INSERT INTO payroll_closings')){injected=true;await f.db.prepare('UPDATE payroll_inputs SET hourly_rate=31000 WHERE month=? AND user_id=?').bind(month,f.ids.staff).run();}return original(stmts);};
 assert.equal((await post({...close,expected_source_version:current.source_version})).status,409);assert.equal(injected,true);assert.equal((await f.db.prepare('SELECT count(*) AS n FROM payroll_closings').first()).n,0);
 assert.equal((await post({...close,expected_source_version:(await get()).source_version})).status,201);
 }finally{f.close()}});
