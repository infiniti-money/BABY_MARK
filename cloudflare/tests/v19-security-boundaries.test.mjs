import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture,photoForm} from './helpers/app.mjs';
import * as auth from '../../functions/api/auth/[action].js';
import * as photo from '../../functions/api/cloudflare/photo/[id].js';
import * as attendance from '../../functions/api/attendance/[action].js';
import * as messages from '../../functions/api/messages.js';
import {digest} from '../lib/auth.mjs';
const adminPaths=['admin/[resource]','admin/audit-log','admin/diagnostics','admin/employment','admin/operations','admin/overview','admin/payroll','admin/rosters'];
const ordinaryPaths=['assignments','alerts','reports','my-decisions','messages','workforce','extra-attendance','handover','cloudflare/timemark-preview','push/[action]','attendance/[action]','cloudflare/photo/[id]','auth/[action]'];
const maintenancePaths=['maintenance/attendance-retention','maintenance/push','maintenance/rosters'];
test('RC16 all protected route modules reject anonymous requests and staff/manager admin access',async()=>{
 const f=await appFixture();try{
 for(const path of [...adminPaths,...ordinaryPaths,...maintenancePaths]){
  const mod=await import('../../functions/api/'+path+'.js');
  for(const method of ['GET','POST']){
   const fn=mod[method==='GET'?'onRequestGet':'onRequestPost'];if(!fn)continue;
   const action=path==='auth/[action]'?'me':path==='attendance/[action]'?'status':path==='push/[action]'?'config':'employees';
   const invoke=async who=>fn({request:new Request('https://test.invalid/api/'+path,{method,headers:{...(who?{Authorization:'Bearer '+f.tokens[who]}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})}),env:f.env,params:{action,resource:'employees',id:crypto.randomUUID()}});
   assert.equal((await invoke(null)).status,401,path+' '+method);
   if(adminPaths.includes(path))for(const who of ['staff','manager'])assert.equal((await invoke(who)).status,403,path+' '+method+' '+who);
   if(maintenancePaths.includes(path))assert.equal((await invoke('admin')).status,401,path+' rejects ordinary admin session');
  }
 }
 }finally{f.close()}
});
test('RC16 revoked administrator cannot create account or disable another at write boundary',async()=>{
 for(const action of ['create','set-active']){
  const f=await appFixture();try{
   const before=(await f.db.prepare('SELECT count(*) AS n FROM profiles').first()).n;
   const batch=f.db.batch.bind(f.db);let intercepted=false;
   f.db.batch=async statements=>{
    if(!intercepted&&statements.some(s=>s._sql.includes(action==='create'?'INSERT INTO profiles':'UPDATE profiles SET active'))){
     intercepted=true;await f.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(f.ids.admin).run();
    }
    return batch(statements);
   };
   const body=action==='create'?{username:'rc16-race',employee_code:'RC16',full_name:'Local fixture',department:'',role:'staff'}:{user_id:f.ids.staff,active:false};
   const r=await f.call(auth,'admin',{action,body});assert.equal(r.status,409);assert.ok(intercepted);
   assert.equal((await f.db.prepare('SELECT count(*) AS n FROM profiles').first()).n,before);
   assert.equal((await f.db.prepare('SELECT active FROM profiles WHERE id=?').bind(f.ids.staff).first()).active,1);
   assert.equal((await f.db.prepare('SELECT count(*) AS n FROM auth_audit').first()).n,0);
   assert.equal((await f.call(auth,'staff',{method:'GET',action:'me'})).status,200);
  }finally{f.close()}
 }
});
test('RC16 photo read rechecks scope and session after KV await',async()=>{
 const f=await appFixture();try{
 const p=await f.call(attendance,'staff',{action:'prepare',body:{assignment_id:f.assignment,type:'IN',lat:20,lng:106,accuracy:5}});assert.equal(p.status,201);
 const s=await f.call(attendance,'staff',{action:'submit',form:photoForm((await p.json()).challenge_id)});assert.equal(s.status,201);
 const id=(await s.json()).attendance.id;
 assert.equal((await f.call(photo,'manager',{method:'GET',action:id})).status,200);
 const get=f.kv.get;f.kv.get=async(...args)=>{const bytes=await get(...args);await f.db.prepare('DELETE FROM branch_managers WHERE user_id=?').bind(f.ids.manager).run();return bytes};
 const denied=await f.call(photo,'manager',{method:'GET',action:id});assert.equal(denied.status,404);assert.notEqual(denied.headers.get('content-type'),'image/jpeg');
 f.kv.get=async(...args)=>{const bytes=await get(...args);await f.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(f.ids.staff).run();return bytes};
 assert.equal((await f.call(photo,'staff',{method:'GET',action:id})).status,404);
 assert.equal(f.objects.size,1);
 }finally{f.close()}
});
test('RC16 revoked sender cannot post system message after authorization',async()=>{
 const f=await appFixture();try{
 const prepare=f.db.prepare.bind(f.db);let intercepted=false;
 f.db.prepare=(sql,...args)=>{const stmt=prepare(sql,...args);if(!sql.startsWith('INSERT INTO chat_messages'))return stmt;
 const bind=stmt.bind;stmt.bind=(...values)=>{const bound=bind(...values),run=bound.run;bound.run=async()=>{intercepted=true;await prepare('DELETE FROM sessions WHERE user_id=?').bind(f.ids.admin).run();return run()};return bound};return stmt};
 assert.equal((await f.call(messages,'admin',{body:{action:'send',thread_id:'system',body:'Local security test'}})).status,403);
 assert.ok(intercepted);assert.equal((await f.db.prepare('SELECT count(*) AS n FROM chat_messages').first()).n,0);
 }finally{f.close()}
});
