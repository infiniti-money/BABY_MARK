import test from 'node:test';import assert from 'node:assert/strict';
import {appFixture,photoForm} from './helpers/app.mjs';
import * as api from '../../functions/api/handover.js';
import * as attendance from '../../functions/api/attendance/[action].js';
test('handover requires own checkout and restricts visibility to next shift or authorized manager',async()=>{
 const f=await appFixture();try{
 const body={assignment_id:f.assignment,message:'Đơn hàng cần kiểm tra'};
 assert.equal((await f.call(api,'staff',{body})).status,409);
 for(const type of ['IN','OUT']){
  const prepared=await f.call(attendance,'staff',{action:'prepare',body:{assignment_id:f.assignment,type,lat:20,lng:106,accuracy:5}});
  assert.equal(prepared.status,201);
  const {challenge_id}=await prepared.json();
  assert.equal((await f.call(attendance,'staff',{action:'submit',form:photoForm(challenge_id)})).status,201);
 }
 assert.equal((await f.call(api,'other',{body})).status,409);
 assert.equal((await f.call(api,'staff',{body})).status,201);
 assert.equal((await f.call(api,'staff',{body})).status,200);
 const list=async who=>(await (await f.call(api,who,{method:'GET'})).json()).rows;
 assert.equal((await list('other')).length,0);
 assert.equal((await list('manager')).length,1);
 assert.equal((await list('admin')).length,1);
 const now=Date.now();
 await f.db.prepare('UPDATE assignments SET branch_id=?,starts_at=?,ends_at=? WHERE id=?').bind('BM-001',now+3600000,now+8*3600000,f.otherAssignment).run();
 assert.equal((await list('other')).length,1);
 }finally{f.close()}
});
