import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import * as diagnostic from '../../functions/api/admin/diagnostics.js';
import * as health from '../../functions/api/cloudflare/health.js';
import {schemaReadiness} from '../lib/schema-readiness.mjs';
test('v1.2 schema and diagnostics are read-only, admin-scoped, and detect 0016',async()=>{
 const f=await appFixture();try{
  const before=await schemaReadiness(f.db);assert.equal(before.ready,true);assert.equal(before.migrations.length,21);assert.equal(before.migrations[1].status,'manual');
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
