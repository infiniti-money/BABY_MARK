import {actorFor,apiFailure,ApiError,identifier,invalid,textField,csvCell,managementAudit} from '../../../cloudflare/lib/access.mjs';
import {reply,bodyJSON} from '../../../cloudflare/lib/auth.mjs';
import {monthBounds,payrollDraft} from '../../../cloudflare/lib/payroll.mjs';
const ready=async db=>!!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_closings'").first();
const snapshots=(db,m)=>db.prepare('SELECT revision,created_at,reason FROM payroll_closings WHERE month=? ORDER BY revision DESC').bind(m).all();
function csv(d){
 const columns=['Mã NV','Nhân viên','Bộ phận','Ngày công','Ca đủ công','Phút dự kiến','Phút thực tế','Phút trong ca','Phút ngoài ca','Ca nghỉ duyệt','Ca vắng','Ca cần kiểm tra','Đơn giá giờ VND','Tiền giờ trong ca','Khoản cộng','Khoản trừ','Tổng dự kiến','Ghi chú'];
 const rows=d.rows.map(r=>[r.employee_code,r.full_name,r.department,r.days,r.shifts,r.planned_minutes,r.worked_minutes,r.regular_minutes,r.extra_minutes,r.leave_shifts,r.absence_shifts,r.issues,r.hourly_rate,r.base,r.additions,r.deductions,r.estimated_total,r.note]);
 return new Response('\uFEFF'+[columns,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="BABY_MARK_PAYROLL_'+d.month+'.csv"'}});
}
export async function onRequestGet({request,env}){
 try{
 const actor=await actorFor(request,env,{admin:true}),db=env.DB,u=new URL(request.url);
 if(!await ready(db))return reply({available:false});
 const month=u.searchParams.get('month');monthBounds(month);
 const revision=u.searchParams.get('revision');let data;
 if(revision!==null){
  if(!/^\d{1,9}$/.test(revision)||Number(revision)<1)invalid('Phiên bản không hợp lệ');
  const row=await db.prepare('SELECT snapshot_json FROM payroll_closings WHERE month=? AND revision=?').bind(month,Number(revision)).first();
  if(!row)throw new ApiError(404,'Không có bản chốt');data=JSON.parse(row.snapshot_json);
 }else data=await payrollDraft(db,actor,month);
 if(u.searchParams.get('format')==='csv')return csv(data);
 return reply({available:true,data,revisions:(await snapshots(db,month)).results,selected_revision:revision===null?null:Number(revision)});
 }catch(e){return apiFailure(e)}
}
export async function onRequestPost({request,env}){
 try{
 const actor=await actorFor(request,env,{admin:true}),db=env.DB,b=await bodyJSON(request);
 if(!await ready(db))throw new ApiError(409,'Cần migration 0014');
 const month=b.month;monthBounds(month);
 if(b.action==='save-input'){
  const id=identifier(b.user_id),note=textField(b.note??'',500,true);
  for(const [v,max] of [[b.hourly_rate,10000000],[b.additions,1000000000],[b.deductions,1000000000]])if(!Number.isInteger(v)||v<0||v>max)invalid('Nhập số nguyên VND không âm trong giới hạn');
  if((b.additions||b.deductions)&&note.length<5)invalid('Cần ghi chú các khoản điều chỉnh');
  if(!await db.prepare("SELECT id FROM profiles WHERE id=? AND role<>'admin'").bind(id).first())invalid('Nhân viên không hợp lệ');
  await db.batch([db.prepare('INSERT INTO payroll_inputs(month,user_id,hourly_rate,additions,deductions,note,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(month,user_id) DO UPDATE SET hourly_rate=excluded.hourly_rate,additions=excluded.additions,deductions=excluded.deductions,note=excluded.note,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(month,id,b.hourly_rate,b.additions,b.deductions,note,actor.id,Date.now()),managementAudit(db,actor,'payroll',month,'SAVE_INPUT',{user_id:id})]);
  return reply({ok:true});
 }
 if(b.action==='close'){
  const reason=textField(b.reason,500);if(reason.length<5||b.reviewed!==true)invalid('Cần lý do và xác nhận đối soát');
  const draft=await payrollDraft(db,actor,month);
  if(!draft.month_ended||draft.pending||draft.missing_rates||!draft.rows.length)throw new ApiError(409,'Chỉ chốt tháng đã kết thúc, đủ đơn giá và không có yêu cầu chờ duyệt');
  if(draft.rows.some(r=>r.estimated_total<0))throw new ApiError(409,'Có tổng âm, kiểm tra khoản điều chỉnh');
  const latest=(await snapshots(db,month)).results[0]?.revision??0;
  if(b.expected_revision!==latest)throw new ApiError(409,'Đã có bản chốt khác; tải lại');
  const revision=latest+1;
  await db.batch([db.prepare('INSERT INTO payroll_closings(month,revision,snapshot_json,created_by,created_at,reason) VALUES(?,?,?,?,?,?)').bind(month,revision,JSON.stringify(draft),actor.id,Date.now(),reason),managementAudit(db,actor,'payroll',month,'CLOSE',{revision})]);
  return reply({ok:true,revision},201);
 }
 invalid('Thao tác không hợp lệ');
 }catch(e){return apiFailure(e)}
}
