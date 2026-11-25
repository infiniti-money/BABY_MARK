import {componentFields,incomeFields,deductionFields,salaryModes} from './payroll-components.mjs';
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const sum=(rows,k)=>rows.some(r=>numeric(r[k]))?rows.reduce((s,r)=>s+(numeric(r[k])?r[k]:0),0):null;
const stamp=v=>v==null?'':new Date(v+7*3600000).toISOString().slice(0,19).replace('T',' ');
const name=r=>r.full_name||'',code=r=>r.employee_code||'';
const unknown='Bản chốt này chưa lưu chi tiết từng ca; không dùng dữ liệu hiện tại để thay thế.';
const totalKeys=['days','shifts','work_units','planned_minutes','worked_minutes','regular_minutes','overtime_minutes','overtime_paid_minutes','leave_shifts','absence_shifts','issues','pending','base','overtime_pay','additions','deductions','estimated_total'];
const totalLabels=['Ngày đủ công','Ca đủ công','Công quy đổi','Phút lịch','Phút thực tế','Phút trong ca','Phút làm thêm sau ca','Phút làm thêm duyệt','Ca nghỉ duyệt','Ca vắng','Ca cần kiểm tra','Ca chờ duyệt','Lương cơ bản','Tiền làm thêm','Tổng khoản cộng','Tổng khoản trừ','Tổng lương dự kiến'];
export function payrollSheets(data,rows,title,subtitle,headers,values){
 const d=data.data,known=rows.filter(r=>numeric(r.estimated_total)),missing=rows.length-known.length;
 const sheets=[{name:'Tổng quan',title,subtitle,headers:['Hạng mục','Giá trị','Ghi chú'],rows:[
 ['Tháng',d.month,'Theo ngày công Việt Nam'],['Phiên bản',data.selected_revision==null?'Dự thảo':'Bản chốt #'+data.selected_revision,'Không phải xác nhận đã thanh toán'],['Thời điểm tính (VN)',stamp(d.computed_at),'Theo dữ liệu đang xem'],
 ['Số nhân viên',rows.length,'Trong phạm vi xuất'],['Đã có tổng lương',known.length,'Có đơn giá/cấu hình'],['Chưa đủ đơn giá',missing,'Không tự coi là lương 0'],
 ...totalKeys.map((k,i)=>[totalLabels[i],sum(rows,k),rows.some(r=>!numeric(r[k]))?'Chỉ cộng dữ liệu đã ghi nhận; có thể chưa đầy đủ':'']),
 ['Tổng quỹ lương đã tính',sum(known,'estimated_total'),missing?'Chưa bao gồm '+missing+' nhân viên thiếu đơn giá':'Đã có số liệu cho tất cả nhân viên'],
 ['Quy tắc','Cơ bản + làm thêm đã duyệt + cộng - trừ','Thuế, bảo hiểm, đơn giá làm thêm do Admin đối soát'],
 ['Giờ chấm công trùng',d.overlap_count??null,d.overlap_count?'Dự thảo chưa loại giờ trùng; không được chốt trước khi đối soát':d.overlap_count==null?'Bản cũ chưa có kiểm tra này':'Không phát hiện trong phạm vi kiểm tra'],
 ['Chi tiết công',d.attendance_detail?.version===1?'Có dữ liệu tại thời điểm tính/chốt':unknown,'Bản cũ giữ nguyên; không lấy dữ liệu công mới để bổ sung bản chốt cũ']
 ]},{name:'Bảng lương đầy đủ',title,subtitle,headers,rows:rows.map(values),freezeCols:3}];
 const groups=new Map();for(const r of rows){const k=r.department||'Chưa phân bộ phận';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 sheets.push({name:'Theo bộ phận',title,subtitle,headers:['Bộ phận','Số nhân viên','Thiếu đơn giá',...totalLabels],rows:[...groups].map(([k,g])=>[k,g.length,g.filter(r=>!numeric(r.estimated_total)).length,...totalKeys.map(key=>sum(g,key))])});
 const adjustments=[['base','Lương cơ bản','Thu nhập'],['overtime_pay','Tiền làm thêm','Thu nhập'],['additions_other','Cộng khác','Thu nhập'],['deductions_other','Trừ khác','Khấu trừ']];
 sheets.push({name:'Chi tiết thu nhập khấu trừ',title,subtitle,headers:['Mã NV','Họ tên','Bộ phận','Nhóm','Hạng mục','Số tiền (VND)','Ghi chú đối soát'],rows:rows.flatMap(r=>[
 ...adjustments.map(([k,label,type])=>[type,label,r[k]]),
 ...incomeFields.map(([k,label])=>['Thu nhập',label,r.components?.[k]]),
 ...deductionFields.map(([k,label])=>['Khấu trừ',label,r.components?.[k]]),
 ...(r.additions_other==null?[['Thu nhập','Khoản cộng (bản cũ)',r.additions]]:[]),
 ...(r.deductions_other==null?[['Khấu trừ','Khoản trừ (bản cũ)',r.deductions]]:[])
 ].filter(([, ,v])=>numeric(v)&&v!==0).map(([type,label,v])=>[code(r),name(r),r.department,type,label,v,r.note]))});
 const stored=d.attendance_detail;
 if(stored?.version!==1||!Array.isArray(stored.records)||!Array.isArray(stored.labels)){
  for(const sheet of ['Công từng ngày','Chi tiết ca'])sheets.push({name:sheet,title,subtitle,headers:['Trạng thái','Ghi chú'],rows:[['Không có dữ liệu lịch sử',unknown]]});
  return sheets;
 }
 const people=new Map(rows.map(r=>[r.id,r])),labels=stored.labels,records=stored.records.filter(a=>people.has(a[0]));
 const days=Array.from({length:new Date(Date.UTC(Number(d.month.slice(0,4)),Number(d.month.slice(5,7)),0)).getUTCDate()},(_,i)=>d.month+'-'+String(i+1).padStart(2,'0'));
 const byDay=new Map();for(const a of records){if(a[13])continue;const key=a[0]+':'+a[1],old=byDay.get(key)||0;byDay.set(key,old+(a[16]||0));}
 sheets.push({name:'Công từng ngày',title,subtitle:subtitle+' · Trống: không có ca; 0: có ca nhưng chưa tính công; 1/2: công quy đổi. Xem chi tiết ca để đối soát.',headers:['Mã NV','Họ tên','Bộ phận',...days.map(v=>v.slice(8)),'Tổng công'],freezeCols:3,rows:rows.map(r=>[code(r),name(r),r.department,...days.map(day=>byDay.get(r.id+':'+day)??null),r.work_units??null])});
 sheets.push({name:'Chi tiết ca',title,subtitle,headers:['Mã NV','Họ tên','Bộ phận','Ngày','Mã cửa hàng','Cửa hàng','Ca','Vào lịch (VN)','Ra lịch (VN)','Vào gốc','Ra gốc','Vào điều chỉnh','Ra điều chỉnh','Trạng thái','Chờ duyệt','Từ chối','Phút thực tế tính công','Phút trong ca','Công quy đổi','Phút làm thêm sau ca','Muộn (phút)','Sớm (phút)','Nghỉ duyệt','Loại yêu cầu','Trạng thái yêu cầu','Loại ca bổ sung','Duyệt bổ sung','Ngoài vùng GPS'],freezeCols:3,rows:records.map(a=>{const r=people.get(a[0]);return [code(r),name(r),r.department,a[1],labels[a[2]],labels[a[3]],labels[a[4]],...a.slice(5,11).map(stamp),labels[a[11]],a[12]?'Có':'Không',a[13]?'Có':'Không',...a.slice(14,20),a[20]?'Có':'Không',...a.slice(21,25).map(i=>labels[i]),a[25]?'Có':'Không'];})});
 return sheets;
}
