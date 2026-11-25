import {ApiError,dayVN,validDay} from './access.mjs';
import {readAssignments,summarizeAssignment} from './reports.mjs';
import {componentsReady,calculatePay} from './payroll-components.mjs';
import {payrollAttendance} from './payroll-attendance.mjs';
export function monthBounds(month){
 if(typeof month!=='string'||!/^\d{4}-\d{2}$/.test(month)||!validDay(month+'-01'))throw new ApiError(400,'Chọn tháng hợp lệ');
 const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);
 return {from:month+'-01',to:d.toISOString().slice(0,10)};
}
export async function payrollVersion(db){
 const exists=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_epoch'").first();
 return exists?(await db.prepare('SELECT version FROM payroll_epoch WHERE id=1').first())?.version??null:null;
}
// Actual intervals can overlap even if planned shifts do not (early IN / late OUT).
// Adjacent work dates cover normal capture/adjustment windows across month boundaries.
// Never silently deduct hours or choose which shift should be paid.
export function findAttendanceOverlaps(assignments,now){
 const groups=new Map(),ids=new Set(),pairs=[];
 for(const a of assignments){
  if(a.extra_state==='PENDING'||a.extra_state==='REJECTED'||a.request_state==='PENDING')continue;
  const s=summarizeAssignment(a,now);if(!s.days||s.leave)continue;
  const entry=s.adjusted?a.proposed_in:a.in_at,exit=s.adjusted?a.proposed_out:a.out_at;
  if(!Number.isSafeInteger(entry)||!Number.isSafeInteger(exit)||exit<=entry)continue;
  if(!groups.has(a.user_id))groups.set(a.user_id,[]);
  groups.get(a.user_id).push({id:a.id,user_id:a.user_id,full_name:a.full_name,work_date:a.work_date,entry,exit});
 }
 for(const rows of groups.values()){
  rows.sort((a,b)=>a.entry-b.entry||b.exit-a.exit||String(a.id).localeCompare(String(b.id)));
  let longest=null;
  for(const a of rows){
   if(longest&&a.entry<longest.exit){
    ids.add(longest.id);ids.add(a.id);
    pairs.push({user_id:a.user_id,full_name:a.full_name,assignment_id:longest.id,other_assignment_id:a.id,work_date:longest.work_date,other_work_date:a.work_date,overlap_minutes:Math.ceil((Math.min(a.exit,longest.exit)-a.entry)/60000)});
   }
   if(!longest||a.exit>longest.exit)longest=a;
  }
 }
 return {ids,pairs};
}
export async function payrollDraft(db,actor,month){
 const version=await payrollVersion(db);
 const {from,to}=monthBounds(month);
 const shiftDate=(day,delta)=>new Date(Date.parse(day+'T00:00:00Z')+delta*86400000).toISOString().slice(0,10);
 const url=new URL('https://internal.invalid/?from='+shiftDate(from,-1)+'&to='+shiftDate(to,1));
 const {assignments:nearby}=await readAssignments(db,actor,url),now=Date.now();
 const assignments=nearby.filter(a=>a.work_date>=from&&a.work_date<=to),overlaps=findAttendanceOverlaps(nearby,now);
 const monthIds=new Set(assignments.map(a=>a.id)),overlapPairs=overlaps.pairs.filter(p=>monthIds.has(p.assignment_id)||monthIds.has(p.other_assignment_id));
 const people=(await db.prepare("SELECT id,employee_code,full_name,department,active FROM profiles WHERE role<>'admin' ORDER BY employee_code").all()).results;
 const inputs=(await db.prepare('SELECT user_id,hourly_rate,additions,deductions,note FROM payroll_inputs WHERE month=?').bind(month).all()).results;
 const components_ready=await componentsReady(db),details=components_ready?(await db.prepare('SELECT user_id,details_json FROM payroll_components WHERE month=?').bind(month).all()).results:[],components=new Map(details.map(x=>[x.user_id,JSON.parse(x.details_json)]));
 const history=version!==null?(await db.prepare('SELECT user_id,start_date,end_date FROM employment_periods').all()).results:[];
 const known=new Set(history.map(x=>x.user_id)),inPeriod=new Set(history.filter(x=>x.start_date<=to&&(!x.end_date||x.end_date>=from)).map(x=>x.user_id));
 const rates=new Map(inputs.map(i=>[i.user_id,i])),by=new Map();
 for(const p of people)if((known.has(p.id)?inPeriod.has(p.id):p.active)||rates.has(p.id))by.set(p.id,{...p,planned_minutes:0,worked_minutes:0,regular_minutes:0,extra_minutes:0,leave_shifts:0,absence_shifts:0,issues:0,pending:0,days:0,shifts:0,work_units:0,overtime_minutes:0,_days:new Set()});
 for(const a of assignments){
  if(a.extra_state==='REJECTED')continue;
  let p=by.get(a.user_id);if(!p){p={id:a.user_id,employee_code:a.employee_code,full_name:a.full_name,department:a.department,active:0,planned_minutes:0,worked_minutes:0,regular_minutes:0,extra_minutes:0,leave_shifts:0,absence_shifts:0,issues:0,pending:0,days:0,shifts:0,work_units:0,overtime_minutes:0,_days:new Set()};by.set(a.user_id,p);}
  if(a.extra_state==='PENDING'||a.request_state==='PENDING'){p.pending++;continue;}
  const s=summarizeAssignment(a,now);
  if(s.work_unit_review||overlaps.ids.has(a.id))p.issues++;
  p.planned_minutes+=Math.floor((a.ends_at-a.starts_at)/60000);
  if(s.leave){p.leave_shifts++;continue;}
  if(!s.days){if(now>a.ends_at){if(!a.in_id&&!a.out_id&&!s.adjusted)p.absence_shifts++;else p.issues++;}continue;}
  const entry=s.adjusted?a.proposed_in:a.in_at,exit=s.adjusted?a.proposed_out:a.out_at;
  const regular=Math.max(0,Math.floor((Math.min(exit,a.ends_at)-Math.max(entry,a.starts_at))/60000));
  p.worked_minutes+=s.minutes;p.regular_minutes+=regular;p.extra_minutes+=Math.max(0,s.minutes-regular);p.shifts++;p.work_units+=s.work_units;p.overtime_minutes+=s.overtime_minutes;p._days.add(a.work_date);
 }
 const reviews=assignments.flatMap(a=>{const s=summarizeAssignment(a,now);return s.work_unit_review||s.work_unit_review_id? [{assignment_id:a.id,user_id:a.user_id,full_name:a.full_name,work_date:a.work_date,branch_name:a.branch_name,starts_at:a.starts_at,ends_at:a.ends_at,in_at:s.adjusted?a.proposed_in:a.in_at,out_at:s.adjusted?a.proposed_out:a.out_at,review_id:s.work_unit_review_id??null,units:s.work_units,review_required:!!s.work_unit_review}]:[];});
 const rows=[...by.values()].map(p=>{
  const i=rates.get(p.id),pay=calculatePay(p,i,components.get(p.id));
  const result={...p,days:p._days.size,hourly_rate:i?.hourly_rate??null,note:i?.note??'',...pay};delete result._days;return result;
 });
 if(version!==await payrollVersion(db))throw new ApiError(409,'Dữ liệu công hoặc lương vừa thay đổi; tải lại bảng lương');
 return {month,from,to,rows,source_version:version,attendance_overlaps:overlapPairs,overlap_count:overlapPairs.length,work_unit_reviews:reviews,attendance_detail:payrollAttendance(assignments,now),components_ready,overtime_review_count:rows.filter(r=>r.overtime_review_required).length,work_units:rows.reduce((n,r)=>n+r.work_units,0),overtime_minutes:rows.reduce((n,r)=>n+r.overtime_minutes,0),missing_rates:rows.filter(r=>r.hourly_rate===null).length,pending:rows.reduce((n,r)=>n+r.pending,0),issues:rows.reduce((n,r)=>n+r.issues,0),absences:rows.reduce((n,r)=>n+r.absence_shifts,0),extra_minutes:rows.reduce((n,r)=>n+r.extra_minutes,0),leave_shifts:rows.reduce((n,r)=>n+r.leave_shifts,0),total:rows.reduce((n,r)=>n+(r.estimated_total??0),0),month_ended:to<dayVN(now)&&assignments.every(a=>a.ends_at+43200000<now),computed_at:now};
}
