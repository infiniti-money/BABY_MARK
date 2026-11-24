export function summarize(rows, now=Date.now(), request=null, assignment=null){
 if(request?.state==='APPROVED'&&request.kind==='LEAVE')return {status:'Nghỉ đã duyệt',minutes:0,late:0,early:0,days:0,leave:1,adjusted:false};
 const logs=rows.filter(Boolean);
 let i=logs.find(r=>r.type==='IN'),o=logs.find(r=>r.type==='OUT');
 const end=assignment?.ends_at??rows.ends_at,start=assignment?.starts_at;
 const adjusted=request?.state==='APPROVED'&&request.kind==='CORRECTION'&&!!assignment;
 if(adjusted){
 const t=Date.parse(request.proposed_in),u=Date.parse(request.proposed_out),s=Date.parse(start),e=Date.parse(end);
 i={server_timestamp:request.proposed_in,late_minutes:t>s+(assignment.grace_minutes||0)*60000?Math.ceil((t-s)/60000):0};
 o={server_timestamp:request.proposed_out,early_minutes:Math.max(0,Math.ceil((e-u)/60000))};
 }
 const outside=!adjusted&&logs.some(r=>r.status==='OUTSIDE');
 const elapsed=i&&o?Date.parse(o.server_timestamp)-Date.parse(i.server_timestamp):NaN;
 const valid=Number.isFinite(elapsed)&&elapsed>=0;
 const late=i?.late_minutes||0,early=o?.early_minutes||0,ended=end&&Date.parse(end)<now;
 const status=outside?'Ngoài vùng':!i?(ended?'Vắng':start&&Date.parse(start)+(assignment?.grace_minutes||0)*60000<now?'Chưa vào / muộn':'Chưa vào ca'):!o?(ended?'Thiếu chấm ra':late?'Đang làm / muộn':'Đang làm'):!valid?'Cần kiểm tra':late&&early?'Muộn / về sớm':late?'Đi muộn':early?'Về sớm':'Đủ công';
 return {status,minutes:valid&&!outside?Math.floor(elapsed/60000):0,late,early,days:valid&&!outside?1:0,leave:0,adjusted};
}
export function aggregateDays(entries){
 const workDates=new Set(),leaveDates=new Set();let minutes=0,late=0,early=0,shifts=0;
 for(const {work_date,summary:s} of entries){if(s.days){workDates.add(work_date);shifts++}if(s.leave)leaveDates.add(work_date);minutes+=s.minutes;late+=s.late;early+=s.early}
 return {days:workDates.size,shifts,leaveDays:leaveDates.size,minutes,late,early};
}
export function dayVN(d=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
