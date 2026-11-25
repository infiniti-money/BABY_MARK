import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {appFixture} from './helpers/app.mjs';
import {shiftInterval} from '../lib/access.mjs';
import * as reports from '../../functions/api/reports.js';

async function fixture(){
 const f=await appFixture();
 for(let day=1;day<=31;day++)for(const [name,branch] of [['staff','BM-001'],['other','BM-002']]){
  const date='2026-10-'+String(day).padStart(2,'0'),t=shiftInterval(date,'08:00','16:00');
  await f.db.prepare('INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,?,?,?,?,?,5)').bind('page-'+name+'-'+day,f.ids[name],branch,'test-day',date,t.starts_at,t.ends_at).run();
 }
 return f;
}
const range={from:'2026-10-01',to:'2026-10-31'};
const get=(f,who,params={})=>f.call(reports,who,{method:'GET',query:'?'+new URLSearchParams({...range,...params})});

test('server report pages preserve full ordering, summaries, CSV and all role scopes',async()=>{
 const f=await fixture();try{
  for(const who of ['admin','staff','manager']){
   const all=await (await get(f,who)).json(),summary=await (await get(f,who,{view:'summary'})).json();
   assert.deepEqual(summary.summary,all.summary);assert.deepEqual(summary.branches,all.branches);assert.equal(summary.rows,undefined);
   const rows=[];let next={},pages=0;
   do{
    const response=await get(f,who,{page_size:'7',...next});assert.equal(response.status,200);
    assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    const data=await response.json();assert.ok(data.rows.length<=7);assert.equal(data.summary,undefined);assert.equal(data.summary_scope,'none');
    rows.push(...data.rows);next=data.next;assert.ok(++pages<=10);
   }while(next);
   assert.deepEqual(rows,all.rows);assert.equal(new Set(rows.map(x=>x.id)).size,all.rows.length);
   if(who!=='admin')assert.ok(rows.every(x=>x.user_id===f.ids[who]||who==='manager'&&x.branch_id==='BM-001'));
   const csv=await (await get(f,who,{format:'csv'})).text();assert.equal(csv.split('\r\n').length,all.rows.length+1);
  }
  assert.equal((await (await get(f,'staff',{page_size:'10',user_id:f.ids.other})).json()).rows.length,0);
  assert.equal((await (await get(f,'manager',{page_size:'10',branch_id:'BM-002'})).json()).rows.length,0);
  assert.equal((await get(f,null,{page_size:'10'})).status,401);
 }finally{f.close();}
});

test('report pagination validates every cursor part and cannot widen scope when forged',async()=>{
 const f=await fixture();try{
  for(const params of [{page_size:'0'},{page_size:'101'},{page_size:'1.5'},{page_size:'10',after_date:'2026-10-01'},{after_id:'fake'},{page_size:'10',view:'summary'},{page_size:'10',format:'csv'},{page_size:'10',after_date:'2026-02-30',after_start:'1',after_code:'X',after_id:'fake'}])assert.equal((await get(f,'admin',params)).status,400);
  const first=await (await get(f,'admin',{page_size:'1'})).json();
  const forged=await (await get(f,'staff',{page_size:'100',...first.next})).json();assert.ok(forged.rows.every(x=>x.user_id===f.ids.staff));
 }finally{f.close();}
});

test('report request precedence and indexed plans hold with and without optional indexes',async()=>{
 const f=await fixture();try{
  const id='page-staff-1',insert=f.db.sqlite.prepare("INSERT INTO workforce_requests(id,assignment_id,user_id,kind,reason,state,created_at,decided_by,decided_at) VALUES(?,?,?,'LEAVE','Test request',?,?,?,?)");
  for(let i=0;i<30;i++)insert.run('rejected-'+i,id,f.ids.staff,'REJECTED',100+i,f.ids.admin,200+i);
  insert.run('approved',id,f.ids.staff,'APPROVED',1,f.ids.admin,2);
  const choice="SELECT wr.id FROM workforce_requests wr WHERE wr.assignment_id=? ORDER BY CASE wr.state WHEN 'APPROVED' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,wr.created_at DESC,wr.id DESC LIMIT 1";
  const plan=sql=>f.db.sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(id).map(r=>r.detail).join('\n');
  assert.match(plan(choice),/request_report_choice/);assert.doesNotMatch(plan(choice),/TEMP B-TREE/);
  const before=await (await get(f,'staff')).json();assert.equal(before.rows.find(r=>r.id===id).request_id,'approved');
  f.db.sqlite.exec('DROP INDEX request_report_choice;DROP INDEX assignment_report_date;');
  assert.match(plan(choice),/TEMP B-TREE/);
  const fallback=await (await get(f,'staff')).json();assert.deepEqual(fallback.rows,before.rows);assert.deepEqual(fallback.summary,before.summary);
  await f.db.exec(await readFile(new URL('../d1/0022_report_indexes.sql',import.meta.url),'utf8'));
  const datePlan=f.db.sqlite.prepare('EXPLAIN QUERY PLAN SELECT id FROM assignments WHERE work_date>=? AND work_date<=? ORDER BY work_date,starts_at,id LIMIT 31').all(range.from,range.to).map(r=>r.detail).join('\n');
  assert.match(datePlan,/SEARCH assignments USING (?:COVERING )?INDEX assignment_report_date/);assert.doesNotMatch(datePlan,/TEMP B-TREE/);
 }finally{f.close();}
});
