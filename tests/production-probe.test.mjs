import test from 'node:test';
import assert from 'node:assert/strict';
import {probe} from '../scripts/production-probe.mjs';
test('public probe requests only fixed public paths and validates cache/health, no credentials',async()=>{
 const paths=[],css='/assets/immutable/style-'+'a'.repeat(32)+'.css';
 const fetcher=async(url,opts)=>{const u=new URL(url);assert.equal(u.origin,'https://babymark.pages.dev');assert.equal(opts.method,'GET');assert.equal(opts.headers,undefined);paths.push(u.pathname);const body=u.pathname==='/'?'<link rel="stylesheet" href="'+css+'">':u.pathname.includes('/health')?JSON.stringify({ready:true,schema_ready:false,schema_target:'0023'}):'fixture';return new Response(body,{headers:{'Cache-Control':u.pathname===css?'public, max-age=31536000, immutable':u.pathname==='/app.mjs'?'public, no-cache':'no-store'}})};
 const r=await probe({fetcher,samples:2});assert.deepEqual(paths,['/','/',css,css,'/app.mjs','/app.mjs','/api/cloudflare/health','/api/cloudflare/health']);assert.equal(r.health.schema_ready,false);assert.equal(r.results.length,4);
 await assert.rejects(probe({fetcher:async()=>new Response('x',{headers:{'Cache-Control':'public'}}),samples:1}),/HTML cache/);
});
