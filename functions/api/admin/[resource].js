import {reply,bodyJSON} from '../../../cloudflare/lib/auth.mjs';
import {actorFor,ApiError,apiFailure,textField,identifier,invalid,shiftInterval,managementAudit,validDay,dayVN} from '../../../cloudflare/lib/access.mjs';

import {policy} from '../../../cloudflare/lib/policy.mjs';
const resources=new Set(['branches','employees','shifts','assignments','manager-branches','settings']);
const all=async(db,sql,...values)=>(await db.prepare(sql).bind(...values).all()).results;

export async function onRequestGet({request,env,params}){
 try{
  await actorFor(request,env,{admin:true});const db=env.DB,resource=params.resource;
  if(!resources.has(resource))throw new ApiError(404,'Không tìm thấy chức năng');
  if(resource==='settings')return reply({settings:await policy(env)});
  if(resource==='branches')return reply({branches:await all(db,'SELECT * FROM branches ORDER BY code,name')});
  if(resource==='employees')return reply({employees:await all(db,'SELECT p.*,c.username FROM profiles p LEFT JOIN credentials c ON c.user_id=p.id ORDER BY employee_code')});
  if(resource==='shifts')return reply({shifts:await all(db,'SELECT * FROM shifts ORDER BY start_time,name')});
  if(resource==='manager-branches')return reply({manager_branches:await all(db,'SELECT user_id,branch_id FROM branch_managers ORDER BY user_id,branch_id')});
  // Scheduling uses the same date-limited, scoped read as the employee screen.
  const {readAssignments}=await import('../../../cloudflare/lib/reports.mjs');
  const {assignments}=await readAssignments(db,await actorFor(request,env),new URL(request.url));
  return reply({assignments});
 }catch(error){return apiFailure(error)}
}

export async function onRequestPost({request,env,params}){
 try{
  const actor=await actorFor(request,env,{admin:true}),db=env.DB,resource=params.resource;
  if(!resources.has(resource))throw new ApiError(404,'Không tìm thấy chức năng');
  const b=await bodyJSON(request);
  if(!b||typeof b!=='object'||Array.isArray(b))invalid();
  const id=b.id?identifier(b.id):crypto.randomUUID();
  const audit=(details)=>managementAudit(db,actor,resource,id,b.id?'UPDATE':'CREATE',details);
  if(resource==='settings'){
   const current=await policy(env);if(!current.available)throw new ApiError(409,'Cần migration 0009');
   if(!Number.isInteger(b.branch_limit)||b.branch_limit<1||b.branch_limit>50||!['photo_eviction','attendance_retention','late_alerts'].every(k=>typeof b[k]==='boolean'))invalid('Cấu hình không hợp lệ');
   if(b.attendance_retention&&!current.retention_secret_configured)throw new ApiError(409,'Cần cấu hình RETENTION_SECRET trên Cloudflare trước khi bật dọn bảng công');
   const details={branch_limit:b.branch_limit,photo_eviction:b.photo_eviction,attendance_retention:b.attendance_retention,late_alerts:b.late_alerts};
   await db.batch([db.prepare('UPDATE system_settings SET branch_limit=?,photo_eviction=?,attendance_retention=?,late_alerts=?,updated_at=? WHERE id=1').bind(b.branch_limit,+b.photo_eviction,+b.attendance_retention,+b.late_alerts,Date.now()),managementAudit(db,actor,'settings','1','UPDATE',details)]);
   return reply({settings:await policy(env)});
  }
  if(resource==='branches'){
   if(b.action==='set-radius-all'){
    if(!(await policy(env)).available)throw new ApiError(409,'Cần migration 0009');
    if(b.allowed_radius!==200)invalid('Bán kính áp dụng toàn hệ thống là 200 m');
    const result=await db.batch([db.prepare("UPDATE branches SET allowed_radius=200 WHERE active=1 AND allowed_radius<>200"),managementAudit(db,actor,'branches','ALL_ACTIVE','SET_RADIUS_ALL',{allowed_radius:200})]);
    return reply({updated:result[0].meta.changes});
   }
   if(b.action==='set-active'){
    if(!b.id||typeof b.active!=='boolean')invalid('Trạng thái cửa hàng không hợp lệ');
    if(!(await policy(env)).available)throw new ApiError(409,'Cần migration 0009');
    const row=await db.prepare('SELECT id,active FROM branches WHERE id=?').bind(id).first();if(!row)throw new ApiError(404,'Không tìm thấy cửa hàng');
    if(!!row.active===b.active)return reply({id,active:b.active});
    await db.batch([db.prepare('UPDATE branches SET active=? WHERE id=?').bind(+b.active,id),managementAudit(db,actor,'branches',id,b.active?'REACTIVATE':'ARCHIVE',{active:b.active})]);
    return reply({id,active:b.active});
   }
   if(b.action==='delete-unused'){
    if(!b.id)invalid('Cần mã cửa hàng');
    // Both statements use the same predicate inside a D1 atomic batch.
    // Historical references and manager scopes are never cascaded.
    const guard='id=? AND NOT EXISTS(SELECT 1 FROM assignments WHERE branch_id=branches.id) AND NOT EXISTS(SELECT 1 FROM branch_managers WHERE branch_id=branches.id)';
    const result=await db.batch([
     db.prepare("INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at) SELECT ?,?,'branches',id,'DELETE_UNUSED',json_object('code',code,'name',name),? FROM branches WHERE "+guard).bind(crypto.randomUUID(),actor.id,Date.now(),id),
     db.prepare('DELETE FROM branches WHERE '+guard).bind(id)
    ]);
    if(result[1].meta?.changes!==1)throw new ApiError(409,'Không thể xóa: cửa hàng không tồn tại, đã có lịch phân công hoặc đang được giao cho quản lý.');
    return reply({id,deleted:true});
   }
   const code=textField(b.code,40),name=textField(b.name,150),address=textField(b.address_text??'',300,true),lat=b.latitude??null,lng=b.longitude??null,radius=b.allowed_radius??(b.id?null:200);
   if(!Number.isInteger(radius)||radius<20||radius>1000||!((lat===null&&lng===null)||(Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lng)&&Math.abs(lng)<=180)))invalid('GPS hoặc bán kính không hợp lệ');
   if(b.id&&!await db.prepare('SELECT id FROM branches WHERE id=?').bind(id).first())throw new ApiError(404,'Không tìm thấy cửa hàng');
   const statement=b.id?db.prepare('UPDATE branches SET code=?,name=?,latitude=?,longitude=?,allowed_radius=?,address_text=? WHERE id=?').bind(code,name,lat,lng,radius,address,id):db.prepare('INSERT INTO branches(id,code,name,latitude,longitude,allowed_radius,address_text) VALUES(?,?,?,?,?,?,?)').bind(id,code,name,lat,lng,radius,address);
   await db.batch([statement,audit({code,name,latitude:lat,longitude:lng,allowed_radius:radius,address_text:address})]);
   return reply({id},b.id?200:201);
  }
  if(resource==='employees'){
   if(!b.id)invalid('Tạo tài khoản bằng chức năng cấp tài khoản');
   const target=await db.prepare('SELECT role FROM profiles WHERE id=?').bind(id).first();
   if(!target||target.role==='admin')throw new ApiError(403,'Không được sửa tài khoản quản trị viên tại đây');
   const employee_code=textField(b.employee_code,40),full_name=textField(b.full_name,120),department=textField(b.department??'',100,true),role=b.role;
   if(!['staff','manager'].includes(role))invalid('Vai trò không hợp lệ');
   const statements=[db.prepare('UPDATE profiles SET employee_code=?,full_name=?,department=?,role=? WHERE id=?').bind(employee_code,full_name,department,role,id),audit({employee_code,full_name,department,role})];
   if(role==='staff')statements.push(db.prepare('DELETE FROM branch_managers WHERE user_id=?').bind(id));
   await db.batch(statements);return reply({id});
  }
  if(resource==='shifts'){
   if(b.action==='delete-unused'){
    if(!b.id)invalid('Cần mã mẫu ca');
    const guard='id=? AND NOT EXISTS(SELECT 1 FROM assignments WHERE shift_id=shifts.id)';
    const result=await db.batch([db.prepare("INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at) SELECT ?,?,'shifts',id,'DELETE_UNUSED',json_object('name',name,'start_time',start_time,'end_time',end_time,'grace_period',grace_period),? FROM shifts WHERE "+guard).bind(crypto.randomUUID(),actor.id,Date.now(),id),db.prepare('DELETE FROM shifts WHERE '+guard).bind(id)]);
    if(result[1].meta?.changes!==1)throw new ApiError(409,'Mẫu ca đã được sử dụng hoặc không tồn tại');
    return reply({id,deleted:true});
   }
   const name=textField(b.name,120),start=textField(b.start_time,5),end=textField(b.end_time,5),grace=b.grace_period;
   shiftInterval('2026-01-01',start,end);
   if(!Number.isInteger(grace)||grace<0||grace>120)invalid('Thời gian cho phép đi muộn không hợp lệ');
   if(b.id&&!await db.prepare('SELECT id FROM shifts WHERE id=?').bind(id).first())throw new ApiError(404,'Không tìm thấy ca');
   const statement=b.id?db.prepare('UPDATE shifts SET name=?,start_time=?,end_time=?,grace_period=? WHERE id=?').bind(name,start,end,grace,id):db.prepare('INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES(?,?,?,?,?)').bind(id,name,start,end,grace);
   await db.batch([statement,audit({name,start_time:start,end_time:end,grace_period:grace})]);return reply({id},b.id?200:201);
  }
  if(resource==='assignments'){
   if(b.action==='cancel'){
    if(!b.id)invalid('Cần mã ca');
    // Only future assignments with no attendance, request, challenge or notification.
    // Preserve an audit snapshot; no employee attendance or photograph is removed.
    const guard='id=? AND starts_at>? AND NOT EXISTS(SELECT 1 FROM attendances WHERE assignment_id=assignments.id) AND NOT EXISTS(SELECT 1 FROM workforce_requests WHERE assignment_id=assignments.id) AND NOT EXISTS(SELECT 1 FROM attendance_challenges WHERE assignment_id=assignments.id) AND NOT EXISTS(SELECT 1 FROM attendance_notifications WHERE assignment_id=assignments.id)';
    const now=Date.now(),reason=textField(b.reason,300);
    const result=await db.batch([db.prepare("INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at) SELECT ?,?,'assignments',id,'CANCEL',json_object('reason',?,'user_id',user_id,'branch_id',branch_id,'shift_id',shift_id,'work_date',work_date,'starts_at',starts_at,'ends_at',ends_at,'grace_minutes',grace_minutes),? FROM assignments WHERE "+guard).bind(crypto.randomUUID(),actor.id,reason,now,id,now),db.prepare('DELETE FROM assignments WHERE '+guard).bind(id,now)]);
    if(result[1].meta?.changes!==1)throw new ApiError(409,'Chỉ hủy ca tương lai chưa có dữ liệu liên quan');
    return reply({id,cancelled:true});
   }
   if(b.action==='bulk'){
    if(!Array.isArray(b.user_ids)||!b.user_ids.length||b.user_ids.length>50||new Set(b.user_ids).size!==b.user_ids.length)invalid('Chọn nhân viên hợp lệ');
    const users=b.user_ids.map(identifier),branch=identifier(b.branch_id),shiftId=identifier(b.shift_id);
    if(!validDay(b.from)||!validDay(b.to)||b.from<dayVN()||b.to<b.from||Date.parse(b.to)-Date.parse(b.from)>30*86400000)invalid('Chọn tối đa 31 ngày từ hôm nay');
    if(!Array.isArray(b.weekdays)||!b.weekdays.length||b.weekdays.some(v=>!Number.isInteger(v)||v<1||v>7))invalid('Chọn ngày trong tuần');
    const shift=await db.prepare('SELECT * FROM shifts WHERE id=?').bind(shiftId).first(),br=await db.prepare('SELECT * FROM branches WHERE id=?').bind(branch).first();
    if(!shift||!br||br.active===0)invalid('Cửa hàng hoặc ca không hoạt động');
    const eligible=await all(db,"SELECT id FROM profiles WHERE active=1 AND role<>'admin' AND id IN ("+users.map(()=>'?').join(',')+")",...users);
    if(eligible.length!==users.length)invalid('Có tài khoản không hoạt động hoặc không hợp lệ');
    const rows=[];
    for(let t=Date.parse(b.from);t<=Date.parse(b.to);t+=86400000){
     const d=new Date(t);if(!b.weekdays.includes(d.getUTCDay()||7))continue;
     const work_date=d.toISOString().slice(0,10),interval=shiftInterval(work_date,shift.start_time,shift.end_time);
     for(const user_id of users)rows.push({id:crypto.randomUUID(),user_id,work_date,...interval});
    }
    if(!rows.length||rows.length>100)invalid('Mỗi lần phân tối đa 100 ca; chia thành nhiều đợt');
    const payload=JSON.stringify(rows);
    const result=await db.batch([db.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) SELECT json_extract(value,'$.id'),json_extract(value,'$.user_id'),?,?,json_extract(value,'$.work_date'),json_extract(value,'$.starts_at'),json_extract(value,'$.ends_at'),? FROM json_each(?)").bind(branch,shiftId,shift.grace_period,payload),managementAudit(db,actor,'assignments',crypto.randomUUID(),'BULK_CREATE',{branch_id:branch,shift_id:shiftId,user_ids:users,from:b.from,to:b.to,weekdays:b.weekdays,count:rows.length})]);
    return reply({created:result[0].meta.changes},201);
   }
   const user=identifier(b.user_id),branch=identifier(b.branch_id),shiftId=identifier(b.shift_id);
   const profile=await db.prepare('SELECT id FROM profiles WHERE id=? AND active=1').bind(user).first();
   const branchRow=await db.prepare('SELECT * FROM branches WHERE id=?').bind(branch).first();
   const shift=await db.prepare('SELECT * FROM shifts WHERE id=?').bind(shiftId).first();
   if(!profile||!branchRow||branchRow.active===0||!shift)invalid('Nhân viên, cửa hàng hoặc ca chưa tồn tại');
   const {starts_at,ends_at}=shiftInterval(b.work_date,shift.start_time,shift.end_time);
   if(b.id&&!await db.prepare('SELECT id FROM assignments WHERE id=?').bind(id).first())throw new ApiError(404,'Không tìm thấy phân ca');
   // Historical assignments and overlaps are rejected by D1 triggers atomically.
   const statement=b.id?db.prepare('UPDATE assignments SET user_id=?,branch_id=?,shift_id=?,work_date=?,starts_at=?,ends_at=?,grace_minutes=? WHERE id=?').bind(user,branch,shiftId,b.work_date,starts_at,ends_at,shift.grace_period,id):db.prepare('INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,?,?,?,?,?,?)').bind(id,user,branch,shiftId,b.work_date,starts_at,ends_at,shift.grace_period);
   await db.batch([statement,audit({user_id:user,branch_id:branch,shift_id:shiftId,work_date:b.work_date,starts_at,ends_at,grace_minutes:shift.grace_period})]);
   return reply({id,starts_at,ends_at},b.id?200:201);
  }
  const user=identifier(b.user_id);
  if(!Array.isArray(b.branch_ids)||b.branch_ids.length>50||new Set(b.branch_ids).size!==b.branch_ids.length)invalid('Danh sách tối đa 50 cửa hàng không hợp lệ');
  const branchIds=b.branch_ids.map(identifier);
  if(!await db.prepare("SELECT id FROM profiles WHERE id=? AND active=1 AND role='manager'").bind(user).first())invalid('Tài khoản phải là quản lý đang hoạt động');
  if(branchIds.length){
   const found=await all(db,`SELECT id FROM branches WHERE id IN (${branchIds.map(()=>'?').join(',')})`,...branchIds);
   if(found.length!==branchIds.length)invalid('Cửa hàng chưa tồn tại');
  }
  await db.batch([db.prepare('DELETE FROM branch_managers WHERE user_id=?').bind(user),...branchIds.map(branch=>db.prepare('INSERT INTO branch_managers(user_id,branch_id) VALUES(?,?)').bind(user,branch)),managementAudit(db,actor,resource,user,'UPDATE',{branch_ids:branchIds})]);
  return reply({user_id:user,branch_ids:branchIds});
 }catch(error){return apiFailure(error)}
}
