import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import * as diagnostic from '../../functions/api/admin/diagnostics.js';
import * as health from '../../functions/api/cloudflare/health.js';
import {schemaReadiness} from '../lib/schema-readiness.mjs';
test('v1.2 schema and diagnostics are read-only, admin-scoped, and detect 0016',async()=>{
 const f=await appFixture();try{
  const before=await schemaReadiness(f.db);assert.equal(before.ready,true);assert.equal(before.migrations.length,23);assert.equal(before.target,'0023');assert.equal(before.migrations[1].status,'manual');
  assert.equal((await f.call(diagnostic,'staff',{method:'GET'})).status,403);
  assert.equal((await f.call(diagnostic,null,{method:'GET'})).status,401);
  const response=await f.call(diagnostic,'admin',{method:'GET'});assert.equal(response.status,200);const d=await response.json();assert.equal(d.schema.ready,true);assert.equal(d.kv_read_ready,true);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM management_audit').first()).n,0);
  await f.db.exec('DROP TABLE payroll_components'); // isolated test database only
  const missing=await schemaReadiness(f.db);assert.equal(missing.ready,false);assert.equal(missing.migrations[15].status,'missing');
  const h=await (await f.call(health,null,{method:'GET'})).json();assert.equal(h.payroll_components_ready,false);assert.equal(h.schema_ready,false);
 }finally{f.close()}
});

test('diagnostics detects stale and ineligible individual roster configurations despite a recent run',async()=>{
 const f=await appFixture();try{
  const now=Date.now();
  await f.db.prepare("INSERT INTO roster_automation(branch_id,weekday_mask,enabled,updated_by,updated_at,last_run_at,last_status) VALUES('BM-001',31,1,?,?,?,'OK')").bind(f.ids.admin,now,now).run();
  await f.db.prepare("INSERT INTO roster_automation(branch_id,weekday_mask,enabled,updated_by,updated_at,last_run_at,last_status) VALUES('BM-002',31,1,?,?,?,'OK')").bind(f.ids.admin,now,now-40*3600000).run();
  const r=await f.call(diagnostic,'admin',{method:'GET'});assert.equal(r.status,200);
  const d=await r.json();assert.equal(d.roster.stale,true);assert.equal(d.roster.ineligible,2);assert.equal(d.roster.branches.find(b=>b.branch_id==='BM-002').stale,true);
  assert.ok(d.issues.some(i=>i.code==='ROSTER_INELIGIBLE'));
 }finally{f.close()}
});

test('0022 indexes are optional, 0023 integrity triggers are required and diagnosed independently',async()=>{
 const f=await appFixture();try{
  await f.db.exec('DROP INDEX assignment_report_date');
  let s=await schemaReadiness(f.db);assert.equal(s.ready,true);
  assert.equal(s.migrations.find(m=>m.id==='0022').status,'optional_missing');
  const initial=await (await f.call(diagnostic,'admin',{method:'GET'})).json();
  assert.ok(initial.issues.some(i=>i.code==='MIGRATION_0022'&&i.severity==='review'));
  await f.db.exec('DROP TRIGGER attendance_assignment_user_guard_insert');
  s=await schemaReadiness(f.db);assert.equal(s.ready,false);
  assert.equal(s.migrations.find(m=>m.id==='0023').status,'missing');
  const d=await (await f.call(diagnostic,'admin',{method:'GET'})).json();
  assert.ok(d.issues.some(i=>i.code==='MIGRATION_0023'&&i.severity==='blocking'));
  const h=await (await f.call(health,null,{method:'GET'})).json();
  assert.equal(h.schema_target,'0023');assert.equal(h.schema_ready,false);
 }finally{f.close()}
});

// Release metadata must be updated atomically with the package and lockfile.
test('diagnostics version matches package and lockfile without JSON import attributes',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {appVersion}=await import('../lib/app-version.mjs');
 const pkg=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8'));
 const lock=JSON.parse(await readFile(new URL('../../package-lock.json',import.meta.url),'utf8'));
 assert.equal(appVersion,pkg.version);assert.equal(appVersion,lock.version);assert.equal(appVersion,lock.packages[''].version);
 const f=await appFixture();try{const response=await f.call(diagnostic,'admin',{method:'GET'});assert.equal(response.status,200);assert.equal((await response.json()).version,appVersion);}finally{f.close()}
});
