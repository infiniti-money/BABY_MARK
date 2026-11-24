import {sessionUser,reply,bodyJSON} from '../../../cloudflare/lib/auth.mjs';
import {makeTimemark,distanceMeters} from '../../../cloudflare/lib/timemark-layout.mjs';
export async function onRequestPost({request,env}){
 if(!env.DB)return reply({error:'D1 chưa kết nối'},503);
 try{
 const user=await sessionUser(request,env.DB);if(!user)return reply({error:'Chưa đăng nhập'},401);
 const b=await bodyJSON(request),now=Date.now(),{lat,lng,accuracy,type,assignment_id}=b;
 if(typeof assignment_id!=='string'||!['IN','OUT'].includes(type)||![lat,lng,accuracy].every(Number.isFinite)||Math.abs(lat)>90||Math.abs(lng)>180||accuracy<0||accuracy>50||b.mocked===true)return reply({error:'Dữ liệu vị trí không hợp lệ'},400);
 const a=await env.DB.prepare('SELECT a.starts_at,a.ends_at,a.grace_minutes,b.name,b.latitude,b.longitude,b.allowed_radius FROM assignments a JOIN branches b ON b.id=a.branch_id WHERE a.id=? AND a.user_id=?').bind(assignment_id,user.id).first();
 if(!a)return reply({error:'Không có ca được phân công'},404);
 if(a.latitude==null||a.longitude==null)return reply({error:'Cửa hàng chưa cấu hình GPS'},409);
 const distance=distanceMeters(lat,lng,a.latitude,a.longitude);
 const status=distance>a.allowed_radius?'Ngoài vùng':type==='IN'&&now>a.starts_at+a.grace_minutes*60000?'Đi muộn':type==='OUT'&&now<a.ends_at?'Về sớm':'Trong vùng';
 const metadata={serverTimestamp:now,shiftStart:a.starts_at,shiftEnd:a.ends_at,lat,lng,accuracy,distance,radius:a.allowed_radius,type,branchName:a.name,employeeName:user.full_name,employeeCode:user.employee_code,address:'',status};
 return reply({metadata,svg:makeTimemark(metadata,{preview:true}),preview_only:true});
 }catch{return reply({error:'Không tạo được mẫu Timemark'},400)}
}
