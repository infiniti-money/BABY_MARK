import {cvFields,hrFields} from './employee-cv.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=v=>v?String(v).split('-').reverse().join('/'):'—';
export function cvPrint(d){
 if(!d?.available||!d.profile)throw Error('Hồ sơ chưa sẵn sàng');
 const p=d.profile,cv=d.cv||{},hrKeys=new Set(hrFields.map(f=>f[0])),roles={admin:'Quản trị',manager:'Quản lý',staff:'Nhân viên'};
 const render=fields=>fields.map(([key,label,type])=>'<div class="cv-print-field"><strong>'+esc(label)+'</strong><p>'+esc(cv[key]?(type==='date'?day(cv[key]):cv[key]):'Chưa cập nhật')+'</p></div>').join('');
 return '<article class="a4-doc cv-print"><header><img src="/brand/logo.png" alt="" width="48" height="53"><h2>BABY MARK</h2><h3>HỒ SƠ NHÂN SỰ / CV</h3><p>BẢO MẬT · Bản đã lưu #'+esc(d.revision)+'</p></header><h3>'+esc(p.full_name)+'</h3><p>'+esc(p.employee_code)+' · '+esc(roles[p.role]||p.role)+' · '+esc(p.department||'Chưa cập nhật')+'</p><h3>Thông tin cá nhân và năng lực</h3>'+render(cvFields.filter(f=>!hrKeys.has(f[0])))+'<h3>Hợp đồng và phát triển nhân sự</h3>'+render(hrFields)+'<h3>Quá trình làm việc đã xác nhận</h3><ul>'+((d.periods||[]).map(x=>'<li>'+esc(day(x.start_date))+' – '+esc(x.end_date?day(x.end_date):'Đang mở')+'</li>').join('')||'<li>Chưa xác nhận</li>')+'</ul><h3>Cửa hàng từng được phân ca</h3><p>'+esc((d.branches||[]).map(x=>x.code+' · '+x.name).join('; ')||'Chưa có lịch')+'</p><p>Hồ sơ tham chiếu nội bộ, không thay thế hợp đồng đã ký hoặc quyết định lương. Lịch phân ca không chứng minh ngày làm thực tế.</p></article>';
}
