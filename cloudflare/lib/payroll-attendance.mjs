import {summarizeAssignment} from './reports.mjs';
// Compact, versioned representation. Names are interned to keep D1 snapshot values small.
// No image, exact coordinates, credentials or private conversation data.
export function payrollAttendance(assignments,now){
 const labels=[],lookup=new Map(),label=v=>{v=String(v??'');if(!lookup.has(v)){lookup.set(v,labels.length);labels.push(v);}return lookup.get(v);};
 const records=assignments.map(a=>{
  const s=summarizeAssignment(a,now),pending=a.extra_state==='PENDING'||a.request_state==='PENDING',rejected=a.extra_state==='REJECTED',entry=s.adjusted?a.proposed_in:a.in_at,exit=s.adjusted?a.proposed_out:a.out_at;
  const included=!pending&&!rejected&&!s.leave&&!!s.days;
  const regular=included?Math.max(0,Math.floor((Math.min(exit,a.ends_at)-Math.max(entry,a.starts_at))/60000)):0;
  return [a.user_id,a.work_date,label(a.branch_code),label(a.branch_name),label(a.shift_name),a.starts_at,a.ends_at,a.in_at??null,a.out_at??null,s.adjusted?entry:null,s.adjusted?exit:null,label(s.status),pending?1:0,rejected?1:0,included?s.minutes:0,regular,included?s.work_units:0,included?s.overtime_minutes:0,s.late,s.early,s.leave?1:0,label(a.request_kind),label(a.request_state),label(a.extra_kind),label(a.extra_state),s.outside?1:0];
 });
 return {version:1,labels,records};
}
