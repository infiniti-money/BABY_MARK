import test from 'node:test';import assert from 'node:assert/strict';
import {pollDelay,retryAfterMs} from '../public/polling.mjs';
test('background polling backs off independently for idle and failed reads, with bounded jitter',()=>{
 assert.deepEqual([0,1,2,99].map(idle=>pollDelay({idle})),[30000,60000,120000,120000]);
 assert.deepEqual([1,2,3,4,5,99].map(failures=>pollDelay({failures,random:()=>0})),[30000,60000,120000,240000,300000,300000]);
 assert.equal(pollDelay({failures:5,random:()=>1}),330000);assert.equal(pollDelay({retryAfter:600000}),600000);
 assert.equal(pollDelay(),30000);
});
test('Retry-After accepts seconds and HTTP dates, rejects invalid/past and bounds delays',()=>{
 const now=Date.parse('2026-11-25T00:00:00Z');
 assert.equal(retryAfterMs('120',now),120000);assert.equal(retryAfterMs('Wed, 25 Nov 2026 00:02:00 GMT',now),120000);
 for(const value of [null,'bad','Tue, 24 Nov 2026 00:00:00 GMT'])assert.equal(retryAfterMs(value,now),0);
 assert.equal(retryAfterMs('9999999999',now),3600000);
});
