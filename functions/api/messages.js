import {actorFor,apiFailure,ApiError,identifier,invalid,textField} from '../../cloudflare/lib/access.mjs';
import {digest,reply} from '../../cloudflare/lib/auth.mjs';
import {jsonLimited} from '../../cloudflare/lib/http.mjs';
const access="(t.kind='SYSTEM' OR EXISTS(SELECT 1 FROM chat_members cm WHERE cm.thread_id=t.id AND cm.user_id=?))";
const ready=async db=>(await db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('chat_threads','chat_members','chat_messages','chat_reads')").first()).n===4;
async function thread(db,actor,id){const t=await db.prepare('SELECT t.* FROM chat_threads t WHERE t.id=? AND '+access).bind(id,actor.id).first();if(!t)throw new ApiError(404,'Không tìm thấy cuộc trò chuyện');return t;}
export async function onRequestGet({request,env}){
 try{const actor=await actorFor(request,env),db=env.DB,u=new URL(request.url);
 if(!await ready(db))return reply({available:false});
 if(u.searchParams.has('thread')){
 const id=identifier(u.searchParams.get('thread')),t=await thread(db,actor,id);
 const before=u.searchParams.get('before');if(before!==null&&(!/^\d{1,15}$/.test(before)||Number(before)<1))invalid('Mốc tin nhắn không hợp lệ');
 const rows=(await db.prepare("SELECT m.id,m.sender_id,p.full_name AS sender_name,m.body,m.created_at FROM chat_messages m JOIN profiles p ON p.id=m.sender_id WHERE m.thread_id=? "+(before?"AND m.id<? ":"")+"ORDER BY m.id DESC LIMIT 51").bind(id,...(before?[Number(before)]:[])).all()).results;
 const more=rows.length>50,messages=rows.slice(0,50).reverse();
 const members=t.kind==='SYSTEM'?[]:(await db.prepare("SELECT p.id,p.employee_code,p.full_name,p.active FROM chat_members cm JOIN profiles p ON p.id=cm.user_id WHERE cm.thread_id=? ORDER BY p.employee_code").bind(id).all()).results;
 return reply({available:true,thread:{id:t.id,kind:t.kind,title:t.title},members,messages,more});
 }
 const threads=(await db.prepare("SELECT t.id,t.kind,t.title,t.created_at,(SELECT p.full_name FROM chat_members cm JOIN profiles p ON p.id=cm.user_id WHERE cm.thread_id=t.id AND p.id<>? LIMIT 1) AS peer_name,m.body AS latest_body,m.created_at AS latest_at,CASE WHEN EXISTS(SELECT 1 FROM chat_messages x WHERE x.thread_id=t.id AND x.id>COALESCE(rd.last_read_id,0) AND x.sender_id<>?) THEN 1 ELSE 0 END AS unread FROM chat_threads t LEFT JOIN chat_messages m ON m.id=(SELECT MAX(id) FROM chat_messages WHERE thread_id=t.id) LEFT JOIN chat_reads rd ON rd.thread_id=t.id AND rd.user_id=? WHERE "+access+" ORDER BY CASE WHEN t.kind='SYSTEM' THEN 0 ELSE 1 END,COALESCE(m.id,0) DESC,t.created_at DESC LIMIT 201").bind(actor.id,actor.id,actor.id,actor.id).all()).results;
 const contacts=(await db.prepare("SELECT id,employee_code,full_name,department,role FROM profiles WHERE active=1 AND id<>? ORDER BY employee_code LIMIT 100").bind(actor.id).all()).results;
 return reply({available:true,threads:threads.slice(0,200),truncated:threads.length>200,contacts});
 }catch(e){return apiFailure(e)}
}
export async function onRequestPost({request,env}){
 try{const actor=await actorFor(request,env),db=env.DB,b=await jsonLimited(request,16384),now=Date.now();
 if(!await ready(db))throw new ApiError(409,'Cần migration 0015 để sử dụng tin nhắn');
 if(b?.action==='direct'||b?.action==='group'){
 const direct=b.action==='direct',raw=direct?[b.user_id]:b.user_ids;
 if(!Array.isArray(raw)||!raw.length||raw.length>49||new Set(raw).size!==raw.length)invalid('Chọn thành viên hợp lệ');
 const others=raw.map(identifier);if(others.includes(actor.id)||(!direct&&others.length<2))invalid('Nhóm cần ít nhất 3 thành viên gồm bạn');
 const ids=[actor.id,...others],id=direct?await digest('babymark-direct:'+JSON.stringify([...ids].sort())):crypto.randomUUID(),title=direct?'':textField(b.title,100);
 const active=(await db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE active=1 AND id IN ("+ids.map(()=>'?').join(',')+")").bind(...ids).first()).n;
 if(active!==ids.length)invalid('Thành viên không còn hoạt động');
 if(!direct){const count=await db.prepare("SELECT COUNT(*) AS n FROM chat_threads WHERE created_by=? AND kind='GROUP' AND created_at>?").bind(actor.id,now-86400000).first();if(count.n>=10)throw new ApiError(429,'Tối đa 10 nhóm mới mỗi ngày');}
 await db.batch([db.prepare("INSERT OR IGNORE INTO chat_threads(id,kind,title,created_by,created_at) VALUES(?,?,?,?,?)").bind(id,direct?'DIRECT':'GROUP',title,actor.id,now),...ids.map(user=>db.prepare('INSERT OR IGNORE INTO chat_members(thread_id,user_id) VALUES(?,?)').bind(id,user))]);
 return reply({id},201);
 }
 if(b?.action==='send'){
 const id=identifier(b.thread_id),t=await thread(db,actor,id),body=textField(b.body,2000);
 if(t.kind==='SYSTEM'&&actor.role!=='admin')throw new ApiError(403,'Chỉ Admin được gửi thông báo hệ thống');
 const rate=await db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE sender_id=? AND created_at>?').bind(actor.id,now-60000).first();
 if(rate.n>=30)throw new ApiError(429,'Gửi tối đa 30 tin/phút; thử lại sau');
 const hash=await digest('babymark-session-v1:'+request.headers.get('authorization').slice(7));
 const result=await db.prepare("INSERT INTO chat_messages(thread_id,sender_id,body,created_at) SELECT t.id,p.id,?,? FROM chat_threads t JOIN profiles p ON p.id=? AND p.active=1 JOIN credentials c ON c.user_id=p.id JOIN sessions s ON s.user_id=p.id AND s.credential_version=c.version AND s.token_hash=? AND s.expires_at>? WHERE t.id=? AND ((t.kind='SYSTEM' AND p.role='admin') OR (t.kind<>'SYSTEM' AND EXISTS(SELECT 1 FROM chat_members cm WHERE cm.thread_id=t.id AND cm.user_id=p.id))) AND (SELECT COUNT(*) FROM chat_messages WHERE sender_id=p.id AND created_at>?)<30").bind(body,now,actor.id,hash,Date.now(),id,now-60000).run();
 if(result.meta.changes!==1){const latest=await db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE sender_id=? AND created_at>?').bind(actor.id,now-60000).first();if(latest.n>=30)throw new ApiError(429,'Gửi tối đa 30 tin/phút; thử lại sau');throw new ApiError(403,'Không còn quyền gửi');}
 return reply({ok:true},201);
 }
 if(b?.action==='read'){
 const id=identifier(b.thread_id);await thread(db,actor,id);
 if(!Number.isSafeInteger(b.message_id)||b.message_id<1)invalid('Mốc đọc không hợp lệ');
 const row=await db.prepare('SELECT id FROM chat_messages WHERE thread_id=? AND id=?').bind(id,b.message_id).first();if(!row)invalid('Tin nhắn không tồn tại');
 await db.prepare('INSERT INTO chat_reads(thread_id,user_id,last_read_id) VALUES(?,?,?) ON CONFLICT(thread_id,user_id) DO UPDATE SET last_read_id=MAX(chat_reads.last_read_id,excluded.last_read_id)').bind(id,actor.id,row.id).run();
 return reply({ok:true});
 }
 invalid('Thao tác tin nhắn không hợp lệ');
 }catch(e){return apiFailure(e)}
}
