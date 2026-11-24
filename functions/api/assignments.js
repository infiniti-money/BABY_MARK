import {reply} from '../../cloudflare/lib/auth.mjs';
import {actorFor,apiFailure} from '../../cloudflare/lib/access.mjs';
import {readAssignments} from '../../cloudflare/lib/reports.mjs';

export async function onRequestGet({request,env}){
 try{
  const actor=await actorFor(request,env);
  return reply(await readAssignments(env.DB,actor,new URL(request.url)));
 }catch(error){return apiFailure(error)}
}
