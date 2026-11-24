import test from 'node:test';import assert from 'node:assert/strict';
import {weeklyStaff,weekSwapped} from '../public/weekly-rotation.mjs';
const roster={morning_user_id:'A',evening_user_id:'B'};
test('Monday rotation is stable across months, years and earlier dates',()=>{
 for(const d of ['2026-11-30','2026-12-06','2026-12-14','2027-01-03'])assert.deepEqual(weeklyStaff(roster,d),{morning:'A',evening:'B'});
 for(const d of ['2026-11-29','2026-12-07','2026-12-13','2027-01-04'])assert.deepEqual(weeklyStaff(roster,d),{morning:'B',evening:'A'});
 assert.throws(()=>weekSwapped('2026-02-30'),/INVALID/);
});
