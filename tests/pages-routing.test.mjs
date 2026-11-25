import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {onRequest} from '../functions/_middleware.js';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('Pages routes invoke Functions only for API; static assets bypass middleware',async()=>{
 const rules=JSON.parse(await read('public/_routes.json'));
 assert.deepEqual(rules,{version:1,include:['/api','/api/*'],exclude:[]});
 const entries=await readdir(new URL('../functions/',import.meta.url));
 assert.deepEqual(entries.sort(),['_middleware.js','api']);
});
test('static security headers stay enabled; public asset cache requires revalidation',async()=>{
 const h=await read('public/_headers');
 const blocks=h.trim().split(/\n\s*\n/);
 assert.match(blocks[0],/Cache-Control: no-store/);
 assert.match(blocks[0],/X-Frame-Options: DENY/);
 assert.match(blocks[0],/frame-ancestors 'none'/);
 assert.match(blocks[0],/Permissions-Policy: camera=\(self\), geolocation=\(self\)/);
 for(const path of ['/*.mjs','/*.css','/brand/*']){
  const block=blocks.find(b=>b.split('\n').includes(path));
  assert.ok(block,path);
  assert.match(block,/! Cache-Control\n  Cache-Control: public, no-cache/);
 }
});
test('API root and all API responses remain private and reject cross-origin requests',async()=>{
 for(const path of ['/api','/api/assignments','/api/cloudflare/photo/example']){
  const request=new Request('https://test.invalid'+path);
  const ok=await onRequest({request,next:async()=>Response.json({ok:true})});
  assert.equal(ok.headers.get('Cache-Control'),'private, no-store');
  const denied=await onRequest({request:new Request(request.url,{headers:{origin:'https://other.invalid'}}),next:()=>{throw Error('must not run')}});
  assert.equal(denied.status,403);
  assert.equal(denied.headers.get('Cache-Control'),'private, no-store');
 }
});
