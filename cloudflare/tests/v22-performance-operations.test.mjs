import test from 'node:test';import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';import * as chat from '../../functions/api/messages.js';
import * as diagnostics from '../../functions/api/admin/diagnostics.js';
import {onRequest as middleware} from '../../functions/_middleware.js';
test('RC18 compact chat is scoped, returns only changed thread content and monotonic read cursor',async()=>{const f=await appFixture();try{
 const post=(who,body)=>f.call(chat,who,{body}),get=(who,query='')=>f.call(chat,who,{method:'GET',query});
 const {id}=await (await post('staff',{action:'direct',user_id:f.ids.other})).json();
 assert.equal((await get('manager','?thread='+id+'&known=0')).status,404);
 assert.equal((await (await get('staff','?thread='+id+'&known=0')).json()).unchanged,true);
 await post('staff',{action:'send',thread_id:id,body:'x'.repeat(2000)});
 const latest=await (await get('other','?thread='+id+'&known=0')).json();assert.equal(latest.messages[0].body.length,2000);
 const cursor=latest.messages[0].id,unchanged=await (await get('other','?thread='+id+'&known='+cursor)).json();
 assert.equal(unchanged.unchanged,true);assert.equal(unchanged.messages,undefined);
 assert.equal((await get('other','?thread='+id+'&known=1&before=2')).status,400);
 const compact=await (await get('other','?compact=1')).json();assert.equal(compact.contacts,undefined);assert.equal(compact.threads.find(t=>t.id===id).latest_body.length,100);
 await post('other',{action:'read',thread_id:id,message_id:cursor});await post('other',{action:'read',thread_id:id,message_id:cursor});
 assert.equal((await (await get('other')).json()).threads.find(t=>t.id===id).unread,0);
 }finally{f.close()}});
test('RC19 request id and timing are generated for API failures without exposing exception',async()=>{
 const request=new Request('https://test.invalid/api/test');
 const r=await middleware({request,next:async()=>{throw Error('PRIVATE INTERNAL TRACE')}});
 assert.equal(r.status,500);assert.match(r.headers.get('X-Request-ID'),/^[0-9a-f-]{36}$/);assert.match(r.headers.get('Server-Timing'),/^app;dur=\d+$/);
 assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.doesNotMatch(await r.text(),/PRIVATE INTERNAL TRACE/);
 const denied=await middleware({request:new Request('https://test.invalid/api/test',{headers:{origin:'https://other.invalid'}}),next:()=>{throw Error('must not run')}});
 assert.equal(denied.status,403);assert.ok(denied.headers.get('X-Request-ID'));
});
test('RC19 diagnostics bounded queue counts, timing and admin-only access',async()=>{const f=await appFixture();try{
 const now=Date.now();
 for(let i=0;i<110;i++)await f.db.prepare("INSERT INTO push_queue(event_key,endpoint,user_id,created_at,expires_at,state) VALUES(?,?,?,?,?,'pending')").bind('e'+i,'local-test-'+i,f.ids.staff,now-10000,now-1000).run();
 assert.equal((await f.call(diagnostics,'staff',{method:'GET'})).status,403);
 const r=await f.call(diagnostics,'admin',{method:'GET'});assert.equal(r.status,200);const d=await r.json();
 assert.equal(d.push.queue.find(x=>x.state==='pending').n,101);assert.equal(d.push.queue.find(x=>x.state==='pending').capped,true);
 assert.ok(d.issues.some(x=>x.code==='PUSH_QUEUE_OVERDUE'));assert.ok(d.diagnostic_ms>=0);assert.ok(d.probes.KV_READ_FAILED.ok);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM push_queue').first()).n,110);
 }finally{f.close()}});
