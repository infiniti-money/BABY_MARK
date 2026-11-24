import test from 'node:test';
import assert from 'node:assert/strict';
import * as attendance from '../../functions/api/attendance/[action].js';
import * as photos from '../../functions/api/cloudflare/photo/[id].js';
import * as auth from '../../functions/api/auth/[action].js';
import {appFixture,photoForm,testSecret} from './helpers/app.mjs';
const prepareBody=f=>({assignment_id:f.assignment,type:'IN',lat:20,lng:106,accuracy:8});
async function prepare(f,body=prepareBody(f)){const r=await f.call(attendance,'staff',{action:'prepare',body});assert.equal(r.status,201,await r.clone().text());return r.json();}
test('D1 attendance enforces identity, configured GPS, finite coordinates and IN-before-OUT',async()=>{
 const f=await appFixture();try{
  assert.equal((await f.call(attendance,null,{action:'prepare',body:prepareBody(f)})).status,401);
  assert.equal((await f.call(attendance,'other',{action:'prepare',body:prepareBody(f)})).status,404);
  assert.equal((await f.call(attendance,'staff',{action:'prepare',body:{...prepareBody(f),lat:91}})).status,400);
  assert.equal((await f.call(attendance,'staff',{action:'prepare',body:{...prepareBody(f),accuracy:51}})).status,400);
  assert.equal((await f.call(attendance,'staff',{action:'prepare',body:{...prepareBody(f),type:'OUT'}})).status,409);
  await f.db.prepare("UPDATE branches SET latitude=NULL,longitude=NULL WHERE id='BM-001'").run();
  assert.equal((await f.call(attendance,'staff',{action:'prepare',body:prepareBody(f)})).status,409);
 }finally{f.close();}
});
test('challenge + private KV + authoritative D1 succeeds; replay is idempotent and different bytes rejected',async()=>{
 const f=await appFixture();try{
  const c=await prepare(f);assert.equal(c.metadata.employeeCode,'TEST-staff');assert.equal(c.metadata.photoSource,'CLIENT_RENDERED');
  let r=await f.call(attendance,'staff',{action:'submit',form:photoForm(c.challenge_id)});assert.equal(r.status,201,await r.clone().text());
  const {attendance:t}=await r.json();assert.equal(t.user_id,f.ids.staff);assert.equal(t.stamp_issued_at,c.metadata.serverTimestamp);assert.ok(t.server_timestamp>=t.stamp_issued_at);assert.equal(t.received_at,t.server_timestamp);assert.equal(t.photo_source,'CLIENT_RENDERED');assert.equal(t.photo_sha256.length,64);assert.equal(t.distance_m,0);assert.equal(f.objects.size,1);
  r=await f.call(attendance,'staff',{action:'submit',form:photoForm(c.challenge_id)});assert.equal(r.status,200);assert.equal((await r.json()).attendance.id,t.id);
  const changed=new Uint8Array((await f.objects.values().next().value.bytes).slice(0));changed[99]=2;
  assert.equal((await f.call(attendance,'staff',{action:'submit',form:photoForm(c.challenge_id,changed)})).status,409);
  assert.equal((await f.call(attendance,'staff',{action:'prepare',body:prepareBody(f)})).status,409);
  assert.equal((await f.call(photos,'staff',{method:'GET',action:t.id})).status,200);
  assert.equal((await f.call(photos,'other',{method:'GET',action:t.id})).status,404);
  assert.equal((await f.call(photos,'manager',{method:'GET',action:t.id})).status,200);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM attendances').first()).n,1);
 }finally{f.close();}
});
test('simultaneous submit only records one IN; OUT keeps separate server and location flags',async()=>{
 const f=await appFixture();try{
  const a=await prepare(f),b=await prepare(f);
  const results=await Promise.all([a,b].map(c=>f.call(attendance,'staff',{action:'submit',form:photoForm(c.challenge_id)})));
  assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===409).length,1);
  const out=await prepare(f,{...prepareBody(f),type:'OUT',lat:20.1});
  const r=await f.call(attendance,'staff',{action:'submit',form:photoForm(out.challenge_id)});assert.equal(r.status,201,await r.clone().text());
  const t=(await r.json()).attendance;assert.equal(t.status,'OUTSIDE');assert.ok(t.early_minutes>0);assert.ok(t.distance_m>100);
 }finally{f.close();}
});
test('expired, cross-account, over-size, non-JPEG and changed-plan submissions never write KV',async()=>{
 const f=await appFixture();try{
  const a=await prepare(f);
  assert.equal((await f.call(attendance,'other',{action:'submit',form:photoForm(a.challenge_id)})).status,404);
  assert.equal((await f.call(attendance,'staff',{action:'submit',form:photoForm(a.challenge_id,new Uint8Array(200001))})).status,413);
  assert.equal((await f.call(attendance,'staff',{action:'submit',form:photoForm(a.challenge_id,new Uint8Array(100))})).status,400);
  await f.db.prepare('UPDATE attendance_challenges SET expires_at=? WHERE id=?').bind(Date.now()-1,a.challenge_id).run();
  assert.equal((await f.call(attendance,'staff',{action:'submit',form:photoForm(a.challenge_id)})).status,410);
  const b=await prepare(f);await f.db.prepare("UPDATE branches SET allowed_radius=200 WHERE id='BM-001'").run();
  assert.equal((await f.call(attendance,'staff',{action:'submit',form:photoForm(b.challenge_id)})).status,409);assert.equal(f.objects.size,0);
 }finally{f.close();}
});
test('uncertain KV put remains budgeted and retry uses a new challenge, never false attendance success',async()=>{
 const f=await appFixture();try{
  const c=await prepare(f);f.kv.put=async()=>{throw Error('NETWORK_UNCERTAIN')};
  assert.equal((await f.call(attendance,'staff',{action:'submit',form:photoForm(c.challenge_id)})).status,500);
  assert.equal((await f.db.prepare('SELECT state FROM photo_inventory').first()).state,'pending');
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM attendances').first()).n,0);
  assert.equal((await f.db.prepare('SELECT state FROM attendance_challenges WHERE id=?').bind(c.challenge_id).first()).state,'FAILED');
  assert.equal((await f.db.prepare('SELECT owner FROM photo_storage_lock').first()).owner,null);
 }finally{f.close();}
});
test('server checks current active session again after image storage',async()=>{
 const f=await appFixture();try{
  const c=await prepare(f),original=f.kv.put;
  f.kv.put=async(...args)=>{await original(...args);await f.db.prepare('UPDATE profiles SET active=0 WHERE id=?').bind(f.ids.staff).run()};
  assert.equal((await f.call(attendance,'staff',{action:'submit',form:photoForm(c.challenge_id)})).status,409);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM attendances').first()).n,0);assert.equal(f.objects.size,1);
 }finally{f.close();}
});
test('admin-issued account login, reset revocation, disabled account and no public signup',async()=>{
 const f=await appFixture();try{
  assert.equal((await f.call(auth,null,{action:'create',body:{}})).status,401);
  assert.equal((await f.call(auth,'staff',{action:'create',body:{}})).status,403);
  let r=await f.call(auth,null,{action:'login',body:{username:'test-staff',secret:testSecret}});assert.equal(r.status,200);const {token}=await r.json();
  assert.equal((await f.call(auth,'admin',{action:'reset',body:{user_id:f.ids.staff}})).status,200);
  const request=new Request('https://test.invalid/api/auth/me',{headers:{Authorization:'Bearer '+token}});
  assert.equal((await auth.onRequestGet({request,env:f.env,params:{action:'me'}})).status,401);
  r=await f.call(auth,null,{action:'login',body:{username:'test-staff',secret:testSecret}});assert.equal(r.status,401);
  assert.equal((await f.call(auth,'admin',{action:'set-active',body:{user_id:f.ids.other,active:false}})).status,200);
  assert.equal((await f.call(auth,null,{action:'login',body:{username:'test-other',secret:testSecret}})).status,401);
 }finally{f.close();}
});
