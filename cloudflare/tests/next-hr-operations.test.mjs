import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import {shiftInterval} from '../lib/access.mjs';
import * as usage from '../../functions/api/leave-usage.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBackup} from '../../scripts/backup-local.mjs';
import {verifyReadiness} from '../../scripts/verify-backup-readiness.mjs';
test('leave usage distinguishes dates and shifts, excludes rejected, protects employee scope',async()=>{const f=await appFixture();try{
 const day='2026-01-10';
 for(const [i,start,end,state] of [[1,'08:00','10:00','APPROVED'],[2,'10:00','12:00','APPROVED'],[3,'12:00','14:00','PENDING'],[4,'14:00','16:00','REJECTED']]){
  const id='usage-'+i,t=shiftInterval(day,start,end);
  await f.db.prepare('INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,?,?,?,?,?,5)').bind(id,f.ids.staff,'BM-001','test-day',day,t.starts_at,t.ends_at).run();
  await f.db.prepare("INSERT INTO workforce_requests(id,assignment_id,user_id,kind,reason,state,created_at,decided_by,decided_at) VALUES(?,?,?,'LEAVE','Fixture only',?,?,?,?)").bind('leave-'+i,id,f.ids.staff,state,i,state==='PENDING'?null:f.ids.admin,state==='PENDING'?null:i).run();
 }
 const get=(who,q='?year=2026')=>f.call(usage,who,{method:'GET',query:q});
 const res=await get('staff');assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'private, no-store');const d=await res.json();
 assert.deepEqual(d.totals,{approved_shifts:2,approved_dates:1,pending_shifts:1,pending_dates:1});assert.equal(d.balance,null);assert.equal(d.policy_configured,false);
 assert.deepEqual((await (await get('admin','?year=2026&user_id='+f.ids.staff)).json()).totals,d.totals);
 assert.equal((await get('manager','?year=2026&user_id='+f.ids.staff)).status,403);
 assert.equal((await get('other','?year=2026&user_id='+f.ids.staff)).status,403);
 assert.equal((await get('staff','?year=bad')).status,400);
 }finally{f.close()}});
test('offline backup readiness distinguishes structural evidence and missing guards, never claims KV restore',async()=>{const f=await appFixture(),root=await mkdtemp(join(tmpdir(),'bm-readiness-'));try{
 const source=join(root,'source.sqlite');f.db.sqlite.prepare('VACUUM INTO ?').run(source);
 await createBackup(source,join(root,'backup'));const good=await verifyReadiness(join(root,'backup'));assert.equal(good.schema_ready,true);assert.equal(good.kv_verified,false);assert.equal(good.production_restore_verified,false);
 f.db.sqlite.exec('DROP TRIGGER attendance_assignment_user_guard_insert');const missing=join(root,'missing.sqlite');f.db.sqlite.prepare('VACUUM INTO ?').run(missing);await createBackup(missing,join(root,'missing-backup'));
 const bad=await verifyReadiness(join(root,'missing-backup'));assert.equal(bad.schema_ready,false);assert.ok(bad.missing.some(x=>x.id==='0023'));
 }finally{f.close();await rm(root,{recursive:true,force:true})}});
