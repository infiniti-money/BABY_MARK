import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {appFixture} from './helpers/app.mjs';
import {shiftInterval} from '../lib/access.mjs';
import * as reports from '../../functions/api/reports.js';
import {readAssignments,summarizeAssignment,workUnitEvidence} from '../lib/reports.mjs';

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

test('compact summary preserves reviewed full-day evidence, corrections, leave and extras; excludes private detail columns',async()=>{
 const f=await fixture();try{
  const db=f.db,staff=f.ids.staff,admin=f.ids.admin,now=Date.now();
  const change=db.sqlite.prepare("UPDATE assignments SET shift_id='BM-ALLDAY' WHERE id=?");
  db.sqlite.prepare("INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES('BM-ALLDAY','Ca cả ngày','07:00','21:30',5)").run();
  change.run('page-staff-1');
  async function attendance(id,kind,offset,status='ON_TIME'){
   const a=await db.prepare('SELECT * FROM assignments WHERE id=?').bind(id).first(),key=crypto.randomUUID();
   await db.prepare("INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status) VALUES(?,?,?,?,?,20,106,5,0,?,?)").bind(key,id,a.user_id,kind,a.starts_at+offset,'timemark/'+key+'.jpg',status).run();
  }
  await attendance('page-staff-1','IN',0);await attendance('page-staff-1','OUT',300000);
  const url=new URL('https://test.invalid/?'+new URLSearchParams(range)),actor={id:admin,role:'admin'};
  const first=(await readAssignments(db,actor,url)).assignments.find(x=>x.id==='page-staff-1');
  assert.equal(summarizeAssignment(first,now).work_unit_review,true);
  await db.prepare("INSERT INTO work_unit_reviews(assignment_id,evidence,units,reason,reviewed_by,reviewed_at) VALUES(?,?,0.5,'Đã đối soát',?,?)").bind(first.id,workUnitEvidence(first),admin,now).run();
  const a=await db.prepare('SELECT * FROM assignments WHERE id=?').bind('page-staff-2').first();
  await db.prepare("INSERT INTO workforce_requests(id,assignment_id,user_id,kind,reason,proposed_in,proposed_out,state,created_at,decided_by,decided_at) VALUES('correct',?,?,'CORRECTION','Đã đối soát',?,?,'APPROVED',?,?,?)").bind(a.id,staff,a.starts_at,a.ends_at+3600000,now-1,admin,now).run();
  await db.prepare("INSERT INTO workforce_requests(id,assignment_id,user_id,kind,reason,state,created_at,decided_by,decided_at) VALUES('leave','page-staff-3',?,'LEAVE','Đã duyệt phép','APPROVED',?,?,?)").bind(staff,now-1,admin,now).run();
  await attendance('page-staff-4','IN',0,'OUTSIDE');await attendance('page-staff-4','OUT',3600000);
  await db.prepare("INSERT INTO extra_attendance(assignment_id,kind,reason,created_at) VALUES('page-staff-5','EXTRA','Chờ duyệt ca',?)").bind(now).run();
  const full=(await readAssignments(db,actor,url)).assignments,compact=(await readAssignments(db,actor,url,{summaryOnly:true})).assignments;
  assert.deepEqual(compact.map(x=>x.id),full.map(x=>x.id));
  assert.deepEqual(compact.map(x=>summarizeAssignment(x,now)),full.map(x=>summarizeAssignment(x,now)));
  assert.equal(summarizeAssignment(compact.find(x=>x.id===first.id),now).work_units,0.5);
  for(const row of compact)for(const key of ['full_name','department','address_text','latitude','longitude','in_accuracy_m','out_distance_m','extra_reason','replaced_name','decided_by'])assert.equal(Object.hasOwn(row,key),false,key);
  const fullBytes=Buffer.byteLength(JSON.stringify(full)),compactBytes=Buffer.byteLength(JSON.stringify(compact));
  console.log('P3 compact D1 result JSON bytes: '+compactBytes+' / '+fullBytes);
  assert.ok(compactBytes<fullBytes*0.8);
  for(const who of ['admin','manager','staff'])for(const filters of [{},{branch_id:'BM-001'},{user_id:staff}]){
   const all=await (await get(f,who,filters)).json(),summary=await (await get(f,who,{...filters,view:'summary'})).json();
   assert.deepEqual(summary.summary,all.summary);assert.deepEqual(summary.branches,all.branches);assert.equal(summary.rows,undefined);
  }
  assert.equal((await get(f,'staff',{view:'summary',format:'csv'})).headers.get('Content-Type'),'text/csv; charset=utf-8');
 }finally{f.close()}
});
