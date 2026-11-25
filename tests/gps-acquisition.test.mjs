import test from 'node:test';import assert from 'node:assert/strict';
import {currentPosition} from '../public/gps.mjs';
function mockGeo(){let success,fail,cleared=0;return {watchPosition(s,f){success=s;fail=f;return 7},clearWatch(id){assert.equal(id,7);cleared++},fix(accuracy){success({coords:{latitude:20,longitude:106,accuracy}})},deny(){fail({code:1})},get cleared(){return cleared}}}
test('GPS waits for precise fix and releases watcher',async()=>{const geo=mockGeo(),progress=[];const p=currentPosition({geo,onProgress:v=>progress.push(v)});geo.fix(120);geo.fix(70);geo.fix(18);assert.deepEqual(await p,{lat:20,lng:106,accuracy:18});assert.deepEqual(progress,[120,70]);assert.equal(geo.cleared,1)});
test('GPS stops on denial, cancellation or timeout',async()=>{let geo=mockGeo(),p=currentPosition({geo});geo.deny();await assert.rejects(p,/quyền vị trí/);assert.equal(geo.cleared,1);geo=mockGeo();const ac=new AbortController();p=currentPosition({geo,signal:ac.signal});ac.abort();await assert.rejects(p,/hủy/);assert.equal(geo.cleared,1);geo=mockGeo();p=currentPosition({geo,timeout:5});geo.fix(90);await assert.rejects(p,/90 m/);assert.equal(geo.cleared,1)});

test('GPS emits only improving accuracy and cleans up even if progress UI fails',async()=>{
 const geo=mockGeo(),progress=[],p=currentPosition({geo,onProgress:v=>progress.push(v)});
 geo.fix(120);geo.fix(150);geo.fix(120);geo.fix(70);geo.fix(20);await p;assert.deepEqual(progress,[120,70]);assert.equal(geo.cleared,1);
 const broken=mockGeo(),failed=currentPosition({geo:broken,onProgress:()=>{throw Error('UI detached')}});broken.fix(80);await assert.rejects(failed,/UI detached/);assert.equal(broken.cleared,1);
});
test('GPS already-cancelled and synchronous precise fixes leave no watch running',async()=>{
 const ac=new AbortController();ac.abort();let started=0;
 await assert.rejects(currentPosition({signal:ac.signal,geo:{watchPosition(){started++}}}),/hủy/);assert.equal(started,0);
 let cleared=0;const result=await currentPosition({geo:{watchPosition(ok){ok({coords:{latitude:20,longitude:106,accuracy:5}});return 9;},clearWatch(id){assert.equal(id,9);cleared++;}}});
 assert.equal(result.accuracy,5);assert.equal(cleared,1);
});
