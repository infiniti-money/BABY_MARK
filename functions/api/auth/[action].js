import {randomHex,digest,usernameOf,validUsername,validSecret,credentialHash,generateCredential,validPasswordKey,validPasswordSalt,passwordKeyHash,equalHash,sessionUser,reply,bodyJSON} from '../../../cloudflare/lib/auth.mjs';
import {HttpError} from '../../../cloudflare/lib/http.mjs';
const validText=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
const uuid=v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v);
const HOURS=8;
async function issuedCredential(b){
 if(b.password_key===undefined&&b.password_salt===undefined)return generateCredential();
 if(!validPasswordKey(b.password_key)||!validPasswordSalt(b.password_salt))return null;
 return {salt:b.password_salt,hash:await passwordKeyHash(b.password_salt,b.password_key),password_configured:true};
}
const issuedResponse=(c)=>c.password_configured?{password_configured:true}:{secret:c.secret};
export async function onRequestGet({request,env,params}){
 if(!env.DB)return reply({error:'D1 chưa kết nối'},503);
 try{
 const actor=await sessionUser(request,env.DB);if(!actor)return reply({error:'Chưa đăng nhập'},401);
 if(params.action==='me')return reply({user:actor});
 if(params.action==='self-salt'&&actor.role!=='admin'){
  const c=await env.DB.prepare('SELECT salt FROM credentials WHERE user_id=?').bind(actor.id).first();
  return reply({salt:c.salt});
 }
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
 if(action==='password-salt'){
 const username=usernameOf(b.username);
 if(!validUsername(username))return reply({error:'Thông tin đăng nhập không đúng'},401);
 const row=await db.prepare('SELECT salt FROM credentials WHERE username=?').bind(username).first();
 // Salts are public KDF inputs, not credentials. A dummy result keeps the response shape
 // identical for absent users, but this endpoint does not promise enumeration resistance.
 const salt=row?.salt||randomHex(16);
 return reply({salt});
 }
 if(action==='login'){
 const username=usernameOf(b.username),secret=b.secret,key=b.password_key;
 const passwordMode=key!==undefined;
 if(!validUsername(username)||(passwordMode?(!validPasswordKey(key)||secret!==undefined):!validSecret(secret)))return reply({error:'Thông tin đăng nhập không đúng'},401);
 const c=await db.prepare('SELECT c.user_id,c.salt,c.secret_hash,c.version,p.active FROM credentials c JOIN profiles p ON p.id=c.user_id WHERE c.username=?').bind(username).first();
 if(!c||!c.active)return reply({error:'Thông tin đăng nhập không đúng'},401);
 const window=Math.floor(now/900000);
 const attempt=await db.prepare('INSERT INTO login_attempts(user_id,window_id,attempts) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET attempts=CASE WHEN window_id=excluded.window_id THEN min(attempts+1,11) ELSE 1 END,window_id=excluded.window_id RETURNING attempts').bind(c.user_id,window).first();
 if(attempt.attempts>10)return reply({error:'Quá nhiều lần thử, hãy thử lại sau'},429);
 if(!equalHash(await (passwordMode?passwordKeyHash(c.salt,key):credentialHash(c.salt,secret)),c.secret_hash))return reply({error:'Thông tin đăng nhập không đúng'},401);
 const token=randomHex(32),hash=await digest('babymark-session-v1:'+token),expires=now+HOURS*3600000;
 await db.batch([db.prepare('DELETE FROM sessions WHERE user_id=? AND expires_at<=?').bind(c.user_id,now),db.prepare('INSERT INTO sessions(token_hash,user_id,credential_version,created_at,expires_at) VALUES(?,?,?,?,?)').bind(hash,c.user_id,c.version,now,expires),db.prepare('DELETE FROM login_attempts WHERE user_id=?').bind(c.user_id)]);
 return reply({token,expires_at:expires});
 }
 const actor=await sessionUser(request,db);if(!actor)return reply({error:'Chưa đăng nhập'},401);
 if(action==='logout'){
 const token=request.headers.get('authorization').slice(7);await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest('babymark-session-v1:'+token)).run();return reply({ok:true});
 }
 if(action==='change-password'){
  if(actor.role==='admin')return reply({error:'Chức năng này dành cho nhân viên và quản lý'},403);
  const c=await db.prepare('SELECT salt,secret_hash,version FROM credentials WHERE user_id=?').bind(actor.id).first();
  if(!c)return reply({error:'Thông tin đăng nhập không đúng'},403);
  const next=await issuedCredential(b);
  if(!next?.password_configured||next.salt===c.salt)return reply({error:'Mật khẩu mới không hợp lệ'},400);
  const key=b.current_key,secret=b.current_secret;
  if((key!==undefined?(!validPasswordKey(key)||secret!==undefined):!validSecret(secret)))return reply({error:'Thông tin đăng nhập không đúng'},403);
  const window=Math.floor(now/900000);
  const attempt=await db.prepare('INSERT INTO login_attempts(user_id,window_id,attempts) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET attempts=CASE WHEN window_id=excluded.window_id THEN min(attempts+1,11) ELSE 1 END,window_id=excluded.window_id RETURNING attempts').bind(actor.id,window).first();
  if(attempt.attempts>10)return reply({error:'Quá nhiều lần thử, hãy thử lại sau'},429);
  if(!equalHash(await (key!==undefined?passwordKeyHash(c.salt,key):credentialHash(c.salt,secret)),c.secret_hash))return reply({error:'Thông tin đăng nhập hiện tại không đúng'},403);
  const sessionHash=await digest('babymark-session-v1:'+request.headers.get('authorization').slice(7));
  const changed='EXISTS(SELECT 1 FROM credentials WHERE user_id=? AND version=? AND salt=? AND secret_hash=?)';
  const args=[actor.id,c.version+1,next.salt,next.hash];
  const result=await db.batch([
   db.prepare("UPDATE credentials SET salt=?,secret_hash=?,version=version+1,updated_at=? WHERE user_id=? AND version=? AND EXISTS(SELECT 1 FROM sessions s JOIN profiles p ON p.id=s.user_id AND p.active=1 AND p.role<>'admin' WHERE s.user_id=credentials.user_id AND s.token_hash=? AND s.credential_version=credentials.version AND s.expires_at>?) RETURNING user_id").bind(next.salt,next.hash,now,actor.id,c.version,sessionHash,Date.now()),
   db.prepare("INSERT INTO auth_audit(id,actor_id,target_id,action,created_at) SELECT ?,?,?,'RESET',? WHERE changes()=1").bind(crypto.randomUUID(),actor.id,actor.id,now),
   db.prepare('DELETE FROM sessions WHERE user_id=? AND credential_version<? AND '+changed).bind(actor.id,c.version+1,...args),
   db.prepare('DELETE FROM login_attempts WHERE user_id=? AND '+changed).bind(actor.id,...args)
  ]);
  if(result[0].meta.changes!==1)return reply({error:'Phiên hoặc mật khẩu đã thay đổi; đăng nhập lại'},409);
  return reply({ok:true,reauthenticate:true});
 }
 if(actor.role!=='admin')return reply({error:'Không có quyền'},403);
 const audit=(id,action)=>db.prepare('INSERT INTO auth_audit(id,actor_id,target_id,action,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,id,action,now);
 if(action==='create'){
 const username=usernameOf(b.username);
 if(!validUsername(username)||!validText(b.employee_code,40)||!validText(b.full_name,120)||!['staff','manager'].includes(b.role)||typeof b.department!=='string'||b.department.length>100)return reply({error:'Thông tin tài khoản không hợp lệ'},400);
 const id=crypto.randomUUID(),c=await issuedCredential(b);if(!c)return reply({error:'Thông tin mật khẩu không hợp lệ'},400);
 await db.batch([db.prepare('INSERT INTO profiles(id,employee_code,full_name,role,department,active) VALUES(?,?,?,?,?,1)').bind(id,b.employee_code.trim(),b.full_name.trim(),b.role,b.department.trim()),db.prepare('INSERT INTO credentials(user_id,username,salt,secret_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,username,c.salt,c.hash,now,now),audit(id,'CREATE')]);
 return reply({id,username,...issuedResponse(c)},201);
 }
 if(!['reset','set-active'].includes(action)||!uuid(b.user_id))return reply({error:'Yêu cầu không hợp lệ'},400);
 const target=await db.prepare('SELECT p.id,p.role,c.username FROM profiles p JOIN credentials c ON p.id=c.user_id WHERE p.id=?').bind(b.user_id).first();
 if(!target||target.role==='admin')return reply({error:'Chỉ quản lý tài khoản nhân viên hoặc quản lý cửa hàng'},403);
 if(action==='reset'){
 const c=await issuedCredential(b);if(!c)return reply({error:'Thông tin mật khẩu không hợp lệ'},400);await db.batch([db.prepare('UPDATE credentials SET salt=?,secret_hash=?,version=version+1,updated_at=? WHERE user_id=?').bind(c.salt,c.hash,now,target.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id),db.prepare('DELETE FROM login_attempts WHERE user_id=?').bind(target.id),audit(target.id,'RESET')]);
 return reply({username:target.username,...issuedResponse(c)});
 }
 if(typeof b.active!=='boolean')return reply({error:'Trạng thái không hợp lệ'},400);
 await db.batch([db.prepare('UPDATE profiles SET active=? WHERE id=? AND role<>?').bind(b.active?1:0,target.id,'admin'),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id),audit(target.id,b.active?'ENABLE':'DISABLE')]);return reply({ok:true});
 }catch(e){if(e instanceof HttpError)return reply({error:e.message},e.status);return reply({error:'Không thể xử lý; kiểm tra mã trùng hoặc giới hạn 50 tài khoản hoạt động'},409)}
}
