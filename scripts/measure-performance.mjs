// Reproducible, synthetic in-memory SQLite only. Never connects to D1 or the live app.
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createD1} from '../cloudflare/tests/helpers/d1.mjs';
import {seedApp} from '../cloudflare/tests/helpers/app.mjs';
import {shiftInterval} from '../cloudflare/lib/access.mjs';
import {readAssignments} from '../cloudflare/lib/reports.mjs';
import {onRequestGet} from '../functions/api/reports.js';

const db=await createD1(),seed=await seedApp(db),sqlite=db.sqlite;
try{
 const profile=sqlite.prepare("INSERT INTO profiles(id,employee_code,full_name,role) VALUES(?,?,?,'staff')"),assignment=sqlite.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,?,'test-day',?,?,?,5)"),request=sqlite.prepare("INSERT INTO workforce_requests(id,assignment_id,user_id,kind,reason,state,created_at,decided_by,decided_at) VALUES(?,?,?,'LEAVE','Synthetic history','REJECTED',?,?,?)");
 sqlite.exec('BEGIN');
 for(let user=0;user<40;user++){
  const uid='bench-'+user;profile.run(uid,'BENCH-'+String(user).padStart(2,'0'),'Nhân viên giả lập '+user);
  for(let day=1;day<=30;day++){
   const id=uid+'-'+day,date='2026-10-'+String(day).padStart(2,'0'),t=shiftInterval(date,'08:00','16:00');
   assignment.run(id,uid,'BM-001',date,t.starts_at,t.ends_at);
   for(let r=0;r<20;r++)request.run(id+'-request-'+r,id,uid,r,seed.ids.admin,r+1);
  }
 }
 sqlite.exec('COMMIT');
 const url=new URL('https://local.invalid/api/reports?from=2026-10-01&to=2026-10-30'),actor={id:seed.ids.admin,role:'admin'};
 let statement;
 const recorder={prepare(sql){if(sql.includes('SELECT a.*'))statement=sql;return db.prepare(sql);}};
 const plan=()=>sqlite.prepare('EXPLAIN QUERY PLAN '+statement).all('2026-10-01','2026-10-30').map(x=>x.detail);
 const time=async(paginate=false,summaryOnly=false)=>{
  const samples=[];for(let i=0;i<7;i++){const start=performance.now();await readAssignments(recorder,actor,url,{paginate,summaryOnly});samples.push(performance.now()-start);}
  samples.sort((a,b)=>a-b);return Number(samples[3].toFixed(2));
 };
 sqlite.exec('DROP INDEX request_report_choice;DROP INDEX assignment_report_date;');
 const beforeMs=await time(),beforePlan=plan();
 sqlite.exec(await readFile(new URL('../cloudflare/d1/0022_report_indexes.sql',import.meta.url),'utf8'));
 const afterMs=await time(),afterPlan=plan(),compactMs=await time(false,true);
 const fullRows=(await readAssignments(db,actor,url)).assignments,compactRows=(await readAssignments(db,actor,url,{summaryOnly:true})).assignments;
 const d1ResultBytes={full:Buffer.byteLength(JSON.stringify(fullRows)),compact:Buffer.byteLength(JSON.stringify(compactRows))};
 url.searchParams.set('page_size','30');const pageMs=await time(true);
 const response=async(params)=>{
  const u=new URL(url);u.search='?'+new URLSearchParams({from:'2026-10-01',to:'2026-10-30',...params});
  const r=await onRequestGet({request:new Request(u,{headers:{Authorization:'Bearer '+seed.tokens.admin}}),env:{DB:db}});
  if(r.status!==200)throw Error(await r.text());return Buffer.byteLength(await r.text());
 };
 const bytes={full:await response({}),summary:await response({view:'summary'}),page:await response({page_size:'30'})};
 const staticGraph=async(ref)=>{
  const files=new Map();
  const visit=async file=>{
   if(files.has(file))return;
   const source=ref?execFileSync('git',['show',ref+':public/'+file],{encoding:'utf8'}):await readFile(new URL('../public/'+file,import.meta.url),'utf8');
   files.set(file,Buffer.byteLength(source.replaceAll('\r\n','\n')));
   for(const m of source.matchAll(/^(?:import|export)\s+[^;\n]*?\sfrom\s*['"]\.\/([^'"]+)['"]/gm))await visit(m[1]);
  };
  await visit('app.mjs');return {bytes:[...files.values()].reduce((a,b)=>a+b,0),files:[...files.keys()]};
 };
 console.log(JSON.stringify({environment:{node:process.version,sqlite:sqlite.prepare('SELECT sqlite_version() v').get().v,scope:'synthetic in-memory; not D1 production or physical devices'},fixture:{assignments:1200,rejectedRequests:24000},median_ms_7_runs:{full_without_optional_indexes:beforeMs,full_with_optional_indexes:afterMs,compact_with_optional_indexes:compactMs,page_30_with_indexes:pageMs},response_bytes:bytes,query_plans:{before:beforePlan,after:afterPlan},startup_static_modules:{...(process.env.PERF_BASE_REF?{base:await staticGraph(process.env.PERF_BASE_REF)}:{}),current:await staticGraph()},d1_result_bytes:d1ResultBytes},null,2));
}finally{db.close();}
