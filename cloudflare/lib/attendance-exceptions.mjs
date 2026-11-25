import {summarizeAssignment} from './reports.mjs';
// Advisory only. A missing record does not establish misconduct or authorize deductions.
export function attendanceExceptions(a,now){
 if((a.extra_state&&a.extra_state!=='APPROVED')||(a.request_kind==='LEAVE'&&a.request_state==='APPROVED'))return [];
 const s=summarizeAssignment(a,now),entry=s.adjusted?a.proposed_in:a.in_at,exit=s.adjusted?a.proposed_out:a.out_at,flags=[];
 if(entry==null&&now>a.ends_at)flags.push('ABSENT_RECORD');
 else if(entry==null&&now>a.starts_at+a.grace_minutes*60000)flags.push('MISSING_IN');
 else if(s.late>0)flags.push('LATE');
 if(entry!=null&&exit==null&&now>a.ends_at)flags.push('MISSING_OUT');
 if(s.early>0)flags.push('EARLY');
 if(s.outside)flags.push('OUTSIDE');
 if((entry==null&&exit!=null)||(entry!=null&&exit!=null&&exit<=entry))flags.push('INVALID_TIME');
 return flags;
}
export function groupBranchReports(rows,now){
 const map=new Map();
 for(const a of rows){
  let b=map.get(a.branch_id);if(!b){b={branch_id:a.branch_id,branch_code:a.branch_code,branch_name:a.branch_name,scheduled:0,completed:0,work_units:0,overtime_minutes:0,minutes:0,late:0,early:0,leave:0,absent:0,missing_out:0,outside:0,pending:0};map.set(a.branch_id,b);}
  if(a.extra_state==='REJECTED')continue;
  if(a.extra_state==='PENDING'){b.pending++;continue;}
  b.scheduled++;const s=a.summary||summarizeAssignment(a,now),flags=attendanceExceptions(a,now);
  b.completed+=s.days?1:0;b.work_units+=s.work_units??s.days??0;b.overtime_minutes+=s.overtime_minutes??0;b.minutes+=s.minutes;b.late+=s.late;b.early+=s.early;b.leave+=s.leave;
  b.absent+=Number(flags.includes('ABSENT_RECORD'));b.missing_out+=Number(flags.includes('MISSING_OUT'));b.outside+=Number(flags.includes('OUTSIDE'));b.pending+=Number(a.request_state==='PENDING');
 }
 return [...map.values()].sort((a,b)=>String(a.branch_code).localeCompare(String(b.branch_code)));
}
