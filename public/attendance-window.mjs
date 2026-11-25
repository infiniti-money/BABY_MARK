export const EARLY_WINDOW_MS=4*3600000,LATE_WINDOW_MS=12*3600000;
export function inAttendanceWindow(a,now){return now>=a.starts_at-EARLY_WINDOW_MS&&now<=a.ends_at+LATE_WINDOW_MS;}
export function todayAssignments(rows,day,now){return rows.filter(a=>a.work_date===day||(!a.out_id&&inAttendanceWindow(a,now)));}
export function captureEligible(a,now){return a.extra_state!=='REJECTED'&&!(a.request_kind==='LEAVE'&&a.request_state==='APPROVED')&&inAttendanceWindow(a,now);}
