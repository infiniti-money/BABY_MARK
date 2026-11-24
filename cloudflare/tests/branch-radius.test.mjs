import test from 'node:test';import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import * as admin from '../../functions/api/admin/[resource].js';
test('admin can set configurable radii on active branches, with bounds, audit and GPS preserved',async()=>{
 const f=await appFixture();try{
 const call=async(who,radius)=>admin.onRequestPost({env:f.env,params:{resource:'branches'},request:new Request('https://test.invalid/api/admin/branches',{method:'POST',headers:{Authorization:'Bearer '+f.tokens[who],'Content-Type':'application/json'},body:JSON.stringify({action:'set-radius-all',allowed_radius:radius})})});
 assert.equal((await call('staff',350)).status,403);
 assert.equal((await call('manager',350)).status,403);
 for(const radius of [19,1001,20.5,'350',null])assert.equal((await call('admin',radius)).status,400);
 const before=await f.db.prepare("SELECT latitude,longitude FROM branches WHERE id='BM-001'").first();
 await f.db.prepare("UPDATE branches SET active=0 WHERE id='BM-014'").run();
 const inactive=await f.db.prepare("SELECT allowed_radius FROM branches WHERE id='BM-014'").first();
 for(const radius of [20,350,1000,200]){
  assert.equal((await call('admin',radius)).status,200);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM branches WHERE active=1 AND allowed_radius<>?').bind(radius).first()).n,0);
  assert.equal((await (await call('admin',radius)).json()).updated,0);
 }
 assert.deepEqual(await f.db.prepare("SELECT latitude,longitude FROM branches WHERE id='BM-001'").first(),before);
 assert.deepEqual(await f.db.prepare("SELECT allowed_radius FROM branches WHERE id='BM-014'").first(),inactive);
 }finally{f.close()}
});
