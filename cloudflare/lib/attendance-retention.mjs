// Two calendar years, at midnight Vietnam time (+07:00).
// Clamp Feb 29 to the final day of February in the target year.
export function attendanceCutoff(now=Date.now()){
 const vn=new Date(now+7*3600000);
 const y=vn.getUTCFullYear()-2,m=vn.getUTCMonth();
 const d=Math.min(vn.getUTCDate(),new Date(Date.UTC(y,m+1,0)).getUTCDate());
 return Date.UTC(y,m,d)-7*3600000;
}
export async function pruneAttendance(db,now=Date.now()){
 const cutoff=attendanceCutoff(now),id=crypto.randomUUID();
 const selected="SELECT assignment_id FROM retention_candidates WHERE run_id=?";
 // Older installations may not have these tables. Never prune pending or recent
 // supplemental shifts, recent handovers or recently reviewed work units.
 const catalog=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('extra_attendance','shift_handover','work_unit_reviews')").all()).results;
 const tables=new Set(catalog.map(r=>r.name)),guards=[],guardValues=[];
 if(tables.has('extra_attendance')){guards.push("AND NOT EXISTS(SELECT 1 FROM extra_attendance e WHERE e.assignment_id=a.id AND (e.state='PENDING' OR e.created_at>=? OR e.decided_at>=?))");guardValues.push(cutoff,cutoff);}
 if(tables.has('shift_handover')){guards.push("AND NOT EXISTS(SELECT 1 FROM shift_handover h WHERE h.assignment_id=a.id AND h.created_at>=?)");guardValues.push(cutoff);}
 if(tables.has('work_unit_reviews')){guards.push("AND NOT EXISTS(SELECT 1 FROM work_unit_reviews u WHERE u.assignment_id=a.id AND u.reviewed_at>=?)");guardValues.push(cutoff);}
 // All statements execute in a single D1 batch transaction. Work in bounded chunks.
 // Preserve pending disputes, recent decisions and any recent attendance evidence.
 const sql=[
 db.prepare("INSERT INTO retention_runs(id,started_at,cutoff_at) VALUES(?,?,?)").bind(id,now,cutoff),
 db.prepare(`INSERT INTO retention_candidates(run_id,assignment_id)
 SELECT ?,a.id FROM assignments a WHERE a.ends_at<?
 AND NOT EXISTS(SELECT 1 FROM attendance_challenges c WHERE c.assignment_id=a.id AND c.state='PROCESSING')
 AND NOT EXISTS(SELECT 1 FROM attendances t WHERE t.assignment_id=a.id AND t.server_timestamp>=?)
 AND NOT EXISTS(SELECT 1 FROM workforce_requests w WHERE w.assignment_id=a.id AND (w.state='PENDING' OR w.created_at>=? OR w.decided_at>=?))
 AND NOT EXISTS(SELECT 1 FROM attendance_notifications n WHERE n.assignment_id=a.id AND n.created_at>=?)
 ${guards.join(' ')}
 ORDER BY a.ends_at,a.id LIMIT 50`).bind(id,cutoff,cutoff,cutoff,cutoff,cutoff,...guardValues),
 db.prepare("UPDATE retention_runs SET assignments_removed=(SELECT COUNT(*) FROM retention_candidates WHERE run_id=?) WHERE id=?").bind(id,id),
 db.prepare("DELETE FROM push_deliveries WHERE notification_id IN (SELECT id FROM attendance_notifications WHERE assignment_id IN ("+selected+"))").bind(id),
 db.prepare("DELETE FROM attendance_notifications WHERE assignment_id IN ("+selected+")").bind(id),
 db.prepare("DELETE FROM workforce_requests WHERE assignment_id IN ("+selected+")").bind(id),
 // KV expires separately; remove only already-retired inventory metadata for old records.
 db.prepare("DELETE FROM photo_inventory WHERE state IN ('evicted','expired') AND photo_path IN (SELECT photo_path FROM attendances WHERE assignment_id IN ("+selected+"))").bind(id),
 db.prepare("DELETE FROM attendances WHERE assignment_id IN ("+selected+")").bind(id),
 db.prepare("DELETE FROM attendance_challenges WHERE assignment_id IN ("+selected+")").bind(id),
 db.prepare("DELETE FROM assignments WHERE id IN ("+selected+") RETURNING id").bind(id),
 db.prepare("DELETE FROM retention_candidates WHERE run_id=?").bind(id)
 ];
 const results=await db.batch(sql);
 return {run_id:id,cutoff_at:cutoff,assignments_removed:results[9].results.length};
}
