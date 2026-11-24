import {actorFor,apiFailure,dayVN} from '../../cloudflare/lib/access.mjs';
import {reply} from '../../cloudflare/lib/auth.mjs';
import {policy} from '../../cloudflare/lib/policy.mjs';
import {readAssignments} from '../../cloudflare/lib/reports.mjs';
export async function onRequestGet({request,env}){
 try{
  const actor=await actorFor(request,env);
  if(actor.role==='staff')return reply({error:'Không có quyền'},403);
  if(!(await policy(env)).late_alerts)return reply({enabled:false,alerts:[]});
  const now=Date.now(),url=new URL(request.url);
  url.search='';url.searchParams.set('from',dayVN(now-86400000));url.searchParams.set('to',dayVN(now));
  const {assignments}=await readAssignments(env.DB,actor,url);
  const alerts=assignments.filter(a=>!(a.request_kind==='LEAVE'&&a.request_state==='APPROVED')&&(a.in_at==null?now>a.starts_at+a.grace_minutes*60000&&now<=a.ends_at+12*3600000:(a.in_late||0)>0)).map(a=>({id:a.id,employee_code:a.employee_code,full_name:a.full_name,branch_name:a.branch_name,work_date:a.work_date,starts_at:a.starts_at,in_at:a.in_at,minutes:a.in_at==null?Math.max(0,Math.ceil((now-a.starts_at)/60000)):a.in_late}));
  return reply({enabled:true,alerts});
 }catch(e){return apiFailure(e)}
}
