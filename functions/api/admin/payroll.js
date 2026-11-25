import {actorFor,apiFailure,ApiError,identifier,invalid,textField,csvCell,managementAudit} from '../../../cloudflare/lib/access.mjs';
import {reply,bodyJSON} from '../../../cloudflare/lib/auth.mjs';
import {readAssignments,summarizeAssignment,workUnitEvidence} from '../../../cloudflare/lib/reports.mjs';
import {monthBounds,payrollDraft,payrollVersion} from '../../../cloudflare/lib/payroll.mjs';
import {componentsReady,validateComponents} from '../../../cloudflare/lib/payroll-components.mjs';
import {componentFields,salaryModes} from '../../../public/payroll-components.mjs';
const ready=async db=>!!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_closings'").first();
const snapshots=(db,m)=>db.prepare('SELECT revision,created_at,reason FROM payroll_closings WHERE month=? ORDER BY revision DESC').bind(m).all();
function csv(d,revision){
 const columns=['Mã NV','Nhân viên','Bộ phận','Ngày công','Ca đủ công','Công quy đổi','Làm thêm sau ca (phút)','Phút dự kiến','Phút thực tế','Phút trong ca','Phút ngoài ca','Ca nghỉ duyệt','Ca vắng','Ca cần kiểm tra','Ca chờ duyệt','Đơn giá giờ VND','Tiền giờ trong ca','Khoản cộng','Khoản trừ','Tổng dự kiến','Ghi chú','Cách tính','Đơn giá công','Lương tháng đã đối soát','Phút làm thêm duyệt','Đơn giá làm thêm','Tiền làm thêm','Cộng khác','Trừ khác',...componentFields.map(([,label])=>label),'Tháng','Phiên bản','Phiên bản nguồn'];
 const rows=d.rows.map(r=>[r.employee_code,r.full_name,r.department,r.days,r.shifts,r.work_units??null,r.overtime_minutes??null,r.planned_minutes,r.worked_minutes,r.regular_minutes,r.extra_minutes,r.leave_shifts,r.absence_shifts,r.issues,r.pending,r.hourly_rate,r.base,r.additions,r.deductions,r.estimated_total,r.note,salaryModes[r.components?.salary_mode]??'',r.components?.unit_rate,r.components?.monthly_base,r.overtime_paid_minutes,r.components?.overtime_rate,r.overtime_pay,r.additions_other,r.deductions_other,...componentFields.map(([k])=>r.components?.[k]),d.month,revision===null?'Dự thảo':'Bản chốt #'+revision,d.source_version??'']);
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
 if(u.searchParams.get('format')==='csv')return csv(data,revision);
 return reply({available:true,data,revisions:(await snapshots(db,month)).results,selected_revision:revision===null?null:Number(revision)});
 }catch(e){return apiFailure(e)}
}
export async function onRequestPost({request,env}){
 try{
 const actor=await actorFor(request,env,{admin:true}),db=env.DB,b=await bodyJSON(request);
 if(!await ready(db))throw new ApiError(409,'Cần migration 0014');
 const month=b.month;monthBounds(month);
 if(b.action==='save-input'){
  const id=identifier(b.user_id),note=textField(b.note??'',500,true),extended=await componentsReady(db),details=b.components===undefined?null:validateComponents(b.components);
  if(details&&!extended)throw new ApiError(409,'Cần migration 0016 để lưu các hạng mục mở rộng');
  if(details&&details.overtime_approved_minutes){const draft=await payrollDraft(db,actor,month),r=draft.rows.find(r=>r.id===id);if(!r||details.overtime_approved_minutes>r.overtime_minutes)invalid('Phút làm thêm duyệt vượt thời gian ghi nhận');if(!details.overtime_rate)invalid('Nhập đơn giá làm thêm đã đối soát');}
  for(const [v,max] of [[b.hourly_rate,10000000],[b.additions,1000000000],[b.deductions,1000000000]])if(!Number.isInteger(v)||v<0||v>max)invalid('Nhập số nguyên VND không âm trong giới hạn');
  if((b.additions||b.deductions||details&&(details.salary_mode==='month'||details.overtime_approved_minutes||componentFields.some(([k])=>details[k])))&&note.length<5)invalid('Cần ghi chú các khoản điều chỉnh');
  if(!await db.prepare("SELECT id FROM profiles WHERE id=? AND role<>'admin'").bind(id).first())invalid('Nhân viên không hợp lệ');
  await db.batch([db.prepare('INSERT INTO payroll_inputs(month,user_id,hourly_rate,additions,deductions,note,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(month,user_id) DO UPDATE SET hourly_rate=excluded.hourly_rate,additions=excluded.additions,deductions=excluded.deductions,note=excluded.note,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(month,id,b.hourly_rate,b.additions,b.deductions,note,actor.id,Date.now()),...(details?[db.prepare('INSERT INTO payroll_components(month,user_id,details_json) VALUES(?,?,?) ON CONFLICT(month,user_id) DO UPDATE SET details_json=excluded.details_json').bind(month,id,JSON.stringify(details))]:[]),managementAudit(db,actor,'payroll',month,'SAVE_INPUT',{user_id:id,extended:!!details})]);
  return reply({ok:true});
 }
 if(b.action==='review-units'){
  if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_unit_reviews'").first())throw new ApiError(409,'Cần migration 0020');
  const id=identifier(b.assignment_id),reason=textField(b.reason,500),units=b.units,version=await payrollVersion(db);
  if(reason.length<5||![0,0.5,1,1.5,2].includes(units)||b.reviewed!==true)invalid('Nhập công đã đối soát và lý do; xác nhận rõ quyết định');
  if(version===null||b.expected_source_version!==version)throw new ApiError(409,'Bảng công đã thay đổi; tải lại');
  const bounds=monthBounds(month),{assignments}=await readAssignments(db,actor,new URL('https://internal.invalid/?from='+bounds.from+'&to='+bounds.to));
  const a=assignments.find(x=>x.id===id),s=a&&summarizeAssignment(a);
  if(!s?.short_full_day||a.request_state==='PENDING'||a.extra_state==='PENDING')throw new ApiError(409,'Chỉ đối soát công ca cả ngày có đủ lượt hợp lệ, không chờ duyệt');
  const result=await db.batch([db.prepare('INSERT INTO work_unit_reviews(assignment_id,evidence,units,reason,reviewed_by,reviewed_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM payroll_epoch WHERE id=1 AND version=?)').bind(id,workUnitEvidence(a),units,reason,actor.id,Date.now(),version),db.prepare("INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at) SELECT ?,?,'payroll',?,'REVIEW_UNITS',?,? WHERE changes()=1").bind(crypto.randomUUID(),actor.id,id,JSON.stringify({units,reason}),Date.now())]);
  if(result[0].meta.changes!==1)throw new ApiError(409,'Dữ liệu đã thay đổi; tải lại');return reply({ok:true},201);
 }
 if(b.action==='close'){
  const reason=textField(b.reason,500);if(reason.length<5||b.reviewed!==true)invalid('Cần lý do và xác nhận đối soát');
  const draft=await payrollDraft(db,actor,month);
  if(!draft.month_ended||draft.pending||draft.missing_rates||!draft.rows.length)throw new ApiError(409,'Chỉ chốt tháng đã kết thúc, đủ đơn giá và không có yêu cầu chờ duyệt');
  if(draft.source_version===null)throw new ApiError(409,'Cần migration 0017 để chốt lương an toàn');
  if(b.expected_source_version!==draft.source_version)throw new ApiError(409,'Dữ liệu đã đổi sau khi xem bảng lương; tải lại và đối soát');
  if(draft.overlap_count)throw new ApiError(409,'Có khoảng giờ chấm công trùng nhau; đối soát giờ vào/ra trước khi chốt lương');
  if(draft.issues)throw new ApiError(409,'Còn ca bất thường chưa được xử lý; không thể chốt lương');
  if(draft.overtime_review_count)throw new ApiError(409,'Thời gian làm thêm đã thay đổi, cần đối soát lại số phút duyệt');
  if(draft.rows.some(r=>r.estimated_total<0))throw new ApiError(409,'Có tổng âm, kiểm tra khoản điều chỉnh');
  const latest=(await snapshots(db,month)).results[0]?.revision??0;
  if(b.expected_revision!==latest)throw new ApiError(409,'Đã có bản chốt khác; tải lại');
  const revision=latest+1,snapshot=JSON.stringify(draft);
  // Stay below D1's single-value limit; never truncate a closing silently.
  if(new TextEncoder().encode(snapshot).length>1800000)throw new ApiError(413,'Bản chốt vượt dung lượng lưu an toàn. Cần kiểm tra số ca và cấu hình trước khi chốt.');
  const result=await db.batch([db.prepare('INSERT INTO payroll_closings(month,revision,snapshot_json,created_by,created_at,reason) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM payroll_epoch WHERE id=1 AND version=?) AND COALESCE((SELECT MAX(revision) FROM payroll_closings WHERE month=?),0)=?').bind(month,revision,snapshot,actor.id,Date.now(),reason,draft.source_version,month,latest),db.prepare("INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at) SELECT ?,?,'payroll',?,'CLOSE',?,? WHERE changes()=1").bind(crypto.randomUUID(),actor.id,month,JSON.stringify({revision,source_version:draft.source_version}),Date.now())]);
  if(result[0].meta.changes!==1)throw new ApiError(409,'Bảng công hoặc phiên bản chốt đã thay đổi; tải lại');
  return reply({ok:true,revision},201);
 }
 invalid('Thao tác không hợp lệ');
 }catch(e){return apiFailure(e)}
}
