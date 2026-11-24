import {actorFor,apiFailure,ApiError,identifier,textField,assignmentScope,dateRange,managementAudit} from '../../cloudflare/lib/access.mjs';
import {reply} from '../../cloudflare/lib/auth.mjs';
import {jsonLimited} from '../../cloudflare/lib/http.mjs';
import {faceSchema,faceRequired,faceGateway,gatewayCall} from '../../cloudflare/lib/face-verification.mjs';
export async function onRequestGet({request,env}){
 try{
  const actor=await actorFor(request,env),db=env.DB;
  if(!await faceSchema(db))return reply({available:false,required:false,configured:false,rows:[],employees:[]});
  const required=await faceRequired(db,actor.id),configured=!!faceGateway(env);
  const {from,to}=dateRange(new URL(request.url)),scope=assignmentScope(actor);
  const rows=(await db.prepare(`SELECT t.id,t.type,t.server_timestamp,a.work_date,a.branch_id,p.full_name,b.name AS branch_name,
   json_extract(t.metadata_json,'$.face_verification.reason') AS reason,COALESCE(r.state,'PENDING') AS state,r.note
   FROM attendances t JOIN assignments a ON a.id=t.assignment_id JOIN profiles p ON p.id=a.user_id JOIN branches b ON b.id=a.branch_id
   LEFT JOIN face_exception_reviews r ON r.attendance_id=t.id
   WHERE json_extract(t.metadata_json,'$.face_verification.mode')='EXCEPTION' AND ${scope.sql} AND a.work_date BETWEEN ? AND ? ORDER BY t.server_timestamp DESC LIMIT 1000`).bind(...scope.values,from,to).all()).results;
  const employees=actor.role==='admin'?(await db.prepare("SELECT p.id,p.full_name,p.employee_code,CASE WHEN f.user_id IS NULL THEN 0 ELSE 1 END AS enabled FROM profiles p LEFT JOIN face_pilot f ON f.user_id=p.id WHERE p.active=1 AND p.role<>'admin' ORDER BY p.employee_code").all()).results:[];
  return reply({available:true,required,configured,rows,employees});
 }catch(e){return apiFailure(e)}
}
export async function onRequestPost({request,env}){
 try{
  const actor=await actorFor(request,env),db=env.DB,b=await jsonLimited(request);
  if(!await faceSchema(db))throw new ApiError(409,'Cần migration 0014');
  if(b.action==='pilot'){
   if(actor.role!=='admin')throw new ApiError(403,'Chỉ Admin');
   const id=identifier(b.user_id);
   if(typeof b.enabled!=='boolean')throw new ApiError(400,'Trạng thái không hợp lệ');
   if(b.enabled){
    if(!faceGateway(env))throw new ApiError(409,'Chưa có cổng xác minh được cấu hình');
    const p=await db.prepare("SELECT id FROM profiles WHERE id=? AND active=1 AND role<>'admin'").bind(id).first();
    if(!p)throw new ApiError(404,'Nhân viên không hoạt động');
    // Gateway must confirm supervised enrollment and current permission/authorization.
    const result=await gatewayCall(env,'/enrollment-status',{subject_id:id});
    if(result?.subject_id!==id||result.enrollment_verified!==true)throw new ApiError(409,'Chưa có mẫu khuôn mặt đăng ký và xác minh');
    await db.batch([db.prepare('INSERT INTO face_pilot(user_id,enabled_at,enabled_by) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(id,Date.now(),actor.id),managementAudit(db,actor,'face-pilot',id,'ENABLE',{})]);
   }else await db.batch([db.prepare('DELETE FROM face_pilot WHERE user_id=?').bind(id),db.prepare('DELETE FROM face_sessions WHERE user_id=?').bind(id),managementAudit(db,actor,'face-pilot',id,'DISABLE',{})]);
   return reply({ok:true});
  }
  if(b.action==='start'){
   if(!await faceRequired(db,actor.id))throw new ApiError(409,'Chưa bật xác minh cho tài khoản');
   const id=identifier(b.assignment_id),type=b.type,now=Date.now();
   if(!['IN','OUT'].includes(type))throw new ApiError(400,'Loại chấm công không hợp lệ');
   const a=await db.prepare('SELECT * FROM assignments WHERE id=? AND user_id=?').bind(id,actor.id).first();
   if(!a||now<a.starts_at-14400000||now>a.ends_at+43200000)throw new ApiError(409,'Ca ngoài thời gian chấm công');
   if(await db.prepare('SELECT id FROM attendances WHERE assignment_id=? AND type=?').bind(id,type).first())throw new ApiError(409,'Đã chấm công loại này');
   if(type==='OUT'&&!await db.prepare("SELECT id FROM attendances WHERE assignment_id=? AND type='IN'").bind(id).first())throw new ApiError(409,'Cần chấm vào ca trước');
   const sid=crypto.randomUUID(),expires=now+180000;
   const inserted=await db.prepare('INSERT INTO face_sessions(id,user_id,assignment_id,type,created_at,expires_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM face_sessions WHERE user_id=? AND created_at>?)<6').bind(sid,actor.id,id,type,now,expires,actor.id,now-3600000).run();
   if(inserted.meta.changes!==1)throw new ApiError(429,'Tối đa 6 phiên xác minh mỗi giờ; có thể khai báo ngoại lệ');
   const result=await gatewayCall(env,'/start',{session_id:sid,subject_id:actor.id,assignment_id:id,type,expires_at:expires});
   let url;try{url=new URL(result.url);}catch{throw new ApiError(503,'Cổng xác minh không trả đường dẫn hợp lệ');}
   if(result.session_id!==sid||url.origin!==faceGateway(env).origin||url.username||url.password)throw new ApiError(503,'Đường dẫn xác minh không hợp lệ');
   return reply({session_id:sid,url:url.href,expires_at:expires},201);
  }
  if(b.action==='decide'){
   if(actor.role==='staff')throw new ApiError(403,'Chỉ quản lý hoặc Admin');
   const id=identifier(b.attendance_id),state=b.state,note=textField(b.note,500);
   if(!['APPROVED','REJECTED'].includes(state)||note.length<5)throw new ApiError(400,'Nhập lý do quyết định tối thiểu 5 ký tự');
   const scope=assignmentScope(actor),now=Date.now();
   const inserted=await db.prepare(`INSERT INTO face_exception_reviews(attendance_id,state,decided_by,decided_at,note)
    SELECT t.id,?,?,?,? FROM attendances t JOIN assignments a ON a.id=t.assignment_id
    WHERE t.id=? AND a.user_id<>? AND ${scope.sql} AND json_extract(t.metadata_json,'$.face_verification.mode')='EXCEPTION'
    ON CONFLICT(attendance_id) DO NOTHING RETURNING attendance_id`).bind(state,actor.id,now,note,id,actor.id,...scope.values).first();
   if(!inserted)throw new ApiError(409,'Không có quyền hoặc ngoại lệ đã được xử lý');
   return reply({ok:true});
  }
  throw new ApiError(400,'Thao tác không hợp lệ');
 }catch(e){return apiFailure(e)}
}
