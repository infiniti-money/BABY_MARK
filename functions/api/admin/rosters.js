import {actorFor,apiFailure,ApiError,identifier,invalid,validDay,dayVN,shiftInterval,managementAudit} from '../../../cloudflare/lib/access.mjs';
import {reply,bodyJSON} from '../../../cloudflare/lib/auth.mjs';
const presets=[['BM-MORNING','Ca sáng cửa hàng','07:00','15:00',5],['BM-EVENING','Ca tối cửa hàng','15:00','21:30',5],['BM-OFFICE','Ca hành chính','08:00','17:00',5]];
const missing=e=>/no such table: (?:main\.)?branch_rosters/i.test(String(e?.message));
async function read(db){try{return {available:true,rosters:(await db.prepare('SELECT * FROM branch_rosters ORDER BY branch_id').all()).results}}catch(e){if(missing(e))return {available:false,rosters:[]};throw e}}
export async function onRequestGet({request,env}){
 try{await actorFor(request,env,{admin:true});return reply(await read(env.DB));}catch(e){return apiFailure(e)}
}
export async function onRequestPost({request,env}){
 try{
  const actor=await actorFor(request,env,{admin:true}),db=env.DB,b=await bodyJSON(request);
  if(b?.action==='presets'){
   // Preserve all existing shift templates, including edits and referenced templates.
   const statements=presets.map(row=>db.prepare('INSERT INTO shifts(id,name,start_time,end_time,grace_period) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM shifts WHERE id=? OR (start_time=? AND end_time=?))').bind(...row,row[0],row[2],row[3]));
   const results=await db.batch([...statements,managementAudit(db,actor,'shifts','BM-PRESETS','ADD_PRESETS',{})]);
   return reply({created:results.slice(0,3).reduce((n,x)=>n+x.meta.changes,0)});
  }
  if(!(await read(db)).available)throw new ApiError(409,'Cần migration 0011');
  const branch=identifier(b.branch_id);
  if(b.action==='remove'){
   await db.batch([db.prepare('DELETE FROM branch_rosters WHERE branch_id=?').bind(branch),managementAudit(db,actor,'rosters',branch,'REMOVE',{})]);return reply({ok:true});
  }
  const br=await db.prepare('SELECT * FROM branches WHERE id=?').bind(branch).first();
  if(!br||br.active===0)invalid('Cửa hàng không hoạt động');
  if(b.action==='save'){
   const m=identifier(b.morning_user_id),e=identifier(b.evening_user_id),ms=identifier(b.morning_shift_id),es=identifier(b.evening_shift_id);
   if(m===e||ms===es||!['morning_stays','evening_arrives','split'].includes(b.handover))invalid('Chọn hai nhân viên khác nhau, hai mẫu ca và cách giao ca');
   const p=await db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE id IN (?,?) AND active=1 AND role<>'admin'").bind(m,e).first();
   const q=await db.prepare('SELECT COUNT(*) AS n FROM shifts WHERE id IN (?,?)').bind(ms,es).first();
   if(p.n!==2||q.n!==2)invalid('Nhân viên hoặc mẫu ca không hợp lệ');
   await db.batch([db.prepare('INSERT INTO branch_rosters(branch_id,morning_user_id,evening_user_id,morning_shift_id,evening_shift_id,handover,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(branch_id) DO UPDATE SET morning_user_id=excluded.morning_user_id,evening_user_id=excluded.evening_user_id,morning_shift_id=excluded.morning_shift_id,evening_shift_id=excluded.evening_shift_id,handover=excluded.handover,updated_at=excluded.updated_at').bind(branch,m,e,ms,es,b.handover,Date.now()),managementAudit(db,actor,'rosters',branch,'SAVE',{morning_user_id:m,evening_user_id:e,morning_shift_id:ms,evening_shift_id:es,handover:b.handover})]);
   return reply({ok:true});
  }
  if(!['generate','generate-missing'].includes(b.action))invalid('Thao tác không hợp lệ');
  if(!validDay(b.from)||!validDay(b.to)||b.from<dayVN()||b.to<b.from||Date.parse(b.to)-Date.parse(b.from)>30*86400000)invalid('Chọn tối đa 31 ngày, không tạo lịch quá khứ');
  if(!Array.isArray(b.weekdays)||!b.weekdays.length||b.weekdays.some(d=>!Number.isInteger(d)||d<1||d>7))invalid('Chọn ngày làm việc');
  const roster=await db.prepare('SELECT * FROM branch_rosters WHERE branch_id=?').bind(branch).first();
  if(!roster)invalid('Chưa cấu hình hai nhân viên cố định');
  const m=await db.prepare('SELECT * FROM shifts WHERE id=?').bind(roster.morning_shift_id).first(),e=await db.prepare('SELECT * FROM shifts WHERE id=?').bind(roster.evening_shift_id).first();
  const p=await db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE id IN (?,?) AND active=1 AND role<>'admin'").bind(roster.morning_user_id,roster.evening_user_id).first();
  if(!m||!e||p.n!==2)invalid('Cần hai nhân viên đang hoạt động và hai mẫu ca');
  const rows=[];
  for(let t=Date.parse(b.from);t<=Date.parse(b.to);t+=86400000){
   const d=new Date(t);if(!b.weekdays.includes(d.getUTCDay()||7))continue;
   const work_date=d.toISOString().slice(0,10),a=shiftInterval(work_date,m.start_time,m.end_time),z=shiftInterval(work_date,e.start_time,e.end_time);
   if(a.ends_at!==z.starts_at)invalid('Hai ca gốc phải tiếp nối nhau; kiểm tra giờ kết thúc ca sáng và bắt đầu ca tối');
   if(roster.handover==='morning_stays')a.ends_at+=1800000;
   else if(roster.handover==='evening_arrives')z.starts_at-=1800000;
   else{a.ends_at+=900000;z.starts_at-=900000;}
   if(a.ends_at-a.starts_at>86400000||z.ends_at-z.starts_at>86400000||a.starts_at<Date.now()||z.starts_at<Date.now())invalid('Không tạo ca đã bắt đầu hoặc ca vượt 24 giờ. Chọn ngày tương lai.');
   for(const [user,shift,interval] of [[roster.morning_user_id,m,a],[roster.evening_user_id,e,z]])rows.push({id:crypto.randomUUID(),user,shift:shift.id,work_date,...interval,grace:shift.grace_period});
  }
  if(!rows.length)invalid('Không có ngày làm việc được chọn');
  // A single atomic insertion. Existing overlap triggers reject the entire batch.
  // Exact matches are left untouched only in the explicit repeat-safe mode.
  // Any differing overlapping assignment still aborts this entire branch batch.
  const skip=b.action==='generate-missing';
  const sql="INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.user'),?,json_extract(j.value,'$.shift'),json_extract(j.value,'$.work_date'),json_extract(j.value,'$.starts_at'),json_extract(j.value,'$.ends_at'),json_extract(j.value,'$.grace') FROM json_each(?) j"+(skip?" WHERE NOT EXISTS(SELECT 1 FROM assignments a WHERE a.user_id=json_extract(j.value,'$.user') AND a.branch_id=? AND a.shift_id=json_extract(j.value,'$.shift') AND a.work_date=json_extract(j.value,'$.work_date') AND a.starts_at=json_extract(j.value,'$.starts_at') AND a.ends_at=json_extract(j.value,'$.ends_at') AND a.grace_minutes=json_extract(j.value,'$.grace'))":"");
  const result=await db.batch([db.prepare(sql).bind(branch,JSON.stringify(rows),...(skip?[branch]:[])),managementAudit(db,actor,'rosters',branch,skip?'GENERATE_MISSING':'GENERATE',{from:b.from,to:b.to,weekdays:b.weekdays,handover:roster.handover,requested:rows.length})]);
  return reply({created:result[0].meta.changes,existing:rows.length-result[0].meta.changes},201);
 }catch(e){return apiFailure(e)}
}
