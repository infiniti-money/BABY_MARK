import {actorFor,apiFailure,ApiError,identifier,invalid,textField,dayVN,shiftInterval,assignmentScope,dateRange,managementAudit} from '../../cloudflare/lib/access.mjs';
import {reply,digest} from '../../cloudflare/lib/auth.mjs';
import {jsonLimited} from '../../cloudflare/lib/http.mjs';
async function available(db){return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='extra_attendance'").first();}
export async function onRequestGet({request,env}){
 try{
  const actor=await actorFor(request,env),db=env.DB;
  if(!await available(db))return reply({available:false,rows:[],branches:[],shifts:[]});
  const scope=assignmentScope(actor),{from,to}=dateRange(new URL(request.url));
  const rows=(await db.prepare(`SELECT x.*,a.user_id,a.branch_id,a.work_date,a.starts_at,a.ends_at,p.full_name,p.employee_code,b.name AS branch_name,s.name AS shift_name,
   i.server_timestamp AS in_at,o.server_timestamp AS out_at FROM extra_attendance x JOIN assignments a ON a.id=x.assignment_id JOIN profiles p ON p.id=a.user_id JOIN branches b ON b.id=a.branch_id JOIN shifts s ON s.id=a.shift_id
   LEFT JOIN attendances i ON i.assignment_id=a.id AND i.type='IN' LEFT JOIN attendances o ON o.assignment_id=a.id AND o.type='OUT'
   WHERE ${scope.sql} AND a.work_date BETWEEN ? AND ? ORDER BY x.created_at DESC LIMIT 1000`).bind(...scope.values,from,to).all()).results;
  const branches=(await db.prepare('SELECT id,code,name FROM branches WHERE active=1 AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY code').all()).results;
  const shifts=(await db.prepare('SELECT id,name,start_time,end_time FROM shifts ORDER BY start_time,name').all()).results;
  return reply({available:true,rows,branches,shifts});
 }catch(e){return apiFailure(e)}
}
export async function onRequestPost({request,env}){
 try{
  const actor=await actorFor(request,env),db=env.DB,b=await jsonLimited(request);
  if(!await available(db))throw new ApiError(409,'Cần migration 0012');
  if(b?.action==='create'){
   if(actor.role==='admin')throw new ApiError(403,'Chức năng dành cho nhân viên và quản lý làm ca');
   const branch=identifier(b.branch_id),shiftId=identifier(b.shift_id),kind=b.kind;
   if(!['EXTRA','COVER'].includes(kind))invalid('Chọn loại ca');
   const name=kind==='COVER'?textField(b.replaced_name,120):'',reason=textField(b.reason,500);
   if(reason.length<5)invalid('Lý do cần ít nhất 5 ký tự');
   const br=await db.prepare('SELECT id FROM branches WHERE id=? AND active=1 AND latitude IS NOT NULL AND longitude IS NOT NULL').bind(branch).first(),shift=await db.prepare('SELECT * FROM shifts WHERE id=?').bind(shiftId).first();
   if(!br||!shift)invalid('Cửa hàng chưa có GPS hoặc mẫu ca không hợp lệ');
   const now=Date.now(),today=dayVN(now),yesterday=dayVN(now-86400000);
   const date=b.work_date;
   if(date!==today&&date!==yesterday)invalid('Chỉ khai báo ca đang diễn ra hôm nay hoặc ca qua đêm hôm qua');
   const interval=shiftInterval(date,shift.start_time,shift.end_time);
   if(date===yesterday&&interval.ends_at<=now)invalid('Ca hôm qua đã kết thúc');
   if(now<interval.starts_at-4*3600000||now>=interval.ends_at)invalid('Ca chưa đến thời gian vào hoặc đã kết thúc; chọn mẫu ca đang làm');
   const id=crypto.randomUUID();
   const rate=await db.prepare('SELECT COUNT(*) AS n FROM extra_attendance x JOIN assignments a ON a.id=x.assignment_id WHERE a.user_id=? AND x.created_at>?').bind(actor.id,now-86400000).first();
   if(rate.n>=6)throw new ApiError(429,'Đã tạo quá nhiều ca bổ sung trong 24 giờ');
   await db.batch([db.prepare('INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,?,?,?,?,?,?)').bind(id,actor.id,branch,shiftId,date,interval.starts_at,interval.ends_at,shift.grace_period),
    db.prepare('INSERT INTO extra_attendance(assignment_id,kind,replaced_name,reason,created_at) VALUES(?,?,?,?,?)').bind(id,kind,name,reason,now)]);
   return reply({assignment_id:id,state:'PENDING'},201);
  }
  if(b?.action==='decide'){
   if(actor.role==='staff')throw new ApiError(403,'Chỉ quản lý hoặc Admin');
   const id=identifier(b.assignment_id),state=b.state,note=textField(b.note||'',500,true);
   if(!['APPROVED','REJECTED'].includes(state)||state==='REJECTED'&&!note)invalid('Chọn quyết định; từ chối cần lý do');
   const now=Date.now(),hash=await digest('babymark-session-v1:'+request.headers.get('authorization').slice(7));
   const guard="assignment_id=? AND state='PENDING' AND EXISTS(SELECT 1 FROM assignments a JOIN sessions ss ON ss.token_hash=? AND ss.expires_at>? JOIN profiles p ON p.id=ss.user_id AND p.id=? AND p.active=1 JOIN credentials c ON c.user_id=p.id AND c.version=ss.credential_version WHERE a.id=extra_attendance.assignment_id AND a.user_id<>p.id AND (p.role='admin' OR (p.role='manager' AND EXISTS(SELECT 1 FROM branch_managers bm WHERE bm.user_id=p.id AND bm.branch_id=a.branch_id))))";
   const args=[id,hash,Date.now(),actor.id];
   const res=await db.batch([db.prepare("INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at) SELECT ?,?,'extra-attendance',assignment_id,?,?,? FROM extra_attendance WHERE "+guard).bind(crypto.randomUUID(),actor.id,state,JSON.stringify({note}),now,...args),
    db.prepare('UPDATE extra_attendance SET state=?,decided_by=?,decided_at=?,decision_note=? WHERE '+guard+' RETURNING assignment_id').bind(state,actor.id,now,note,...args)]);
   // D1's change count can include trigger writes (for example payroll_epoch).
   // The returned row proves this guarded decision, independent of those writes.
   if(res[1].results?.length!==1)throw new ApiError(409,'Không có quyền hoặc yêu cầu đã xử lý');
   return reply({ok:true});
  }
  invalid('Thao tác không hợp lệ');
 }catch(e){return apiFailure(e)}
}
