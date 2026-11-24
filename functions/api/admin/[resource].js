import {reply,bodyJSON} from '../../../cloudflare/lib/auth.mjs';
import {actorFor,ApiError,apiFailure,textField,identifier,invalid,shiftInterval,managementAudit} from '../../../cloudflare/lib/access.mjs';

const resources=new Set(['branches','employees','shifts','assignments','manager-branches']);
const all=async(db,sql,...values)=>(await db.prepare(sql).bind(...values).all()).results;

export async function onRequestGet({request,env,params}){
 try{
  await actorFor(request,env,{admin:true});const db=env.DB,resource=params.resource;
  if(!resources.has(resource))throw new ApiError(404,'Không tìm thấy chức năng');
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
  if(resource==='branches'){
   const code=textField(b.code,40),name=textField(b.name,150),address=textField(b.address_text??'',300,true),lat=b.latitude??null,lng=b.longitude??null,radius=b.allowed_radius;
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
   const name=textField(b.name,120),start=textField(b.start_time,5),end=textField(b.end_time,5),grace=b.grace_period;
   shiftInterval('2026-01-01',start,end);
   if(!Number.isInteger(grace)||grace<0||grace>120)invalid('Thời gian cho phép đi muộn không hợp lệ');
   if(b.id&&!await db.prepare('SELECT id FROM shifts WHERE id=?').bind(id).first())throw new ApiError(404,'Không tìm thấy ca');
   const statement=b.id?db.prepare('UPDATE shifts SET name=?,start_time=?,end_time=?,grace_period=? WHERE id=?').bind(name,start,end,grace,id):db.prepare('INSERT INTO shifts(id,name,start_time,end_time,grace_period) VALUES(?,?,?,?,?)').bind(id,name,start,end,grace);
   await db.batch([statement,audit({name,start_time:start,end_time:end,grace_period:grace})]);return reply({id},b.id?200:201);
  }
  if(resource==='assignments'){
   const user=identifier(b.user_id),branch=identifier(b.branch_id),shiftId=identifier(b.shift_id);
   const profile=await db.prepare('SELECT id FROM profiles WHERE id=? AND active=1').bind(user).first();
   const branchRow=await db.prepare('SELECT id FROM branches WHERE id=?').bind(branch).first();
   const shift=await db.prepare('SELECT * FROM shifts WHERE id=?').bind(shiftId).first();
   if(!profile||!branchRow||!shift)invalid('Nhân viên, cửa hàng hoặc ca chưa tồn tại');
   const {starts_at,ends_at}=shiftInterval(b.work_date,shift.start_time,shift.end_time);
   if(b.id&&!await db.prepare('SELECT id FROM assignments WHERE id=?').bind(id).first())throw new ApiError(404,'Không tìm thấy phân ca');
   // Historical assignments and overlaps are rejected by D1 triggers atomically.
   const statement=b.id?db.prepare('UPDATE assignments SET user_id=?,branch_id=?,shift_id=?,work_date=?,starts_at=?,ends_at=?,grace_minutes=? WHERE id=?').bind(user,branch,shiftId,b.work_date,starts_at,ends_at,shift.grace_period,id):db.prepare('INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,?,?,?,?,?,?)').bind(id,user,branch,shiftId,b.work_date,starts_at,ends_at,shift.grace_period);
   await db.batch([statement,audit({user_id:user,branch_id:branch,shift_id:shiftId,work_date:b.work_date,starts_at,ends_at,grace_minutes:shift.grace_period})]);
   return reply({id,starts_at,ends_at},b.id?200:201);
  }
  const user=identifier(b.user_id);
  if(!Array.isArray(b.branch_ids)||b.branch_ids.length>14||new Set(b.branch_ids).size!==b.branch_ids.length)invalid('Danh sách tối đa 14 cửa hàng không hợp lệ');
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
