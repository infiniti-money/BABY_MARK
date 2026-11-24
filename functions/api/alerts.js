import {actorFor,apiFailure,dayVN} from '../../cloudflare/lib/access.mjs';
import {reply} from '../../cloudflare/lib/auth.mjs';
import {policy} from '../../cloudflare/lib/policy.mjs';
import {readAssignments,summarizeAssignment} from '../../cloudflare/lib/reports.mjs';
import {attendanceExceptions} from '../../cloudflare/lib/attendance-exceptions.mjs';
export async function onRequestGet({request,env}){
 try{
  const actor=await actorFor(request,env);
  if(actor.role==='staff')return reply({error:'Không có quyền'},403);
  if(!(await policy(env)).late_alerts)return reply({enabled:false,alerts:[]});
  const now=Date.now(),url=new URL(request.url);
  if(!url.searchParams.has('from'))url.searchParams.set('from',dayVN(now-86400000));if(!url.searchParams.has('to'))url.searchParams.set('to',dayVN(now));
  const {assignments}=await readAssignments(env.DB,actor,url);
  const alerts=assignments.flatMap(a=>{
   const flags=attendanceExceptions(a,now);if(!flags.length)return [];
   const s=summarizeAssignment(a,now);
   return [{id:a.id,employee_code:a.employee_code,full_name:a.full_name,branch_name:a.branch_name,work_date:a.work_date,starts_at:a.starts_at,ends_at:a.ends_at,in_at:a.in_at,out_at:a.out_at,minutes:flags.includes('MISSING_IN')?Math.max(0,Math.ceil((now-a.starts_at)/60000)):s.late,early:s.early,flags,pending:a.request_state==='PENDING',adjusted:s.adjusted}];
  });
  return reply({enabled:true,alerts,from:url.searchParams.get('from'),to:url.searchParams.get('to')});
 }catch(e){return apiFailure(e)}
}
