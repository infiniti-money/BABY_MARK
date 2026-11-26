import test from 'node:test';import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import * as cv from '../../functions/api/employee-cv.js';
import {schemaReadiness} from '../lib/schema-readiness.mjs';
test('CV access is owner or admin; only admin edits employee; version conflict and audit redaction',async()=>{const f=await appFixture();try{
 const read=(who,id)=>f.call(cv,who,{method:'GET',query:id?'?user_id='+id:''});
 const write=(who,user_id,expected_revision,data)=>f.call(cv,who,{body:{user_id,expected_revision,cv:data}});
 assert.equal((await read(null)).status,401);
 assert.equal((await read('other',f.ids.staff)).status,404);
 assert.equal((await read('manager',f.ids.staff)).status,404);
 assert.equal((await write('staff',f.ids.staff,0,{phone:'0123456789'})).status,403);
 assert.equal((await write('admin',f.ids.admin,0,{})).status,409);
 assert.equal((await write('admin',f.ids.staff,0,{birth_date:'2999-01-01'})).status,400);
 assert.equal((await write('admin',f.ids.staff,0,{unknown:'value'})).status,400);
 assert.equal((await write('admin',f.ids.staff,0,{phone:'0123456789',education:'Local test',skills:'<script>test</script>'})).status,201);
 assert.equal((await write('admin',f.ids.staff,0,{phone:'000'})).status,409);
 const mine=await (await read('staff')).json();assert.equal(mine.revision,1);assert.equal(mine.can_edit,false);assert.equal(mine.cv.phone,'0123456789');assert.equal(mine.cv.skills,'<script>test</script>');assert.ok(mine.branches.some(b=>b.code==='BM-001'));
 assert.equal((await write('admin',f.ids.staff,1,{phone:'0900000000'})).status,200);
 const audits=(await f.db.prepare("SELECT details_json FROM management_audit WHERE resource='employee-cv'").all()).results;
 assert.equal(audits.length,2);assert.ok(audits.every(a=>Object.keys(JSON.parse(a.details_json)).join()==='revision'));
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM attendances').first()).n,0);
 assert.equal((await schemaReadiness(f.db)).target,'0023');assert.equal((await schemaReadiness(f.db)).ready,true);
 }finally{f.close()}});
test('CV refuses revoked admin write at SQL boundary and degrades when migration missing',async()=>{const f=await appFixture();try{
 const prepare=f.db.prepare.bind(f.db);
 f.db.prepare=(sql,...args)=>{const p=prepare(sql,...args);if(!sql.startsWith('INSERT INTO employee_cv'))return p;const bind=p.bind;p.bind=(...values)=>{const b=bind(...values),first=b.first;b.first=async()=>{await prepare('DELETE FROM sessions WHERE user_id=?').bind(f.ids.admin).run();return first()};return b};return p};
 assert.equal((await f.call(cv,'admin',{body:{user_id:f.ids.staff,expected_revision:0,cv:{}}})).status,409);
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM employee_cv').first()).n,0);
 await f.db.exec('DROP TABLE employee_cv');
 assert.equal((await (await f.call(cv,'staff',{method:'GET'})).json()).available,false);
 }finally{f.close()}});

test('HR metadata, deadline scope, valid future dates and print-safe text without migration',async()=>{const f=await appFixture();try{
 const write=cvData=>f.call(cv,'admin',{body:{user_id:f.ids.staff,expected_revision:0,cv:cvData}});
 const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
 assert.equal((await write({contract_start:today,contract_end:'1900-01-01'})).status,400);
 assert.equal((await write({probation_end:today})).status,400);
 assert.equal((await write({contract_start:today,contract_end:today,probation_start:today,probation_end:today,probation_result:'Đã đạt',performance:'<script>private</script>'})).status,201);
 const deadline=(who)=>f.call(cv,who,{method:'GET',query:'?view=deadlines'});
 assert.equal((await deadline('staff')).status,403);assert.equal((await deadline('manager')).status,403);
 const data=await (await deadline('admin')).json();assert.equal(data.items.length,1);assert.equal(data.items[0].key,'contract_end');assert.equal(data.items[0].status,'today');assert.ok(!JSON.stringify(data).includes('private'));
 const mine=await (await f.call(cv,'staff',{method:'GET'})).json();assert.equal(mine.cv.performance,'<script>private</script>');
 const {cvPrint}=await import('../../public/cv-print.mjs');const html=cvPrint(mine);assert.ok(html.includes('&lt;script&gt;private&lt;/script&gt;'));assert.ok(!html.includes('<script>'));
 assert.equal((await schemaReadiness(f.db)).target,'0023');
 }finally{f.close()}});
