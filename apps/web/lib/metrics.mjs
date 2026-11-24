export function summarize(rows, now=Date.now()){
 const logs=rows.filter(Boolean),i=logs.find(r=>r.type==='IN'),o=logs.find(r=>r.type==='OUT');
 const end=rows.ends_at;
 const outside=logs.some(r=>r.status==='OUTSIDE');
 return {status:outside?'Ngoài vùng':!i?(end&&Date.parse(end)<now?'Vắng':'Chưa vào ca'):!o?'Đang làm':i.late_minutes||o.early_minutes?'Thiếu giờ':'Đủ công',
 minutes:i&&o?Math.max(0,Math.floor((Date.parse(o.server_timestamp)-Date.parse(i.server_timestamp))/60000)):0,
 late:i?.late_minutes||0,early:o?.early_minutes||0,days:i&&o&&!outside?1:0};
}
export function dayVN(d=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
