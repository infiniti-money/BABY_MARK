import {actorFor,apiFailure,ApiError,managementAudit} from '../../../cloudflare/lib/access.mjs';
import {reply,bodyJSON} from '../../../cloudflare/lib/auth.mjs';
import {policy} from '../../../cloudflare/lib/policy.mjs';
import {pushSettings,vapidDiagnosis} from '../../../cloudflare/lib/web-push.mjs';
import {coverage} from '../../../cloudflare/lib/coverage.mjs';
import {hrReadiness,rosterReadiness} from '../../../cloudflare/lib/hr-readiness.mjs';

async function readiness(env){
 const db=env.DB,p=await policy(env),push=await pushSettings(env),now=Date.now();
 const active=p.available?'active=1':'1=1';
 const counts=await db.prepare('SELECT COUNT(*) AS branches, SUM(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END) AS gps_ready FROM branches WHERE '+active).first();
 const people=await db.prepare("SELECT COUNT(*) AS employees,SUM(CASE WHEN EXISTS(SELECT 1 FROM credentials c WHERE c.user_id=profiles.id) THEN 1 ELSE 0 END) AS accounts FROM profiles WHERE active=1 AND role<>'admin'").first();
 const shifts=await db.prepare('SELECT COUNT(*) AS total FROM shifts').first();
 const scheduled=await db.prepare('SELECT COUNT(*) AS total FROM assignments WHERE ends_at>=?').bind(now).first();
 const missing=(await db.prepare('SELECT id,code,name FROM branches WHERE '+active+' AND (latitude IS NULL OR longitude IS NULL) ORDER BY code').all()).results;
 const photos=await db.prepare("SELECT COALESCE(SUM(byte_size),0) AS bytes,COUNT(*) AS records FROM photo_inventory WHERE state IN ('pending','stored','evicting') AND expires_at>?").bind(now-120000).first();
 const lastRetention=await db.prepare('SELECT started_at,assignments_removed FROM retention_runs ORDER BY started_at DESC LIMIT 1').first();
 let devices=0,lastPush=null,pushSchema=push.available;
 const vapid=await vapidDiagnosis(env);
 if(push.available){
  try{
   devices=(await db.prepare('SELECT COUNT(*) AS n FROM web_push_subscriptions s JOIN profiles p ON p.id=s.user_id WHERE p.active=1').first()).n;
   lastPush=await db.prepare('SELECT claimed_at,state FROM web_push_receipts ORDER BY claimed_at DESC LIMIT 1').first();
  }catch(e){if(!/no such table/i.test(String(e?.message)))throw e;pushSchema=false;}
 }
 const hr=await hrReadiness(db),roster=p.available?await rosterReadiness(env,hr):null;
 return {hr,roster,coverage:p.available?await coverage(db,now):null,admin_ready:p.available,branches:counts.branches,gps_ready:counts.gps_ready||0,missing_gps:missing,branch_limit:p.branch_limit,employees:people.employees,accounts:people.accounts||0,shifts:shifts.total,scheduled:scheduled.total,late_alerts:p.late_alerts,photo_eviction:p.photo_eviction,attendance_retention:p.attendance_retention,retention_secret_ready:p.retention_secret_configured,photo_bytes:photos.bytes,photo_records:photos.records,last_retention:lastRetention,push_schema_ready:pushSchema,push_enabled:push.enabled,vapid_ready:vapid.ready,vapid_code:vapid.code,push_cron_secret_ready:typeof env.PUSH_CRON_SECRET==='string'&&env.PUSH_CRON_SECRET.length>=32,push_devices:devices,last_push:lastPush,kv_bound:!!env.TIMEMARKS};
}

export async function onRequestGet({request,env}){
 try{await actorFor(request,env,{admin:true});return reply(await readiness(env));}catch(e){return apiFailure(e)}
}
export async function onRequestPost({request,env}){
 try{
  const actor=await actorFor(request,env,{admin:true}),b=await bodyJSON(request);
  if(b?.action!=='enable-safe')throw new ApiError(400,'Thao tác không hợp lệ');
  const current=await readiness(env),db=env.DB;
  if(!current.admin_ready)throw new ApiError(409,'Cần migration 0009 trước');
  const statements=[db.prepare('UPDATE system_settings SET late_alerts=1,updated_at=? WHERE id=1').bind(Date.now())];
  const canPush=current.push_schema_ready&&current.vapid_ready&&current.push_cron_secret_ready;
  if(canPush)statements.push(db.prepare('UPDATE web_push_settings SET enabled=1,reminders=1,late_alerts=1 WHERE id=1'));
  statements.push(managementAudit(db,actor,'operations','1','ENABLE_SAFE',{late_alerts:true,push_enabled:canPush,photo_eviction_unchanged:true,attendance_retention_unchanged:true}));
  await db.batch(statements);
  return reply({ok:true,push_activated:canPush,status:await readiness(env)});
 }catch(e){return apiFailure(e)}
}
