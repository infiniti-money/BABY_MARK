import {digest,equalHash,reply} from '../../../cloudflare/lib/auth.mjs';
import {dayVN} from '../../../cloudflare/lib/access.mjs';
import {generateRoster} from '../admin/rosters.js';
export async function onRequestPost({request,env}){
 const expected=env.ROSTER_CRON_SECRET,provided=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(typeof expected!=='string'||expected.length<32||expected.length>256||!provided||provided.length>256||!equalHash(await digest(expected),await digest(provided)))return reply({error:'Unauthorized'},401);
 try{
 const db=env.DB;
 if(!db||!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='roster_automation'").first())return reply({error:'Migration 0014 required'},503);
 const from=dayVN(Date.now()+86400000),to=dayVN(Date.now()+14*86400000);
 const configs=(await db.prepare("SELECT ra.* FROM roster_automation ra JOIN branches b ON b.id=ra.branch_id AND b.active=1 JOIN profiles p ON p.id=ra.updated_by AND p.active=1 AND p.role='admin' JOIN branch_rosters r ON r.branch_id=ra.branch_id WHERE ra.enabled=1 ORDER BY ra.branch_id").all()).results;
 const branch=new URL(request.url).searchParams.get('branch_id');
 if(!branch)return reply({branches:configs.map(c=>c.branch_id)});
 if(!configs.some(c=>c.branch_id===branch))return reply({error:'Branch not eligible or automation disabled'},409);
 let created=0,skipped=0,failed=0;const results=[];
 for(const cfg of configs.filter(c=>c.branch_id===branch)){
  const weekdays=[1,2,3,4,5,6,7].filter(d=>cfg.weekday_mask&(1<<(d-1)));
  let status;
  try{const r=await generateRoster(db,{id:cfg.updated_by,role:'admin'},cfg.branch_id,{action:'auto-generate',from,to,weekdays,config_updated_at:cfg.updated_at});created+=r.created;skipped+=r.existing;status='OK '+r.created+' mới / '+r.existing+' đã có hoặc bỏ qua';}
  catch{failed++;status='Cần kiểm tra: ca xung đột hoặc cấu hình không hợp lệ';}
  await db.prepare('UPDATE roster_automation SET last_run_at=?,last_status=? WHERE branch_id=? AND updated_at=?').bind(Date.now(),status,cfg.branch_id,cfg.updated_at).run();
  results.push({branch_id:cfg.branch_id,status});
 }
 return reply({from,to,created,skipped,failed,configured:configs.length,results});
 }catch{return reply({error:'Scheduler failed'},500)}
}
