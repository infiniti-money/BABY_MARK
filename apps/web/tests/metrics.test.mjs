import test from 'node:test';import assert from 'node:assert/strict';import {summarize,dayVN,aggregateDays} from '../lib/metrics.mjs';
test('Vietnam day boundary',()=>assert.equal(dayVN(new Date('2026-01-01T18:00:00Z')),'2026-01-02'));
test('work minutes and late',()=>{const r=summarize([{type:'IN',server_timestamp:'2026-01-01T01:00Z',late_minutes:10},{type:'OUT',server_timestamp:'2026-01-01T09:00Z',early_minutes:0}]);assert.equal(r.minutes,480);assert.equal(r.late,10);assert.equal(r.days,1)});
test('outside needs review',()=>assert.equal(summarize([{type:'IN',status:'OUTSIDE'},{type:'OUT'}]).days,0));

test('multiple shifts count one day',()=>assert.deepEqual(aggregateDays([{work_date:'2026-01-02',summary:{days:1,minutes:240,late:0,early:0}},{work_date:'2026-01-02',summary:{days:1,minutes:240,late:0,early:0}}]),{days:1,shifts:2,leaveDays:0,minutes:480,late:0,early:0}));
test('approved leave does not count absence or work',()=>assert.equal(summarize([],Date.now(),{state:'APPROVED',kind:'LEAVE'}).status,'Nghỉ đã duyệt'));
test('missing checkout is not counted as complete',()=>assert.equal(summarize([{type:'IN',server_timestamp:'2026-01-01T01:00Z'}],Date.parse('2026-01-02T00:00Z'),null,{ends_at:'2026-01-01T09:00Z'}).status,'Thiếu chấm ra'));
test('approved correction overlays original without mutation',()=>{const original=[{type:'IN',status:'OUTSIDE',server_timestamp:'2026-01-01T01:00Z'}];const s=summarize(original,Date.now(),{state:'APPROVED',kind:'CORRECTION',proposed_in:'2026-01-01T01:10Z',proposed_out:'2026-01-01T08:50Z'},{starts_at:'2026-01-01T01:00Z',ends_at:'2026-01-01T09:00Z',grace_minutes:5});assert.equal(s.minutes,460);assert.equal(s.late,10);assert.equal(s.early,10);assert.equal(original[0].status,'OUTSIDE')});
