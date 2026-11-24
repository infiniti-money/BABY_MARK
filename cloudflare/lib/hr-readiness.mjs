// Read-only catalog checks; verify presence and kind, not full schema integrity.
const required={roster_automation:'table',payroll_inputs:'table',payroll_closings:'table',payroll_closings_immutable_update:'trigger',payroll_closings_immutable_delete:'trigger'};
export async function hrReadiness(db){
 const {results}=await db.prepare("SELECT name,type FROM sqlite_master WHERE name IN ('roster_automation','payroll_inputs','payroll_closings','payroll_closings_immutable_update','payroll_closings_immutable_delete')").all();
 const present=new Map(results.map(x=>[x.name,x.type])),missing=Object.keys(required).filter(name=>present.get(name)!==required[name]);
 return {ready:missing.length===0,missing,automation_ready:present.get('roster_automation')==='table'};
}
export async function rosterReadiness(env,hr){
 const secret=env.ROSTER_CRON_SECRET,secret_ready=typeof secret==='string'&&secret.length>=32&&secret.length<=256;
 if(!hr.automation_ready)return {secret_ready,enabled:0,last_run_at:null,errors:0,never_run:0};
 const row=await env.DB.prepare("SELECT COUNT(*) AS enabled,MAX(last_run_at) AS last_run_at,COALESCE(SUM(CASE WHEN last_status LIKE 'Cần kiểm tra:%' THEN 1 ELSE 0 END),0) AS errors,COALESCE(SUM(CASE WHEN last_run_at IS NULL THEN 1 ELSE 0 END),0) AS never_run FROM roster_automation ra JOIN branches b ON b.id=ra.branch_id AND b.active=1 WHERE ra.enabled=1").first();
 return {secret_ready,...row};
}
