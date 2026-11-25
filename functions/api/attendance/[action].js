import {inAttendanceWindow} from '../../../public/attendance-window.mjs';
import {sessionUser,reply,digest} from '../../../cloudflare/lib/auth.mjs';
import {distanceMeters,attendanceTiming} from '../../../cloudflare/lib/timemark-layout.mjs';
import {storeStampedPhoto} from '../../../cloudflare/lib/timemark-kv.mjs';
import {jpegDimensions} from '../../../cloudflare/lib/jpeg.mjs';
import {HttpError,readLimited,jsonLimited,idPattern,errorResponse} from '../../../cloudflare/lib/http.mjs';
import {policy} from '../../../cloudflare/lib/policy.mjs';
const MAX_AGE=90000;
const fail=(status,message,code)=>{throw new HttpError(status,message,code);};
const assignmentSQL=`SELECT a.*,b.name AS branch_name,b.code AS branch_code,b.latitude,b.longitude,b.allowed_radius,b.address_text,
 s.name AS shift_name FROM assignments a JOIN branches b ON b.id=a.branch_id JOIN shifts s ON s.id=a.shift_id WHERE a.id=? AND a.user_id=?`;
const planHash=a=>digest(JSON.stringify([a.user_id,a.branch_id,a.branch_name,a.shift_id,a.work_date,a.starts_at,a.ends_at,a.grace_minutes,a.latitude,a.longitude,a.allowed_radius,a.address_text]));
function openWindow(a,now){if(!inAttendanceWindow(a,now))fail(409,'Ca ngoài thời gian cho phép chấm công','OUTSIDE_SHIFT_WINDOW');}
async function rejectedExtra(db,id){const t=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='extra_attendance'").first();return !!t&&!!await db.prepare("SELECT 1 AS yes FROM extra_attendance WHERE assignment_id=? AND state='REJECTED'").bind(id).first();}
async function existing(db,assignment,type){return db.prepare('SELECT * FROM attendances WHERE assignment_id=? AND type=?').bind(assignment,type).first();}
async function prepare(request,env,user){
 const b=await jsonLimited(request);if(!b||typeof b!=='object'||!idPattern.test(b.assignment_id||'')||!['IN','OUT'].includes(b.type))fail(400,'Yêu cầu không hợp lệ');
 const {lat,lng,accuracy}=b;
 if(![lat,lng,accuracy].every(Number.isFinite)||Math.abs(lat)>90||Math.abs(lng)>180||accuracy<0||accuracy>50||b.mocked===true)fail(400,'GPS phải có độ chính xác từ 0 đến 50 m','INVALID_GPS');
 const now=Date.now(),a=await env.DB.prepare(assignmentSQL).bind(b.assignment_id,user.id).first();
 if(!a)fail(404,'Không có ca được phân công');openWindow(a,now);
 if(await rejectedExtra(env.DB,a.id))fail(409,'Ca bổ sung đã bị từ chối','EXTRA_REJECTED');
 if(await env.DB.prepare("SELECT id FROM workforce_requests WHERE assignment_id=? AND kind='LEAVE' AND state='APPROVED'").bind(a.id).first())fail(409,'Ca đã có nghỉ phép được duyệt','APPROVED_LEAVE');
 if(a.latitude==null||a.longitude==null)fail(409,'Cửa hàng chưa cấu hình GPS','BRANCH_GPS_MISSING');
 if(await existing(env.DB,a.id,b.type))fail(409,'Đã chấm công loại này; hãy kiểm tra lịch sử','ALREADY_RECORDED');
 if(b.type==='OUT'&&!await existing(env.DB,a.id,'IN'))fail(409,'Cần chấm vào ca trước khi tan ca','IN_REQUIRED');
 const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM attendance_challenges WHERE user_id=? AND created_at>?').bind(user.id,now-300000).first();
 if(count.n>=10)fail(429,'Đã yêu cầu chụp quá nhiều lần; chờ vài phút','PREPARE_RATE_LIMIT');
 if(await env.DB.prepare("SELECT id FROM attendance_challenges WHERE assignment_id=? AND type=? AND state='PROCESSING'").bind(a.id,b.type).first())fail(409,'Yêu cầu trước đang xử lý; kiểm tra lịch sử','ATTENDANCE_PROCESSING');
 const distance=distanceMeters(lat,lng,a.latitude,a.longitude),id=crypto.randomUUID();
 const metadata={serverTimestamp:now,shiftStart:a.starts_at,shiftEnd:a.ends_at,lat,lng,accuracy,distance,radius:a.allowed_radius,type:b.type,
  branchName:a.branch_name,branchCode:a.branch_code,shiftName:a.shift_name,reference:id.slice(0,8).toUpperCase(),employeeName:user.full_name,employeeCode:user.employee_code,address:a.address_text||'',graceMinutes:a.grace_minutes,
  timestampMeaning:'SERVER_CHALLENGE_ISSUED',photoSource:'CLIENT_RENDERED'};
 const inserted=await env.DB.prepare("INSERT INTO attendance_challenges(id,user_id,assignment_id,type,created_at,expires_at,metadata_json,plan_hash) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM attendance_challenges WHERE user_id=? AND created_at>?)<10")
  .bind(id,user.id,a.id,b.type,now,now+MAX_AGE,JSON.stringify(metadata),await planHash(a),user.id,now-300000).run();
 if(inserted.meta.changes!==1)fail(429,'Đã yêu cầu chụp quá nhiều lần; chờ vài phút','PREPARE_RATE_LIMIT');
 return reply({challenge_id:id,metadata,expires_at:now+MAX_AGE,proof_notice:'Ảnh do thiết bị ghép. Thời gian là lúc máy chủ cấp dấu; GPS và nội dung ảnh không được chứng thực.'},201);
}
async function submit(request,env,user){
 const contentType=request.headers.get('content-type')||'';
 if(!/^multipart\/form-data\s*;/i.test(contentType))fail(415,'Cần gửi ảnh bằng multipart/form-data');
 const raw=await readLimited(request,220000);
 let form;try{form=await new Response(raw,{headers:{'Content-Type':contentType}}).formData();}catch{fail(400,'Dữ liệu ảnh không hợp lệ');}
 if([...form.keys()].some(k=>!['challenge_id','photo'].includes(k))||form.getAll('photo').length!==1||form.getAll('challenge_id').length!==1)fail(400,'Dữ liệu ảnh không hợp lệ');
 const challengeId=form.get('challenge_id'),photo=form.get('photo');
 if(typeof challengeId!=='string'||!idPattern.test(challengeId)||!(photo instanceof Blob)||photo.type!=='image/jpeg')fail(400,'Cần ảnh JPEG và mã yêu cầu hợp lệ');
 if(photo.size>200000)fail(413,'Ảnh vượt quá 200 KB','PHOTO_TOO_LARGE');
 const bytes=await photo.arrayBuffer();try{jpegDimensions(bytes);}catch{fail(400,'JPEG không hợp lệ hoặc kích thước không hỗ trợ','INVALID_JPEG');}
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const receivedAt=Date.now();
 const c=await env.DB.prepare('SELECT * FROM attendance_challenges WHERE id=? AND user_id=?').bind(challengeId,user.id).first();
 if(!c)fail(404,'Không có yêu cầu chụp này');
 if(c.state==='COMPLETED'){
  if(c.photo_sha256!==sha)fail(409,'Ảnh khác với yêu cầu đã ghi nhận','REPLAY_MISMATCH');
  const t=await env.DB.prepare('SELECT * FROM attendances WHERE id=? AND user_id=?').bind(c.attendance_id,user.id).first();
  return reply({attendance:t,idempotent:true});
 }
 if(c.state!=='READY')fail(409,'Yêu cầu đã sử dụng hoặc đang xử lý; kiểm tra lịch sử','CHALLENGE_USED');
 if(receivedAt>=c.expires_at)fail(410,'Yêu cầu chụp đã hết hạn; chụp lại','CHALLENGE_EXPIRED');
 const a=await env.DB.prepare(assignmentSQL).bind(c.assignment_id,user.id).first();
 if(!a||await planHash(a)!==c.plan_hash)fail(409,'Thông tin ca hoặc cửa hàng đã thay đổi; chụp lại','PLAN_CHANGED');
 openWindow(a,receivedAt);
 if(await rejectedExtra(env.DB,a.id))fail(409,'Ca bổ sung đã bị từ chối','EXTRA_REJECTED');
 if(await existing(env.DB,a.id,c.type))fail(409,'Đã chấm công loại này; kiểm tra lịch sử','ALREADY_RECORDED');
 if(c.type==='OUT'&&!await existing(env.DB,a.id,'IN'))fail(409,'Cần chấm vào trước khi tan ca','IN_REQUIRED');
 const id=crypto.randomUUID(),key='timemark/'+id+'.jpg';
 let claimed;try{claimed=await env.DB.prepare("UPDATE attendance_challenges SET state='PROCESSING',photo_sha256=?,attendance_id=? WHERE id=? AND user_id=? AND state='READY' AND expires_at>? RETURNING id")
  .bind(sha,id,c.id,user.id,receivedAt).first();}catch{fail(409,'Có yêu cầu chấm công khác đang xử lý','ATTENDANCE_PROCESSING');}
 if(!claimed)fail(409,'Yêu cầu đã được sử dụng','CHALLENGE_USED');
 try{
  // Recheck after claiming: PROCESSING triggers now freeze both the assignment
  // and branch. This closes a plan edit between the preflight read and claim.
  const frozen=await env.DB.prepare(assignmentSQL).bind(c.assignment_id,user.id).first();
  if(!frozen||await planHash(frozen)!==c.plan_hash)fail(409,'Ca hoặc cửa hàng đã thay đổi; chụp lại','PLAN_CHANGED');
  await storeStampedPhoto(env.DB,env.TIMEMARKS,key,bytes,c.created_at,{allowEviction:(await policy(env)).photo_eviction});
  const m=JSON.parse(c.metadata_json),timing=attendanceTiming({...m,serverTimestamp:receivedAt});
  const outside=m.distance>m.radius,status=outside?'OUTSIDE':c.type==='IN'?(timing.minutes?'LATE':'ON_TIME'):(timing.minutes?'EARLY':'ON_TIME');
  const sessionHash=await digest('babymark-session-v1:'+request.headers.get('authorization').slice(7));
  const statements=[env.DB.prepare(`INSERT INTO attendances(id,assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,address_text,photo_path,status,late_minutes,early_minutes,photo_sha256,photo_source,received_at,stamp_issued_at,metadata_json)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'CLIENT_RENDERED',?,?,? FROM attendance_challenges c
   JOIN profiles p ON p.id=c.user_id AND p.active=1
   JOIN credentials cr ON cr.user_id=p.id
   JOIN sessions ss ON ss.user_id=p.id AND ss.token_hash=? AND ss.credential_version=cr.version AND ss.expires_at>?
   WHERE c.id=? AND c.state='PROCESSING' AND c.attendance_id=?
   AND (c.type='IN' OR EXISTS(SELECT 1 FROM attendances ti WHERE ti.assignment_id=c.assignment_id AND ti.type='IN' AND ti.server_timestamp<=?))`)
   .bind(id,c.assignment_id,user.id,c.type,receivedAt,m.lat,m.lng,m.accuracy,m.distance,m.address,key,status,c.type==='IN'?timing.minutes:0,c.type==='OUT'?timing.minutes:0,sha,receivedAt,c.created_at,c.metadata_json,sessionHash,Date.now(),c.id,id,receivedAt),
   env.DB.prepare("UPDATE attendance_challenges SET state='COMPLETED' WHERE id=? AND state='PROCESSING' AND EXISTS(SELECT 1 FROM attendances WHERE id=?)").bind(c.id,id)];
  const results=await env.DB.batch(statements);
  if(results[0].meta.changes!==1)fail(409,'Phiên hoặc trạng thái công đã thay đổi; kiểm tra lịch sử','FINALIZE_FAILED');
  return reply({attendance:await env.DB.prepare('SELECT * FROM attendances WHERE id=?').bind(id).first()},201);
 }catch(e){
  // KV and D1 are not one transaction. Keep counted inventory on every uncertain
  // failure; never delete or release bytes merely because a network call failed.
  const completed=await env.DB.prepare('SELECT * FROM attendances WHERE id=? AND user_id=?').bind(id,user.id).first().catch(()=>null);
  if(completed)return reply({attendance:completed,idempotent:true});
  await env.DB.prepare("UPDATE attendance_challenges SET state='FAILED' WHERE id=? AND state='PROCESSING'").bind(c.id).run().catch(()=>{});
  if(e instanceof HttpError)throw e;
  if(/APPROVED_LEAVE|UNIQUE constraint/.test(e.message))fail(409,'Ca đã được ghi nhận hoặc đã duyệt nghỉ; kiểm tra lịch sử','ATTENDANCE_CONFLICT');
  if(/PHOTO_STORAGE|KV_NOT_CONFIGURED/.test(e.message))fail(503,'Kho ảnh bận hoặc cần quản trị kiểm tra; xem lịch sử rồi chụp lại','PHOTO_STORAGE_UNAVAILABLE');
  throw e;
 }
}
export async function onRequestPost({request,env,params}){
 if(!env.DB||!env.TIMEMARKS)return reply({error:'Chưa cấu hình D1/KV'},503);
 try{const user=await sessionUser(request,env.DB);if(!user)return reply({error:'Chưa đăng nhập'},401);
  if(params.action==='prepare')return await prepare(request,env,user);
  if(params.action==='submit')return await submit(request,env,user);
  return reply({error:'Không tìm thấy API'},404);
 }catch(e){return errorResponse(e);}
}
export async function onRequestGet({request,env,params}){
 if(!env.DB)return reply({error:'Chưa cấu hình D1'},503);
 try{
  const user=await sessionUser(request,env.DB);if(!user)return reply({error:'Chưa đăng nhập'},401);
  if(params.action==='status'){
   const id=new URL(request.url).searchParams.get('challenge_id');if(!idPattern.test(id||''))fail(400,'Mã yêu cầu không hợp lệ');
   const c=await env.DB.prepare('SELECT id,state,expires_at,attendance_id FROM attendance_challenges WHERE id=? AND user_id=?').bind(id,user.id).first();if(!c)fail(404,'Không tìm thấy yêu cầu');
   const t=c.attendance_id?await env.DB.prepare('SELECT id,assignment_id,type,server_timestamp FROM attendances WHERE id=? AND user_id=?').bind(c.attendance_id,user.id).first():null;
   return reply({state:t?'COMPLETED':c.state==='COMPLETED'?'UNKNOWN':c.state==='READY'&&c.expires_at<=Date.now()?'EXPIRED':c.state,attendance:t,expires_at:c.expires_at});
  }
  if(params.action!=='history')return reply({error:'Không tìm thấy API'},404);
  const u=new URL(request.url),from=u.searchParams.get('from')||new Date(Date.now()+7*3600000-31*86400000).toISOString().slice(0,10),to=u.searchParams.get('to')||new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||Date.parse(to)-Date.parse(from)>93*86400000)fail(400,'Khoảng ngày phải trong 93 ngày');
  const {results}=await env.DB.prepare(`SELECT t.*,b.name AS branch_name,a.work_date,s.name AS shift_name FROM attendances t JOIN assignments a ON a.id=t.assignment_id JOIN branches b ON b.id=a.branch_id JOIN shifts s ON s.id=a.shift_id WHERE t.user_id=? AND a.work_date BETWEEN ? AND ? ORDER BY t.server_timestamp DESC LIMIT 1000`).bind(user.id,from,to).all();
  return reply({attendances:results});
 }catch(e){return errorResponse(e);}
}
