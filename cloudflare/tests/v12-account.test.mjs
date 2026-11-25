import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture,testSecret} from './helpers/app.mjs';
import * as auth from '../../functions/api/auth/[action].js';
test('v1.2 rename preserves credentials, sessions and user identity; scoped revocation',async()=>{
 const f=await appFixture();try{
  const body={user_id:f.ids.staff,username:'new-staff'};
  assert.equal((await f.call(auth,'staff',{action:'rename-username',body})).status,403);
  assert.equal((await f.call(auth,'admin',{action:'rename-username',body:{...body,username:'test-other'}})).status,409);
  assert.equal((await f.call(auth,'admin',{action:'rename-username',body})).status,200);
  assert.equal((await f.call(auth,'staff',{action:'me',method:'GET'})).status,200);
  assert.equal((await f.call(auth,null,{action:'login',body:{username:'test-staff',secret:testSecret}})).status,401);
  const login=await f.call(auth,null,{action:'login',body:{username:'new-staff',secret:testSecret}});assert.equal(login.status,200);
  const sessions=await (await f.call(auth,'staff',{action:'devices',method:'GET'})).json();
  assert.equal(sessions.sessions.length,2);
  const other=sessions.sessions.find(s=>!s.current),current=sessions.sessions.find(s=>s.current);
  assert.ok(other.id);assert.equal(other.token_hash,undefined);
  assert.equal((await f.call(auth,'other',{action:'revoke-device',body:{id:other.id}})).status,404);
  assert.equal((await f.call(auth,'staff',{action:'revoke-device',body:{id:current.id}})).status,404);
  assert.equal((await f.call(auth,'staff',{action:'revoke-device',body:{id:other.id}})).status,200);
  assert.equal((await f.call(auth,'staff',{action:'me',method:'GET'})).status,200);
  assert.equal((await f.call(auth,'other',{action:'me',method:'GET'})).status,200);
 }finally{f.close()}
});
