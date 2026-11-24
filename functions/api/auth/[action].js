import {randomHex,digest,usernameOf,validUsername,validSecret,credentialHash,generateCredential,equalHash,sessionUser,reply,bodyJSON} from '../../../cloudflare/lib/auth.mjs';
const validText=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
const uuid=v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v);
const HOURS=8;
export async function onRequestGet({request,env,params}){
 if(!env.DB)return reply({error:'D1 chưa kết nối'},503);
 try{
 const actor=await sessionUser(request,env.DB);if(!actor)return reply({error:'Chưa đăng nhập'},401);
 if(params.action==='me')return reply({user:actor});
 if(params.action==='accounts'&&actor.role==='admin'){
 const {results}=await env.DB.prepare('SELECT p.id,p.employee_code,p.full_name,p.role,p.department,p.active,c.username FROM profiles p JOIN credentials c ON c.user_id=p.id ORDER BY p.employee_code LIMIT 500').all();return reply({accounts:results});
 }
 return reply({error:'Không có quyền hoặc đường dẫn không hợp lệ'},403);
 }catch{return reply({error:'Lỗi hệ thống'},500)}
}
export async function onRequestPost({request,env,params}){
 const db=env.DB;if(!db)return reply({error:'D1 chưa kết nối'},503);
 try{
 const action=params.action,b=await bodyJSON(request),now=Date.now();
 if(action==='login'){
 const username=usernameOf(b.username),secret=b.secret;
 if(!validUsername(username)||!validSecret(secret))return reply({error:'Thông tin đăng nhập không đúng'},401);
 const c=await db.prepare('SELECT c.user_id,c.salt,c.secret_hash,c.version,p.active FROM credentials c JOIN profiles p ON p.id=c.user_id WHERE c.username=?').bind(username).first();
 if(!c||!c.active)return reply({error:'Thông tin đăng nhập không đúng'},401);
 const window=Math.floor(now/900000);
 const attempt=await db.prepare('INSERT INTO login_attempts(user_id,window_id,attempts) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET attempts=CASE WHEN window_id=excluded.window_id THEN min(attempts+1,11) ELSE 1 END,window_id=excluded.window_id RETURNING attempts').bind(c.user_id,window).first();
 if(attempt.attempts>10)return reply({error:'Quá nhiều lần thử, hãy thử lại sau'},429);
 if(!equalHash(await credentialHash(c.salt,secret),c.secret_hash))return reply({error:'Thông tin đăng nhập không đúng'},401);
 const token=randomHex(32),hash=await digest('babymark-session-v1:'+token),expires=now+HOURS*3600000;
 await db.batch([db.prepare('DELETE FROM sessions WHERE user_id=? AND expires_at<=?').bind(c.user_id,now),db.prepare('INSERT INTO sessions(token_hash,user_id,credential_version,created_at,expires_at) VALUES(?,?,?,?,?)').bind(hash,c.user_id,c.version,now,expires),db.prepare('DELETE FROM login_attempts WHERE user_id=?').bind(c.user_id)]);
 return reply({token,expires_at:expires});
 }
 const actor=await sessionUser(request,db);if(!actor)return reply({error:'Chưa đăng nhập'},401);
 if(action==='logout'){
 const token=request.headers.get('authorization').slice(7);await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest('babymark-session-v1:'+token)).run();return reply({ok:true});
 }
 if(actor.role!=='admin')return reply({error:'Không có quyền'},403);
 const audit=(id,action)=>db.prepare('INSERT INTO auth_audit(id,actor_id,target_id,action,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,id,action,now);
 if(action==='create'){
 const username=usernameOf(b.username);
 if(!validUsername(username)||!validText(b.employee_code,40)||!validText(b.full_name,120)||!['staff','manager'].includes(b.role)||typeof b.department!=='string'||b.department.length>100)return reply({error:'Thông tin tài khoản không hợp lệ'},400);
 const id=crypto.randomUUID(),c=await generateCredential();
 await db.batch([db.prepare('INSERT INTO profiles(id,employee_code,full_name,role,department,active) VALUES(?,?,?,?,?,1)').bind(id,b.employee_code.trim(),b.full_name.trim(),b.role,b.department.trim()),db.prepare('INSERT INTO credentials(user_id,username,salt,secret_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,username,c.salt,c.hash,now,now),audit(id,'CREATE')]);
 return reply({id,username,secret:c.secret},201);
 }
 if(!['reset','set-active'].includes(action)||!uuid(b.user_id))return reply({error:'Yêu cầu không hợp lệ'},400);
 const target=await db.prepare('SELECT p.id,p.role,c.username FROM profiles p JOIN credentials c ON p.id=c.user_id WHERE p.id=?').bind(b.user_id).first();
 if(!target||target.role==='admin')return reply({error:'Chỉ quản lý tài khoản nhân viên hoặc quản lý cửa hàng'},403);
 if(action==='reset'){
 const c=await generateCredential();await db.batch([db.prepare('UPDATE credentials SET salt=?,secret_hash=?,version=version+1,updated_at=? WHERE user_id=?').bind(c.salt,c.hash,now,target.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id),db.prepare('DELETE FROM login_attempts WHERE user_id=?').bind(target.id),audit(target.id,'RESET')]);
 return reply({username:target.username,secret:c.secret});
 }
 if(typeof b.active!=='boolean')return reply({error:'Trạng thái không hợp lệ'},400);
 await db.batch([db.prepare('UPDATE profiles SET active=? WHERE id=? AND role<>?').bind(b.active?1:0,target.id,'admin'),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id),audit(target.id,b.active?'ENABLE':'DISABLE')]);return reply({ok:true});
 }catch(e){return reply({error:'Không thể xử lý yêu cầu; kiểm tra dữ liệu hoặc trùng mã tài khoản'},409)}
}
