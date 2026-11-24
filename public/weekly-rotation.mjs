// Calendar dates in Vietnam, not device timezone or elapsed hours.
// Fixed Monday anchor, never reset at month/year boundaries or after regenerating.
export const ROTATION_ANCHOR='2026-11-30';
const WEEK=7*86400000;
export function weekSwapped(workDate){
 const t=Date.parse(workDate+'T00:00:00Z'),a=Date.parse(ROTATION_ANCHOR+'T00:00:00Z');
 if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==workDate)throw Error('INVALID_WORK_DATE');
 return Math.abs(Math.floor((t-a)/WEEK)%2)===1;
}
export function weeklyStaff(roster,workDate){
 return weekSwapped(workDate)?{morning:roster.evening_user_id,evening:roster.morning_user_id}:{morning:roster.morning_user_id,evening:roster.evening_user_id};
}
