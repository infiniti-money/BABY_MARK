import {sessionUser} from '../../../../cloudflare/lib/auth.mjs';
// Private KV photo read, authorized via D1 internal account.
export async function onRequestGet({request,env,params}){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status,error)=>Response.json({error},{status,headers});
 if(!env.DB||!env.TIMEMARKS)return fail(503,'Not configured');
 try{
 const user=await sessionUser(request,env.DB);
 if(!user)return fail(401,'Unauthorized');
 const record=await env.DB.prepare(
 "SELECT t.photo_path,t.server_timestamp,i.state AS photo_state,i.expires_at AS photo_expires_at FROM attendances t LEFT JOIN photo_inventory i ON i.photo_path=t.photo_path JOIN assignments a ON a.id=t.assignment_id JOIN profiles p ON p.id=? AND p.active=1 WHERE t.id=? AND (t.user_id=p.id OR p.role='admin' OR (p.role='manager' AND EXISTS(SELECT 1 FROM branch_managers bm WHERE bm.user_id=p.id AND bm.branch_id=a.branch_id)))"
 ).bind(user.id,String(params.id)).first();
 if(!record)return fail(404,'Not found');
 if(Date.now()>=record.server_timestamp+60*86400000||(record.photo_expires_at!=null&&Date.now()>=record.photo_expires_at)||['evicted','evicting','expired'].includes(record.photo_state))return fail(410,'Ảnh đã hết hạn hoặc đã được xóa để giải phóng dung lượng');
 if(record.photo_state!=='stored')return fail(404,'Ảnh chưa sẵn sàng');
 const object=await env.TIMEMARKS.get(record.photo_path,'arrayBuffer');
 if(!object)return fail(404,'Not found or not yet available');
 return new Response(object,{headers:{...headers,'Content-Type':'image/jpeg','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
 }catch{return fail(500,'Unable to read photo')}
}
