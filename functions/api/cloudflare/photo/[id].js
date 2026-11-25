import {sessionUser,digest} from '../../../../cloudflare/lib/auth.mjs';
// Private KV photo read, authorized via D1 internal account.
export async function onRequestGet({request,env,params}){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status,error)=>Response.json({error},{status,headers});
 if(!env.DB||!env.TIMEMARKS)return fail(503,'Not configured');
 try{
 const user=await sessionUser(request,env.DB);
 if(!user)return fail(401,'Unauthorized');
 // Legacy attendance IDs may not be UUIDs. Always bind the ID, never interpolate it.
 const id=String(params.id);
 const hash=await digest('babymark-session-v1:'+request.headers.get('authorization').slice(7));
 const read=()=>env.DB.prepare(
 "SELECT t.photo_path,t.server_timestamp,i.state AS photo_state,i.expires_at AS photo_expires_at FROM attendances t LEFT JOIN photo_inventory i ON i.photo_path=t.photo_path JOIN assignments a ON a.id=t.assignment_id JOIN profiles p ON p.id=? AND p.active=1 JOIN credentials c ON c.user_id=p.id JOIN sessions s ON s.user_id=p.id AND s.credential_version=c.version AND s.token_hash=? AND s.expires_at>? WHERE t.id=? AND (t.user_id=p.id OR p.role='admin' OR (p.role='manager' AND EXISTS(SELECT 1 FROM branch_managers bm WHERE bm.user_id=p.id AND bm.branch_id=a.branch_id)))"
 ).bind(user.id,hash,Date.now(),id).first();
 const check=record=>{
  if(!record)return fail(404,'Not found');
  if(Date.now()>=record.server_timestamp+60*86400000||(record.photo_expires_at!=null&&Date.now()>=record.photo_expires_at)||['evicted','evicting','expired'].includes(record.photo_state))return fail(410,'Ảnh đã hết hạn hoặc đã được xóa để giải phóng dung lượng');
  if(record.photo_state!=='stored')return fail(404,'Ảnh chưa sẵn sàng');
  return null;
 };
 const record=await read(),denied=check(record);if(denied)return denied;
 const object=await env.TIMEMARKS.get(record.photo_path,'arrayBuffer');
 // Recheck the actual session, current scope and inventory after asynchronous KV read.
 const latest=await read(),changed=check(latest);if(changed)return changed;
 if(latest.photo_path!==record.photo_path||!object)return fail(404,'Not found or not yet available');
 return new Response(object,{headers:{...headers,'Content-Type':'image/jpeg','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
 }catch{return fail(500,'Unable to read photo')}
}
