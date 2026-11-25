import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture,testSecret} from './helpers/app.mjs';
import {summarizeAssignment} from '../lib/reports.mjs';
import {attendanceExceptions} from '../lib/attendance-exceptions.mjs';
import * as auth from '../../functions/api/auth/[action].js';
import * as diagnostic from '../../functions/api/admin/diagnostics.js';
test('zero-length and out-only records never count as complete work',()=>{
 const row={starts_at:1000,ends_at:100000,grace_minutes:0,in_at:2000,out_at:2000};
 const s=summarizeAssignment(row,200000);
 assert.equal(s.days,0);assert.equal(s.work_units,0);assert.ok(attendanceExceptions(row,200000).includes('INVALID_TIME'));
 const outOnly={...row,in_at:null};assert.equal(summarizeAssignment(outOnly,200000).status,'Cần kiểm tra');assert.ok(attendanceExceptions(outOnly,200000).includes('INVALID_TIME'));
});
test('login cannot issue session if username changes after credential read',async()=>{
 const f=await appFixture();try{
  const db=f.db,original=db.batch.bind(db);let intercepted=false;
  db.batch=async statements=>{
   if(!intercepted&&statements.some(s=>s._sql.startsWith('INSERT INTO sessions'))){
    intercepted=true;await db.prepare("UPDATE credentials SET username='changed-staff' WHERE user_id=?").bind(f.ids.staff).run();
   }
   return original(statements);
  };
  const r=await f.call(auth,null,{action:'login',body:{username:'test-staff',secret:testSecret}});
  assert.equal(r.status,401);assert.ok(intercepted);assert.equal((await f.db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id=?').bind(f.ids.staff).first()).n,1);
  assert.equal((await f.call(auth,null,{action:'login',body:{username:'changed-staff',secret:testSecret}})).status,200);
 }finally{f.close()}
});
test('diagnostics includes stale fifteenth active store, not just original 14',async()=>{
 const f=await appFixture();try{
  const now=Date.now();await f.db.prepare('UPDATE system_settings SET branch_limit=50 WHERE id=1').run();
  await f.db.prepare("INSERT INTO branches(id,code,name) VALUES('ZZ-015','ZZ-015','Cửa hàng kiểm thử 15')").run();
  const branches=(await f.db.prepare('SELECT id FROM branches WHERE active=1 ORDER BY id').all()).results;
  assert.ok(branches.length>=15);
  for(const b of branches)await f.db.prepare("INSERT INTO roster_automation(branch_id,weekday_mask,enabled,updated_by,updated_at,last_run_at,last_status) VALUES(?,31,1,?,?,?,'OK')").bind(b.id,f.ids.admin,now,b.id==='ZZ-015'?now-40*3600000:now).run();
  const r=await f.call(diagnostic,'admin',{method:'GET'});assert.equal(r.status,200);const d=await r.json();
  assert.equal(d.roster.branches.length,branches.length);assert.equal(d.roster.branches.find(b=>b.branch_id==='ZZ-015').stale,true);
  assert.equal(d.roster.stale,true);
 }finally{f.close()}
});
