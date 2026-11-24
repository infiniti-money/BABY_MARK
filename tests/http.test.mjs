import test from 'node:test';import assert from 'node:assert/strict';
import {readLimited,jsonLimited} from '../cloudflare/lib/http.mjs';
import {jpegDimensions} from '../cloudflare/lib/jpeg.mjs';
import {structuralJPEG} from '../cloudflare/tests/helpers/app.mjs';
test('stream request limit holds without Content-Length, including invalid declared length',async()=>{
 const request=new Request('https://test.invalid',{method:'POST',body:'x'.repeat(9000)});
 await assert.rejects(readLimited(request,8192),e=>e.status===413);
 const json=new Request('https://test.invalid',{method:'POST',body:'{"a":1}',headers:{'content-type':'application/json; charset=utf-8'}});assert.deepEqual(await jsonLimited(json),{a:1});
});
test('JPEG structural bounds reject signature-only, truncated and oversized pixel input',()=>{
 assert.deepEqual(jpegDimensions(structuralJPEG()),{width:800,height:1200});
 assert.throws(()=>jpegDimensions(new Uint8Array([255,216,255,217])),/INVALID/);
 const bad=structuralJPEG();bad[9]=255;bad[10]=255;assert.throws(()=>jpegDimensions(bad),/DIMENSIONS/);
 assert.throws(()=>jpegDimensions(structuralJPEG().slice(0,-1)),/INVALID/);
});
