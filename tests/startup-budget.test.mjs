import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Source bytes, not compressed transfer sizes or measured latency.
// Generous ceilings catch accidental eager imports while route splitting is staged.
const read=path=>readFile(new URL('../public/'+path,import.meta.url),'utf8');
const bytes=s=>Buffer.byteLength(s.replaceAll('\r\n','\n'));
test('startup module graph and linked CSS stay within source-size budgets',async()=>{
 const seen=new Set();let js=0;
 async function visit(path){if(seen.has(path))return;seen.add(path);const source=await read(path);js+=bytes(source);
  for(const m of source.matchAll(/^(?:import|export)\s+[^;\n]*?\sfrom\s*['"]\.\/([^'"]+)['"]/gm))await visit(m[1]);
 }
 await visit('app.mjs');
 const html=await read('index.html'),links=[...html.matchAll(/<link\s+rel="stylesheet"\s+href="\/([^"?]+)"/g)].map(m=>m[1]);
 assert.ok(links.length>=7);let css=0;for(const p of new Set(links))css+=bytes(await read(p));
 assert.ok(!seen.has('timemark-layout.mjs'),'camera/Timemark should remain lazy');
 console.log('Startup source budgets: JS '+js+'/285000 bytes, CSS '+css+'/185000 bytes');
 assert.ok(js<=285000,'initial JS exceeds budget: '+js);assert.ok(css<=185000,'linked CSS exceeds budget: '+css);
});
