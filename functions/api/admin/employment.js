import {actorFor,apiFailure,ApiError,identifier,validDay,invalid,managementAudit} from '../../../cloudflare/lib/access.mjs';
import {reply,bodyJSON} from '../../../cloudflare/lib/auth.mjs';
const ready=async db=>!!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employment_periods'").first();
export async function onRequestGet({request,env}){try{
 await actorFor(request,env,{admin:true});const db=env.DB,id=identifier(new URL(request.url).searchParams.get('user_id'));
 if(!await ready(db))return reply({available:false,periods:[]});
 const periods=(await db.prepare('SELECT id,start_date,end_date,created_at FROM employment_periods WHERE user_id=? ORDER BY start_date DESC,id LIMIT 101').bind(id).all()).results;
 return reply({available:true,periods:periods.slice(0,100),truncated:periods.length>100});
 }catch(e){return apiFailure(e)}}
export async function onRequestPost({request,env}){try{
 const actor=await actorFor(request,env,{admin:true}),db=env.DB,b=await bodyJSON(request);
 if(!await ready(db))throw new ApiError(409,'Cần migration 0017');
 const user=identifier(b.user_id);
 if(!await db.prepare("SELECT id FROM profiles WHERE id=? AND role<>'admin'").bind(user).first())invalid('Nhân viên không hợp lệ');
 if(b.action==='start'){
  if(!validDay(b.start_date))invalid('Ngày bắt đầu không hợp lệ');
  const id=crypto.randomUUID();await db.batch([db.prepare('INSERT INTO employment_periods(id,user_id,start_date,recorded_by,created_at) VALUES(?,?,?,?,?)').bind(id,user,b.start_date,actor.id,Date.now()),managementAudit(db,actor,'employment',id,'START',{user_id:user,start_date:b.start_date})]);return reply({ok:true,id},201);
 }
 if(b.action==='end'){
  const id=identifier(b.id);if(!validDay(b.end_date))invalid('Ngày kết thúc không hợp lệ');
  const r=await db.batch([db.prepare('UPDATE employment_periods SET end_date=? WHERE id=? AND user_id=? AND end_date IS NULL AND start_date<=?').bind(b.end_date,id,user,b.end_date),db.prepare("INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at) SELECT ?,?,'employment',?,'END',?,? WHERE changes()=1").bind(crypto.randomUUID(),actor.id,id,JSON.stringify({user_id:user,end_date:b.end_date}),Date.now())]);
  if(r[0].meta.changes!==1)throw new ApiError(409,'Giai đoạn đã kết thúc hoặc ngày không hợp lệ');return reply({ok:true});
 }
 invalid();
 }catch(e){return apiFailure(e)}}
