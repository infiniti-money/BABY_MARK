import test from 'node:test';import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import * as admin from '../../functions/api/admin/[resource].js';
test('only admin can change all active branch radii to 200m without changing GPS',async()=>{
 const f=await appFixture();try{
 const call=async who=>admin.onRequestPost({env:f.env,params:{resource:'branches'},request:new Request('https://test.invalid/api/admin/branches',{method:'POST',headers:{Authorization:'Bearer '+f.tokens[who],'Content-Type':'application/json'},body:JSON.stringify({action:'set-radius-all',allowed_radius:200})})});
 assert.equal((await call('staff')).status,403);
 const before=await f.db.prepare("SELECT latitude,longitude FROM branches WHERE id='BM-001'").first();
 assert.equal((await call('admin')).status,200);
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM branches WHERE active=1 AND allowed_radius<>200').first()).n,0);
 assert.deepEqual(await f.db.prepare("SELECT latitude,longitude FROM branches WHERE id='BM-001'").first(),before);
 assert.equal((await (await call('admin')).json()).updated,0);
 }finally{f.close()}
});
