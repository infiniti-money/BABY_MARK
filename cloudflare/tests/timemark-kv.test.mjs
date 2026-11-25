import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePhoto,excessBytes,storeStampedPhoto,RETENTION_SECONDS,MAX_IMAGE_BYTES,STORAGE_BUDGET_BYTES} from '../lib/timemark-kv.mjs';
import {createD1} from './helpers/d1.mjs';
import {digest} from '../lib/auth.mjs';
import {onRequestGet as readPhoto} from '../../functions/api/cloudflare/photo/[id].js';

const key='timemark/00000000-0000-4000-8000-000000000000.jpg';
const pathFor=index=>'timemark/00000000-0000-4000-8000-'+String(index).padStart(12,'0')+'.jpg';
const jpeg=n=>{const a=new Uint8Array(n);a[0]=255;a[1]=216;a[n-2]=255;a[n-1]=217;return a.buffer};
const inventory=(db,path)=>db.sqlite.prepare('SELECT * FROM photo_inventory WHERE photo_path=?').get(path);
const usage=db=>db.sqlite.prepare("SELECT COALESCE(SUM(byte_size),0) AS used FROM photo_inventory WHERE state IN ('pending','stored','evicting')").get().used;
function seedInventory(db,total,{state='stored',firstIndex=1,now=Date.now()}={}){
 const insert=db.sqlite.prepare('INSERT INTO photo_inventory(photo_path,byte_size,captured_at,expires_at,state) VALUES(?,?,?,?,?)');
 db.sqlite.exec('BEGIN');
 let index=firstIndex;
 while(total>0){const bytes=Math.min(total,MAX_IMAGE_BYTES);insert.run(pathFor(index),bytes,now-10000000+index,now+RETENTION_SECONDS*1000,state);total-=bytes;index++;}
 db.sqlite.exec('COMMIT');
 return index-firstIndex;
}
function namespace(){
 const calls=[];
 return {calls,async put(path,bytes,options){calls.push({action:'put',path,bytes:bytes.byteLength,...options})},async delete(path){calls.push({action:'delete',path})},async get(path){calls.push({action:'get',path});return jpeg(4)}};
}

test('200 KB decimal cap, JPEG envelope and server time; KV TTL is exactly ninety days',()=>{
 const now=Date.now();assert.equal(validatePhoto(key,jpeg(200000),now,now),Math.floor(now/1000)+RETENTION_SECONDS);assert.equal(MAX_IMAGE_BYTES,200000);assert.equal(RETENTION_SECONDS,90*86400);
 assert.throws(()=>validatePhoto(key,jpeg(200001),now,now),/INVALID_IMAGE_SIZE/);
 assert.throws(()=>validatePhoto(key,new ArrayBuffer(4),now,now),/INVALID_JPEG/);
 assert.throws(()=>validatePhoto('../photo.jpg',jpeg(4),now,now),/INVALID_KEY/);
 assert.throws(()=>validatePhoto(key,jpeg(4),now-120001,now),/INVALID_SERVER_TIME/);
 assert.throws(()=>validatePhoto(key,jpeg(4),now+1001,now),/INVALID_SERVER_TIME/);
});

test('900 MB budget permits an exact boundary, then accounts for incoming overflow',()=>{
 assert.equal(STORAGE_BUDGET_BYTES,900000000);
 assert.equal(excessBytes(899800000,200000),0);assert.equal(excessBytes(899900000,200000),100000);
});

test('real D1 busy or interrupted storage lock never uploads, deletes or steals ownership',async()=>{
 const db=await createD1(),kv=namespace();try{
  db.sqlite.prepare('UPDATE photo_storage_lock SET owner=?,acquired_at=? WHERE id=1').run('interrupted-operation',Date.now()-86400000);
  await assert.rejects(storeStampedPhoto(db,kv,key,jpeg(4),Date.now()),/PHOTO_STORAGE_BUSY/);
  assert.equal(kv.calls.length,0);assert.equal(db.sqlite.prepare('SELECT owner FROM photo_storage_lock').get().owner,'interrupted-operation');
 }finally{db.close()}
});

test('oldest stored image is hidden and evicted before reservation and upload',async()=>{
 const db=await createD1(),kv=namespace(),now=Date.now();try{
  seedInventory(db,STORAGE_BUDGET_BYTES,{now});
  const basePut=kv.put;kv.put=async(path,bytes,options)=>{assert.equal(inventory(db,path).state,'pending');assert.equal(inventory(db,pathFor(1)).state,'evicted');await basePut(path,bytes,options)};
  const baseDelete=kv.delete;kv.delete=async path=>{assert.equal(inventory(db,path).state,'evicting');await baseDelete(path)};
  const result=await storeStampedPhoto(db,kv,key,jpeg(200000),now);
  assert.equal(result.evicted_count,1);assert.equal(kv.calls[0].action,'delete');assert.equal(kv.calls[0].path,pathFor(1));assert.equal(kv.calls[1].action,'put');
  assert.equal(kv.calls[1].expiration,Math.floor(now/1000)+RETENTION_SECONDS);
  assert.equal(inventory(db,pathFor(1)).removal_reason,'CAPACITY');assert.equal(inventory(db,pathFor(2)).state,'stored');assert.equal(inventory(db,key).state,'stored');assert.equal(usage(db),STORAGE_BUDGET_BYTES);
  assert.equal(db.sqlite.prepare('SELECT owner FROM photo_storage_lock').get().owner,null);
 }finally{db.close()}
});

test('TTL reconciliation excludes safely expired reservations and keeps the cache grace window',async()=>{
 const db=await createD1(),kv=namespace(),now=Date.now();try{
  const insert=db.sqlite.prepare('INSERT INTO photo_inventory(photo_path,byte_size,captured_at,expires_at,state) VALUES(?,100,?,?,?)');
  for(const [index,state] of ['pending','stored','evicting'].entries())insert.run(pathFor(index+1),now-RETENTION_SECONDS*1000-200000,now-200000,state);
  insert.run(pathFor(4),now-RETENTION_SECONDS*1000-1000,now-1000,'pending');
  await storeStampedPhoto(db,kv,key,jpeg(100),now);
  for(let index=1;index<=3;index++){assert.equal(inventory(db,pathFor(index)).state,'expired');assert.equal(inventory(db,pathFor(index)).removal_reason,'TTL');}
  assert.equal(inventory(db,pathFor(4)).state,'pending');assert.equal(usage(db),200);assert.deepEqual(kv.calls.map(call=>call.action),['put']);
 }finally{db.close()}
});

test('uncertain KV put remains pending and counted; key reuse and unsafe overflow fail closed',async()=>{
 const db=await createD1(),kv=namespace(),now=Date.now();try{
  seedInventory(db,STORAGE_BUDGET_BYTES-MAX_IMAGE_BYTES,{now});
  kv.put=async()=>{throw Error('uncertain network result')};
  await assert.rejects(storeStampedPhoto(db,kv,key,jpeg(200000),now),/uncertain network result/);
  assert.equal(inventory(db,key).state,'pending');assert.equal(usage(db),STORAGE_BUDGET_BYTES);assert.equal(db.sqlite.prepare('SELECT owner FROM photo_storage_lock').get().owner,null);
  await assert.rejects(storeStampedPhoto(db,kv,key,jpeg(4),Date.now()),/PHOTO_KEY_ALREADY_USED/);
  await assert.rejects(storeStampedPhoto(db,kv,pathFor(999999),jpeg(4),Date.now(),{allowEviction:false}),/PHOTO_STORAGE_CAPACITY_EVICTION_DISABLED/);
  assert.equal(usage(db),STORAGE_BUDGET_BYTES);assert.equal(inventory(db,pathFor(999999)),undefined);
 }finally{db.close()}
});

test('KV delete failure leaves counted evicting inventory and private photo endpoint denies stale bytes',async()=>{
 const db=await createD1(),kv=namespace(),now=Date.now();try{
  seedInventory(db,STORAGE_BUDGET_BYTES,{now});
  db.sqlite.prepare("INSERT INTO profiles(id,employee_code,full_name,role) VALUES('staff','BM001','Nhân viên','staff')").run();
  db.sqlite.prepare("INSERT INTO credentials(user_id,username,salt,secret_hash,created_at,updated_at) VALUES('staff','staff',?,?,?,?)").run('a'.repeat(32),'b'.repeat(64),now,now);
  const token='f'.repeat(64);db.sqlite.prepare("INSERT INTO sessions(token_hash,user_id,credential_version,created_at,expires_at) VALUES(?,'staff',1,?,?)").run(await digest('babymark-session-v1:'+token),now,now+3600000);
  db.sqlite.prepare("INSERT INTO shifts(id,name,start_time,end_time) VALUES('shift','Ca','08:00','16:00')").run();
  db.sqlite.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at) VALUES('assignment','staff','BM-001','shift','2026-11-24',?,?)").run(now-3600000,now+3600000);
  db.sqlite.prepare("INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status) VALUES('attendance','assignment','staff','IN',?,0,0,5,0,?,'ON_TIME')").run(now-10000000,pathFor(1));
  kv.delete=async()=>{throw Error('delete uncertain')};
  await assert.rejects(storeStampedPhoto(db,kv,key,jpeg(200000),now),/delete uncertain/);
  assert.equal(inventory(db,pathFor(1)).state,'evicting');assert.equal(usage(db),STORAGE_BUDGET_BYTES);assert.equal(inventory(db,key),undefined);
  const response=await readPhoto({request:new Request('https://test.invalid/api/cloudflare/photo/attendance',{headers:{authorization:'Bearer '+token}}),env:{DB:db,TIMEMARKS:kv},params:{id:'attendance'}});
  assert.equal(response.status,410);assert.equal(kv.calls.length,0);assert.equal(db.sqlite.prepare('SELECT owner FROM photo_storage_lock').get().owner,null);
 }finally{db.close()}
});

test('capacity with eviction disabled or only uncertain pending photos never drops reservations',async()=>{
 const db=await createD1(),kv=namespace(),now=Date.now();try{
  seedInventory(db,STORAGE_BUDGET_BYTES,{state:'pending',now});
  await assert.rejects(storeStampedPhoto(db,kv,key,jpeg(4),now,{allowEviction:false}),/PHOTO_STORAGE_CAPACITY_EVICTION_DISABLED/);
  assert.equal(kv.calls.length,0);assert.equal(usage(db),STORAGE_BUDGET_BYTES);
  await assert.rejects(storeStampedPhoto(db,kv,key,jpeg(4),now),/PHOTO_STORAGE_RECONCILIATION_REQUIRED/);
  assert.equal(kv.calls.length,0);assert.equal(inventory(db,key),undefined);assert.equal(usage(db),STORAGE_BUDGET_BYTES);
 }finally{db.close()}
});

test('concurrent storage attempts serialize through D1 without duplicate reservations',async()=>{
 const db=await createD1(),kv=namespace();let releasePut,putStarted;
 const started=new Promise(resolve=>{putStarted=resolve}),held=new Promise(resolve=>{releasePut=resolve});
 try{
  kv.put=async(path,bytes,options)=>{kv.calls.push({action:'put',path,bytes:bytes.byteLength,...options});putStarted();await held};
  const first=storeStampedPhoto(db,kv,key,jpeg(4),Date.now());await started;
  await assert.rejects(storeStampedPhoto(db,kv,pathFor(999999),jpeg(4),Date.now()),/PHOTO_STORAGE_BUSY/);
  assert.equal(inventory(db,key).state,'pending');assert.equal(inventory(db,pathFor(999999)),undefined);
  releasePut();await first;
  assert.equal(inventory(db,key).state,'stored');assert.equal(kv.calls.length,1);assert.equal(usage(db),4);
 }finally{releasePut();db.close()}
});

test('new 90-day photo is readable after day 60; legacy expiry and capacity state still control access',async()=>{
 const db=await createD1(),kv=namespace(),now=Date.now(),DAY=86400000;try{
  db.sqlite.prepare("INSERT INTO profiles(id,employee_code,full_name,role) VALUES('staff','BM001','Nhân viên','staff')").run();
  db.sqlite.prepare("INSERT INTO credentials(user_id,username,salt,secret_hash,created_at,updated_at) VALUES('staff','staff',?,?,?,?)").run('a'.repeat(32),'b'.repeat(64),now,now);
  const token='f'.repeat(64);db.sqlite.prepare("INSERT INTO sessions(token_hash,user_id,credential_version,created_at,expires_at) VALUES(?,'staff',1,?,?)").run(await digest('babymark-session-v1:'+token),now,now+3600000);
  db.sqlite.prepare("INSERT INTO shifts(id,name,start_time,end_time) VALUES('shift','Ca','08:00','16:00')").run();
  for(const [i,age,ttl,state,expected] of [[1,75,90,'stored',200],[2,75,60,'stored',410],[3,91,90,'stored',410],[4,75,90,'evicted',410]]){
   const timestamp=now-age*DAY,assignment='assignment-'+i,id='attendance-'+i,path=pathFor(i),day=new Date(timestamp+7*3600000).toISOString().slice(0,10);
   db.sqlite.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at) VALUES(?,'staff','BM-001','shift',?,?,?)").run(assignment,day,timestamp-3600000,timestamp+3600000);
   db.sqlite.prepare("INSERT INTO photo_inventory(photo_path,byte_size,captured_at,expires_at,state) VALUES(?,4,?,?,?)").run(path,timestamp,timestamp+ttl*DAY,state);
   db.sqlite.prepare("INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status) VALUES(?,?,'staff','IN',?,0,0,5,0,?,'ON_TIME')").run(id,assignment,timestamp,path);
   const response=await readPhoto({request:new Request('https://test.invalid/api/cloudflare/photo/'+id,{headers:{authorization:'Bearer '+token}}),env:{DB:db,TIMEMARKS:kv},params:{id}});
   assert.equal(response.status,expected,'age '+age+' TTL '+ttl+' state '+state);
  }
  assert.deepEqual(kv.calls.map(x=>x.path),[pathFor(1)]);
 }finally{db.close()}
});
