import test from 'node:test';
import assert from 'node:assert/strict';
import {attendanceCutoff,pruneAttendance} from '../lib/attendance-retention.mjs';
test('Vietnam date boundary and two calendar years',()=>assert.equal(new Date(attendanceCutoff(Date.parse('2026-11-24T17:01:00Z'))).toISOString(),'2024-11-24T17:00:00.000Z'));
test('leap date clamps to Feb 28',()=>assert.equal(new Date(attendanceCutoff(Date.parse('2028-02-29T01:00:00Z'))).toISOString(),'2026-02-27T17:00:00.000Z'));
test('bounded atomic cleanup preserves dependent order',async()=>{const db={prepare(sql){return{bind(...args){return{sql,args}}}},async batch(s){assert.match(s[1].sql,/LIMIT 50/);assert.match(s[1].sql,/w.state='PENDING'/);assert.match(s[1].sql,/a.ends_at<\?/);assert.match(s[3].sql,/DELETE FROM push_deliveries/);assert.match(s[7].sql,/DELETE FROM attendances/);assert.match(s[8].sql,/DELETE FROM assignments/);return s.map(()=>({meta:{changes:1}}))}};assert.equal((await pruneAttendance(db)).assignments_removed,1)});
