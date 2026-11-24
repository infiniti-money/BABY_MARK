// Read-only pilot. Auth remains Supabase Auth during migration; business scope comes from D1.
export async function onRequestGet({request,env,params}){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status,error)=>Response.json({error},{status,headers});
 if(!env.DB||!env.TIMEMARKS||!env.SUPABASE_AUTH_URL||!env.SUPABASE_PUBLISHABLE_KEY)return fail(503,'Not configured');
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(!token)return fail(401,'Unauthorized');
 try{
 const auth=await fetch(env.SUPABASE_AUTH_URL.replace(/\/$/,'')+'/auth/v1/user',{headers:{Authorization:'Bearer '+token,apikey:env.SUPABASE_PUBLISHABLE_KEY}});
 if(!auth.ok)return fail(401,'Unauthorized');
 const user=await auth.json();
 if(typeof user.id!=='string')return fail(401,'Unauthorized');
 const record=await env.DB.prepare(
 "SELECT t.photo_path FROM attendances t JOIN assignments a ON a.id=t.assignment_id JOIN profiles p ON p.id=? AND p.active=1 WHERE t.id=? AND (t.user_id=p.id OR p.role='admin' OR (p.role='manager' AND EXISTS(SELECT 1 FROM branch_managers bm WHERE bm.user_id=p.id AND bm.branch_id=a.branch_id)))"
 ).bind(user.id,String(params.id)).first();
 if(!record)return fail(404,'Not found');
 const object=await env.TIMEMARKS.get(record.photo_path);
 if(!object)return fail(404,'Not found');
 return new Response(object.body,{headers:{...headers,'Content-Type':'image/jpeg','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
 }catch{return fail(500,'Unable to read photo')}
}
