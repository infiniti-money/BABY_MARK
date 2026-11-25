import {actorFor,apiFailure} from '../../../cloudflare/lib/access.mjs';
import {reply} from '../../../cloudflare/lib/auth.mjs';
import {schemaReadiness} from '../../../cloudflare/lib/schema-readiness.mjs';
import {hrReadiness,rosterReadiness} from '../../../cloudflare/lib/hr-readiness.mjs';
import {vapidDiagnosis,pushSettings} from '../../../cloudflare/lib/web-push.mjs';
import {policy} from '../../../cloudflare/lib/policy.mjs';
// No write endpoint; no secrets, KV keys, user records or raw SQL errors.
export async function onRequestGet({request,env}){
 try{
  await actorFor(request,env,{admin:true});const db=env.DB,now=Date.now();
  const schema=await schemaReadiness(db),issues=[];
  const add=(code,severity,count=null)=>issues.push({code,severity,count});
  for(const m of schema.migrations.filter(m=>m.status==='missing'))add('MIGRATION_'+m.id,'blocking',m.missing.length);
  const check=async(code,fn)=>{try{return await fn()}catch{add(code,'unknown');return null}};
  const kv=await check('KV_READ_FAILED',async()=>{if(!env.TIMEMARKS)throw Error();await env.TIMEMARKS.get('_health_probe_nonexistent','arrayBuffer');return true});
  const recovery=await check('RECOVERY_SCHEMA_UNAVAILABLE',async()=>{
   const lock=await db.prepare('SELECT acquired_at,CASE WHEN owner IS NULL THEN 0 ELSE 1 END AS held FROM photo_storage_lock WHERE id=1').first();
   const processing=await db.prepare("SELECT COUNT(*) AS n FROM (SELECT 1 FROM attendance_challenges WHERE state='PROCESSING' AND expires_at<? LIMIT 101)").bind(now-120000).first();
   const pending=await db.prepare("SELECT COUNT(*) AS n FROM (SELECT 1 FROM photo_inventory WHERE state IN ('pending','evicting') AND captured_at<? LIMIT 101)").bind(now-120000).first();
   if(!lock)add('LOCK_ROW_MISSING','blocking');
   if(lock?.held&&(!lock.acquired_at||lock.acquired_at<now-120000))add('OLD_PHOTO_LOCK','review');
   if(processing.n)add('OLD_PROCESSING','review',processing.n);
   if(pending.n)add('UNCERTAIN_PHOTOS','review',pending.n);
   return {lock_held:!!lock?.held,lock_acquired_at:lock?.acquired_at??null,old_processing:processing.n,uncertain_photos:pending.n,count_cap:101};
  });
  const roster=await check('ROSTER_UNAVAILABLE',async()=>{const hr=await hrReadiness(db),r=await rosterReadiness(env,hr);
   const stale=r.enabled>0&&(!r.last_run_at||r.last_run_at<now-36*3600000);
   if(r.enabled&&!r.secret_ready)add('ROSTER_SECRET_MISSING','blocking');
   if(r.errors||r.never_run||stale)add('ROSTER_REVIEW','review');
   return {...r,stale:!!stale};
  });
  const push=await check('PUSH_UNAVAILABLE',async()=>{const s=await pushSettings(env),v=await vapidDiagnosis(env),cron=typeof env.PUSH_CRON_SECRET==='string'&&env.PUSH_CRON_SECRET.length>=32;
   if(s.enabled&&(!v.ready||!cron))add('PUSH_CONFIGURATION','review');
   return {schema_ready:s.available,enabled:s.enabled,vapid_ready:v.ready,cron_secret_ready:cron};
  });
  const retention=await check('RETENTION_UNAVAILABLE',async()=>{const p=await policy(env);return {attendance_enabled:p.attendance_retention,photo_eviction_enabled:p.photo_eviction}});
  return reply({version:'1.2.0-rc',generated_at:now,schema,kv_read_ready:kv===true,recovery,roster,push,retention,issues,backup:{status:'manual_verification_required',restore_mode:'isolated_environment_only'}});
 }catch(e){return apiFailure(e)}
}
