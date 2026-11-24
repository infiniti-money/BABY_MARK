// Pure export from authorized, currently displayed report rows, never refetch or mix scopes.
const n=v=>Number.isFinite(v)?v:0,hrs=v=>Math.round(v/60*100)/100;
const stamp=v=>v==null?'':new Date(v+7*3600000).toISOString().slice(0,19).replace('T',' ');
const units=r=>r.summary?.work_units??r.summary?.days??0;
const labels={ABSENT_RECORD:'Vắng / chưa có công',MISSING_IN:'Chưa vào ca',MISSING_OUT:'Thiếu chấm ra',LATE:'Đi muộn',EARLY:'Về sớm',OUTSIDE:'Ngoài vùng GPS',INVALID_TIME:'Giờ không hợp lệ'};
const pending=r=>r.request_state==='PENDING'||r.extra_state==='PENDING',rejected=r=>r.extra_state==='REJECTED';
const flags=r=>Array.isArray(r.exception_flags)?r.exception_flags:[];
function grouped(rows,key){const m=new Map();for(const r of rows){const k=key(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r);}return [...m.values()];}
export function attendanceTotals(rows){
 const people=new Set(),days=new Set(),leaves=new Set();
 const t={employees:0,assignments:rows.length,days:0,completed:0,work_units:0,minutes:0,overtime_minutes:0,late:0,early:0,leave_days:0,absent:0,missing_in:0,missing_out:0,outside:0,invalid:0,pending:0,rejected:0};
 for(const r of rows){const s=r.summary||{},key=r.user_id+':'+r.work_date;people.add(r.user_id);if(s.days){days.add(key);t.completed++;}if(s.leave)leaves.add(key);t.work_units+=n(units(r));t.minutes+=n(s.minutes);t.overtime_minutes+=n(s.overtime_minutes);t.late+=n(s.late);t.early+=n(s.early);
  const f=flags(r);t.absent+=Number(f.includes('ABSENT_RECORD'));t.missing_in+=Number(f.includes('MISSING_IN'));t.missing_out+=Number(f.includes('MISSING_OUT'));t.outside+=Number(f.includes('OUTSIDE'));t.invalid+=Number(f.includes('INVALID_TIME'));t.pending+=Number(pending(r));t.rejected+=Number(rejected(r));
 }
 return {...t,employees:people.size,days:days.size,leave_days:leaves.size};
}
const metricKeys=['assignments','days','completed','work_units','minutes','overtime_minutes','late','early','leave_days','absent','missing_in','missing_out','outside','invalid','pending','rejected'];
const metricNames=['Ca ghi trong báo cáo','Ngày có ca đủ lượt','Ca đủ lượt hợp lệ','Công quy đổi','Phút ghi nhận','Làm thêm sau ca (phút)','Muộn (phút)','Sớm (phút)','Ngày nghỉ duyệt','Ca vắng','Ca chưa vào','Ca thiếu chấm ra','Ca ngoài vùng','Ca giờ sai','Ca chờ duyệt','Ca bổ sung từ chối'];
const metricValues=t=>metricKeys.map(k=>t[k]);
export function attendanceSheets(data,rows,title,subtitle,headers,detail){
 const t=attendanceTotals(rows),staff=grouped(rows,r=>r.user_id),stores=grouped(rows,r=>r.branch_id||r.branch_code||r.branch_name||'');
 const dayStart=Date.parse(data.from+'T00:00:00Z'),dayEnd=Date.parse(data.to+'T00:00:00Z');
 if(!Number.isFinite(dayStart)||!Number.isFinite(dayEnd)||dayEnd<dayStart||dayEnd-dayStart>92*86400000)throw Error('Khoảng ngày xuất Excel không hợp lệ');
 const dates=Array.from({length:(dayEnd-dayStart)/86400000+1},(_,i)=>new Date(dayStart+i*86400000).toISOString().slice(0,10));
 const daily=new Map();for(const r of rows){if(rejected(r))continue;const key=r.user_id+':'+r.work_date;daily.set(key,(daily.get(key)||0)+n(units(r)));}
 const detailsComplete=rows.every(r=>Array.isArray(r.exception_flags));
 const notes='Chỉ các ca thuộc phạm vi được cấp quyền và bộ lọc đã tải. Không bao gồm nhân viên chưa có ca trong kỳ.';
 const sheets=[
 {name:'Tổng quan',title,subtitle,headers:['Hạng mục','Giá trị','Ghi chú'],rows:[['Từ ngày',data.from,'Ngày công Việt Nam'],['Đến ngày',data.to,'Ngày công Việt Nam'],['Thời điểm đối soát',stamp(data.computed_at),'Theo dữ liệu đã tải'],['Nhân viên có ca',t.employees,notes],...metricKeys.map((k,i)=>[metricNames[i],t[k],['absent','missing_in','missing_out','outside','invalid'].includes(k)&&!detailsComplete?'Thiếu cờ đối soát trong dữ liệu cũ':'' ]),['Giờ làm ghi nhận',hrs(t.minutes),'Không tự tính tiền lương'],['Quy tắc công','Ca thường 1, cả ngày 2','Dùng công quy đổi từ máy chủ; ca chờ duyệt chưa cộng công'],['Chú giải','Trống = không có ca; 0 = có ca chưa được tính công','Ca từ chối không đưa vào ô ngày; xem Chi tiết ca.']]},
 {name:'Tổng hợp nhân viên',title,subtitle,headers:['Mã NV','Họ tên','Bộ phận',...metricNames,'Giờ ghi nhận','Cửa hàng làm việc'],freezeCols:3,rows:staff.map(g=>{const r=g[0],a=attendanceTotals(g);return [r.employee_code,r.full_name,r.department,...metricValues(a),hrs(a.minutes),[...new Set(g.map(v=>v.branch_name).filter(Boolean))].join(', ')];})},
 {name:'Theo cửa hàng',title,subtitle,headers:['Mã cửa hàng','Cửa hàng','Nhân viên có ca',...metricNames,'Giờ ghi nhận'],freezeCols:2,rows:stores.map(g=>{const a=attendanceTotals(g),r=g[0];return [r.branch_code,r.branch_name,a.employees,...metricValues(a),hrs(a.minutes)];})},
 {name:'Công từng ngày',title,subtitle:subtitle+' · Trống: không có ca; 0: chưa tính công; 1/2: công quy đổi. Ca từ chối không tính.',headers:['Mã NV','Họ tên','Bộ phận',...dates.map(d=>d.slice(8)+'/'+d.slice(5,7)),'Tổng công','Làm thêm (phút)'],freezeCols:3,rows:staff.map(g=>{const r=g[0],a=attendanceTotals(g);return [r.employee_code,r.full_name,r.department,...dates.map(d=>daily.get(r.user_id+':'+d)??null),a.work_units,a.overtime_minutes];})},
 {name:'Chi tiết từng ca',title,subtitle,headers:[...headers,'GPS ngoài vùng','Đã điều chỉnh','Cần đối soát'],freezeCols:3,rows:rows.map(r=>[...detail(r),r.summary?.outside?'Có':'Không',r.summary?.adjusted?'Có':'Không',flags(r).map(v=>labels[v]||v).join('; ')])},
 {name:'Cần đối soát',title,subtitle:subtitle+' · Cảnh báo không phải quyết định kỷ luật hoặc khấu trừ.',headers:['Ngày','Mã NV','Họ tên','Bộ phận','Cửa hàng','Ca','Vào lịch','Ra lịch','Vào gốc','Ra gốc','Trạng thái','Cảnh báo','Muộn (phút)','Sớm (phút)','Làm thêm (phút)','Yêu cầu','Duyệt'],freezeCols:3,rows:rows.filter(r=>flags(r).length||pending(r)||rejected(r)).map(r=>[r.work_date,r.employee_code,r.full_name,r.department,r.branch_name,r.shift_name,stamp(r.starts_at),stamp(r.ends_at),stamp(r.in_at),stamp(r.out_at),r.summary?.status,[...flags(r).map(v=>labels[v]||v),...(pending(r)?['Chờ duyệt']:[]),...(rejected(r)?['Ca bổ sung bị từ chối']:[])].join('; '),n(r.summary?.late),n(r.summary?.early),n(r.summary?.overtime_minutes),r.request_kind||r.extra_kind,r.request_state||r.extra_state])}
 ];
 return sheets;
}
