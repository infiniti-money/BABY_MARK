import {ApiError,dayVN,validDay} from './access.mjs';
import {readAssignments,summarizeAssignment} from './reports.mjs';
import {componentsReady,calculatePay} from './payroll-components.mjs';
import {payrollAttendance} from './payroll-attendance.mjs';
export function monthBounds(month){
 if(typeof month!=='string'||!/^\d{4}-\d{2}$/.test(month)||!validDay(month+'-01'))throw new ApiError(400,'Chọn tháng hợp lệ');
 const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);
 return {from:month+'-01',to:d.toISOString().slice(0,10)};
}
export async function payrollDraft(db,actor,month){
 const {from,to}=monthBounds(month),url=new URL('https://internal.invalid/?from='+from+'&to='+to);
 const {assignments}=await readAssignments(db,actor,url),now=Date.now();
 const people=(await db.prepare("SELECT id,employee_code,full_name,department,active FROM profiles WHERE role<>'admin' ORDER BY employee_code").all()).results;
 const inputs=(await db.prepare('SELECT user_id,hourly_rate,additions,deductions,note FROM payroll_inputs WHERE month=?').bind(month).all()).results;
 const components_ready=await componentsReady(db),details=components_ready?(await db.prepare('SELECT user_id,details_json FROM payroll_components WHERE month=?').bind(month).all()).results:[],components=new Map(details.map(x=>[x.user_id,JSON.parse(x.details_json)]));
 const rates=new Map(inputs.map(i=>[i.user_id,i])),by=new Map();
 for(const p of people)if(p.active||rates.has(p.id))by.set(p.id,{...p,planned_minutes:0,worked_minutes:0,regular_minutes:0,extra_minutes:0,leave_shifts:0,absence_shifts:0,issues:0,pending:0,days:0,shifts:0,work_units:0,overtime_minutes:0,_days:new Set()});
 for(const a of assignments){
  if(a.extra_state==='REJECTED')continue;
  let p=by.get(a.user_id);if(!p){p={id:a.user_id,employee_code:a.employee_code,full_name:a.full_name,department:a.department,active:0,planned_minutes:0,worked_minutes:0,regular_minutes:0,extra_minutes:0,leave_shifts:0,absence_shifts:0,issues:0,pending:0,days:0,shifts:0,work_units:0,overtime_minutes:0,_days:new Set()};by.set(a.user_id,p);}
  if(a.extra_state==='PENDING'||a.request_state==='PENDING'){p.pending++;continue;}
  const s=summarizeAssignment(a,now);
  p.planned_minutes+=Math.floor((a.ends_at-a.starts_at)/60000);
  if(s.leave){p.leave_shifts++;continue;}
  if(!s.days){if(now>a.ends_at){if(!a.in_id&&!a.out_id&&!s.adjusted)p.absence_shifts++;else p.issues++;}continue;}
  const entry=s.adjusted?a.proposed_in:a.in_at,exit=s.adjusted?a.proposed_out:a.out_at;
  const regular=Math.max(0,Math.floor((Math.min(exit,a.ends_at)-Math.max(entry,a.starts_at))/60000));
  p.worked_minutes+=s.minutes;p.regular_minutes+=regular;p.extra_minutes+=Math.max(0,s.minutes-regular);p.shifts++;p.work_units+=s.work_units;p.overtime_minutes+=s.overtime_minutes;p._days.add(a.work_date);
 }
 const rows=[...by.values()].map(p=>{
  const i=rates.get(p.id),pay=calculatePay(p,i,components.get(p.id));
  const result={...p,days:p._days.size,hourly_rate:i?.hourly_rate??null,note:i?.note??'',...pay};delete result._days;return result;
 });
 return {month,from,to,rows,attendance_detail:payrollAttendance(assignments,now),components_ready,overtime_review_count:rows.filter(r=>r.overtime_review_required).length,work_units:rows.reduce((n,r)=>n+r.work_units,0),overtime_minutes:rows.reduce((n,r)=>n+r.overtime_minutes,0),missing_rates:rows.filter(r=>r.hourly_rate===null).length,pending:rows.reduce((n,r)=>n+r.pending,0),issues:rows.reduce((n,r)=>n+r.issues,0),absences:rows.reduce((n,r)=>n+r.absence_shifts,0),extra_minutes:rows.reduce((n,r)=>n+r.extra_minutes,0),leave_shifts:rows.reduce((n,r)=>n+r.leave_shifts,0),total:rows.reduce((n,r)=>n+(r.estimated_total??0),0),month_ended:to<dayVN(now)&&assignments.every(a=>a.ends_at+43200000<now),computed_at:now};
}
