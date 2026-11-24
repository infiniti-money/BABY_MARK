import {pruneAttendance} from '../../../cloudflare/lib/attendance-retention.mjs';
import {digest,equalHash,reply} from '../../../cloudflare/lib/auth.mjs';
import {policy} from '../../../cloudflare/lib/policy.mjs';
// No deletion by GET. Disabled until a human explicitly enables the policy.
export async function onRequestPost({request,env}){
 if(!env.DB)return reply({error:'Retention disabled'},503);
 const expected=env.RETENTION_SECRET,provided=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(typeof expected!=='string'||expected.length<32||!provided||provided.length>256)return reply({error:'Unauthorized'},401);
 if(!equalHash(await digest(expected),await digest(provided)))return reply({error:'Unauthorized'},401);
 try{if(!(await policy(env)).attendance_retention)return reply({error:'Retention disabled'},503);return reply(await pruneAttendance(env.DB));}catch{return reply({error:'Cleanup failed; transaction rolled back or result uncertain; check retention_runs'},500)}
}
