import test from 'node:test';import assert from 'node:assert/strict';import {summarize,dayVN} from '../lib/metrics.mjs';
test('Vietnam day boundary',()=>assert.equal(dayVN(new Date('2026-01-01T18:00:00Z')),'2026-01-02'));
test('work minutes and late',()=>{const r=summarize([{type:'IN',server_timestamp:'2026-01-01T01:00Z',late_minutes:10},{type:'OUT',server_timestamp:'2026-01-01T09:00Z',early_minutes:0}]);assert.equal(r.minutes,480);assert.equal(r.late,10);assert.equal(r.days,1)});
test('outside needs review',()=>assert.equal(summarize([{type:'IN',status:'OUTSIDE'},{type:'OUT'}]).days,0));
