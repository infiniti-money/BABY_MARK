import {createD1} from './d1.mjs';
import {digest,credentialHash} from '../../lib/auth.mjs';
export const testSecret='1'.repeat(48);
export async function seedApp(db){
 const now=Date.now(),tokens={},ids={};
 for(const [name,role,index] of [['admin','admin',1],['staff','staff',2],['other','staff',3],['manager','manager',4]]){
  const id=`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;ids[name]=id;
  const salt=String(index).repeat(32),hash=await credentialHash(salt,testSecret),token=String(index).repeat(64);tokens[name]=token;
  await db.prepare('INSERT INTO profiles(id,employee_code,full_name,role,active) VALUES(?,?,?,?,1)').bind(id,'TEST-'+name,'Kiểm thử '+name,role).run();
  await db.prepare('INSERT INTO credentials(user_id,username,salt,secret_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,'test-'+name,salt,hash,now,now).run();
  await db.prepare('INSERT INTO sessions(token_hash,user_id,credential_version,created_at,expires_at) VALUES(?,?,1,?,?)').bind(await digest('babymark-session-v1:'+token),id,now,now+8*3600000).run();
 }
 await db.prepare("UPDATE branches SET latitude=20,longitude=106,address_text='Địa chỉ KIỂM THỬ' WHERE id='BM-001'").run();
 await db.prepare("INSERT INTO branch_managers(user_id,branch_id) VALUES(?,'BM-001')").bind(ids.manager).run();
 await db.prepare("INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES('test-day','Ca kiểm thử','08:00','16:00',5)").run();
 const assignment=crypto.randomUUID(),otherAssignment=crypto.randomUUID(),workDate=new Date(now+7*3600000).toISOString().slice(0,10);
 for(const [id,user,branch] of [[assignment,ids.staff,'BM-001'],[otherAssignment,ids.other,'BM-002']]){
  await db.prepare('INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,?,?,?,?,?,5)').bind(id,user,branch,'test-day',workDate,now-3600000,now+7*3600000).run();
 }
 return {tokens,ids,assignment,otherAssignment,workDate};
}
export async function appFixture(){
 const db=await createD1(),seed=await seedApp(db),objects=new Map();
 const kv={async put(k,b,o){objects.set(k,{bytes:b,expiration:o.expiration})},async get(k){return objects.get(k)?.bytes??null},async delete(k){objects.delete(k)}};
 const env={DB:db,TIMEMARKS:kv};
 const call=async(module,who,{method='POST',action,body,form,query='',headers:extra={}}={})=>{
  const headers={...extra};if(who)headers.Authorization='Bearer '+seed.tokens[who];if(body!==undefined)headers['Content-Type']='application/json';
  const request=new Request('https://test.invalid/api/'+(action||'')+query,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:form?{body:form}:{})});
  return module[method==='POST'?'onRequestPost':'onRequestGet']({request,env,params:{action,id:action}});
 };
 return {db,env,kv,objects,...seed,call,close:()=>db.close()};
}
// A structural JPEG test vector. The endpoint does not claim JPEG pixel decode.
// Actual browser-generated JPEGs are exercised by workerd/browser tests.
export function structuralJPEG(){
 const b=new Uint8Array(200);let n=0;const add=(...xs)=>{b.set(xs,n);n+=xs.length};
 add(255,216,255,192,0,17,8,4,176,3,32,3,1,17,0,2,17,0,3,17,0);
 add(255,218,0,12,3,1,0,2,0,3,0,0,63,0);while(n<198)b[n++]=1;add(255,217);return b;
}
export function photoForm(challengeId,bytes=structuralJPEG()){
 const form=new FormData();form.set('challenge_id',challengeId);form.set('photo',new Blob([bytes],{type:'image/jpeg'}),'camera.jpg');return form;
}
