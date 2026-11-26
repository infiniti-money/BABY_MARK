import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {optimizeStaticAssets} from '../scripts/static-assets.mjs';
test('static optimizer preserves module URLs, lazy import and exact CSS cascade; content hash matches bytes',async()=>{
 const root=await mkdtemp(resolve(tmpdir(),'bm-static-'));
 try{
  const html='<html><head><link rel="stylesheet" href="/one.css">\n<link rel="stylesheet" href="/two.css">\n<script type="module" src="/app.mjs"></script></head></html>';
  const one='/* first */\n.test{color:red;background:url("/brand/logo.png")}';
  const two='/* second */\n.test{color:blue}';
  await Promise.all(Object.entries({'index.html':html,'one.css':one,'two.css':two,'app.mjs':'// comment\nexport async function value () { return ( await import("./lazy.mjs") ).value; }','lazy.mjs':'// comment\nexport const value = 42;'}).map(([file,content])=>writeFile(resolve(root,file),content)));
  const stats=await optimizeStaticAssets(root),combined=await readFile(resolve(root,'.'+stats.css.url),'utf8');
  assert.equal(combined,one+'\n'+two);
  assert.equal(stats.css.url,'/assets/immutable/style-'+createHash('sha256').update(combined).digest('hex').slice(0,32)+'.css');
  assert.equal(stats.css.requests_before,2);assert.equal(stats.css.requests_after,1);assert.ok(stats.js.after<stats.js.before);
  const output=await readFile(resolve(root,'index.html'),'utf8');assert.ok(output.includes(stats.css.url));assert.ok(output.includes('/app.mjs'));assert.ok(!output.includes('/one.css'));
  const mod=await import(pathToFileURL(resolve(root,'app.mjs')).href);assert.equal(await mod.value(),42);
  assert.equal(await readFile(resolve(root,'one.css'),'utf8'),one);
 }finally{await rm(root,{recursive:true,force:true});}
});
