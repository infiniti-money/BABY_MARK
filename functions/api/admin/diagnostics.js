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
   const candidates=(await db.prepare("SELECT c.id,c.type,c.expires_at,CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS attendance_exists,i.state AS inventory_state FROM attendance_challenges c LEFT JOIN attendances a ON a.id=c.attendance_id LEFT JOIN photo_inventory i ON i.photo_path='timemark/'||c.attendance_id||'.jpg' WHERE c.state='PROCESSING' AND c.expires_at<? ORDER BY c.expires_at,c.id LIMIT 20").bind(now-120000).all()).results;
   return {candidates,lock_held:!!lock?.held,lock_acquired_at:lock?.acquired_at??null,old_processing:processing.n,uncertain_photos:pending.n,count_cap:101};
  });
  const roster=await check('ROSTER_UNAVAILABLE',async()=>{const hr=await hrReadiness(db),r=await rosterReadiness(env,hr);
   const branches=hr.automation_ready?(await db.prepare("SELECT ra.branch_id,ra.last_run_at,CASE WHEN p.id IS NULL OR p.active<>1 OR p.role<>'admin' OR br.branch_id IS NULL THEN 0 ELSE 1 END AS eligible,CASE WHEN ra.last_status LIKE 'Cần kiểm tra:%' THEN 1 ELSE 0 END AS error FROM roster_automation ra JOIN branches b ON b.id=ra.branch_id AND b.active=1 LEFT JOIN profiles p ON p.id=ra.updated_by LEFT JOIN branch_rosters br ON br.branch_id=ra.branch_id WHERE ra.enabled=1 ORDER BY ra.branch_id LIMIT 50").all()).results:[];
   const detail=branches.map(b=>({...b,stale:!b.last_run_at||b.last_run_at<now-36*3600000}));
   const stale=detail.some(b=>b.stale),ineligible=detail.filter(b=>!b.eligible).length;
   if(ineligible)add('ROSTER_INELIGIBLE','review',ineligible);
   if(r.enabled&&!r.secret_ready)add('ROSTER_SECRET_MISSING','blocking');
   if(r.errors||r.never_run||stale)add('ROSTER_REVIEW','review');
   return {...r,stale,branches:detail,ineligible};
  });
  const push=await check('PUSH_UNAVAILABLE',async()=>{const s=await pushSettings(env),v=await vapidDiagnosis(env),cron=typeof env.PUSH_CRON_SECRET==='string'&&env.PUSH_CRON_SECRET.length>=32&&env.PUSH_CRON_SECRET.length<=256;
   if(s.enabled&&(!v.ready||!cron))add('PUSH_CONFIGURATION','review');
   const receipts=s.available?(await db.prepare("SELECT state,claimed_at FROM web_push_receipts ORDER BY claimed_at DESC LIMIT 100").all()).results:[];
   const recent=receipts.filter(x=>x.claimed_at>=now-24*3600000);
   const failed=recent.filter(x=>x.state==='failed').length,uncertain=recent.filter(x=>x.state==='claimed'&&x.claimed_at<now-600000).length;
   if(failed||uncertain)add('PUSH_DELIVERY_REVIEW','review',failed+uncertain);
   return {schema_ready:s.available,enabled:s.enabled,vapid_ready:v.ready,cron_secret_ready:cron,recent_receipts:recent.length,failed,uncertain,receipt_sample_limit:100,last_receipt_at:receipts[0]?.claimed_at??null};
  });
  const retention=await check('RETENTION_UNAVAILABLE',async()=>{const p=await policy(env);return {attendance_enabled:p.attendance_retention,photo_eviction_enabled:p.photo_eviction}});
  return reply({version:'1.2.0-rc',generated_at:now,schema,kv_read_ready:kv===true,recovery,roster,push,retention,issues,backup:{status:'manual_verification_required',restore_mode:'isolated_environment_only',offline_tool:'npm run backup:local',kv_included:false}});
 }catch(e){return apiFailure(e)}
}
