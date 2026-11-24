// For fresh, ephemeral local D1 only. Never imported by deployed Functions.
import {randomHex,credentialHash} from '../../lib/auth.mjs';
import {dayVN,shiftInterval} from '../../lib/access.mjs';
import {weeklyStaff} from '../../../public/weekly-rotation.mjs';
import * as scheduler from '../../../functions/api/maintenance/rosters.js';
export async function seedDemo(db,cronSecret=randomHex(32)){
 if((await db.prepare('SELECT COUNT(*) AS n FROM profiles').first()).n!==0)throw Error('Demo requires an empty profile table');
 const branches=(await db.prepare('SELECT id,code FROM branches ORDER BY code').all()).results;
 if(branches.length!==14)throw Error('Demo requires 14 stores');
 const now=Date.now(),today=dayVN(now),prevMonth=dayVN(Date.parse(today.slice(0,7)+'-01T12:00:00Z')-86400000).slice(0,7);
 const secret=randomHex(24),accounts=[],rosters=[];
 async function account(username,name,role,dept){
  const id=crypto.randomUUID(),salt=randomHex(16);
  await db.batch([db.prepare('INSERT INTO profiles(id,employee_code,full_name,role,department,active) VALUES(?,?,?,?,?,1)').bind(id,username.toUpperCase(),'[DEMO] '+name,role,dept),db.prepare('INSERT INTO credentials(user_id,username,salt,secret_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,username,salt,await credentialHash(salt,secret),now,now)]);
  const row={id,username,role};accounts.push(row);return row;
 }
 const admin=await account('demo-admin','Quản trị thử nghiệm','admin','Quản trị');
 const managers=[await account('demo-ql-01','Quản lý cụm 1','manager','Quản lý'),await account('demo-ql-02','Quản lý cụm 2','manager','Quản lý')];
 await db.batch([db.prepare("UPDATE system_settings SET late_alerts=1 WHERE id=1"),db.prepare("INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES('BM-MORNING','Ca sáng cửa hàng','07:00','15:00',5),('BM-EVENING','Ca tối cửa hàng','15:00','21:30',5)")]);
 for(let i=0;i<branches.length;i++){
  const branch=branches[i],n=String(i+1).padStart(2,'0'),a=await account('demo-'+n+'-a','Bán hàng '+n+' A','staff','Bán hàng'),b=await account('demo-'+n+'-b','Bán hàng '+n+' B','staff','Bán hàng');
  const r={branch_id:branch.id,morning_user_id:a.id,evening_user_id:b.id};rosters.push(r);
  await db.batch([db.prepare("UPDATE branches SET latitude=20,longitude=106,allowed_radius=200,address_text='ĐỊA CHỈ GPS GIẢ LẬP - KHÔNG DÙNG THỰC TẾ' WHERE id=?").bind(branch.id),db.prepare('INSERT INTO branch_managers(user_id,branch_id) VALUES(?,?)').bind(managers[i<7?0:1].id,branch.id),db.prepare("INSERT INTO branch_rosters(branch_id,morning_user_id,evening_user_id,morning_shift_id,evening_shift_id,handover,updated_at) VALUES(?,?,?,'BM-MORNING','BM-EVENING','split',?)").bind(branch.id,a.id,b.id,now),db.prepare("INSERT INTO roster_automation(branch_id,weekday_mask,enabled,updated_by,updated_at) VALUES(?,31,1,?,?)").bind(branch.id,admin.id,now)]);
 }
 async function assignment(r,date,slot){
  const people=weeklyStaff(r,date),morning=slot===0,interval=shiftInterval(date,morning?'07:00':'15:00',morning?'15:00':'21:30');
  if(morning)interval.ends_at+=900000;else interval.starts_at-=900000;
  const id=crypto.randomUUID(),user=morning?people.morning:people.evening;
  await db.prepare('INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,?,?,?,?,?,5)').bind(id,user,r.branch_id,morning?'BM-MORNING':'BM-EVENING',date,interval.starts_at,interval.ends_at).run();
  return {id,user,...interval};
 }
 async function mark(a,type,stamp,status,late=0,early=0){
  const id=crypto.randomUUID();
  // Historical demo has no photos. Never manufacture or claim real attendance evidence.
  await db.prepare("INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,photo_path,status,late_minutes,early_minutes,photo_source) VALUES(?,?,?,?,?,20,106,5,0,?,?,?,?,'LEGACY_UNVERIFIED')").bind(id,a.id,a.user,type,stamp,'demo/no-photo/'+id,status,late,early).run();
 }
 for(const r of rosters){
  for(let d=3;d<=6;d++)for(let slot=0;slot<2;slot++){
   const a=await assignment(r,prevMonth+'-0'+d,slot);
   if(d===6&&slot===1){
    await db.prepare("INSERT INTO workforce_requests(id,assignment_id,user_id,kind,reason,state,created_at,decided_by,decided_at,decision_note) VALUES(?,?,?,'LEAVE','[DEMO] Nghỉ đã duyệt','APPROVED',?,?,?,'[DEMO] Đồng ý')").bind(crypto.randomUUID(),a.id,a.user,now-86400000,admin.id,now-43200000).run();continue;
   }
   if(d===5&&slot===1)continue;
   await mark(a,'IN',a.starts_at+(d===4?15*60000:0),d===4?'LATE':'ON_TIME',d===4?15:0);
   await mark(a,'OUT',a.ends_at,'ON_TIME');
   if(d===3&&slot===0)await db.prepare('INSERT INTO shift_handover(assignment_id,message,created_at) VALUES(?,?,?)').bind(a.id,'[DEMO] Đã kiểm tra hàng hóa, bàn giao ca thử nghiệm.',a.ends_at).run();
  }
  for(let slot=0;slot<2;slot++)await assignment(r,today,slot);
 }
 for(const a of accounts.filter(x=>x.role!=='admin'))for(const month of [prevMonth,today.slice(0,7)])await db.prepare("INSERT INTO payroll_inputs(month,user_id,hourly_rate,additions,deductions,note,updated_by,updated_at) VALUES(?,?,?,?,0,'[DEMO] Đơn giá minh họa',?,?)").bind(month,a.id,a.role==='manager'?45000:30000,0,admin.id,now).run();
 const invoke=branch=>scheduler.onRequestPost({env:{DB:db,ROSTER_CRON_SECRET:cronSecret},request:new Request('https://test.invalid/api/maintenance/rosters?branch_id='+branch,{method:'POST',headers:{Authorization:'Bearer '+cronSecret}})});
 let created=0;
 for(const r of rosters){const response=await invoke(r.branch_id),data=await response.json();if(!response.ok||data.failed!==0)throw Error('Demo scheduler failed');created+=data.created;}
 const future=await db.prepare('SELECT a.id,a.user_id FROM assignments a WHERE a.branch_id=? AND a.work_date>? ORDER BY a.starts_at LIMIT 1').bind(rosters[0].branch_id,today).first();
 await db.prepare("INSERT INTO workforce_requests(id,assignment_id,user_id,kind,reason,state,created_at) VALUES(?,?,?,'LEAVE','[DEMO] Đơn nghỉ chờ duyệt','PENDING',?)").bind(crypto.randomUUID(),future.id,future.user_id,now).run();
 return {accounts,secret,created,prevMonth,today};
}
