import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import * as audit from '../../functions/api/admin/audit-log.js';
import * as decisions from '../../functions/api/my-decisions.js';
import * as workforce from '../../functions/api/workforce.js';
test('audit log is admin-only, paginated with stable tie ordering and omits arbitrary details',async()=>{
 const f=await appFixture();try{
  const now=Date.now();
  for(let i=0;i<55;i++)await f.db.prepare("INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at) VALUES(?,?,'test','x','UPDATE',?,?)").bind('audit-'+String(i).padStart(2,'0'),f.ids.admin,'{"secret":"do-not-return"}',now).run();
  for(const role of ['staff','manager'])assert.equal((await f.call(audit,role,{method:'GET'})).status,403);
  const first=await (await f.call(audit,'admin',{method:'GET'})).json();
  assert.equal(first.items.length,50);assert.ok(first.next);assert.equal(first.items[0].id,'audit-54');assert.ok(!JSON.stringify(first).includes('do-not-return'));
  const next=await (await f.call(audit,'admin',{method:'GET',query:'?before='+first.next.before+'&before_id='+first.next.before_id})).json();
  assert.equal(next.items.length,5);assert.equal(next.next,null);assert.equal(new Set([...first.items,...next.items].map(x=>x.id)).size,55);
  assert.equal((await f.call(audit,'admin',{method:'GET',query:'?source=invalid'})).status,400);
  assert.equal((await f.call(audit,'admin',{method:'GET',query:'?before=123'})).status,400);
 }finally{f.close()}
});
test('personal decision inbox only reveals decisions for current user',async()=>{
 const f=await appFixture();try{
  const a=await f.call(workforce,'staff',{body:{assignment_id:f.assignment,kind:'LEAVE',reason:'Nghỉ việc riêng'}});
  assert.equal(a.status,201);const {id}=await a.json();
  const pending=await (await f.call(decisions,'staff',{method:'GET'})).json();assert.equal(pending.items.length,0);
  const r=await f.call(workforce,'admin',{body:{action:'decide',id,state:'APPROVED',decision_note:'Đã duyệt nghỉ'}});
  assert.equal(r.status,200);
  const mine=await (await f.call(decisions,'staff',{method:'GET',query:'?user_id='+f.ids.other})).json();assert.equal(mine.items.length,1);assert.equal(mine.items[0].state,'APPROVED');
  for(const role of ['other','manager','admin'])assert.equal((await (await f.call(decisions,role,{method:'GET'})).json()).items.length,0);
  assert.equal((await f.call(decisions,null,{method:'GET'})).status,401);
 }finally{f.close()}
});
