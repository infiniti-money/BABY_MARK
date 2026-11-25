import {actorFor,apiFailure} from '../../cloudflare/lib/access.mjs';
import {reply} from '../../cloudflare/lib/auth.mjs';
export async function onRequestGet({request,env}){
 try{
  const actor=await actorFor(request,env),db=env.DB,now=Date.now();
  const rows=(await db.prepare("SELECT r.id,r.kind,r.state,r.decided_at,r.decision_note,a.work_date,b.name AS branch_name FROM workforce_requests r JOIN assignments a ON a.id=r.assignment_id JOIN branches b ON b.id=a.branch_id WHERE r.user_id=? AND r.state IN ('APPROVED','REJECTED') AND r.decided_at>=? ORDER BY r.decided_at DESC,r.id DESC LIMIT 30").bind(actor.id,now-30*86400000).all()).results;
  return reply({items:rows,days:30,limit:30});
 }catch(e){return apiFailure(e)}
}
