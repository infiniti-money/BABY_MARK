import {actorFor,apiFailure,dayVN} from '../../../cloudflare/lib/access.mjs';
import {reply} from '../../../cloudflare/lib/auth.mjs';
export async function onRequestGet({request,env}){
 try{
 await actorFor(request,env,{admin:true});const db=env.DB,day=dayVN();
 const schema=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('branch_rosters','extra_attendance')").all()).results.map(x=>x.name);
 const row=await db.prepare("SELECT (SELECT COUNT(*) FROM branches WHERE active=1) AS branches,(SELECT COUNT(*) FROM profiles WHERE active=1 AND role<>'admin') AS employees,(SELECT COUNT(*) FROM branches WHERE active=1 AND (latitude IS NULL OR longitude IS NULL)) AS missing_gps,(SELECT COUNT(*) FROM workforce_requests WHERE state='PENDING') AS pending_requests,COUNT(*) AS shifts,COALESCE(SUM(CASE WHEN i.id IS NOT NULL THEN 1 ELSE 0 END),0) AS started,COALESCE(SUM(CASE WHEN i.id IS NOT NULL AND o.id IS NOT NULL THEN 1 ELSE 0 END),0) AS completed FROM assignments a LEFT JOIN attendances i ON i.assignment_id=a.id AND i.type='IN' LEFT JOIN attendances o ON o.assignment_id=a.id AND o.type='OUT' WHERE a.work_date=?").bind(day).first();
 const pending_extra=schema.includes('extra_attendance')?(await db.prepare("SELECT COUNT(*) AS n FROM extra_attendance WHERE state='PENDING'").first()).n:null;
 const missing_roster=schema.includes('branch_rosters')?(await db.prepare("SELECT COUNT(*) AS n FROM branches b WHERE b.active=1 AND NOT EXISTS(SELECT 1 FROM branch_rosters r JOIN profiles m ON m.id=r.morning_user_id AND m.active=1 JOIN profiles e ON e.id=r.evening_user_id AND e.active=1 WHERE r.branch_id=b.id)").first()).n:null;
 return reply({...row,day,pending_extra,missing_roster});
 }catch(e){return apiFailure(e)}
}
