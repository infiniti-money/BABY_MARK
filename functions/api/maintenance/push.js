import {digest,equalHash,reply} from '../../../cloudflare/lib/auth.mjs';
import {dispatchPush} from '../../../cloudflare/lib/web-push.mjs';
export async function onRequestPost({request,env}){
 const expected=env.PUSH_CRON_SECRET,provided=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(typeof expected!=='string'||expected.length<32||!provided||provided.length>256||!equalHash(await digest(expected),await digest(provided)))return reply({error:'Unauthorized'},401);
 try{return reply(await dispatchPush(env));}catch{return reply({error:'Push dispatcher unavailable'},503)}
}
