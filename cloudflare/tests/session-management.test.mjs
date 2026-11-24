import test from 'node:test';import assert from 'node:assert/strict';
import {appFixture,testSecret} from './helpers/app.mjs';
import * as auth from '../../functions/api/auth/[action].js';
import {sessionUser} from '../lib/auth.mjs';
test('revoke other sessions without affecting current or other accounts',async()=>{
 const f=await appFixture();try{
 const response=await f.call(auth,null,{action:'login',body:{username:'test-staff',secret:testSecret,remember:true}});
 assert.equal(response.status,200);const other=await response.json();assert.ok(other.expires_at>Date.now()+29*86400000);
 const s=await (await f.call(auth,'staff',{method:'GET',action:'sessions'})).json();assert.equal(s.total,2);assert.equal(s.other,1);
 assert.equal((await f.call(auth,'staff',{action:'revoke-other-sessions',body:{}})).status,200);
 const req=t=>new Request('https://test.invalid',{headers:{Authorization:'Bearer '+t}});
 assert.equal(await sessionUser(req(other.token),f.db),null);assert.ok(await sessionUser(req(f.tokens.staff),f.db));assert.ok(await sessionUser(req(f.tokens.other),f.db));
 assert.equal((await (await f.call(auth,'staff',{method:'GET',action:'sessions'})).json()).other,0);
 }finally{f.close()}
});
