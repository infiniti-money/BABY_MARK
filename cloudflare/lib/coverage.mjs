import {dayVN,shiftInterval} from './access.mjs';
import {isRetailStaff} from '../../public/retail-staff.mjs';
// Read-only planning check, no assumptions about actual store opening days.
export async function coverage(db,now=Date.now()){
 const from=dayVN(now+86400000),to=dayVN(now+7*86400000);
 const schema=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('branch_rosters','extra_attendance','shift_handover')").all()).results.map(r=>r.name);
 if(!schema.includes('branch_rosters'))return {available:false,from,to,extra_ready:schema.includes('extra_attendance'),handover_ready:schema.includes('shift_handover'),branches:[],missing_slots:0};
 const branches=(await db.prepare("SELECT b.id,b.code,b.name,r.morning_user_id,r.evening_user_id,r.morning_shift_id,r.evening_shift_id,r.handover FROM branches b LEFT JOIN branch_rosters r ON r.branch_id=b.id WHERE b.active=1 ORDER BY b.code").all()).results;
 const people=new Map((await db.prepare("SELECT id,role,active,department FROM profiles").all()).results.map(p=>[p.id,p]));
 const shifts=new Map((await db.prepare("SELECT id,start_time,end_time FROM shifts").all()).results.map(s=>[s.id,s]));
 const rows=(await db.prepare("SELECT a.branch_id,a.work_date,a.shift_id,a.user_id,a.starts_at,a.ends_at FROM assignments a JOIN branches b ON b.id=a.branch_id AND b.active=1 JOIN profiles p ON p.id=a.user_id AND p.active=1 WHERE a.work_date BETWEEN ? AND ? AND NOT EXISTS(SELECT 1 FROM workforce_requests w WHERE w.assignment_id=a.id AND w.kind='LEAVE' AND w.state='APPROVED')"+(schema.includes('extra_attendance')?" AND NOT EXISTS(SELECT 1 FROM extra_attendance x WHERE x.assignment_id=a.id AND x.state<>'APPROVED')":"")).bind(from,to).all()).results;
 const byKey=new Map();for(const row of rows){const k=row.branch_id+':'+row.work_date+':'+row.shift_id;const items=byKey.get(k)||[];items.push(row);byKey.set(k,items);}
 let missing_slots=0;
 const result=branches.map(b=>{
  const m=shifts.get(b.morning_shift_id),e=shifts.get(b.evening_shift_id);
  const configured=!!m&&!!e&&isRetailStaff(people.get(b.morning_user_id))&&isRetailStaff(people.get(b.evening_user_id))&&m.end_time===e.start_time;
  const days=[];
  if(configured)for(let t=Date.parse(from);t<=Date.parse(to);t+=86400000){
   const day=new Date(t).toISOString().slice(0,10),a=shiftInterval(day,m.start_time,m.end_time),z=shiftInterval(day,e.start_time,e.end_time);
   if(b.handover==='morning_stays')a.ends_at+=1800000;else if(b.handover==='evening_arrives')z.starts_at-=1800000;else{a.ends_at+=900000;z.starts_at-=900000;}
   const filled=(id,interval)=>(byKey.get(b.id+':'+day+':'+id)||[]).some(r=>isRetailStaff(people.get(r.user_id))&&r.starts_at<=interval.starts_at&&r.ends_at>=interval.ends_at);
   const morning=filled(b.morning_shift_id,a),evening=filled(b.evening_shift_id,z);
   missing_slots+=Number(!morning)+Number(!evening);days.push({day,morning,evening});
  }
  return {id:b.id,code:b.code,name:b.name,configured,days};
 });
 return {available:true,from,to,extra_ready:schema.includes('extra_attendance'),handover_ready:schema.includes('shift_handover'),branches:result,missing_slots};
}
