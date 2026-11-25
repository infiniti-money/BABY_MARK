import {actorFor,apiFailure,dayVN,validDay,invalid} from '../../../cloudflare/lib/access.mjs';
import {reply} from '../../../cloudflare/lib/auth.mjs';
import {readAssignments,summarizeAssignment} from '../../../cloudflare/lib/reports.mjs';
import {attendanceExceptions} from '../../../cloudflare/lib/attendance-exceptions.mjs';
export async function onRequestGet({request,env}){
 try{
 const actor=await actorFor(request,env,{admin:true}),db=env.DB,now=Date.now(),day=new URL(request.url).searchParams.get('day')||dayVN(now);if(!validDay(day))invalid('Ngày không hợp lệ');
 const schema=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('branch_rosters','extra_attendance')").all()).results.map(x=>x.name);
 const row=await db.prepare("SELECT (SELECT COUNT(*) FROM branches WHERE active=1) AS branches,(SELECT COUNT(*) FROM profiles WHERE active=1 AND role<>'admin') AS employees,(SELECT COUNT(*) FROM branches WHERE active=1 AND (latitude IS NULL OR longitude IS NULL)) AS missing_gps,(SELECT COUNT(*) FROM workforce_requests WHERE state='PENDING') AS pending_requests,COUNT(*) AS shifts,COALESCE(SUM(CASE WHEN i.id IS NOT NULL THEN 1 ELSE 0 END),0) AS started,COALESCE(SUM(CASE WHEN i.id IS NOT NULL AND o.id IS NOT NULL THEN 1 ELSE 0 END),0) AS completed FROM assignments a LEFT JOIN attendances i ON i.assignment_id=a.id AND i.type='IN' LEFT JOIN attendances o ON o.assignment_id=a.id AND o.type='OUT' WHERE a.work_date=?").bind(day).first();
 const pending_extra=schema.includes('extra_attendance')?(await db.prepare("SELECT COUNT(*) AS n FROM extra_attendance WHERE state='PENDING'").first()).n:null;
 const missing_roster=schema.includes('branch_rosters')?(await db.prepare("SELECT COUNT(*) AS n FROM branches b WHERE b.active=1 AND NOT EXISTS(SELECT 1 FROM branch_rosters r JOIN profiles m ON m.id=r.morning_user_id AND m.active=1 JOIN profiles e ON e.id=r.evening_user_id AND e.active=1 WHERE r.branch_id=b.id)").first()).n:null;
 const [data,stores,requests,extra]=await Promise.all([
 readAssignments(db,actor,new URL('https://internal.invalid/?from='+day+'&to='+day)),
 db.prepare("SELECT id,code,name,active,CASE WHEN latitude IS NULL OR longitude IS NULL THEN 0 ELSE 1 END AS gps_ready FROM branches WHERE active=1 OR EXISTS(SELECT 1 FROM assignments a WHERE a.branch_id=branches.id AND a.work_date=?) ORDER BY code").bind(day).all(),
 db.prepare("SELECT r.id,r.kind,r.reason,r.proposed_in,r.proposed_out,p.full_name,p.employee_code,a.work_date,b.name AS branch_name FROM workforce_requests r JOIN profiles p ON p.id=r.user_id JOIN assignments a ON a.id=r.assignment_id JOIN branches b ON b.id=a.branch_id WHERE r.state='PENDING' ORDER BY r.created_at,r.id LIMIT 20").all(),
 schema.includes('extra_attendance')?db.prepare("SELECT x.assignment_id,x.kind,x.reason,x.replaced_name,p.full_name,a.work_date,b.name AS branch_name FROM extra_attendance x JOIN assignments a ON a.id=x.assignment_id JOIN profiles p ON p.id=a.user_id JOIN branches b ON b.id=a.branch_id WHERE x.state='PENDING' ORDER BY x.created_at,x.assignment_id LIMIT 20").all():Promise.resolve({results:[]})
 ]);
 const counters=()=>({scheduled:0,completed:0,working:0,waiting:0,missing_in:0,absent:0,missing_out:0,leave:0,pending:0,review:0,rejected:0,late:0,work_units:0,overtime_minutes:0});
 const by=new Map(stores.results.map(b=>[b.id,{...b,...counters(),people:0,_people:new Set()}])),totals=counters();
 const rows=data.assignments.map(a=>{
 const summary=summarizeAssignment(a,now),flags=attendanceExceptions(a,now);
 const status=a.extra_state==='REJECTED'?'rejected':a.extra_state==='PENDING'||a.request_state==='PENDING'?'pending':summary.leave?'leave':summary.outside||summary.work_unit_review||flags.includes('INVALID_TIME')?'review':summary.days?'completed':flags.includes('ABSENT_RECORD')?'absent':flags.includes('MISSING_OUT')?'missing_out':flags.includes('MISSING_IN')?'missing_in':a.in_at!=null&&a.out_at==null?'working':'waiting';
 const b=by.get(a.branch_id);
 for(const item of [b,totals].filter(Boolean)){item[status]++;if(status!=='rejected')item.scheduled++;item.late+=Number(flags.includes('LATE'));item.work_units+=summary.work_units||0;item.overtime_minutes+=summary.overtime_minutes||0;}
 if(b&&status!=='rejected')b._people.add(a.user_id);
 return {id:a.id,user_id:a.user_id,employee_code:a.employee_code,full_name:a.full_name,branch_id:a.branch_id,branch_name:a.branch_name,shift_name:a.shift_name,starts_at:a.starts_at,ends_at:a.ends_at,in_at:a.in_at,out_at:a.out_at,in_id:a.in_id,out_id:a.out_id,proposed_in:a.proposed_in,proposed_out:a.proposed_out,summary,status};
 });
 const stores_detail=[...by.values()].map(({_people,...b})=>({...b,people:_people.size}));
 return reply({...row,day,generated_at:now,pending_extra,missing_roster,stores_detail,totals,rows,pending_request_rows:requests.results,pending_extra_rows:extra.results});
 }catch(e){return apiFailure(e)}
}
