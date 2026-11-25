import test from 'node:test';import assert from 'node:assert/strict';import {calendarRange,calendarDays} from '../public/schedule-calendar.mjs';
test('Vietnam calendar date arithmetic uses ISO dates, Monday weeks and leap months',()=>{
 assert.deepEqual(calendarRange('2026-11-25','week'),{from:'2026-11-23',to:'2026-11-29'});
 assert.deepEqual(calendarRange('2026-01-01','week'),{from:'2025-12-29',to:'2026-01-04'});
 assert.deepEqual(calendarRange('2028-02-29','month'),{from:'2028-02-01',to:'2028-02-29'});
 assert.throws(()=>calendarRange('2026-02-30','month'));
 const d=calendarDays('2026-11-23','2026-11-29',[{work_date:'2026-11-25',id:'a'},{work_date:'2026-11-25',id:'b'},{work_date:'2026-11-30',id:'outside'}]);
 assert.equal(d.length,7);assert.equal(d[0].weekday,0);assert.equal(d[2].rows.length,2);assert.equal(d[6].rows.length,0);
});
