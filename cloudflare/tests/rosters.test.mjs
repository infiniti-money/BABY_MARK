import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import * as api from '../../functions/api/admin/rosters.js';
import {dayVN} from '../lib/access.mjs';
test('fixed roster creates two shifts with explicit 30-minute overlap and never overwrites existing data',async()=>{
 const f=await appFixture();try{
 const call=(body,role='admin')=>f.call(api,role,{body});
 assert.equal((await call({action:'presets'},'staff')).status,403);
 assert.equal((await (await call({action:'presets'})).json()).created,3);
 assert.equal((await (await call({action:'presets'})).json()).created,0);
 const data={action:'save',branch_id:'BM-001',morning_user_id:f.ids.staff,evening_user_id:f.ids.other,morning_shift_id:'BM-MORNING',evening_shift_id:'BM-EVENING',handover:'split'};
 assert.equal((await call(data)).status,200);
 assert.equal((await call({...data,branch_id:'BM-002'})).status,409);
 const from=dayVN(Date.now()+2*86400000);
 const batch={action:'generate',branch_id:'BM-001',from,to:from,weekdays:[1,2,3,4,5,6,7]};
 const res=await call(batch);assert.equal(res.status,201);assert.equal((await res.json()).created,2);
 const rows=(await f.db.prepare('SELECT * FROM assignments WHERE branch_id=? AND work_date=? ORDER BY starts_at').bind('BM-001',from).all()).results;
 assert.equal(rows.length,2);assert.equal(rows[0].ends_at-rows[1].starts_at,1800000);
 assert.equal((await call(batch)).status,409);
 const repeat=await call({...batch,action:'generate-missing'});
 assert.equal(repeat.status,201);assert.deepEqual(await repeat.json(),{created:0,existing:2});
 const next=dayVN(Date.now()+3*86400000);
 const extended=await call({...batch,action:'generate-missing',to:next});assert.equal(extended.status,201);assert.deepEqual(await extended.json(),{created:2,existing:2});
 const collision=await call({...data,handover:'evening_arrives'});assert.equal(collision.status,200);
 assert.equal((await call({...batch,action:'generate-missing',to:next})).status,409);
 assert.equal((await call({action:'remove',branch_id:'BM-001'})).status,200);
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM assignments WHERE work_date=?').bind(from).first()).n,2);
 }finally{f.close()}
});
