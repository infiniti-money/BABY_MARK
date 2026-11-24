import {reply} from '../../cloudflare/lib/auth.mjs';
import {actorFor,apiFailure} from '../../cloudflare/lib/access.mjs';
import {readAssignments,summarizeAssignment} from '../../cloudflare/lib/reports.mjs';

export async function onRequestGet({request,env}){
 try{
  const actor=await actorFor(request,env);
  const d=await readAssignments(env.DB,actor,new URL(request.url));return reply({...d,assignments:d.assignments.map(a=>({...a,summary:summarizeAssignment(a)}))});
 }catch(error){return apiFailure(error)}
}
