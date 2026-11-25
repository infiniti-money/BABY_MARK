import {reply,bodyJSON,digest} from '../../cloudflare/lib/auth.mjs';
import {actorFor,ApiError,apiFailure,assignmentScope,dateRange,identifier,textField,invalid,managementAudit,validDay,dayVN} from '../../cloudflare/lib/access.mjs';

export async function onRequestGet({request,env}){
 try{
  const actor=await actorFor(request,env),scope=assignmentScope(actor),{from,to}=dateRange(new URL(request.url));
  const {results}=await env.DB.prepare(`SELECT r.*,p.full_name,p.employee_code,a.work_date,a.starts_at,a.ends_at,a.branch_id,b.name AS branch_name,s.name AS shift_name
   FROM workforce_requests r JOIN assignments a ON a.id=r.assignment_id JOIN profiles p ON p.id=r.user_id JOIN branches b ON b.id=a.branch_id JOIN shifts s ON s.id=a.shift_id
   WHERE ${scope.sql} AND a.work_date>=? AND a.work_date<=? ORDER BY r.created_at DESC,r.id DESC LIMIT 5001`).bind(...scope.values,from,to).all();
  if(results.length>5000)throw new ApiError(413,'Quá nhiều yêu cầu. Chọn khoảng ngày nhỏ hơn.');
  return reply({requests:results,from,to});
 }catch(error){return apiFailure(error)}
}

export async function onRequestPost({request,env}){
 try{
  const actor=await actorFor(request,env),db=env.DB,b=await bodyJSON(request),now=Date.now();
  if(!b||typeof b!=='object'||Array.isArray(b))invalid();
  if(b.action==='decide'){
   const id=identifier(b.id),state=b.state,note=textField(b.decision_note,1000);
   if(!['APPROVED','REJECTED'].includes(state)||note.length<3)invalid('Cần quyết định và ghi chú ít nhất 3 ký tự');
   if(!['admin','manager'].includes(actor.role))throw new ApiError(403,'Không có quyền duyệt');
   const row=await db.prepare('SELECT r.*,a.branch_id FROM workforce_requests r JOIN assignments a ON a.id=r.assignment_id WHERE r.id=?').bind(id).first();
   if(!row)throw new ApiError(404,'Không tìm thấy yêu cầu');
   if(row.user_id===actor.id)throw new ApiError(403,'Không tự duyệt yêu cầu của mình');
   if(actor.role==='manager'&&!await db.prepare('SELECT branch_id FROM branch_managers WHERE user_id=? AND branch_id=?').bind(actor.id,row.branch_id).first())throw new ApiError(403,'Không thuộc cửa hàng được quản lý');
   if(row.state!=='PENDING')throw new ApiError(409,'Yêu cầu đã được xử lý');
   const auditId=crypto.randomUUID();
   const sessionHash=await digest('babymark-session-v1:'+request.headers.get('authorization').slice(7));
   const result=await db.batch([
    db.prepare(`UPDATE workforce_requests SET state=?,decided_by=?,decided_at=?,decision_note=? WHERE id=? AND state='PENDING' AND user_id<>?
     AND EXISTS(SELECT 1 FROM sessions ss JOIN profiles p ON p.id=ss.user_id AND p.active=1 JOIN credentials c ON c.user_id=p.id AND c.version=ss.credential_version
      WHERE ss.token_hash=? AND ss.expires_at>? AND p.id=? AND (p.role='admin' OR (p.role='manager' AND EXISTS(
       SELECT 1 FROM branch_managers bm JOIN assignments a ON a.branch_id=bm.branch_id WHERE bm.user_id=p.id AND a.id=workforce_requests.assignment_id))))
     RETURNING id`).bind(state,actor.id,now,note,id,actor.id,sessionHash,Date.now(),actor.id),
    db.prepare('INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(auditId,actor.id,'workforce',id,'DECIDE',JSON.stringify({state,decision_note:note}),now)
   ]);
   if(!result[0].results?.length)throw new ApiError(409,'Yêu cầu hoặc quyền duyệt đã thay đổi; tải lại dữ liệu');
   return reply({id,state});
  }
  if(b.action==='leave-range'){
   const from=b.from,to=b.to,reason=textField(b.reason,1000);
   if(!validDay(from)||!validDay(to)||from<dayVN(now)||to<from||Date.parse(to)-Date.parse(from)>30*86400000||reason.length<5)invalid('Chọn từ hôm nay, tối đa 31 ngày và lý do tối thiểu 5 ký tự');
   const rows=(await db.prepare("SELECT a.id,a.work_date FROM assignments a WHERE a.user_id=? AND a.work_date BETWEEN ? AND ? AND a.starts_at>? AND NOT EXISTS(SELECT 1 FROM attendances t WHERE t.assignment_id=a.id) AND NOT EXISTS(SELECT 1 FROM workforce_requests w WHERE w.assignment_id=a.id AND w.state IN ('PENDING','APPROVED')) ORDER BY a.work_date,a.starts_at LIMIT 63").bind(actor.id,from,to,now).all()).results;
   if(!rows.length||rows.length>62)invalid('Không có ca tương lai đủ điều kiện hoặc quá nhiều ca');
   const payload=rows.map(a=>({id:crypto.randomUUID(),assignment_id:a.id}));
   const result=await db.batch([db.prepare("INSERT INTO workforce_requests(id,assignment_id,user_id,kind,reason,state,created_at) SELECT json_extract(j.value,'$.id'),a.id,?,'LEAVE',?,'PENDING',? FROM json_each(?) j JOIN assignments a ON a.id=json_extract(j.value,'$.assignment_id') WHERE a.user_id=? AND a.starts_at>? AND NOT EXISTS(SELECT 1 FROM attendances t WHERE t.assignment_id=a.id) AND NOT EXISTS(SELECT 1 FROM workforce_requests w WHERE w.assignment_id=a.id AND w.state IN ('PENDING','APPROVED')) RETURNING id").bind(actor.id,reason,now,JSON.stringify(payload),actor.id,now),managementAudit(db,actor,'workforce',actor.id,'LEAVE_RANGE',{from,to,requested:rows.length})]);
   return reply({created:result[0].results.length},201);
  }
  if(b.action!=null)invalid('Thao tác không hợp lệ');
  const assignment=identifier(b.assignment_id),kind=b.kind,reason=textField(b.reason,1000);
  if(!['LEAVE','CORRECTION'].includes(kind)||reason.length<5)invalid('Lý do cần ít nhất 5 ký tự');
  const row=await db.prepare('SELECT * FROM assignments WHERE id=? AND user_id=?').bind(assignment,actor.id).first();
  if(!row)throw new ApiError(404,'Không có ca được phân công');
  const id=crypto.randomUUID();let entry=null,exit=null;
  if(kind==='CORRECTION'){
   entry=b.proposed_in;exit=b.proposed_out;
   if(!Number.isSafeInteger(entry)||!Number.isSafeInteger(exit)||entry<row.starts_at-2*3600000||exit>row.ends_at+6*3600000||exit<=entry||exit>now)invalid('Giờ điều chỉnh phải nằm trong khoảng ca cho phép và không ở tương lai');
  }else if(await db.prepare('SELECT id FROM attendances WHERE assignment_id=? LIMIT 1').bind(assignment).first())throw new ApiError(409,'Ca đã có chấm công, không thể xin nghỉ');
  await db.batch([db.prepare("INSERT INTO workforce_requests(id,assignment_id,user_id,kind,reason,proposed_in,proposed_out,state,created_at) VALUES(?,?,?,?,?,?,?,'PENDING',?)").bind(id,assignment,actor.id,kind,reason,entry,exit,now),managementAudit(db,actor,'workforce',id,'SUBMIT',{assignment_id:assignment,kind,reason,proposed_in:entry,proposed_out:exit})]);
  return reply({id,state:'PENDING'},201);
 }catch(error){return apiFailure(error)}
}
