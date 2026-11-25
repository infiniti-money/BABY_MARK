import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture,photoForm} from './helpers/app.mjs';
import * as attendance from '../../functions/api/attendance/[action].js';
async function prepare(f){
 const r=await f.call(attendance,'staff',{action:'prepare',body:{assignment_id:f.assignment,type:'IN',lat:20,lng:106,accuracy:5}});
 assert.equal(r.status,201);return (await r.json()).challenge_id;
}
const status=(f,id,who='staff')=>f.call(attendance,who,{method:'GET',action:'status',query:'?challenge_id='+id});
const cancel=(f,id,who='staff')=>f.call(attendance,who,{action:'cancel',body:{challenge_id:id}});
test('RC15 cancel is owner-only, terminal and idempotent; late submit cannot record',async()=>{const f=await appFixture();try{
 const id=await prepare(f);
 assert.equal((await cancel(f,id,'other')).status,404);
 assert.equal((await status(f,id,'other')).status,404);
 assert.equal((await (await status(f,id)).json()).state,'READY');
 for(let i=0;i<2;i++)assert.equal((await (await cancel(f,id)).json()).state,'FAILED');
 assert.equal((await f.call(attendance,'staff',{action:'submit',form:photoForm(id)})).status,409);
 assert.equal(f.objects.size,0);
 assert.equal((await f.db.prepare('SELECT count(*) AS n FROM attendances').first()).n,0);
 }finally{f.close()}});
test('RC15 cancellation cannot interrupt PROCESSING; lost response and another challenge recover original record',async()=>{const f=await appFixture();try{
 const id=await prepare(f),other=await prepare(f),original=f.kv.put;
 let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
 f.kv.put=async(...args)=>{enter();await gate;return original(...args)};
 const submit=f.call(attendance,'staff',{action:'submit',form:photoForm(id)});
 try{await entered;assert.equal((await (await cancel(f,id)).json()).state,'PROCESSING');}finally{release();}
 const result=await submit;assert.equal(result.status,201);const t=(await result.json()).attendance;
 for(const q of [status(f,id),cancel(f,id),status(f,other),cancel(f,other)]){
  const d=await (await q).json();assert.equal(d.state,'COMPLETED');assert.equal(d.attendance.id,t.id);
 }
 assert.equal((await f.db.prepare('SELECT count(*) AS n FROM attendances').first()).n,1);
 assert.equal(f.objects.size,1);
 }finally{f.close()}});
test('RC15 cancel/submit race never creates a second attendance or overwrites an accepted photo',async()=>{const f=await appFixture();try{
 const id=await prepare(f);
 const [a,b]=await Promise.all([cancel(f,id),f.call(attendance,'staff',{action:'submit',form:photoForm(id)})]);
 assert.equal(a.status,200);assert.ok([201,409].includes(b.status));
 const d=await (await status(f,id)).json();
 const n=(await f.db.prepare('SELECT count(*) AS n FROM attendances').first()).n;
 assert.equal(n,b.status===201?1:0);assert.equal(d.state,n?'COMPLETED':'FAILED');
 assert.equal(f.objects.size,n);
 }finally{f.close()}});

test('RC15 expired unused challenge can be cancelled, orphan COMPLETED is UNKNOWN, no false success',async()=>{const f=await appFixture();try{
 const id=await prepare(f);
 await f.db.prepare('UPDATE attendance_challenges SET expires_at=? WHERE id=?').bind(Date.now()-1,id).run();
 assert.equal((await (await status(f,id)).json()).state,'EXPIRED');
 assert.equal((await (await cancel(f,id)).json()).state,'FAILED');
 const orphan=await prepare(f);
 await f.db.prepare("UPDATE attendance_challenges SET state='COMPLETED' WHERE id=?").bind(orphan).run();
 assert.equal((await (await status(f,orphan)).json()).state,'UNKNOWN');
 assert.equal((await (await cancel(f,orphan)).json()).state,'UNKNOWN');
 assert.equal((await f.db.prepare('SELECT count(*) AS n FROM attendances').first()).n,0);
 assert.equal(f.objects.size,0);
 }finally{f.close()}});
