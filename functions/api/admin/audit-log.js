import {actorFor,apiFailure,dateRange,identifier,invalid} from '../../../cloudflare/lib/access.mjs';
import {reply} from '../../../cloudflare/lib/auth.mjs';
// Metadata only. Never return arbitrary audit details, credential material or request notes.
export async function onRequestGet({request,env}){
 try{
  await actorFor(request,env,{admin:true});const db=env.DB,url=new URL(request.url),{from,to}=dateRange(url);
  const source=url.searchParams.get('source')||'management';
  if(!['management','auth'].includes(source))invalid('Loại nhật ký không hợp lệ');
  const cursor=url.searchParams.get('before'),beforeId=url.searchParams.get('before_id');
  if((cursor===null)!==(beforeId===null))invalid('Mốc phân trang không hợp lệ');
  const params=[Date.parse(from+'T00:00:00+07:00'),Date.parse(to+'T00:00:00+07:00')+86400000];
  let where='a.created_at>=? AND a.created_at<?';
  if(cursor!==null){const n=Number(cursor);if(!/^\d{1,16}$/.test(cursor)||!Number.isSafeInteger(n))invalid();where+=' AND (a.created_at<? OR (a.created_at=? AND a.id<?))';params.push(n,n,identifier(beforeId));}
  const table=source==='auth'?'auth_audit':'management_audit';
  const fields=source==='auth'?"'credentials' AS resource,a.target_id AS resource_id":'a.resource,a.resource_id';
  const rows=(await db.prepare(`SELECT a.id,a.created_at,a.action,${fields},p.employee_code AS actor_code,p.full_name AS actor_name FROM ${table} a LEFT JOIN profiles p ON p.id=a.actor_id WHERE ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT 51`).bind(...params).all()).results;
  const more=rows.length>50,items=rows.slice(0,50),last=items.at(-1);
  return reply({source,from,to,items,next:more?{before:last.created_at,before_id:last.id}:null});
 }catch(e){return apiFailure(e)}
}
