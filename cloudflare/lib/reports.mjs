import {assignmentScope,dateRange,identifier,ApiError} from './access.mjs';

export async function readAssignments(db,actor,url){
 const {from,to}=dateRange(url),scope=assignmentScope(actor),conditions=[scope.sql,'a.work_date>=?','a.work_date<=?'],values=[...scope.values,from,to];
 for(const [parameter,column] of [['branch_id','a.branch_id'],['user_id','a.user_id']]){
  const value=url.searchParams.get(parameter);
  if(value){conditions.push(`${column}=?`);values.push(identifier(value));}
 }
 const sql=`SELECT a.*,p.employee_code,p.full_name,p.department,b.name AS branch_name,b.code AS branch_code,b.address_text,b.latitude,b.longitude,b.allowed_radius,s.name AS shift_name,
 i.id AS in_id,i.server_timestamp AS in_at,i.status AS in_status,i.late_minutes AS in_late,i.distance_m AS in_distance_m,i.photo_source AS in_photo_source,
 o.id AS out_id,o.server_timestamp AS out_at,o.status AS out_status,o.early_minutes AS out_early,o.distance_m AS out_distance_m,o.photo_source AS out_photo_source,
 r.id AS request_id,r.kind AS request_kind,r.state AS request_state,r.proposed_in,r.proposed_out,r.decided_by,r.decided_at
 FROM assignments a JOIN profiles p ON p.id=a.user_id JOIN branches b ON b.id=a.branch_id JOIN shifts s ON s.id=a.shift_id
 LEFT JOIN attendances i ON i.assignment_id=a.id AND i.type='IN'
 LEFT JOIN attendances o ON o.assignment_id=a.id AND o.type='OUT'
 LEFT JOIN workforce_requests r ON r.id=(SELECT wr.id FROM workforce_requests wr WHERE wr.assignment_id=a.id ORDER BY CASE wr.state WHEN 'APPROVED' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,wr.created_at DESC,wr.id DESC LIMIT 1)
 WHERE ${conditions.join(' AND ')} ORDER BY a.work_date,a.starts_at,p.employee_code,a.id LIMIT 5001`;
 const {results}=await db.prepare(sql).bind(...values).all();
 if(results.length>5000)throw new ApiError(413,'Báo cáo quá 5.000 ca. Chọn khoảng ngày hoặc cửa hàng nhỏ hơn.');
 return {assignments:results,from,to};
}

export function summarizeAssignment(row,now=Date.now()){
 const outside=row.in_status==='OUTSIDE'||row.out_status==='OUTSIDE';
 if(row.request_state==='APPROVED'&&row.request_kind==='LEAVE')return {status:'Nghỉ đã duyệt',minutes:0,late:0,early:0,days:0,leave:1,adjusted:false,outside};
 const adjusted=row.request_state==='APPROVED'&&row.request_kind==='CORRECTION';
 const entry=adjusted?row.proposed_in:row.in_at,exit=adjusted?row.proposed_out:row.out_at;
 const late=entry!=null&&entry>row.starts_at+row.grace_minutes*60000?Math.ceil((entry-row.starts_at)/60000):0;
 const early=exit!=null?Math.max(0,Math.ceil((row.ends_at-exit)/60000)):0;
 const complete=entry!=null&&exit!=null&&exit>=entry;
 let status=outside?'Ngoài vùng':entry==null?(now>row.ends_at?'Vắng':now>row.starts_at+row.grace_minutes*60000?'Chưa vào / muộn':'Chưa vào ca'):exit==null?(now>row.ends_at?'Thiếu chấm ra':'Đang làm'):!complete?'Cần kiểm tra':late&&early?'Muộn / về sớm':late?'Đi muộn':early?'Về sớm':'Đủ công';
 if(adjusted)status='Điều chỉnh đã duyệt'+(outside?' / ngoài vùng':'');
 return {status,minutes:complete&&!outside?Math.floor((exit-entry)/60000):0,late,early,days:complete&&!outside?1:0,leave:0,adjusted,outside};
}

export function summarizeReport(rows){
 const dates=new Set(),leaveDates=new Set(),employees=new Set();let minutes=0,late=0,early=0,shifts=0;
 for(const row of rows){
  const s=row.summary,key=row.user_id+':'+row.work_date;employees.add(row.user_id);
  if(s.days){dates.add(key);shifts++;}
  if(s.leave)leaveDates.add(key);
  minutes+=s.minutes;late+=s.late;early+=s.early;
 }
 return {days:dates.size,shifts,leaveDays:leaveDates.size,minutes,late,early,employees:employees.size,assignments:rows.length};
}
