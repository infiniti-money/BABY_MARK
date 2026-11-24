import {actorFor,apiFailure,ApiError,identifier,textField,dateRange} from '../../cloudflare/lib/access.mjs';
import {reply} from '../../cloudflare/lib/auth.mjs';
import {jsonLimited} from '../../cloudflare/lib/http.mjs';
const exists=db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shift_handover'").first();
export async function onRequestGet({request,env}){
 try{
  const actor=await actorFor(request,env),db=env.DB;
  if(!await exists(db))return reply({available:false,rows:[]});
  const {from,to}=dateRange(new URL(request.url)),now=Date.now();
  // An employee receives notes from preceding shifts at their actual assigned
  // branch, including overlap and next-day handover. No company-wide staff feed.
  const sql=`SELECT h.assignment_id,h.message,h.created_at,a.branch_id,a.work_date,a.starts_at,a.ends_at,p.full_name,b.name AS branch_name,s.name AS shift_name,t.server_timestamp AS out_at
    FROM shift_handover h JOIN assignments a ON a.id=h.assignment_id JOIN branches b ON b.id=a.branch_id JOIN profiles p ON p.id=a.user_id JOIN shifts s ON s.id=a.shift_id
    JOIN attendances t ON t.assignment_id=a.id AND t.type='OUT'
    WHERE a.work_date BETWEEN ? AND ?
    AND (a.user_id=? OR ?='admin' OR (?='manager' AND EXISTS(SELECT 1 FROM branch_managers bm WHERE bm.user_id=? AND bm.branch_id=a.branch_id))
    OR EXISTS(SELECT 1 FROM assignments n WHERE n.user_id=? AND n.branch_id=a.branch_id AND n.starts_at>a.starts_at AND n.starts_at<=a.ends_at+172800000 AND n.starts_at<=? AND n.ends_at>=?
    AND NOT EXISTS(SELECT 1 FROM workforce_requests w WHERE w.assignment_id=n.id AND w.kind='LEAVE' AND w.state='APPROVED')))
    ORDER BY h.created_at DESC LIMIT 500`;
  const rows=(await db.prepare(sql).bind(from,to,actor.id,actor.role,actor.role,actor.id,actor.id,now+86400000,now-172800000).all()).results;
  return reply({available:true,rows});
 }catch(e){return apiFailure(e)}
}
export async function onRequestPost({request,env}){
 try{
  const actor=await actorFor(request,env),db=env.DB,b=await jsonLimited(request);
  if(!await exists(db))throw new ApiError(409,'Cần migration 0013');
  const id=identifier(b.assignment_id),message=textField(b.message,1000),now=Date.now();
  // Only the actual worker can leave a note, after a verified OUT, within 24h.
  const old=await db.prepare('SELECT h.message FROM shift_handover h JOIN assignments a ON a.id=h.assignment_id WHERE h.assignment_id=? AND a.user_id=?').bind(id,actor.id).first();
  if(old){if(old.message===message)return reply({ok:true,idempotent:true});throw new ApiError(409,'Ca đã có lời nhắn; không ghi đè nội dung bàn giao.');}
  const row=await db.prepare(`INSERT INTO shift_handover(assignment_id,message,created_at)
   SELECT a.id,?,? FROM assignments a JOIN attendances t ON t.assignment_id=a.id AND t.user_id=a.user_id AND t.type='OUT'
   WHERE a.id=? AND a.user_id=? AND t.server_timestamp BETWEEN ? AND ? ON CONFLICT(assignment_id) DO NOTHING RETURNING assignment_id`).bind(message,now,id,actor.id,now-86400000,now).first();
  if(!row)throw new ApiError(409,'Chỉ để lại lời nhắn cho ca của bạn đã tan trong 24 giờ qua.');
  return reply({ok:true},201);
 }catch(e){return apiFailure(e)}
}
