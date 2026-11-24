import {authenticatedUser,serviceClient} from '../../../lib/server-auth';
export const runtime='nodejs';
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const valid=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
export async function POST(req){
 try{
 const actor=await authenticatedUser(req),db=serviceClient();
 if(!actor)return Response.json({error:'Unauthorized'},{status:401});
 const {data:admin}=await db.from('profiles').select('role,active').eq('id',actor).single();
 if(admin?.role!=='admin'||!admin.active)return Response.json({error:'Forbidden'},{status:403});
 const b=await req.json();let r;
 if(!uuid(b.auth_id))return Response.json({error:'UUID không hợp lệ'},{status:400});
 if(b.action==='create'&&valid(b.employee_code,40)&&valid(b.full_name,120)&&typeof b.department==='string'&&b.department.length<=100&&['staff','manager'].includes(b.role)){
 const {data,error}=await db.auth.admin.getUserById(b.auth_id);if(error||!data.user)return Response.json({error:'Chưa có tài khoản Auth tương ứng'},{status:400});
 r=await db.from('profiles').insert({id:b.auth_id,employee_code:b.employee_code.trim(),full_name:b.full_name.trim(),department:b.department.trim(),role:b.role,active:true});
 }else if(b.action==='set_active'&&typeof b.active==='boolean'){
 r=await db.from('profiles').update({active:b.active}).eq('id',b.auth_id).neq('role','admin').select('id').single();
 }else if(['grant_branch','revoke_branch'].includes(b.action)&&uuid(b.branch_id)){
 const {data:p}=await db.from('profiles').select('role,active').eq('id',b.auth_id).single();
 if(p?.role!=='manager')return Response.json({error:'Tài khoản không phải quản lý'},{status:400});
 r=b.action==='grant_branch'?await db.from('branch_managers').upsert({user_id:b.auth_id,branch_id:b.branch_id}):await db.from('branch_managers').delete().eq('user_id',b.auth_id).eq('branch_id',b.branch_id);
 }else return Response.json({error:'Dữ liệu không hợp lệ'},{status:400});
 if(r.error)return Response.json({error:'Không thể lưu: '+r.error.message},{status:409});
 return Response.json({ok:true});
 }catch{return Response.json({error:'Lỗi xử lý nhân sự'},{status:500})}
}
