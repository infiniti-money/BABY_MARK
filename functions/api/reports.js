import {reply} from '../../cloudflare/lib/auth.mjs';
import {actorFor,apiFailure,csvCell,invalid} from '../../cloudflare/lib/access.mjs';
import {readAssignments,summarizeAssignment,summarizeReport} from '../../cloudflare/lib/reports.mjs';
import {groupBranchReports,attendanceExceptions} from '../../cloudflare/lib/attendance-exceptions.mjs';

const localTime=timestamp=>timestamp==null?'':new Date(timestamp+7*3600000).toISOString().slice(0,19).replace('T',' ');
export async function onRequestGet({request,env}){
 try{
  const actor=await actorFor(request,env),url=new URL(request.url),paginate=url.searchParams.has('page_size'),summaryOnly=url.searchParams.get('view')==='summary';
  const hasCursor=['after_date','after_start','after_code','after_id'].some(k=>url.searchParams.has(k));
  if((hasCursor&&!paginate)||(paginate&&(summaryOnly||url.searchParams.get('format')==='csv')))invalid('Không kết hợp phân trang với tổng hợp hoặc xuất CSV');
  const compact=summaryOnly&&url.searchParams.get('format')!=='csv';
  const {assignments,from,to,...page}=await readAssignments(env.DB,actor,url,{paginate,summaryOnly:compact});
  if(paginate){const now=Date.now();return reply({rows:assignments.map(row=>{const summary=summarizeAssignment(row,now);return {...row,summary,exception_flags:attendanceExceptions(row,now,summary)}}),from,to,...page,computed_at:now,summary_scope:'none',timezone:'Asia/Ho_Chi_Minh',payroll_ready:false});}
  const now=Date.now(),rows=assignments.map(row=>{const summary=summarizeAssignment(row,now);return {...row,summary,...(compact?{}:{exception_flags:attendanceExceptions(row,now,summary)})}}),summary=summarizeReport(rows),branches=groupBranchReports(rows,now);
  if(url.searchParams.get('format')==='csv'){
   const headers=['Ngày công','Mã NV','Nhân viên','Cửa hàng','Ca','Vào dự kiến (GMT+7)','Ra dự kiến (GMT+7)','Vào ghi nhận gốc (GMT+7)','Ra ghi nhận gốc (GMT+7)','Vào điều chỉnh đã duyệt (GMT+7)','Ra điều chỉnh đã duyệt (GMT+7)','Trạng thái','Phút làm','Công quy đổi','Làm thêm sau ca (phút)','Muộn (phút)','Về sớm (phút)','Điều chỉnh đã duyệt','Ngoài vùng','Nguồn ảnh vào','Nguồn ảnh ra','Loại ca bổ sung','Duyệt ca bổ sung','Người được thay','Lý do ca bổ sung','Khoảng cách vào (m)','Sai số GPS vào (m)','Khoảng cách ra (m)','Sai số GPS ra (m)'];
   const lines=[headers,...rows.map(row=>[row.work_date,row.employee_code,row.full_name,row.branch_name,row.shift_name,localTime(row.starts_at),localTime(row.ends_at),localTime(row.in_at),localTime(row.out_at),row.summary.adjusted?localTime(row.proposed_in):'',row.summary.adjusted?localTime(row.proposed_out):'',row.summary.status,row.summary.minutes,row.summary.work_units,row.summary.overtime_minutes,row.summary.late,row.summary.early,row.summary.adjusted?'Có':'Không',row.summary.outside?'Có':'Không',row.in_photo_source??'',row.out_photo_source??'',row.extra_kind??'',row.extra_state??'',row.replaced_name??'',row.extra_reason??'',row.in_distance_m??'',row.in_accuracy_m??'',row.out_distance_m??'',row.out_accuracy_m??''])];
   return new Response('\uFEFF'+lines.map(line=>line.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="BABY_MARK_${from}_${to}.csv"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  return reply({...(!summaryOnly?{rows}:{}),summary,branches,from,to,computed_at:now,summary_scope:'filter',timezone:'Asia/Ho_Chi_Minh',payroll_ready:false});
 }catch(error){return apiFailure(error)}
}
