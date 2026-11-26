import {sessionUser,reply,digest} from './auth.mjs';
import {HttpError} from './http.mjs';

export class ApiError extends Error {
 constructor(status,message){super(message);this.status=status;}
}
export const invalid=(message='Dữ liệu không hợp lệ')=>{throw new ApiError(400,message)};
export function textField(value,max=120,optional=false){
 if(typeof value!=='string'||value.length>max||(!optional&&!value.trim()))invalid();
 return value.trim();
}
export function identifier(value){
 if(typeof value!=='string'||! /^[a-zA-Z0-9._-]{1,64}$/.test(value))invalid('Mã định danh không hợp lệ');
 return value;
}
export async function actorFor(request,env,{admin=false}={}){
 if(!env.DB)throw new ApiError(503,'D1 chưa kết nối');
 const actor=await sessionUser(request,env.DB);
 if(!actor)throw new ApiError(401,'Chưa đăng nhập');
 if(admin&&actor.role!=='admin')throw new ApiError(403,'Chỉ quản trị viên được thay đổi cấu hình');
 return actor;
}
// SQL-bound revalidation of the same session and role observed at request entry.
export async function writeSession(request,actor){
 const token=request.headers.get('authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
 if(!token)throw new ApiError(401,'Chưa đăng nhập');
 const hash=await digest('babymark-session-v1:'+token);
 return {sql:"EXISTS(SELECT 1 FROM sessions ss JOIN profiles p ON p.id=ss.user_id AND p.active=1 JOIN credentials c ON c.user_id=p.id AND c.version=ss.credential_version WHERE ss.token_hash=? AND ss.expires_at>? AND p.id=? AND p.role=?)",args:()=>[hash,Date.now(),actor.id,actor.role]};
}
export function assignmentScope(actor,alias='a'){
 if(actor.role==='admin')return {sql:'1=1',values:[]};
 if(actor.role==='manager')return {sql:`(${alias}.user_id=? OR EXISTS(SELECT 1 FROM branch_managers bm WHERE bm.user_id=? AND bm.branch_id=${alias}.branch_id))`,values:[actor.id,actor.id]};
 return {sql:`${alias}.user_id=?`,values:[actor.id]};
}
export function dayVN(now=Date.now()){return new Date(now+7*3600000).toISOString().slice(0,10)}
export function validDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const stamp=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;
}
export function dateRange(url,now=Date.now()){
 const current=dayVN(now),from=url.searchParams.get('from')||current.slice(0,7)+'-01',to=url.searchParams.get('to')||current;
 if(!validDay(from)||!validDay(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>92)invalid('Chọn khoảng ngày hợp lệ, tối đa 93 ngày');
 return {from,to};
}
export function shiftInterval(workDate,startTime,endTime){
 if(!validDay(workDate)||![startTime,endTime].every(v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v))||startTime===endTime)invalid('Ngày hoặc giờ ca không hợp lệ');
 const starts_at=Date.parse(`${workDate}T${startTime}:00+07:00`);
 let ends_at=Date.parse(`${workDate}T${endTime}:00+07:00`);
 if(ends_at<starts_at)ends_at+=86400000;
 return {starts_at,ends_at};
}
export function managementAudit(db,actor,resource,id,action,details={}){
 return db.prepare('INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,resource,id,action,JSON.stringify(details),Date.now());
}
export function apiFailure(error){
 if(error instanceof ApiError||error instanceof HttpError)return reply({error:error.message},error.status);
 if(error instanceof SyntaxError||error?.message==='INVALID_BODY')return reply({error:'Nội dung yêu cầu không hợp lệ'},400);
 // Never expose SQL, identifiers, credential material or runtime stack traces.
 return reply({error:'Không thể lưu dữ liệu. Kiểm tra mã bị trùng, lịch ca chồng nhau hoặc ca đã có lịch sử.'},409);
}
export function csvCell(value){
 let cell=value==null?'':String(value);
 if(/^[\s\u0000-\u001f]*[=+\-@]/.test(cell)||/^[\t\r\n]/.test(cell))cell="'"+cell;
 return '"'+cell.replaceAll('"','""')+'"';
}
