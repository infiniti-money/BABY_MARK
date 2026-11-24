import {actorFor,apiFailure,invalid,ApiError,managementAudit} from '../../../cloudflare/lib/access.mjs';
import {reply,bodyJSON} from '../../../cloudflare/lib/auth.mjs';
import {pushSettings,pushEndpoint,vapidConfig,vapidDiagnosis,sendEmptyPush} from '../../../cloudflare/lib/web-push.mjs';
export async function onRequestGet({request,env,params}){
 try{
  const actor=await actorFor(request,env),settings=await pushSettings(env);
  if(params.action!=='config')return reply({error:'Không tìm thấy'},404);
  const diagnostic=actor.role==='admin'?await vapidDiagnosis(env):null;
  return reply({settings:diagnostic?{...settings,configured:diagnostic.ready}:settings,public_key:vapidConfig(env)?.publicKey||null,admin:actor.role==='admin',...(diagnostic?{vapid_code:diagnostic.code}:{})});
 }catch(e){return apiFailure(e)}
}
export async function onRequestPost({request,env,params}){
 try{
  const actor=await actorFor(request,env),db=env.DB,b=await bodyJSON(request),settings=await pushSettings(env),action=params.action;
  if(!settings.available)throw new ApiError(409,'Cần migration 0010');
  if(action==='settings'){
   if(actor.role!=='admin')throw new ApiError(403,'Chỉ Admin');
   if(!['enabled','reminders','late_alerts'].every(k=>typeof b[k]==='boolean'))invalid();
   if(b.enabled){const check=await vapidDiagnosis(env);if(!check.ready)throw new ApiError(409,'VAPID chưa hợp lệ: '+check.code);}
   await db.batch([db.prepare('UPDATE web_push_settings SET enabled=?,reminders=?,late_alerts=? WHERE id=1').bind(+b.enabled,+b.reminders,+b.late_alerts),managementAudit(db,actor,'push','1','UPDATE',{enabled:b.enabled,reminders:b.reminders,late_alerts:b.late_alerts})]);
   return reply({settings:await pushSettings(env)});
  }
  const endpoint=pushEndpoint(b.endpoint);if(!endpoint)invalid('Địa chỉ Push không hợp lệ');
  if(action==='unsubscribe'){
   await db.prepare('DELETE FROM web_push_subscriptions WHERE endpoint=? AND user_id=?').bind(endpoint,actor.id).run();return reply({ok:true});
  }
  if(!settings.enabled||!settings.configured)throw new ApiError(409,'Admin chưa bật Push hoặc chưa cấu hình VAPID');
  if(action==='subscribe'){
   // At most three devices per account. A browser endpoint is unique across accounts.
   const now=Date.now();
   const r=await db.prepare(`INSERT INTO web_push_subscriptions(endpoint,user_id,created_at,updated_at)
    SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM web_push_subscriptions WHERE user_id=? AND endpoint<>?)<3
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,updated_at=excluded.updated_at RETURNING endpoint`).bind(endpoint,actor.id,now,now,actor.id,endpoint).first();
   if(!r)throw new ApiError(409,'Tối đa 3 thiết bị mỗi tài khoản; tắt Push trên thiết bị cũ');
   return reply({ok:true});
  }
  if(action==='status'){
   const r=await db.prepare('SELECT 1 AS yes FROM web_push_subscriptions WHERE endpoint=? AND user_id=?').bind(endpoint,actor.id).first();
   return reply({subscribed:!!r});
  }
  if(action==='test'){
   const now=Date.now(),r=await db.prepare('UPDATE web_push_subscriptions SET last_test_at=? WHERE endpoint=? AND user_id=? AND last_test_at<? RETURNING endpoint').bind(now,endpoint,actor.id,now-60000).first();
   if(!r)throw new ApiError(429,'Chưa đăng ký hoặc cần đợi 60 giây giữa hai lần thử');
   const status=await sendEmptyPush(vapidConfig(env),endpoint);
   if(status===404||status===410)await db.prepare('DELETE FROM web_push_subscriptions WHERE endpoint=? AND user_id=?').bind(endpoint,actor.id).run();
   if(status<200||status>=300)throw new ApiError(502,'Dịch vụ Push chưa chấp nhận; kiểm tra lại thiết bị');
   return reply({accepted:true});
  }
  return reply({error:'Không tìm thấy'},404);
 }catch(e){return apiFailure(e)}
}
