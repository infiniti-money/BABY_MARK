import test from 'node:test';import assert from 'node:assert/strict';
import * as attendance from '../../functions/api/attendance/[action].js';
import {appFixture,photoForm} from './helpers/app.mjs';
const body=f=>({assignment_id:f.assignment,type:'IN',lat:20,lng:106,accuracy:8});
test('concurrent prepare rate limit is enforced in atomic INSERT, not just preflight count',async()=>{
 const f=await appFixture();try{
  const results=await Promise.all(Array.from({length:14},()=>f.call(attendance,'staff',{action:'prepare',body:body(f)})));
  assert.equal(results.filter(r=>r.status===201).length,10);assert.equal(results.filter(r=>r.status===429).length,4);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM attendance_challenges').first()).n,10);
 }finally{f.close();}
});
test('plan change immediately before claim is rejected after claim with no KV writes',async()=>{
 const f=await appFixture();try{
  const c=await (await f.call(attendance,'staff',{action:'prepare',body:body(f)})).json();
  const original=f.db.prepare.bind(f.db);let changed=false;
  f.db.prepare=(sql)=>{
   const statement=original(sql);
   if(sql.startsWith("UPDATE attendance_challenges SET state='PROCESSING'")){
    const bind=statement.bind.bind(statement);statement.bind=(...args)=>{const bound=bind(...args),first=bound.first.bind(bound);
     bound.first=async()=>{changed=true;await original("UPDATE branches SET address_text='New reviewed location' WHERE id='BM-001'").run();return first();};return bound;};
   }return statement;
  };
  const result=await f.call(attendance,'staff',{action:'submit',form:photoForm(c.challenge_id)});
  assert.equal(changed,true);assert.equal(result.status,409);assert.equal((await result.json()).code,'PLAN_CHANGED');assert.equal(f.objects.size,0);
 }finally{f.close();}
});
test('slow upload cannot outlive the server challenge even when headers arrived before expiry',async()=>{
 const f=await appFixture(),originalNow=Date.now;try{
  const c=await (await f.call(attendance,'staff',{action:'prepare',body:body(f)})).json();
  const source=new Request('https://test.invalid',{method:'POST',body:photoForm(c.challenge_id)}),raw=new Uint8Array(await source.arrayBuffer());
  let clock=originalNow();Date.now=()=>clock;
  const stream=new ReadableStream({start(controller){controller.enqueue(raw.slice(0,30));},pull(controller){clock=c.expires_at+1;controller.enqueue(raw.slice(30));controller.close();}});
  const request=new Request('https://test.invalid/api/attendance/submit',{method:'POST',duplex:'half',headers:{'Content-Type':source.headers.get('content-type'),Authorization:'Bearer '+f.tokens.staff},body:stream});
  const result=await attendance.onRequestPost({request,env:f.env,params:{action:'submit'}});assert.equal(result.status,410);assert.equal(f.objects.size,0);
 }finally{Date.now=originalNow;f.close();}
});
