import {HttpError} from './http.mjs';
export const faceSchema=async db=>!!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='face_pilot'").first();
export async function faceRequired(db,userId){return await faceSchema(db)&&!!await db.prepare('SELECT user_id FROM face_pilot WHERE user_id=?').bind(userId).first();}
export function faceGateway(env){
 try{
  const url=new URL(env.FACE_GATEWAY_URL);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||typeof env.FACE_GATEWAY_TOKEN!=='string'||env.FACE_GATEWAY_TOKEN.length<32)return null;
  return {origin:url.origin,token:env.FACE_GATEWAY_TOKEN};
 }catch{return null}
}
export async function gatewayCall(env,path,body,fetcher=fetch){
 const cfg=faceGateway(env);if(!cfg)throw new HttpError(503,'Chưa kết nối dịch vụ xác minh khuôn mặt');
 try{
  const r=await fetcher(cfg.origin+path,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+cfg.token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('gateway');return await r.json();
 }catch{throw new HttpError(503,'Dịch vụ xác minh chưa sẵn sàng; có thể gửi ngoại lệ để quản lý duyệt.');}
}
export async function faceEvidence(env,user,a,b,now,fetcher=fetch){
 if(!await faceRequired(env.DB,user.id))return {mode:'NOT_REQUIRED'};
 if(typeof b.face_exception==='string'&&b.face_exception.trim().length>=5&&b.face_exception.length<=500){
  return {mode:'EXCEPTION',reason:b.face_exception.trim()};
 }
 if(typeof b.face_session!=='string'||!/^[a-f0-9-]{36}$/i.test(b.face_session))throw new HttpError(409,'Cần xác minh khuôn mặt hoặc khai báo lý do ngoại lệ');
 const db=env.DB,s=await db.prepare('SELECT * FROM face_sessions WHERE id=? AND user_id=? AND assignment_id=? AND type=? AND expires_at>? AND used_at IS NULL').bind(b.face_session,user.id,a.id,b.type,now).first();
 if(!s)throw new HttpError(409,'Phiên xác minh đã hết hạn hoặc không khớp ca');
 const result=await gatewayCall(env,'/result',{session_id:s.id,subject_id:user.id,assignment_id:a.id,type:b.type},fetcher);
 // Only a configured server-side gateway is trusted. Browser scores are ignored.
 if(result?.session_id!==s.id||result.subject_id!==user.id||result.assignment_id!==a.id||result.type!==b.type||result.liveness_passed!==true||result.match_passed!==true||result.enrollment_verified!==true)throw new HttpError(409,'Khuôn mặt chưa được xác minh; thử lại hoặc khai báo ngoại lệ');
 const used=await db.prepare('UPDATE face_sessions SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>? RETURNING id').bind(Date.now(),s.id,Date.now()).first();
 if(!used)throw new HttpError(409,'Phiên xác minh đã sử dụng hoặc hết hạn');
 return {mode:'VERIFIED',session_id:s.id};
}
