import {assignmentScope,dateRange,identifier,validDay,invalid,ApiError} from './access.mjs';

export async function readAssignments(db,actor,url,{paginate=false,summaryOnly=false}={}){
 const {from,to}=dateRange(url),scope=assignmentScope(actor),conditions=[scope.sql,'a.work_date>=?','a.work_date<=?'],values=[...scope.values,from,to];
 for(const [parameter,column] of [['branch_id','a.branch_id'],['user_id','a.user_id']]){
  const value=url.searchParams.get(parameter);
  if(value){conditions.push(`${column}=?`);values.push(identifier(value));}
 }
 let size,cursor;
 if(paginate){
  const raw=url.searchParams.get('page_size');
  if(!/^[1-9]\d{0,2}$/.test(raw??'')||Number(raw)>100)invalid('Kích thước trang từ 1 đến 100');
  size=Number(raw);
  const parts=['after_date','after_start','after_code','after_id'].map(k=>url.searchParams.get(k));
  if(parts.some(v=>v!==null)){
   const [date,start,code,id]=parts;
   if(parts.some(v=>v===null)||!validDay(date)||date<from||date>to||!/^\d{1,16}$/.test(start)||!Number.isSafeInteger(Number(start))||!code||code.length>120)invalid('Mốc phân trang không hợp lệ');
   cursor={date,start:Number(start),code,id:identifier(id)};
  }
 }
 const extra=!!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='extra_attendance'").first();
 const reviews=!!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_unit_reviews'").first();
 const order='a.work_date,a.starts_at,p.employee_code,a.id';
 // Page assignment keys first: costly attendance/request/review joins see at most size+1 rows.
 const pageWhere=cursor?' AND (a.work_date,a.starts_at,p.employee_code,a.id)>(?,?,?,?)':'';
 const prefix=paginate?`WITH selected AS (SELECT a.id FROM assignments a JOIN profiles p ON p.id=a.user_id WHERE ${conditions.join(' AND ')}${pageWhere} ORDER BY ${order} LIMIT ?) `:'';
 // The compact projection retains every field used by workUnitEvidence,
 // summarizeAssignment and groupBranchReports, including raw evidence IDs.
 // Keep the same joins, filters, precedence, ordering and 5000-row limit.
 const compact=summaryOnly&&!paginate;
 const projection=compact?`a.id,a.user_id,a.branch_id,a.shift_id,a.work_date,a.starts_at,a.ends_at,a.grace_minutes,
 ${reviews?'u.id AS unit_review_id,u.evidence AS unit_review_evidence,u.units AS unit_review_units,':''}
 ${extra?'x.state AS extra_state,':''}b.name AS branch_name,b.code AS branch_code,
 i.id AS in_id,i.server_timestamp AS in_at,i.status AS in_status,
 o.id AS out_id,o.server_timestamp AS out_at,o.status AS out_status,
 r.id AS request_id,r.kind AS request_kind,r.state AS request_state,r.proposed_in,r.proposed_out`:`a.*,${reviews?'u.id AS unit_review_id,u.evidence AS unit_review_evidence,u.units AS unit_review_units,':''}${extra?'x.kind AS extra_kind,x.state AS extra_state,x.replaced_name,x.reason AS extra_reason,':''}p.employee_code,p.full_name,p.department,b.name AS branch_name,b.code AS branch_code,b.address_text,b.latitude,b.longitude,b.allowed_radius,s.name AS shift_name,
 i.id AS in_id,i.server_timestamp AS in_at,i.status AS in_status,i.late_minutes AS in_late,i.distance_m AS in_distance_m,i.accuracy_m AS in_accuracy_m,i.photo_source AS in_photo_source,
 o.id AS out_id,o.server_timestamp AS out_at,o.status AS out_status,o.early_minutes AS out_early,o.distance_m AS out_distance_m,o.accuracy_m AS out_accuracy_m,o.photo_source AS out_photo_source,
 r.id AS request_id,r.kind AS request_kind,r.state AS request_state,r.proposed_in,r.proposed_out,r.decided_by,r.decided_at`;
 const sql=prefix+`SELECT ${projection}
 FROM ${paginate?'selected JOIN assignments a ON a.id=selected.id':'assignments a'} JOIN profiles p ON p.id=a.user_id JOIN branches b ON b.id=a.branch_id JOIN shifts s ON s.id=a.shift_id
${extra?' LEFT JOIN extra_attendance x ON x.assignment_id=a.id':''}
 ${reviews?'LEFT JOIN work_unit_reviews u ON u.id=(SELECT max(w.id) FROM work_unit_reviews w WHERE w.assignment_id=a.id)':''}
 LEFT JOIN attendances i ON i.assignment_id=a.id AND i.type='IN'
 LEFT JOIN attendances o ON o.assignment_id=a.id AND o.type='OUT'
 LEFT JOIN workforce_requests r ON r.id=(SELECT wr.id FROM workforce_requests wr WHERE wr.assignment_id=a.id ORDER BY CASE wr.state WHEN 'APPROVED' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,wr.created_at DESC,wr.id DESC LIMIT 1)
 ${paginate?'':'WHERE '+conditions.join(' AND ')} ORDER BY ${order}${paginate?'':' LIMIT 5001'}`;
 const {results}=await db.prepare(sql).bind(...values,...(cursor?[cursor.date,cursor.start,cursor.code,cursor.id]:[]),...(paginate?[size+1]:[])).all();
 if(paginate){
  const assignments=results.slice(0,size),last=assignments.at(-1);
  return {assignments,from,to,page_size:size,next:results.length>size?{after_date:last.work_date,after_start:last.starts_at,after_code:last.employee_code,after_id:last.id}:null};
 }
 if(results.length>5000)throw new ApiError(413,'Báo cáo quá 5.000 ca. Chọn khoảng ngày hoặc cửa hàng nhỏ hơn.');
 return {assignments:results,from,to};
}

export function workUnitEvidence(a){return JSON.stringify([a.id,a.user_id,a.branch_id,a.shift_id,a.starts_at,a.ends_at,a.grace_minutes,a.in_id,a.out_id,a.in_at,a.out_at,a.in_status,a.out_status,a.request_id,a.request_kind,a.request_state,a.proposed_in,a.proposed_out,a.extra_state]);}
export function summarizeAssignment(row,now=Date.now()){
 const outside=row.in_status==='OUTSIDE'||row.out_status==='OUTSIDE';
 if(row.extra_state&&row.extra_state!=='APPROVED')return {status:row.extra_state==='PENDING'?'Ca bổ sung chờ duyệt':'Ca bổ sung bị từ chối',minutes:0,late:0,early:0,days:0,work_units:0,overtime_minutes:0,leave:0,adjusted:false,outside};
 if(row.request_state==='APPROVED'&&row.request_kind==='LEAVE')return {status:'Nghỉ đã duyệt',minutes:0,late:0,early:0,days:0,work_units:0,overtime_minutes:0,leave:1,adjusted:false,outside};
 const adjusted=row.request_state==='APPROVED'&&row.request_kind==='CORRECTION';
 const entry=adjusted?row.proposed_in:row.in_at,exit=adjusted?row.proposed_out:row.out_at;
 const late=entry!=null&&entry>row.starts_at+row.grace_minutes*60000?Math.ceil((entry-row.starts_at)/60000):0;
 const early=exit!=null?Math.max(0,Math.ceil((row.ends_at-exit)/60000)):0;
 const complete=entry!=null&&exit!=null&&exit>entry;
 let status=outside?'Ngoài vùng':entry==null&&exit!=null?'Cần kiểm tra':entry==null?(now>row.ends_at?'Vắng':now>row.starts_at+row.grace_minutes*60000?'Chưa vào / muộn':'Chưa vào ca'):exit==null?(now>row.ends_at?'Thiếu chấm ra':'Đang làm'):!complete?'Cần kiểm tra':late&&early?'Muộn / về sớm':late?'Đi muộn':early?'Về sớm':'Đủ công';
 if(adjusted)status='Điều chỉnh đã duyệt'+(outside?' / ngoài vùng':'');
 const fullDay=row.shift_id==='BM-ALLDAY',shortFullDay=fullDay&&complete&&!outside&&(entry>row.starts_at+row.grace_minutes*60000||exit<row.ends_at);
 const reviewed=shortFullDay&&row.request_state!=='PENDING'&&row.unit_review_id!=null&&row.unit_review_evidence===workUnitEvidence(row)&&[0,0.5,1,1.5,2].includes(row.unit_review_units);
 if(shortFullDay)status=reviewed?'Ca cả ngày đã đối soát':'Ca cả ngày cần đối soát';
 return {status,short_full_day:shortFullDay,work_unit_review:shortFullDay&&!reviewed,work_unit_review_id:reviewed?row.unit_review_id:null,minutes:complete&&!outside?Math.floor((exit-entry)/60000):0,late,early,days:complete&&!outside?1:0,work_units:complete&&!outside&&exit>entry&&row.request_state!=='PENDING'?(shortFullDay?(reviewed?row.unit_review_units:0):(fullDay?2:1)):0,overtime_minutes:complete&&!outside&&row.request_state!=='PENDING'?Math.max(0,Math.floor((exit-Math.max(entry,row.ends_at))/60000)):0,leave:0,adjusted,outside};
}

export function summarizeReport(rows){
 const dates=new Set(),leaveDates=new Set(),employees=new Set();let minutes=0,late=0,early=0,shifts=0,work_units=0,overtime_minutes=0;
 for(const row of rows){
  const s=row.summary,key=row.user_id+':'+row.work_date;employees.add(row.user_id);
  if(s.days){dates.add(key);shifts++;}
  if(s.leave)leaveDates.add(key);
  minutes+=s.minutes;late+=s.late;early+=s.early;work_units+=s.work_units??s.days??0;overtime_minutes+=s.overtime_minutes??0;
 }
 return {days:dates.size,shifts,work_units,overtime_minutes,leaveDays:leaveDates.size,minutes,late,early,employees:employees.size,assignments:rows.length};
}
