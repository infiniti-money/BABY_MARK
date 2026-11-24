// Only confirms configured bindings and schema; no private data or secrets.
export async function onRequestGet({env}){
 const headers={'Cache-Control':'no-store'};
 if(!env.DB||!env.TIMEMARKS)return Response.json({ready:false,reason:'Bindings missing'},{status:503,headers});
 try{await env.DB.prepare('SELECT 1 FROM branches LIMIT 1').first();await env.TIMEMARKS.get('_health_probe_nonexistent','arrayBuffer');return Response.json({ready:true,mode:'kv-migration-pilot'},{headers});}
 catch{return Response.json({ready:false,reason:'Storage not initialized'},{status:503,headers})}
}
