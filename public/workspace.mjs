import {captureEligible} from './attendance-window.mjs';
const DAY=86400000;
export function primaryViews(role){
 return role==='admin'?['overview','requests','admin']:role==='manager'?['today','requests','reports']:['today','schedule','requests'];
}
export function initialFilters(view,day){
 const stamp=Date.parse(day+'T12:00:00Z');
 return {from:view==='requests'?new Date(stamp-30*DAY).toISOString().slice(0,10):day.slice(0,7)+'-01',to:view==='requests'?new Date(stamp+31*DAY).toISOString().slice(0,10):day,branch_id:'',user_id:''};
}
export function includeRequestDates(filters,from,to=from){
 const start=filters.from<from?filters.from:from,end=filters.to>to?filters.to:to;
 return {...filters,...(Date.parse(end)-Date.parse(start)<=92*DAY?{from:start,to:end}:{from,to})};
}
export function captureControls(assignment,{ready=false,busy=false,blocked=false,now=Date.now()}={}){
 const unavailable=!assignment||!captureEligible(assignment,now),complete=!!(assignment?.in_id&&assignment?.out_id);
 const disabled=busy||blocked||unavailable||!ready;
 const next=assignment?.in_id?'OUT':'IN';
 const hint=blocked?'Kiểm tra kết quả chấm công trước đó trước khi chụp mới.':busy?'Đang xử lý, vui lòng đợi.':!assignment?'Chọn ca làm để xem lượt cần chấm.':unavailable?'Ca này chưa đến hoặc đã hết thời hạn chấm công.':complete?'Ca đã có đủ lượt vào và tan ca. Xem lịch sử để đối soát.':!ready?'Bật camera để chụp '+(next==='IN'?'vào ca.':'tan ca.'):'Camera sẵn sàng. Chụp '+(next==='IN'?'vào ca':'tan ca')+' rồi kiểm tra ảnh trước khi xác nhận.';
 return {inDisabled:disabled||!!assignment?.in_id,outDisabled:disabled||!assignment?.in_id||!!assignment?.out_id,next,hint};
}
export function requestMatches(row,filter,user){
 return filter==='ALL'||(filter==='REVIEW'?user.role!=='staff'&&row.state==='PENDING'&&row.user_id!==user.id:row.state===filter);
}
