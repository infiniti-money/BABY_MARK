import {policy} from '../../../cloudflare/lib/policy.mjs';
// Only confirms configured bindings and schema; no private data or secrets.
export async function onRequestGet({env}){
 const headers={'Cache-Control':'no-store'};
 if(!env.DB||!env.TIMEMARKS)return Response.json({ready:false,reason:'Bindings missing'},{status:503,headers});
 try{
 await env.DB.prepare('SELECT a.stamp_issued_at,a.photo_source,c.plan_hash,b.address_text,i.state FROM attendances a LEFT JOIN attendance_challenges c ON c.attendance_id=a.id LEFT JOIN photo_inventory i ON i.photo_path=a.photo_path JOIN assignments s ON s.id=a.assignment_id JOIN branches b ON b.id=s.branch_id LIMIT 1').first();
 await env.DB.prepare('SELECT details_json FROM management_audit LIMIT 1').first();
 await env.TIMEMARKS.get('_health_probe_nonexistent','arrayBuffer');
 const p=await policy(env);
 return Response.json({ready:true,mode:'pages-d1-kv',image_composition:'CLIENT_RENDERED',retention_enabled:p.attendance_retention,eviction_enabled:p.photo_eviction,admin_controls_ready:p.available},{headers});}
 catch{return Response.json({ready:false,reason:'Storage not initialized'},{status:503,headers})}
}
