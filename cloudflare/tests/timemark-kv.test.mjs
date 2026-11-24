import test from 'node:test';
import assert from 'node:assert/strict';
import {storeStampedPhoto,RETENTION_SECONDS} from '../lib/timemark-kv.mjs';
const key='timemark/00000000-0000-4000-8000-000000000000.jpg';
test('binary photo, 60-day expiry, no public URL',async()=>{
 const now=Date.now(),bytes=new Uint8Array([255,216,255,217]).buffer;
 let args;
 const out=await storeStampedPhoto({put:async(...a)=>{args=a}},key,bytes,now);
 assert.equal(args[0],key);assert.equal(args[1],bytes);assert.equal(args[2].expiration,Math.floor(now/1000)+RETENTION_SECONDS);assert.equal(out.photo_path,key);
});
test('reject oversize',async()=>assert.rejects(storeStampedPhoto({put:async()=>assert.fail()},key,new ArrayBuffer(100001),Date.now()),/INVALID_IMAGE_SIZE/));
test('reject wrong JPEG signature',async()=>assert.rejects(storeStampedPhoto({put:async()=>assert.fail()},key,new ArrayBuffer(4),Date.now()),/INVALID_JPEG/));
