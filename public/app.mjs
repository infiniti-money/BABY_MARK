import {cameraFrame,composeTimemark,currentPosition} from './capture.mjs';
import {isLegacyCode,derivePasswordKey,newPasswordCredential} from './password.mjs';
import {pushRegistration,publicKeyBytes,disableDevicePush} from './push.mjs';
let pushReg=null,pushConfig=null,pushSub=null;

const $ = s => document.querySelector(s);
const app = $('#app'), modal = $('#modal');
const esc = v => String(v ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0112 0v3M16 5a3 3 0 010 6M18 15a5 5 0 013 4v2"/>',store:'<path d="M3 9l2-6h14l2 6M3 9v3a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0V9M5 15v6h14v-6M10 21v-6h4v6"/>',chart:'<path d="M4 3v18h18M9 16v-5M14 16V7M19 16v-9"/>',shield:'<path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',check:'<path d="M5 12l4 4L19 6"/>',download:'<path d="M12 3v12M7 10l5 5 5-5M4 17v4h16v-4"/>',file:'<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/>',pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1116 0z"/><circle cx="12" cy="10" r="3"/>',logout:'<path d="M9 3H4v18h5M9 12h12M16 7l5 5-5 5"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0113 2M18 18a8 8 0 01-13-2"/>',plus:'<path d="M12 4v16M4 12h16"/>'};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.file}</svg>`;
const tz = 'Asia/Ho_Chi_Minh';
const dayString = t => new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
const today = () => dayString(Date.now());
const monthStart = () => today().slice(0,7)+'-01';
const dt = t => t == null ? '—' : new Intl.DateTimeFormat('vi-VN',{timeZone:tz,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(Number(t));
const hm = t => t == null ? '—' : new Intl.DateTimeFormat('vi-VN',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(Number(t));
const dateVN = v => v ? String(v).split('-').reverse().join('/') : '—';
const roles = {admin:'Quản trị hệ thống',manager:'Quản lý cửa hàng',staff:'Nhân viên'};
const statusNames = {ON_TIME:'Đúng giờ',LATE:'Đi muộn',EARLY:'Về sớm',OUTSIDE:'Ngoài vùng',PENDING:'Chờ duyệt',APPROVED:'Đã duyệt',REJECTED:'Từ chối',LEAVE:'Nghỉ phép',CORRECTION:'Điều chỉnh',COMPLETE:'Hoàn tất',COMPLETED:'Hoàn tất',MISSING:'Thiếu chấm công',ABSENT:'Chưa chấm công',IN_PROGRESS:'Đang làm',SCHEDULED:'Chưa đến ca',PARTIAL:'Chưa đủ lượt',ADJUSTED:'Đã điều chỉnh'};
const badge = value => {
  const text=statusNames[value]||value||'—';
  const tone=['OUTSIDE','REJECTED','ABSENT'].includes(value)||/ngoài vùng|vắng/i.test(text)?'red':
    ['ON_TIME','APPROVED','COMPLETE','COMPLETED','ADJUSTED'].includes(value)||/đủ công|đã duyệt/i.test(text)?'green':
    ['LATE','EARLY','PENDING','MISSING','PARTIAL'].includes(value)||/muộn|sớm|thiếu|chờ/i.test(text)?'amber':'';
  return `<span class="tag ${tone}">${esc(text)}</span>`;
};
let saved;
try { saved = JSON.parse(sessionStorage.getItem('babymark-session') || 'null'); } catch {}
const state = {token:saved?.expires_at>Date.now()?saved.token:null,user:null,view:'today',adminTab:'employees',assignments:[],attendances:[],admin:{},reports:[],requests:[],stream:null,renderId:0,sessionEpoch:0,filters:{from:monthStart(),to:today(),branch_id:'',user_id:''}};
let noticeTimer, photoURLs = [],modalTicket=0,cameraTicket=0;

function notify(message,error=false) {
  const el = $('#notice'); el.textContent=message; el.hidden=false; el.classList.toggle('error',error);
  clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>el.hidden=true,error?10000:5500);
}
function setSession(session) {
  stopCamera();closeModal();
  state.sessionEpoch++;state.renderId++;
  state.token=session?.token||null;
  state.assignments=[];state.attendances=[];state.admin={};state.reports=[];state.requests=[];
  try { session ? sessionStorage.setItem('babymark-session',JSON.stringify(session)) : sessionStorage.removeItem('babymark-session'); } catch {}
}
async function api(path,{body,method='GET',raw=false}={}) {
  const epoch=state.sessionEpoch;
  const headers = new Headers();
  if (state.token) headers.set('Authorization',`Bearer ${state.token}`);
  if (body && !(body instanceof FormData)) { headers.set('Content-Type','application/json'); body=JSON.stringify(body); }
  const response = await fetch(path,{method,headers,body,cache:'no-store',credentials:'same-origin'});
  if(epoch!==state.sessionEpoch)throw new Error('Tài khoản đã thay đổi. Vui lòng thử lại trong phiên hiện tại.');
  if (!response.ok) {
    const result = await response.json().catch(()=>({}));
    if(epoch!==state.sessionEpoch)throw new Error('Tài khoản đã thay đổi. Vui lòng thử lại trong phiên hiện tại.');
    if (response.status===401 && state.user) { stopCamera(); state.user=null; setSession(null); renderLogin('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); }
    throw new Error(result.error||`Không thể xử lý yêu cầu (${response.status}).`);
  }
  if(raw)return response;
  const data=await response.json();
  if(epoch!==state.sessionEpoch)throw new Error('Tài khoản đã thay đổi. Vui lòng thử lại trong phiên hiện tại.');
  return data;
}
const query = values => new URLSearchParams(Object.entries(values).filter(([,v])=>v!==''&&v!=null)).toString();
const dateFilters = () => ({from:state.filters.from,to:state.filters.to});
const empty = (message='Chưa có dữ liệu trong khoảng thời gian này.') => `<div class="empty">${icon('calendar')}${esc(message)}</div>`;
const loading = () => '<div class="loading" role="status">Đang tải dữ liệu…</div>';
const errorHTML = message => `<div class="table-error"><p class="error-text" role="alert">${esc(message)}</p><button class="btn secondary section-gap" data-action="refresh">Thử lại</button></div>`;
const rowOptions = (rows,selected,label='name') => rows.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${esc(r[label]||r.full_name||r.id)}${label==='full_name'?' · '+esc(r.employee_code):''}</option>`).join('');

function stopCamera() {
  cameraTicket++;
  state.stream?.getTracks().forEach(t=>t.stop()); state.stream=null;
  if($('#camera-placeholder'))$('#camera-placeholder').hidden=false;
  if($('#camera-live'))$('#camera-live').hidden=true;
}
function clearPhotos() { photoURLs.forEach(URL.revokeObjectURL); photoURLs=[]; }
function closeModal() { modalTicket++;modal.close(); modal.innerHTML=''; clearPhotos(); }
function showModal(title,body) {
  closeModal(); modal.innerHTML=`<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="close" data-action="close-modal" aria-label="Đóng">×</button></div><div class="modal-body">${body}</div>`;
  modal.showModal();
  return modalTicket;
}
function renderLogin(error='') {
  app.innerHTML=`<div class="login"><aside class="login-story"><div><div class="login-brand"><img src="/brand/logo.png" alt="BABY MARK"><div><strong>BABY MARK</strong><p class="muted">MOM & BABY</p></div></div><h1>Mỗi ngày làm việc.<br>Một dấu ấn tận tâm.</h1><p class="intro">Không gian chấm công và quản lý ca làm dành riêng cho đội ngũ BABY MARK.</p><div class="login-values"><div><strong>14</strong><span>Cửa hàng kết nối</span></div><div><strong>01</strong><span>Đội ngũ đồng hành</span></div></div></div><div class="login-foot">BABY MARK · Cổng nội bộ dành cho nhân viên được cấp tài khoản</div></aside><main id="main" class="login-panel"><section class="login-box"><p class="eyebrow">CHÀO MỪNG TRỞ LẠI</p><h2>Đăng nhập hệ thống</h2><p class="muted">Sử dụng tài khoản và mật khẩu hoặc mã truy cập do quản trị viên cấp.</p><form data-form="login" class="form-stack"><label>Tên đăng nhập<input name="username" autocomplete="username" required minlength="3" maxlength="64" placeholder="Ví dụ: bm001" autocapitalize="none" spellcheck="false"></label><label>Mật khẩu hoặc mã truy cập<input name="secret" type="password" autocomplete="current-password" required maxlength="128" placeholder="Mật khẩu hoặc mã 48 ký tự"></label><p id="login-error" class="error-text" role="alert" ${error?'':'hidden'}>${esc(error)}</p><button class="btn wide" type="submit" data-testid="login-submit">Đăng nhập ${icon('arrow')}</button></form><div class="login-note">${icon('shield')}<span>Tài khoản được cấp nội bộ. Nếu quên mật khẩu hoặc chưa có tài khoản, hãy liên hệ quản trị viên cửa hàng.</span></div><p class="hint">Camera và GPS cần HTTPS hoặc localhost. Trang chỉ xin quyền khi bạn bắt đầu chấm công.</p></section></main></div>`;
}
const navItems = () => [['today','camera','Chấm công'],['history','clock','Lịch sử'],['schedule','calendar','Lịch làm việc'],['requests','file','Yêu cầu công'],['push','clock','Push điện thoại'],...(state.user.role==='admin'?[['admin','people','Quản trị']]:[]),...(['admin','manager'].includes(state.user.role)?[['reports','chart','Báo cáo'],['alerts','clock','Thông báo']]:[])];
const titles = {today:'Chấm công hôm nay',history:'Lịch sử chấm công',schedule:'Lịch làm việc',requests:'Yêu cầu công',admin:'Quản trị hệ thống',reports:'Báo cáo chấm công',alerts:'Thông báo đi muộn',push:'Push điện thoại'};
function shell() {
  const name=state.user.full_name;
  app.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><img src="/brand/logo.png" alt="BABY MARK"><div><strong>BABY MARK</strong><span>KHÔNG GIAN LÀM VIỆC</span></div></div><div class="nav-label">ĐỘI NGŨ BABY MARK</div><nav id="main-nav" class="nav" aria-label="Điều hướng chính">${navItems().map(([id,ic,label])=>`<button data-view="${id}" class="${state.view===id?'active':''} ${['today','history','schedule'].includes(id)?'primary-nav':'extra-nav'}" ${state.view===id?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></button>`).join('')}<button type="button" class="mobile-more ${['today','history','schedule'].includes(state.view)?'':'active'}" data-action="mobile-menu" aria-expanded="false" aria-controls="main-nav"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>Thêm</span></button></nav><div class="sidebar-bottom"><div class="privacy-note">${icon('shield')}<strong>Riêng tư theo phân quyền</strong>Ảnh chỉ dành cho bạn và người quản lý được cấp quyền.</div>${state.user.role!=='admin'?'<button class="logout" data-action="self-password">Đổi mật khẩu</button>':''}<button class="logout" data-action="logout">Đăng xuất tài khoản</button></div></aside><div class="workspace"><header class="topbar"><div class="topbar-path">Không gian làm việc / <span>${titles[state.view]}</span></div><div class="profile"><div class="avatar">${esc(name.split(/\s+/).map(s=>s[0]).slice(-2).join('').toUpperCase())}</div><div><strong>${esc(name)}</strong><small>${esc(state.user.employee_code)} · ${roles[state.user.role]}</small></div><button class="btn quiet small mobile-logout" data-action="logout" aria-label="Đăng xuất">${icon('logout')}</button></div></header><main id="main" class="main"><div class="page-head"><div><p class="eyebrow">${state.view==='today'?'MỘT NGÀY LÀM VIỆC TỐT LÀNH':'BABY MARK · ĐỘI NGŨ'}</p><h1>${titles[state.view]}</h1><p class="muted">${state.view==='today'?'Ghi nhận ca làm của bạn bằng ảnh trực tiếp và vị trí hiện tại.':'Dữ liệu được hiển thị theo phạm vi tài khoản của bạn.'}</p></div><div class="date-chip">${icon('calendar')} ${new Intl.DateTimeFormat('vi-VN',{timeZone:tz,weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(Date.now())}</div></div><div id="content">${loading()}</div><p class="footer-note">BABY MARK · Múi giờ Việt Nam (UTC+7) · Ảnh tối đa 200 KB, lưu tối đa 60 ngày theo ngân sách ảnh 900 MB · Bảng công lưu 2 năm.</p></main></div></div>`;
}
function stat(label,value,note,ic) { return `<article class="stat"><div class="label">${label}${icon(ic)}</div><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`; }
function filterBar({reports=false,action='filter'}={}) {
  return `<form class="toolbar" data-form="${action}"><label>Từ ngày<input type="date" name="from" value="${esc(state.filters.from)}" required></label><label>Đến ngày<input type="date" name="to" value="${esc(state.filters.to)}" required></label>${reports&&state.admin.branches?`<label>Cửa hàng<select name="branch_id"><option value="">Tất cả được cấp quyền</option>${rowOptions(state.admin.branches,state.filters.branch_id)}</select></label>`:''}${reports&&state.admin.employees?`<label>Nhân viên<select name="user_id"><option value="">Tất cả nhân viên</option>${rowOptions(state.admin.employees,state.filters.user_id,'full_name')}</select></label>`:''}<button class="btn secondary" type="submit">${icon('refresh')} Xem dữ liệu</button>${reports?`<span class="spacer"></span><button class="btn" data-action="export" type="button">${icon('download')} Xuất CSV</button>`:''}</form>`;
}
function assignmentCards(rows) {
  return rows.length ? rows.map(a=>`<article class="assignment-card"><div class="assignment-details">${badge(a.in_id&&a.out_id?'COMPLETE':a.in_id?'IN_PROGRESS':'SCHEDULED')}<span>${dateVN(a.work_date)}</span></div><h3>${esc(a.branch_name)}</h3><div class="assignment-details"><span>${icon('clock')} ${hm(a.starts_at)} – ${hm(a.ends_at)}${dayString(a.starts_at)!==dayString(a.ends_at)?' (+1 ngày)':''}</span><span>${esc(a.shift_name)}</span></div>${state.user.role!=='staff'?`<p class="hint">${esc(a.full_name)} · ${esc(a.employee_code)}</p>`:''}<div class="assignment-footer"><span>Vào ca <strong>${hm(a.in_at)}</strong></span><span>Tan ca <strong>${hm(a.out_at)}</strong></span></div></article>`).join('') : empty('Bạn chưa được phân ca trong ngày. Liên hệ quản lý để kiểm tra lịch.');
}
async function renderToday(id) {
  const yesterday=dayString(Date.now()-86400000);
  const data=await api(`/api/assignments?${query({from:yesterday,to:today()})}`);
  if(id!==state.renderId)return;
  const own=data.assignments.filter(a=>a.user_id===state.user.id);
  state.assignments=own;
  const dayRows=own.filter(a=>a.work_date===today()||Number(a.ends_at)>Date.now()-6*3600000);
  const complete=dayRows.filter(a=>a.in_id&&a.out_id).length;
  $('#content').innerHTML=`<div class="stats">${stat('Ca làm hôm nay',dayRows.length,'Theo lịch đã được phân','calendar')}${stat('Đã vào ca',dayRows.filter(a=>a.in_id).length,'Dữ liệu lưu trên máy chủ','check')}${stat('Ca đã hoàn tất',complete,'Đã có lượt vào và tan ca','clock')}${stat('Ảnh chấm công','200 KB','Timemark · Nền thông tin mờ 40%','camera')}</div><div class="two-col"><section class="card"><div class="card-head"><div><h2>Ghi nhận chấm công</h2><p class="muted">Camera trực tiếp · GPS hiện tại · Giờ máy chủ</p></div><span class="tag">TIMEMARK</span></div><div class="card-body"><div class="camera-frame"><video id="camera" autoplay muted playsinline aria-label="Camera chấm công"></video><div id="camera-placeholder" class="camera-placeholder">${icon('camera')}<strong>Sẵn sàng cho ca làm mới</strong><p>Bật camera, giữ rõ khuôn mặt và kiểm tra ca làm trước khi chụp.</p><button class="btn" data-action="camera-start">Bật camera</button></div><span class="camera-corner tl"></span><span class="camera-corner br"></span><span id="camera-live" class="camera-live" hidden><span class="dot"></span>CAMERA TRỰC TIẾP</span></div><label class="assignment-select">Chọn ca làm<select id="capture-assignment" ${!dayRows.length?'disabled':''}><option value="">Chọn ca được phân công</option>${dayRows.map(a=>`<option value="${esc(a.id)}">${esc(a.branch_name)} · ${dateVN(a.work_date)} ${hm(a.starts_at)}–${hm(a.ends_at)}</option>`).join('')}</select></label><div class="camera-actions"><button class="btn" data-action="capture" data-type="IN" data-testid="attendance-in" ${!dayRows.length?'disabled':''}>${icon('camera')} Chụp vào ca</button><button class="btn secondary" data-action="capture" data-type="OUT" data-testid="attendance-out" ${!dayRows.length?'disabled':''}>${icon('camera')} Chụp tan ca</button></div><p class="camera-note">${icon('shield')}<span>Ảnh Timemark được ghép trên thiết bị từ thông tin máy chủ. Giờ đóng dấu được cấp trước lúc lưu tối đa 90 giây. Máy chủ xác thực bản ghi; ảnh và GPS không chứng minh tuyệt đối sự hiện diện.</span></p><p id="capture-status" class="hint" role="status" aria-live="polite"></p></div></section><div><section class="card"><div class="card-head"><div><h2>Ca làm của bạn</h2><p class="muted">Bao gồm ca qua đêm còn gần thời gian làm việc</p></div><button class="btn quiet small" data-view="schedule">Xem lịch</button></div><div class="card-body">${assignmentCards(dayRows)}</div></section><aside class="policy"><h3>${icon('pin')} Để chấm công chính xác</h3><p>Cho phép camera và vị trí chính xác. GPS cần sai số tối đa 50 m. Thời gian công lấy từ máy chủ; ngoài vùng được ghi cờ để quản lý xem xét.</p></aside></div></div>`;
  if(dayRows.length===1)$('#capture-assignment').value=dayRows[0].id;
}
async function renderSchedule(id) {
  const data=await api(`/api/assignments?${query(dateFilters())}`); if(id!==state.renderId)return;
  state.assignments=data.assignments;
  $('#content').innerHTML=`<section class="card"><div class="card-head"><h2>Lịch phân công</h2><span class="tag">${data.assignments.length} CA</span></div>${filterBar()}<div class="card-body">${assignmentCards(data.assignments)}</div></section>`;
}
async function renderHistory(id) {
  const data=await api(`/api/attendance/history?${query(dateFilters())}`); if(id!==state.renderId)return;
  state.attendances=data.attendances;
  $('#content').innerHTML=`<section class="card"><div class="card-head"><h2>Nhật ký chấm công</h2><span class="tag">${data.attendances.length} LƯỢT</span></div>${filterBar()}${attendanceTable(data.attendances)}</section>`;
}
function attendanceTable(rows) {
  return rows.length?`<div class="table-wrap"><table><thead><tr><th>Nhân viên / Cửa hàng</th><th>Thời gian máy chủ</th><th>Loại</th><th>Trạng thái</th><th>Vị trí</th><th>Ảnh</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${esc(r.full_name||state.user.full_name)}</strong><small>${esc(r.branch_name||r.assignment_id)}</small></td><td>${dt(r.server_timestamp)}</td><td>${r.type==='IN'?'Vào ca':'Tan ca'}</td><td>${badge(r.status)}${r.late_minutes?`<small>Muộn ${r.late_minutes} phút</small>`:''}${r.early_minutes?`<small>Sớm ${r.early_minutes} phút</small>`:''}</td><td>${Math.round(r.distance_m)} m<small>Sai số ±${Math.round(r.accuracy_m)} m</small></td><td><button class="btn secondary small" data-action="photo" data-id="${esc(r.id)}">Xem ảnh</button></td></tr>`).join('')}</tbody></table></div><p class="table-footer">Thời gian hiển thị theo Việt Nam · Ảnh có thể hết hạn trước bản ghi công.</p>`:empty();
}
async function renderPush(id){
 const data=await api('/api/push/config');if(id!==state.renderId)return;pushConfig=data;pushReg=null;pushSub=null;
 const settings=data.settings,ready=settings.available&&settings.configured&&settings.enabled;
 if(ready){try{pushReg=await pushRegistration()}catch{}}
 if(id!==state.renderId)return;
 let subscribed=false;if(pushReg){const sub=await pushReg.pushManager.getSubscription();pushSub=sub;if(sub){try{subscribed=(await api('/api/push/status',{method:'POST',body:{endpoint:sub.endpoint}})).subscribed}catch{}}}
 if(id!==state.renderId)return;
 $('#content').innerHTML=`<section class="card"><div class="card-head"><h2>Thông báo khi đóng ứng dụng</h2></div><div class="card-body form-stack"><p>iPhone/iPad: thêm BABY MARK vào màn hình chính, mở từ biểu tượng rồi bật Push. Android: dùng trình duyệt hỗ trợ hoặc cài ứng dụng web.</p><p class="hint">${!settings.available?'Cần migration 0010.':!settings.configured?'Chưa cấu hình VAPID.':!settings.enabled?'Admin chưa bật Push.':!pushReg?'Thiết bị chưa hỗ trợ Push hoặc chưa cài PWA.':subscribed?'Thiết bị này đã đăng ký nhận Push.':'Thiết bị sẵn sàng đăng ký.'}</p>${pushReg?`<button class="btn" data-action="push-enable">${subscribed?'Đăng ký lại':'Bật Push trên thiết bị'}</button><button class="btn secondary" data-action="push-test" ${subscribed?'':'disabled'}>Gửi thông báo thử</button><button class="btn secondary" data-action="push-disable">Tắt Push trên thiết bị</button>`:''}<p class="hint">Thông báo trên màn hình khóa không chứa tên, GPS hay dữ liệu nhân viên.</p></div></section>${data.admin&&settings.available?`<section class="card section-gap"><div class="card-head"><h2>Cài đặt Push toàn hệ thống</h2></div><form class="card-body form-stack" data-form="push-settings"><label><input type="checkbox" name="enabled" ${settings.enabled?'checked':''} ${settings.configured?'':'disabled'}> Bật Push</label><label><input type="checkbox" name="reminders" ${settings.reminders?'checked':''}> Nhắc trước ca 10 phút</label><label><input type="checkbox" name="late_alerts" ${settings.late_alerts?'checked':''}> Cảnh báo quản lý đi muộn (cần bật thông báo đi muộn trong Cài đặt)</label><p class="hint">Cần Worker Cron riêng đã cấu hình để gửi tự động; giờ gửi không được bảo đảm tuyệt đối.</p><p class="error-text" data-form-error hidden></p><button class="btn" type="submit">Lưu cài đặt Push</button></form></section>`:''}`;
}
async function renderAlerts(id){const data=await api('/api/alerts');if(id!==state.renderId)return;$('#content').innerHTML=`<section class="card"><div class="card-head"><div><h2>Thông báo đi muộn</h2><p class="muted">Cập nhật khi mở hoặc làm mới trang; không phải push nền.</p></div><button class="btn secondary" data-action="refresh">Làm mới</button></div><div class="card-body">${!data.enabled?empty('Quản trị viên chưa bật thông báo đi muộn.'):data.alerts.length?data.alerts.map(a=>`<article class="assignment-card"><strong>${esc(a.full_name)} · ${esc(a.employee_code)}</strong><p>${esc(a.branch_name)} · ${dateVN(a.work_date)} · ${hm(a.starts_at)}</p><p>${badge(a.in_at==null?'Chưa vào ca':'Đi muộn')} ${a.minutes} phút</p></article>`).join(''):empty('Không có cảnh báo trong phạm vi quản lý.')}</div></section>`;}
async function loadAdmin() {
  const resources=['branches','employees','shifts','assignments','manager-branches','settings'];
  const responses=await Promise.all(resources.map(r=>api(`/api/admin/${r}?${query(dateFilters())}`)));
  resources.forEach((r,i)=>state.admin[r.replace('-','_')]=responses[i][r.replace('-','_')]);
}
async function renderAdmin(id) {
  await loadAdmin(); if(id!==state.renderId)return;
  const tabs=[['employees','people','Nhân viên'],['branches','store','Cửa hàng'],['shifts','clock','Ca làm'],['assignments','calendar','Phân ca'],['settings','shield','Cài đặt'],['operations','shield','Vận hành']];
  if(state.adminTab==='operations'){state.admin.operations=await api('/api/admin/operations');if(id!==state.renderId)return;}
  const rows=state.admin[state.adminTab]||[];
  const tabName=tabs.find(t=>t[0]===state.adminTab)[2];
  $('#content').innerHTML=`<div class="stats">${stat('Nhân viên',state.admin.employees.filter(p=>p.active&&p.role!=='admin').length,'Tài khoản đang hoạt động','people')}${stat('Cửa hàng',state.admin.branches.filter(b=>b.active!==0).length,'Đang hoạt động','store')}${stat('Ca làm',state.admin.shifts.length,'Mẫu giờ làm việc','clock')}${stat('Lịch phân công',state.admin.assignments.length,'Trong khoảng ngày đang chọn','calendar')}</div><div class="tabs" role="tablist" aria-label="Danh mục quản trị">${tabs.map(([key,ic,name])=>`<button role="tab" aria-selected="${state.adminTab===key}" data-admin-tab="${key}" class="${state.adminTab===key?'active':''}">${name}</button>`).join('')}</div><section class="card"><div class="card-head"><div><h2>${tabName}</h2><p class="muted">Quản lý tập trung · Chỉ quản trị viên được chỉnh sửa</p></div>${['settings','operations'].includes(state.adminTab)?'':`<button class="btn" data-action="admin-add" ${state.adminTab==='branches'&&state.admin.branches.filter(b=>b.active!==0).length>=state.admin.settings.branch_limit?'disabled title="Đã đạt giới hạn cửa hàng"':''}>${icon('plus')} ${state.adminTab==='employees'?'Cấp tài khoản':'Thêm mới'}</button>`}</div>${state.adminTab==='assignments'?filterBar()+'<div class="card-body"><button class="btn secondary" data-action="bulk-assign">Phân ca hàng loạt</button></div>':''}${state.adminTab==='settings'?settingsForm():state.adminTab==='operations'?operationsPanel():adminTable(rows)}</section>`;
}
function operationsPanel(){
 const o=state.admin.operations;
 const item=(name,ok,note)=>`<article class="operation-row"><div><strong>${esc(name)}</strong><p class="hint">${esc(note)}</p></div><span class="tag ${ok?'green':'amber'}">${ok?'Sẵn sàng':'Cần cấu hình'}</span></article>`;
 return `<div class="card-body form-stack"><h3>Trung tâm vận hành BABY MARK</h3><p class="hint">Trạng thái lấy từ D1 và cấu hình máy chủ. Không hiển thị khóa bí mật.</p>
 <div class="operations-grid">${item('Quản trị mở rộng',o.admin_ready,o.admin_ready?'Migration 0009 đã được nhận diện':'Cần migration 0009')}${item('GPS cửa hàng',o.branches>0&&o.gps_ready===o.branches,o.gps_ready+'/'+o.branches+' cửa hàng có tọa độ đã nhập; cần kiểm tra thực tế')}${item('Tài khoản',o.employees>0&&o.accounts===o.employees,o.accounts+'/'+o.employees+' nhân viên đang hoạt động có tài khoản')}${item('Ca và lịch làm việc',o.shifts>0&&o.scheduled>0,o.shifts+' mẫu ca · '+o.scheduled+' lịch chưa kết thúc')}${item('Thông báo đi muộn',o.late_alerts,o.late_alerts?'Đang bật trong ứng dụng':'Chưa bật')}${item('Web Push',o.push_schema_ready&&o.push_enabled&&o.vapid_ready,o.push_schema_ready?(o.vapid_ready?(o.push_enabled?'Đã bật chính sách':'Chưa bật chính sách'):'Chưa có khóa VAPID hợp lệ'):'Cần migration 0010')}${item('Cron Push',o.push_cron_secret_ready,o.push_cron_secret_ready?'Đã có Secret; chưa xác nhận lịch Worker':'Chưa có PUSH_CRON_SECRET')}${item('Thiết bị nhận Push',o.push_devices>0,o.push_devices+' thiết bị đã đăng ký; chưa xác nhận thông báo đến máy')}${item('Kho ảnh',o.kv_bound,(o.photo_bytes/1000000).toFixed(1)+' / 900 MB theo số liệu D1 · '+o.photo_records+' mục đang tính dung lượng')}${item('Dọn bảng công',o.attendance_retention,o.attendance_retention?'Chính sách đang bật; cần xác nhận Cron':'Đang tắt; cần sao lưu trước khi bật')}</div>
 ${o.missing_gps.length?`<section><h3>Cửa hàng chưa có GPS</h3><div class="checklist">${o.missing_gps.map(b=>`<div>${esc(b.code)} · ${esc(b.name)}</div>`).join('')}</div><button class="btn secondary section-gap" data-admin-tab="branches">Cấu hình cửa hàng</button></section>`:''}
 <p class="hint">Push gần nhất: ${o.last_push?esc(dt(o.last_push.claimed_at)+' · '+o.last_push.state):'Chưa có bản ghi gửi theo lịch'}. Dọn bảng công gần nhất: ${o.last_retention?esc(dt(o.last_retention.started_at)+' · '+o.last_retention.assignments_removed+' ca'):'Chưa có bản ghi'}.</p>
 <p class="hint">Kích hoạt an toàn bật cảnh báo đi muộn và bật Push, nhắc ca nếu đã đủ cấu hình. Không tự bật xóa ảnh hoặc bảng công.</p>
 <button class="btn" data-action="enable-safe-features" ${o.admin_ready?'':'disabled'}>Kích hoạt tính năng an toàn</button><button class="btn secondary" data-view="push">Cài đặt Push điện thoại</button><button class="btn secondary" data-admin-tab="settings">Chính sách lưu trữ</button><button class="btn quiet" data-action="refresh">Kiểm tra lại trạng thái</button></div>`;
}
function settingsForm(){
 const p=state.admin.settings;
 if(!p.available)return '<div class="card-body"><p>Cần áp dụng migration 0009 trước khi mở cài đặt mở rộng.</p></div>';
 return `<form data-form="system-settings" class="card-body form-stack"><label>Giới hạn cửa hàng hoạt động (1–50)<input name="branch_limit" type="number" min="1" max="50" required value="${p.branch_limit}"></label><label><input type="checkbox" name="late_alerts" ${p.late_alerts?'checked':''}> Thông báo đi muộn trong ứng dụng</label><label><input type="checkbox" name="photo_eviction" ${p.photo_eviction?'checked':''}> Cho phép xóa ảnh cũ khi đạt 900 MB (TTL tối đa 60 ngày)</label><label><input type="checkbox" name="attendance_retention" ${p.attendance_retention?'checked':''} ${p.retention_secret_configured?'':'disabled'}> Cho phép dọn bảng công cũ hơn 2 năm</label><p class="hint">${p.retention_secret_configured?'Đã có RETENTION_SECRET. Cần lịch gọi API riêng để dọn tự động.':'Chưa cấu hình RETENTION_SECRET trên Cloudflare.'} Bật lưu trữ có thể cho phép xóa dữ liệu đã hết hạn; hãy sao lưu và kiểm tra chính sách trước.</p><p class="error-text" data-form-error hidden></p><button type="submit" class="btn">Lưu cài đặt</button></form>`;
}
function adminTable(rows) {
  if(!rows.length)return empty('Chưa có dữ liệu. Dùng nút Thêm mới để bắt đầu.');
  const tab=state.adminTab;
  const headers={employees:['Nhân viên','Vai trò / Bộ phận','Tài khoản','Thao tác'],branches:['Cửa hàng','GPS','Bán kính / Địa chỉ','Thao tác'],shifts:['Ca làm','Khung giờ','Dung sai đi muộn','Thao tác'],assignments:['Nhân viên','Cửa hàng / Ca','Ngày / Khung giờ','Thao tác']}[tab];
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>{
    const edit=`<button class="btn secondary small" data-action="admin-edit" data-id="${esc(r.id)}">Sửa</button>`;
    if(tab==='employees')return `<tr><td><strong>${esc(r.full_name)}</strong><small>${esc(r.employee_code)}</small></td><td>${roles[r.role]}<small>${esc(r.department)}</small></td><td>${esc(r.username||'Chưa được cấp')}<small>${r.active?'Đang hoạt động':'Đã khóa'}</small></td><td>${r.role==='admin'?'<span class="muted">Quản trị hệ thống</span>':`${edit}<button class="btn secondary small" data-action="reset-account" data-id="${esc(r.id)}">Đặt lại mật khẩu / mã</button><button class="btn ${r.active?'danger':'quiet'} small" data-action="toggle-account" data-id="${esc(r.id)}">${r.active?'Khóa':'Mở khóa'}</button>${r.role==='manager'?`<button class="btn quiet small" data-action="manager-scope" data-id="${esc(r.id)}">Phạm vi cửa hàng</button>`:''}`}</td></tr>`;
    if(tab==='branches')return `<tr><td><strong>${esc(r.name)}</strong><small>${esc(r.code)} · ${r.active===0?'Ngừng hoạt động':'Đang hoạt động'}</small></td><td>${r.latitude==null?badge('Chưa cấu hình'):esc(Number(r.latitude).toFixed(6)+', '+Number(r.longitude).toFixed(6))}</td><td>${r.allowed_radius} m<small>${esc(r.address_text||'Chưa có địa chỉ')}</small></td><td>${edit}${state.admin.settings.available?`<button class="btn secondary small" data-action="branch-active" data-id="${esc(r.id)}" data-active="${r.active===0?'true':'false'}">${r.active===0?'Khôi phục':'Ngừng hoạt động'}</button>`:''}<button class="btn danger small" data-action="branch-remove" data-id="${esc(r.id)}">Xóa cửa hàng chưa sử dụng</button></td></tr>`;
    if(tab==='shifts')return `<tr><td><strong>${esc(r.name)}</strong></td><td>${esc(r.start_time)} – ${esc(r.end_time)} ${r.end_time<r.start_time?'<small>Kết thúc ngày kế tiếp</small>':''}</td><td>${r.grace_period} phút</td><td>${edit}<button class="btn danger small" data-action="shift-remove" data-id="${esc(r.id)}">Xóa mẫu chưa dùng</button></td></tr>`;
    return `<tr><td><strong>${esc(r.full_name)}</strong><small>${esc(r.employee_code)}</small></td><td>${esc(r.branch_name)}<small>${esc(r.shift_name)}</small></td><td>${dateVN(r.work_date)}<small>${dt(r.starts_at)} – ${dt(r.ends_at)}</small></td><td>${edit}${r.starts_at>Date.now()&&!r.in_id&&!r.out_id&&!r.request_id?`<button class="btn danger small" data-action="assignment-cancel" data-id="${esc(r.id)}">Hủy ca</button>`:''}</td></tr>`;
  }).join('')}</tbody></table></div><p class="table-footer">${rows.length} bản ghi · Lịch có dữ liệu công được giữ nguyên để bảo toàn đối soát.</p>`;
}
function field(label,name,value='',{type='text',required=true,max=120,min='',step='',full=false,placeholder=''}={}) {
  return `<label class="${full?'full':''}">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${type==='text'?`maxlength="${max}"`:''} ${min!==''?`min="${min}"`:''} ${step?`step="${step}"`:''} placeholder="${esc(placeholder)}"></label>`;
}
const departmentChoices=['Kho','Lái xe','Kế toán','Bán hàng','Thu ngân','Quản lý cửa hàng','Giao nhận','Nhân sự','Hành chính','Marketing','Chăm sóc khách hàng','Mua hàng','IT','Bảo vệ','Tạp vụ'];
const departmentField=(value='')=>{
 const choices=[...new Set([...departmentChoices,...(state.admin.employees||[]).map(e=>e.department).filter(Boolean),...(value?[value]:[])])];
 return `<label class="full">Bộ phận<input name="department" list="employee-departments" maxlength="100" value="${esc(value)}" placeholder="Chọn hoặc nhập bộ phận"></label><datalist id="employee-departments">${choices.map(d=>`<option value="${esc(d)}"></option>`).join('')}</datalist><p class="hint full">Có thể chọn bộ phận có sẵn hoặc nhập tên bộ phận mới. Bộ phận không làm thay đổi quyền truy cập.</p>`;
};
const passwordField=()=>'<label class="full">Mật khẩu nhân viên (không bắt buộc)<input type="password" name="password" minlength="9" maxlength="128" autocomplete="new-password" placeholder="Tối thiểu 9 ký tự; để trống để cấp mã ngẫu nhiên"></label><p class="hint full">Dùng mật khẩu riêng cho BABY MARK. Không đặt mã 48 ký tự hex làm mật khẩu. Hệ thống không lưu mật khẩu gốc.</p>';
function adminForm(row={}) {
  const tab=state.adminTab, isNew=!row.id;
  let fields='';
  if(tab==='employees')fields=`${field('Mã nhân viên','employee_code',row.employee_code,{max:40})}${field('Họ và tên','full_name',row.full_name)}${isNew?field('Tên đăng nhập','username','',{max:64,placeholder:'Chữ thường, số, dấu . _ -'})+passwordField():''}<label>Vai trò<select name="role"><option value="staff" ${row.role!=='manager'?'selected':''}>Nhân viên</option><option value="manager" ${row.role==='manager'?'selected':''}>Quản lý cửa hàng</option></select></label>${departmentField(row.department)}`;
  if(tab==='branches')fields=`${field('Mã cửa hàng','code',row.code,{max:40})}${field('Tên cửa hàng','name',row.name)}${field('Vĩ độ','latitude',row.latitude??'',{type:'number',min:-90,step:'any',required:false})}${field('Kinh độ','longitude',row.longitude??'',{type:'number',min:-180,step:'any',required:false})}${field('Bán kính chấm công (20–1000 m)','allowed_radius',row.allowed_radius??100,{type:'number',min:20,step:'1'})}${field('Địa chỉ','address_text',row.address_text,{required:false,max:300,full:true})}<div class="full"><label>Tọa độ từ Google Maps<input data-branch-coords placeholder="Vĩ độ, kinh độ" autocomplete="off"></label><div class="modal-actions"><button class="btn secondary" type="button" data-action="branch-paste-gps">Điền tọa độ</button><button class="btn secondary" type="button" data-action="branch-current-gps">Lấy GPS hiện tại</button><button class="btn secondary" type="button" data-action="branch-check-map">Kiểm tra trên bản đồ</button></div><p class="hint" data-branch-gps-status role="status">Chỉ lấy GPS hiện tại khi đang đứng tại cửa hàng. Tọa độ chưa được lưu cho đến khi bấm Lưu thông tin.</p></div><p class="hint full">Chỉ nhập tọa độ đã xác minh tại cửa hàng. Để trống cả hai tọa độ sẽ tạm ngăn chấm công tại chi nhánh này.</p>`;
  if(tab==='shifts')fields=`${field('Tên ca làm','name',row.name,{full:true})}${field('Giờ bắt đầu','start_time',row.start_time||'08:00',{type:'time'})}${field('Giờ kết thúc','end_time',row.end_time||'16:00',{type:'time'})}${field('Dung sai đi muộn (0–120 phút)','grace_period',row.grace_period??0,{type:'number',min:0,step:'1',full:true})}<p class="hint full">Giờ kết thúc nhỏ hơn giờ bắt đầu được tính sang ngày kế tiếp. Giờ đầu và cuối ca cần khác nhau.</p>`;
  if(tab==='assignments')fields=`<label class="full">Nhân viên<select name="user_id" required><option value="">Chọn nhân viên</option>${rowOptions(state.admin.employees.filter(e=>e.active),row.user_id,'full_name')}</select></label><label class="full">Cửa hàng<select name="branch_id" required><option value="">Chọn cửa hàng</option>${rowOptions(state.admin.branches.filter(b=>b.active!==0||b.id===row.branch_id),row.branch_id)}</select></label><label>Ca làm<select name="shift_id" required><option value="">Chọn ca</option>${rowOptions(state.admin.shifts,row.shift_id)}</select></label>${field('Ngày bắt đầu ca (Việt Nam)','work_date',row.work_date||today(),{type:'date'})}<p class="hint full">Máy chủ tính giờ ca theo Việt Nam, bao gồm ca qua đêm. Các lịch trùng giờ hoặc lịch đã có công không thể sửa.</p>`;
  showModal(isNew?(tab==='employees'?'Cấp tài khoản nhân viên':'Thêm '+({branches:'cửa hàng',shifts:'ca làm',assignments:'lịch phân công'}[tab])):'Chỉnh sửa thông tin',`<form data-form="admin-save" data-resource="${tab}" data-id="${esc(row.id||'')}"><div class="form-grid">${fields}</div><p class="error-text inline-error" data-form-error hidden role="alert"></p><div class="modal-actions"><button class="btn secondary" type="button" data-action="close-modal">Hủy</button><button class="btn" type="submit">${tab==='employees'&&isNew?'Tạo và cấp mã truy cập':'Lưu thông tin'}</button></div></form>`);
}
function credentialModal(result) {
  showModal('Mã truy cập vừa được cấp',`<p class="muted">Gửi riêng mã này cho đúng nhân viên. Mã chỉ hiển thị trong lần cấp này; đóng cửa sổ sẽ không thể xem lại.</p><div class="credential">Tên đăng nhập<strong> ${esc(result.username)}</strong><br>Mã truy cập<code data-testid="issued-secret">${esc(result.secret)}</code></div><p class="hint">Nhân viên dùng nguyên mã 48 ký tự để đăng nhập. Sau khi cấp lại, mã và phiên cũ không còn hiệu lực.</p><div class="modal-actions"><button class="btn" data-action="close-modal">Đã lưu mã an toàn</button></div>`);
}
async function renderReports(id) {
  if(state.user.role==='admin'&&!state.admin.branches)await loadAdmin();
  const data=await api(`/api/reports?${query(state.filters)}`); if(id!==state.renderId)return;
  state.reports=data.rows;
  const s=data.summary||{};
  $('#content').innerHTML=`<div class="stats">${stat('Ca hoàn tất',s.shifts??0,'Các ca đủ dữ liệu công','check')}${stat('Giờ làm ghi nhận',(Number(s.minutes||0)/60).toFixed(1),'Chưa bao gồm quy tắc tính lương','clock')}${stat('Đi muộn',s.late??0,'Tổng phút theo bảng công','calendar')}${stat('Ngày nghỉ được duyệt',s.leaveDays??0,'Theo đơn đã phê duyệt','file')}</div><section class="card"><div class="card-head"><h2>Bảng công theo ca</h2><span class="tag">${data.rows.length} CA</span></div>${filterBar({reports:true})}${data.rows.length?`<div class="table-wrap"><table><thead><tr><th>Nhân viên</th><th>Ngày / Cửa hàng</th><th>Ca làm</th><th>Vào / Tan ca</th><th>Phút công</th><th>Trạng thái</th></tr></thead><tbody>${data.rows.map(r=>`<tr><td><strong>${esc(r.full_name)}</strong><small>${esc(r.employee_code)}</small></td><td>${dateVN(r.work_date)}<small>${esc(r.branch_name)}</small></td><td>${esc(r.shift_name)}<small>${hm(r.starts_at)} – ${hm(r.ends_at)}</small></td><td>${r.summary?.adjusted?`${hm(r.proposed_in)} / ${hm(r.proposed_out)}<small>Đã duyệt · Gốc: ${hm(r.in_at)} / ${hm(r.out_at)}</small>`:`${hm(r.in_at)} / ${hm(r.out_at)}`}</td><td>${r.summary?.minutes??0}<small>Muộn ${r.summary?.late??0} · Sớm ${r.summary?.early??0}</small></td><td>${badge(r.summary?.status)}</td></tr>`).join('')}</tbody></table></div><p class="table-footer">Dữ liệu tham khảo đối soát. CSV mở được trong Excel; chưa áp dụng quy tắc lương, nghỉ giữa ca và ngày lễ.</p>`:empty()}</section>`;
}
async function renderRequests(id) {
  const [data,assignments]=await Promise.all([api(`/api/workforce?${query(dateFilters())}`),api(`/api/assignments?${query(dateFilters())}`)]); if(id!==state.renderId)return;
  state.requests=data.requests;state.assignments=assignments.assignments;
  $('#content').innerHTML=`<section class="card"><div class="card-head"><div><h2>Nghỉ phép và điều chỉnh công</h2><p class="muted">Giữ nguyên bản ghi ảnh/GPS gốc · Mọi quyết định được lưu</p></div><button class="btn" data-action="request-add">${icon('plus')} Tạo yêu cầu</button></div>${filterBar()}${data.requests.length?`<div class="table-wrap"><table><thead><tr><th>Nhân viên / Ca làm</th><th>Yêu cầu</th><th>Nội dung</th><th>Trạng thái</th><th>Xử lý</th></tr></thead><tbody>${data.requests.map(r=>`<tr><td><strong>${esc(r.full_name)}</strong><small>${dateVN(r.work_date)} · ${esc(r.branch_name)}</small></td><td>${statusNames[r.kind]}${r.kind==='CORRECTION'?`<small>${dt(r.proposed_in)} – ${dt(r.proposed_out)}</small>`:''}</td><td class="request-reason">${esc(r.reason)}</td><td>${badge(r.state)}${r.decision_note?`<small>${esc(r.decision_note)}</small>`:''}</td><td>${r.state==='PENDING'&&r.user_id!==state.user.id&&state.user.role!=='staff'?`<button class="btn small" data-action="request-decide" data-id="${esc(r.id)}">Xem xét</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`:empty('Chưa có yêu cầu công trong khoảng ngày này.')}</section>`;
}
function requestForm() {
  const own=state.assignments.filter(a=>a.user_id===state.user.id);
  if(!own.length)return notify('Bạn chưa có ca được phân công trong khoảng ngày đang xem.',true);
  showModal('Gửi yêu cầu công',`<form data-form="request-create" class="form-stack"><label>Ca làm<select name="assignment_id" required><option value="">Chọn ca của bạn</option>${own.map(a=>`<option value="${esc(a.id)}">${dateVN(a.work_date)} · ${esc(a.branch_name)} · ${hm(a.starts_at)}</option>`).join('')}</select></label><label>Loại yêu cầu<select name="kind" id="request-kind"><option value="LEAVE">Nghỉ phép</option><option value="CORRECTION">Điều chỉnh giờ công</option></select></label><div id="correction-times" class="form-grid" hidden>${field('Giờ vào đề xuất (Việt Nam)','proposed_in','',{type:'datetime-local',required:false})}${field('Giờ ra đề xuất (Việt Nam)','proposed_out','',{type:'datetime-local',required:false})}</div><label>Lý do<textarea name="reason" required minlength="5" maxlength="1000" placeholder="Mô tả lý do để quản lý có thể đối soát"></textarea></label><p class="hint">Yêu cầu chỉ có hiệu lực sau phê duyệt. Đơn điều chỉnh không thay đổi ảnh hoặc vị trí gốc.</p><p class="error-text" data-form-error hidden role="alert"></p><div class="modal-actions"><button class="btn secondary" type="button" data-action="close-modal">Hủy</button><button class="btn" type="submit">Gửi yêu cầu</button></div></form>`);
}
function mobileMenu(open){
  const sidebar=$('.sidebar'),trigger=$('[data-action="mobile-menu"]');
  if(!sidebar||!trigger)return;
  sidebar.classList.toggle('menu-open',open);trigger.setAttribute('aria-expanded',String(open));
}
function prepareResponsiveTables(){
 for(const wrap of document.querySelectorAll('#content .table-wrap')){
  const table=wrap.querySelector('table');if(!table)continue;
  const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
  table.classList.add('responsive-table');table.setAttribute('role','table');
  for(const section of table.querySelectorAll('thead,tbody'))section.setAttribute('role','rowgroup');
  for(const tr of table.rows){tr.setAttribute('role','row');for(const [index,cell] of [...tr.cells].entries()){
   if(cell.tagName==='TH'){cell.scope='col';cell.setAttribute('role','columnheader');}
   else{cell.setAttribute('role','cell');cell.dataset.label=headers[index]||'';}
  }}
 }
}
async function navigate(view=state.view) {
  if(!state.user)return;
  const changed=state.view!==view;stopCamera(); state.view=view; const id=++state.renderId; shell();
  if(changed)window.scrollTo(0,0);
  try {
    await ({today:renderToday,history:renderHistory,schedule:renderSchedule,admin:renderAdmin,reports:renderReports,requests:renderRequests,alerts:renderAlerts,push:renderPush}[view])(id);
    if(id===state.renderId)prepareResponsiveTables();
  } catch(e) { if(id===state.renderId&&$('#content'))$('#content').innerHTML=errorHTML(e.message); }
}

async function startCamera() {
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera cần HTTPS hoặc localhost và trình duyệt có hỗ trợ camera.');
  stopCamera();
  const ticket=cameraTicket,epoch=state.sessionEpoch;
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1200},height:{ideal:1600}},audio:false});
  if(ticket!==cameraTicket||epoch!==state.sessionEpoch){stream.getTracks().forEach(t=>t.stop());return;}
  state.stream=stream;
  const video=$('#camera');
  if(!video){stopCamera();return;}
  video.srcObject=state.stream;await video.play();$('#camera-placeholder').hidden=true;$('#camera-live').hidden=false;
}
async function capture(type,button) {
  const epoch=state.sessionEpoch;
  const assignment_id=$('#capture-assignment').value;
  if(!assignment_id)throw new Error('Vui lòng chọn ca làm trước khi chụp.');
  if(!state.stream)throw new Error('Bật camera và đợi hình ảnh xuất hiện trước khi chụp.');
  const a=state.assignments.find(r=>r.id===assignment_id);
  if(type==='IN'&&a.in_id)throw new Error('Ca này đã có lượt vào ca.');
  if(type==='OUT'&&!a.in_id)throw new Error('Cần ghi nhận vào ca trước khi tan ca.');
  if(type==='OUT'&&a.out_id)throw new Error('Ca này đã có lượt tan ca.');
  const status=$('#capture-status');
  document.querySelectorAll('[data-action="capture"]').forEach(b=>b.disabled=true);
  try {
    status.textContent='Đang lấy vị trí chính xác…';
    const location=await currentPosition();
    if(epoch!==state.sessionEpoch)throw new Error('Tài khoản đã thay đổi. Vui lòng chụp lại.');
    const frame=cameraFrame($('#camera'));
    status.textContent='Đang xác thực ca làm và thời gian máy chủ…';
    const prepared=await api('/api/attendance/prepare',{method:'POST',body:{assignment_id,type,...location}});
    status.textContent='Đang ghép Timemark và nén ảnh…';
    const photo=await composeTimemark(frame,prepared.metadata);
    if(epoch!==state.sessionEpoch)throw new Error('Tài khoản đã thay đổi. Vui lòng chụp lại.');
    const form=new FormData();form.set('challenge_id',prepared.challenge_id);form.set('photo',photo,'timemark.jpg');
    status.textContent='Đang lưu bản ghi công và ảnh. Vui lòng chờ…';
    const result=await api('/api/attendance/submit',{method:'POST',body:form});
    const url=URL.createObjectURL(photo);
    stopCamera();
    showModal('Đã ghi nhận '+(type==='IN'?'vào ca':'tan ca'),`<p class="muted">Bản ghi đã được lưu trên máy chủ. Ảnh bên dưới được ghép trên thiết bị từ thông tin máy chủ. Giờ đóng dấu có thể sớm hơn giờ ghi nhận tối đa 90 giây.</p><div class="review-meta"><div>Thời gian máy chủ<strong>${dt(result.attendance?.server_timestamp||prepared.metadata.serverTimestamp)}</strong></div><div>Dung lượng ảnh<strong>${(photo.size/1000).toFixed(1)} KB / 200 KB</strong></div></div><img class="result-photo" src="${url}" alt="Ảnh Timemark vừa ghi nhận"><div class="modal-actions"><button class="btn" data-action="close-modal">Hoàn tất</button></div>`);
    // Keep the current preview alive until the dialog closes.
    photoURLs.push(url);
    await navigate('today');
  } finally { if(status.isConnected)status.textContent=''; document.querySelectorAll('[data-action="capture"]').forEach(b=>b.disabled=false); }
}
async function showPhoto(id) {
  const epoch=state.sessionEpoch,ticket=showModal('Ảnh chấm công',loading());
  try {
    const response=await api(`/api/cloudflare/photo/${encodeURIComponent(id)}`,{raw:true});
    const url=URL.createObjectURL(await response.blob());photoURLs.push(url);
    if(!modal.open||ticket!==modalTicket||epoch!==state.sessionEpoch){URL.revokeObjectURL(url);return;}
    $('.modal-body').innerHTML=`<img class="photo-view" src="${url}" alt="Ảnh Timemark chấm công"><p class="hint">Ảnh ghép trên thiết bị; dùng bản ghi công máy chủ và quy trình đối soát để kiểm tra.</p>`;
  } catch(e) { if(modal.open&&ticket===modalTicket&&epoch===state.sessionEpoch)$('.modal-body').innerHTML=`<p class="error-text">${esc(e.message)}</p>`; }
}
async function exportReports() {
  const epoch=state.sessionEpoch;
  const response=await api(`/api/reports?${query({...state.filters,format:'csv'})}`,{raw:true});
  const blob=await response.blob();
  if(epoch!==state.sessionEpoch)throw new Error('Tài khoản đã thay đổi. Vui lòng xuất lại báo cáo.');
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`BABY_MARK-bang-cong-${state.filters.from}-${state.filters.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify('Đã xuất bảng công CSV. Bạn có thể mở tệp bằng Excel.');
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.view)return void navigate(button.dataset.view);
  if(button.dataset.adminTab){state.adminTab=button.dataset.adminTab;return void navigate('admin');}
  const action=button.dataset.action;if(!action)return;
  try {
    if(action==='mobile-menu'){mobileMenu(button.getAttribute('aria-expanded')!=='true');return;}
    if(action==='close-modal')return closeModal();
    if(action==='refresh')return void navigate();
    if(action==='enable-safe-features'){
      button.disabled=true;
      const result=await api('/api/admin/operations',{method:'POST',body:{action:'enable-safe'}});
      await navigate('admin');notify(result.push_activated?'Đã bật cảnh báo đi muộn và chính sách Push.':'Đã bật cảnh báo đi muộn. Push còn thiếu cấu hình.');return;
    }
    if(action==='push-enable'){
      if(!pushReg||!pushConfig?.public_key)throw Error('Push chưa sẵn sàng.');
      const epoch=state.sessionEpoch;
      // Call subscribe directly in the click gesture; Safari requires user activation.
      if(Notification.permission==='denied')throw Error('Chưa được cấp quyền thông báo. Hãy bật trong cài đặt thiết bị.');
      const sub=pushSub||await pushReg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKeyBytes(pushConfig.public_key)});
      if(epoch!==state.sessionEpoch){await sub.unsubscribe();return;}
      await api('/api/push/subscribe',{method:'POST',body:{endpoint:sub.endpoint}});
      try{localStorage.setItem('babymark-push-endpoint',sub.endpoint)}catch{}
      await navigate('push');notify('Đã đăng ký thiết bị nhận Push.');return;
    }
    if(action==='push-test'||action==='push-disable'){
      const sub=await pushReg?.pushManager.getSubscription();
      if(!sub)throw Error('Thiết bị chưa đăng ký Push.');
      if(action==='push-test'){await api('/api/push/test',{method:'POST',body:{endpoint:sub.endpoint}});notify('Dịch vụ Push đã chấp nhận yêu cầu; kiểm tra điện thoại.');}
      else{try{await api('/api/push/unsubscribe',{method:'POST',body:{endpoint:sub.endpoint}});}finally{await sub.unsubscribe();try{localStorage.removeItem('babymark-push-endpoint')}catch{}}await navigate('push');notify('Đã tắt Push trên thiết bị.');}return;
    }
    if(action==='self-password'){
      showModal('Đổi mật khẩu của bạn',`<form data-form="self-password" class="form-stack"><label>Mật khẩu hoặc mã hiện tại<input type="password" name="current" autocomplete="current-password" required maxlength="128"></label><label>Mật khẩu mới<input type="password" name="next" autocomplete="new-password" required minlength="9" maxlength="128"></label><label>Nhập lại mật khẩu mới<input type="password" name="confirm" autocomplete="new-password" required minlength="9" maxlength="128"></label><p class="hint">Tối thiểu 9 ký tự. Sau khi đổi, tất cả phiên cũ sẽ bị thu hồi.</p><p class="error-text inline-error" data-form-error hidden></p><div class="modal-actions"><button class="btn secondary" type="button" data-action="close-modal">Hủy</button><button class="btn" type="submit">Đổi mật khẩu</button></div></form>`);return;
    }
    if(action==='logout'){
      const token=state.token;let endpoint;
      try{endpoint=localStorage.getItem('babymark-push-endpoint');localStorage.removeItem('babymark-push-endpoint')}catch{}
      void disableDevicePush();
      const revoke=fetch('/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({push_endpoint:endpoint}),signal:AbortSignal.timeout(5000)});
      state.user=null;setSession(null);renderLogin();const epoch=state.sessionEpoch;
      try{const response=await revoke;if(!response.ok)throw Error('REVOKE_FAILED');}
      catch{if(epoch===state.sessionEpoch)renderLogin('Đã đăng xuất trên thiết bị. Chưa xác nhận thu hồi phiên máy chủ do mất kết nối.');}
      return;
    }
    if(action==='camera-start'){button.disabled=true;await startCamera();return;}
    if(action==='capture')return await capture(button.dataset.type,button);
    if(action==='photo')return await showPhoto(button.dataset.id);
    if(action==='export')return await exportReports();
    if(action==='admin-add')return adminForm();
    if(action==='admin-edit')return adminForm(state.admin[state.adminTab].find(r=>r.id===button.dataset.id));
    if(['branch-paste-gps','branch-current-gps','branch-check-map'].includes(action)){
      const form=button.closest('form');if(!form||form.dataset.resource!=='branches')return;
      const lat=form.elements.latitude,lng=form.elements.longitude,status=form.querySelector('[data-branch-gps-status]');
      const show=(message,error=false)=>{if(status.isConnected){status.textContent=message;status.classList.toggle('error-text',error);}};
      const valid=(a,b)=>Number.isFinite(a)&&Math.abs(a)<=90&&Number.isFinite(b)&&Math.abs(b)<=180;
      if(action==='branch-paste-gps'){
        const values=form.querySelector('[data-branch-coords]').value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
        if(!values||!valid(Number(values[1]),Number(values[2])))return show('Nhập hai số vĩ độ, kinh độ hợp lệ, phân cách bằng dấu phẩy.',true);
        lat.value=Number(values[1]);lng.value=Number(values[2]);return show('Đã điền tọa độ. Kiểm tra trên bản đồ trước khi lưu.');
      }
      if(action==='branch-check-map'){
        if(!lat.value.trim()||!lng.value.trim()||!valid(Number(lat.value),Number(lng.value)))return show('Cần có đủ vĩ độ và kinh độ hợp lệ.',true);
        window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(lat.value+','+lng.value),'_blank','noopener,noreferrer');return;
      }
      const ticket=modalTicket;button.disabled=true;show('Đang yêu cầu quyền vị trí…');
      try{const p=await currentPosition();if(ticket!==modalTicket||!form.isConnected)return;lat.value=p.lat;lng.value=p.lng;show('Đã điền GPS; sai số ±'+Math.round(p.accuracy)+' m. Kiểm tra trước khi lưu.');}
      catch(e){if(ticket===modalTicket)show(e.message,true);}
      finally{if(button.isConnected)button.disabled=false;}
      return;
    }
    if(action==='branch-active'||action==='shift-remove'||action==='assignment-cancel'){
      const active=button.dataset.active==='true',resource=action==='branch-active'?'branches':action==='shift-remove'?'shifts':'assignments';
      const title=action==='branch-active'?(active?'Khôi phục cửa hàng':'Ngừng hoạt động cửa hàng'):action==='shift-remove'?'Xóa mẫu ca chưa dùng':'Hủy ca tương lai';
      showModal(title,`<form data-form="admin-action" data-resource="${resource}" data-id="${esc(button.dataset.id)}" data-action-name="${action}" data-active="${active}" class="form-stack"><p class="muted">Chỉ thao tác khi không ảnh hưởng lịch sử chấm công; cửa hàng còn lịch chưa kết thúc sẽ bị từ chối ngừng hoạt động.</p>${action==='assignment-cancel'?'<label>Lý do hủy<input name="reason" required maxlength="300"></label>':''}<p class="error-text" data-form-error hidden></p><div class="modal-actions"><button class="btn secondary" type="button" data-action="close-modal">Quay lại</button><button class="btn" type="submit">Xác nhận</button></div></form>`);return;
    }
    if(action==='bulk-assign'){
      showModal('Phân ca hàng loạt',`<form data-form="bulk-assign" class="form-stack"><label>Nhân viên (chọn nhiều bằng Ctrl trên máy tính)<select name="user_ids" multiple required size="5">${rowOptions(state.admin.employees.filter(e=>e.active&&e.role!=='admin'),'','full_name')}</select></label><label>Cửa hàng<select name="branch_id" required><option value="">Chọn cửa hàng</option>${rowOptions(state.admin.branches.filter(b=>b.active!==0),'')}</select></label><label>Ca làm<select name="shift_id" required><option value="">Chọn ca</option>${rowOptions(state.admin.shifts,'')}</select></label><label>Từ ngày<input name="from" type="date" min="${today()}" value="${today()}" required></label><label>Đến ngày<input name="to" type="date" min="${today()}" value="${today()}" required></label><div class="checklist">${['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'].map((d,i)=>`<label><input type="checkbox" name="weekdays" value="${i+1}" ${i<5?'checked':''}>${d}</label>`).join('')}</div><p class="hint">Tối đa 31 ngày và 100 ca/lần. Nếu có ca trùng, toàn bộ đợt bị từ chối, không lưu dở dang.</p><p class="error-text" data-form-error hidden></p><button type="submit" class="btn">Tạo lịch hàng loạt</button></form>`);return;
    }
    if(action==='branch-remove'){
      const branch=state.admin.branches?.find(r=>r.id===button.dataset.id);if(!branch)return;
      showModal('Xóa cửa hàng chưa sử dụng',`<p>Chỉ xóa được cửa hàng <strong>${esc(branch.name)}</strong> chưa có lịch phân công và chưa được giao cho quản lý. Cửa hàng có lịch sử sẽ bị từ chối; không xóa bảng công hoặc ảnh.</p><form data-form="branch-remove" data-id="${esc(branch.id)}"><p class="error-text inline-error" data-form-error hidden></p><div class="modal-actions"><button class="btn secondary" type="button" data-action="close-modal">Hủy</button><button class="btn danger" type="submit">Xác nhận xóa</button></div></form>`);return;
    }
    const employee=state.admin.employees?.find(r=>r.id===button.dataset.id);
    if(action==='reset-account'){
      showModal('Cấp lại mã truy cập',`<p class="muted">Đặt mật khẩu hoặc cấp mã mới cho <strong>${esc(employee.full_name)}</strong> sẽ vô hiệu hóa thông tin cũ và toàn bộ phiên đăng nhập của nhân viên này.</p><form data-form="reset-account" data-id="${esc(employee.id)}"><div class="form-grid">${passwordField()}</div><p class="error-text inline-error" data-form-error hidden></p><div class="modal-actions"><button class="btn secondary" type="button" data-action="close-modal">Hủy</button><button class="btn" type="submit">Cấp lại mã</button></div></form>`);return;
    }
    if(action==='toggle-account'){
      showModal(employee.active?'Khóa tài khoản':'Mở khóa tài khoản',`<p class="muted">${employee.active?'Nhân viên sẽ được đăng xuất và không thể đăng nhập cho đến khi mở khóa.':'Nhân viên có thể đăng nhập lại bằng mã truy cập đang được cấp.'}</p><p class="hint">${esc(employee.full_name)} · ${esc(employee.employee_code)}</p><form data-form="toggle-account" data-id="${esc(employee.id)}" data-active="${employee.active?'false':'true'}"><p class="error-text inline-error" data-form-error hidden></p><div class="modal-actions"><button class="btn secondary" type="button" data-action="close-modal">Hủy</button><button class="btn" type="submit">${employee.active?'Khóa tài khoản':'Mở khóa'}</button></div></form>`);return;
    }
    if(action==='manager-scope'){
      const scope=state.admin.manager_branches.filter(r=>r.user_id===employee.id).map(r=>r.branch_id);
      showModal('Phạm vi quản lý cửa hàng',`<form data-form="manager-scope" data-id="${esc(employee.id)}"><p class="muted">${esc(employee.full_name)} chỉ được xem báo cáo và duyệt yêu cầu trong các cửa hàng được chọn.</p><div class="checklist section-gap">${state.admin.branches.map(b=>`<label><input type="checkbox" name="branch_ids" value="${esc(b.id)}" ${scope.includes(b.id)?'checked':''}>${esc(b.name)}</label>`).join('')}</div><p class="error-text inline-error" data-form-error hidden></p><div class="modal-actions"><button class="btn secondary" type="button" data-action="close-modal">Hủy</button><button class="btn" type="submit">Lưu phạm vi</button></div></form>`);return;
    }
    if(action==='request-add')return requestForm();
    if(action==='request-decide'){
      const r=state.requests.find(r=>r.id===button.dataset.id);
      showModal('Xem xét yêu cầu công',`<p class="muted"><strong>${esc(r.full_name)}</strong> · ${dateVN(r.work_date)}<br>${esc(r.branch_name)}</p><div class="credential">${esc(r.reason)}${r.kind==='CORRECTION'?`<p class="hint">Đề xuất: ${dt(r.proposed_in)} – ${dt(r.proposed_out)}</p>`:''}</div><form data-form="request-decide" data-id="${esc(r.id)}" class="form-stack section-gap"><label>Quyết định<select name="state"><option value="APPROVED">Phê duyệt</option><option value="REJECTED">Từ chối</option></select></label><label>Ghi chú quyết định<textarea name="decision_note" required minlength="3" maxlength="1000" placeholder="Nội dung đã đối soát"></textarea></label><p class="error-text" data-form-error hidden></p><div class="modal-actions"><button class="btn secondary" type="button" data-action="close-modal">Hủy</button><button class="btn" type="submit">Lưu quyết định</button></div></form>`);return;
    }
  }catch(e){notify(e.message||'Không thể thực hiện. Vui lòng thử lại.',true);}
  finally{if(button.isConnected)button.disabled=false;}
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!modal.open&&$('.sidebar.menu-open')){mobileMenu(false);$('[data-action="mobile-menu"]')?.focus();}
});
document.addEventListener('pointerdown',event=>{
 if($('.sidebar.menu-open')&&!event.target.closest('.sidebar'))mobileMenu(false);
});
document.addEventListener('change',event=>{
  if(event.target.id==='request-kind') {
    const correction=event.target.value==='CORRECTION';$('#correction-times').hidden=!correction;
    $('#correction-times').querySelectorAll('input').forEach(i=>i.required=correction);
  }
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!form.dataset.form)return;event.preventDefault();
  const button=form.querySelector('button[type="submit"]'), values=Object.fromEntries(new FormData(form));
  button.disabled=true;const old=button.innerHTML;button.textContent='Đang xử lý…';
  const error=form.querySelector('[data-form-error]')||$('#login-error');if(error)error.hidden=true;
  try{
    if(form.dataset.form==='login'){
      const username=values.username.trim().toLowerCase(),secret=values.secret;
      let body={username,secret};
      if(!isLegacyCode(secret)){
        if(secret.length<9||secret.length>128)throw new Error('Thông tin đăng nhập không đúng');
        const {salt}=await api('/api/auth/password-salt',{method:'POST',body:{username}});
        body={username,password_key:await derivePasswordKey(secret,salt)};
      }
      const result=await api('/api/auth/login',{method:'POST',body});setSession(result);
      state.user=(await api('/api/auth/me')).user;await navigate('today');return;
    }
    if(form.dataset.form==='self-password'){
      if(values.next!==values.confirm)throw new Error('Hai mật khẩu mới không khớp.');
      if(values.next===values.current)throw new Error('Mật khẩu mới cần khác mật khẩu hiện tại.');
      const body=await newPasswordCredential(values.next);
      if(isLegacyCode(values.current))body.current_secret=values.current;
      else{const {salt}=await api('/api/auth/self-salt');body.current_key=await derivePasswordKey(values.current,salt);}
      await api('/api/auth/change-password',{method:'POST',body});state.user=null;setSession(null);renderLogin('Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới.');return;
    }
    if(form.dataset.form==='push-settings'){
      await api('/api/push/settings',{method:'POST',body:{enabled:!!values.enabled,reminders:!!values.reminders,late_alerts:!!values.late_alerts}});await navigate('push');notify('Đã lưu cài đặt Push.');return;
    }
    if(form.dataset.form==='filter'){
      if(values.from>values.to)throw new Error('Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.');
      state.filters={...state.filters,...values};await navigate();return;
    }
    if(form.dataset.form==='admin-save'){
      const resource=form.dataset.resource,id=form.dataset.id;const payload={...values,...(id?{id}:{})};
      if(resource==='employees'&&!id){delete payload.password;if(values.password)Object.assign(payload,await newPasswordCredential(values.password));}
      if(resource==='branches'){payload.latitude=values.latitude===''?null:Number(values.latitude);payload.longitude=values.longitude===''?null:Number(values.longitude);payload.allowed_radius=Number(values.allowed_radius);}
      if(resource==='shifts')payload.grace_period=Number(values.grace_period);
      const result=await api(resource==='employees'&&!id?'/api/auth/create':`/api/admin/${resource}`,{method:'POST',body:payload});
      closeModal();await navigate('admin');if(result.secret)credentialModal(result);else notify(result.password_configured?'Đã tạo tài khoản với mật khẩu.':'Đã lưu thông tin.');return;
    }
    if(form.dataset.form==='system-settings'){
      const old=state.admin.settings;
      await api('/api/admin/settings',{method:'POST',body:{branch_limit:Number(values.branch_limit),late_alerts:!!values.late_alerts,photo_eviction:!!values.photo_eviction,attendance_retention:old.retention_secret_configured?!!values.attendance_retention:old.attendance_retention}});await navigate('admin');notify('Đã lưu cài đặt.');return;
    }
    if(form.dataset.form==='admin-action'){
      const op=form.dataset.actionName,body={id:form.dataset.id,action:op==='branch-active'?'set-active':op==='shift-remove'?'delete-unused':'cancel'};
      if(op==='branch-active')body.active=form.dataset.active==='true';if(op==='assignment-cancel')body.reason=values.reason;
      await api('/api/admin/'+form.dataset.resource,{method:'POST',body});closeModal();await navigate('admin');notify('Đã cập nhật.');return;
    }
    if(form.dataset.form==='bulk-assign'){
      const data=new FormData(form),result=await api('/api/admin/assignments',{method:'POST',body:{action:'bulk',user_ids:data.getAll('user_ids'),branch_id:values.branch_id,shift_id:values.shift_id,from:values.from,to:values.to,weekdays:data.getAll('weekdays').map(Number)}});
      state.filters={...state.filters,from:values.from,to:values.to};closeModal();await navigate('admin');notify('Đã tạo '+result.created+' ca.');return;
    }
    if(form.dataset.form==='branch-remove'){
      await api('/api/admin/branches',{method:'POST',body:{id:form.dataset.id,action:'delete-unused'}});closeModal();await navigate('admin');notify('Đã xóa cửa hàng chưa sử dụng.');return;
    }
    if(form.dataset.form==='reset-account'){
      const body={user_id:form.dataset.id};
      if(values.password)Object.assign(body,await newPasswordCredential(values.password));
      const result=await api('/api/auth/reset',{method:'POST',body});if(result.secret)credentialModal(result);else{closeModal();await navigate('admin');notify('Đã đặt mật khẩu mới và thu hồi phiên cũ.');}return;
    }
    if(form.dataset.form==='toggle-account'){
      await api('/api/auth/set-active',{method:'POST',body:{user_id:form.dataset.id,active:form.dataset.active==='true'}});closeModal();await navigate('admin');notify('Đã cập nhật trạng thái tài khoản.');return;
    }
    if(form.dataset.form==='manager-scope'){
      await api('/api/admin/manager-branches',{method:'POST',body:{user_id:form.dataset.id,branch_ids:new FormData(form).getAll('branch_ids')}});closeModal();await navigate('admin');notify('Đã lưu phạm vi cửa hàng.');return;
    }
    if(form.dataset.form==='request-create'){
      const payload={assignment_id:values.assignment_id,kind:values.kind,reason:values.reason};
      if(values.kind==='CORRECTION') {payload.proposed_in=Date.parse(values.proposed_in+':00+07:00');payload.proposed_out=Date.parse(values.proposed_out+':00+07:00');}
      await api('/api/workforce',{method:'POST',body:payload});closeModal();await navigate('requests');notify('Đã gửi yêu cầu chờ phê duyệt.');return;
    }
    if(form.dataset.form==='request-decide'){
      await api('/api/workforce',{method:'POST',body:{action:'decide',id:form.dataset.id,...values}});closeModal();await navigate('requests');notify('Đã lưu quyết định.');
    }
  }catch(e){if(error&&error.isConnected){error.textContent=e.message;error.hidden=false;}else notify(e.message,true);}
  finally{if(button.isConnected){button.disabled=false;button.innerHTML=old;}}
});
modal.addEventListener('cancel',event=>{event.preventDefault();closeModal();});
window.addEventListener('pagehide',()=>{stopCamera();clearPhotos();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});

async function boot(){
  if(!state.token)return renderLogin();
  try{state.user=(await api('/api/auth/me')).user;await navigate('today');}
  catch(e){setSession(null);renderLogin(e.message);}
}
await boot();
