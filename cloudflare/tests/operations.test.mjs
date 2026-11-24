import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import * as ops from '../../functions/api/admin/operations.js';
test('operations readiness and safe activation require admin and preserve deletion policy',async()=>{
 const f=await appFixture();try{
  assert.equal((await f.call(ops,'staff',{method:'GET'})).status,403);
  assert.equal((await f.call(ops,'staff',{method:'POST',body:{action:'enable-safe'}})).status,403);
  const r=await f.call(ops,'admin',{method:'GET'});assert.equal(r.status,200);
  const before=await r.json();assert.equal(before.admin_ready,true);assert.equal(before.push_schema_ready,true);assert.equal(before.vapid_ready,false);assert.equal(before.vapid_code,'JWK_MISSING');assert.equal(before.branches,14);assert.equal(before.gps_ready,1);
  const a=await f.call(ops,'admin',{method:'POST',body:{action:'enable-safe'}});assert.equal(a.status,200);const result=await a.json();
  assert.equal(result.push_activated,false);assert.equal(result.status.late_alerts,true);assert.equal(result.status.photo_eviction,false);assert.equal(result.status.attendance_retention,false);
  assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM management_audit WHERE action='ENABLE_SAFE'").first()).n,1);
 }finally{f.close()}
});
