import {actorFor,ApiError,apiFailure,identifier,invalid,validDay,dayVN} from '../../cloudflare/lib/access.mjs';
import {reply,digest} from '../../cloudflare/lib/auth.mjs';
import {jsonLimited} from '../../cloudflare/lib/http.mjs';
import {cvFields,hrDeadlines} from '../../public/employee-cv.mjs';
const ready=async db=>!!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employee_cv'").first();
const canRead=(actor,id)=>actor.role==='admin'||actor.id===id;
function clean(value){
 if(!value||typeof value!=='object'||Array.isArray(value))invalid('CV không hợp lệ');
 const keys=new Set(cvFields.map(f=>f[0]));if(Object.keys(value).some(k=>!keys.has(k)))invalid('Trường CV không hợp lệ');
 const out={};for(const [key,label,type,max] of cvFields){
  const v=value[key]??'';if(typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))invalid(label+' không hợp lệ');
  out[key]=v.trim();
  if(type==='date'&&out[key]&&(!validDay(out[key])||out[key]<'1900-01-01'||out[key]>'2199-12-31'||key==='birth_date'&&out[key]>dayVN()))invalid(label+' không hợp lệ');
  if(type==='email'&&out[key]&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out[key]))invalid('Email không hợp lệ');
 }
 for(const [start,end,label] of [['contract_start','contract_end','Hợp đồng'],['probation_start','probation_end','Thử việc']]){
  if(out[end]&&!out[start])invalid(label+': cần ngày bắt đầu');
  if(out[start]&&out[end]&&out[end]<out[start])invalid(label+': ngày kết thúc phải từ ngày bắt đầu');
 }
 if(new TextEncoder().encode(JSON.stringify(out)).length>24000)invalid('CV vượt dung lượng cho phép');
 return out;
}
export async function onRequestGet({request,env}){try{
 const actor=await actorFor(request,env),db=env.DB,u=new URL(request.url);
 if(u.searchParams.get('view')==='deadlines'){
  if(actor.role!=='admin')throw new ApiError(403,'Chỉ Admin được xem thời hạn hồ sơ');
  if(!await ready(db))return reply({available:false});
  const day=dayVN(),rows=(await db.prepare("SELECT p.id,p.employee_code,p.full_name,json_extract(c.data_json,'$.contract_end') AS contract_end,json_extract(c.data_json,'$.probation_end') AS probation_end,CASE WHEN length(trim(COALESCE(json_extract(c.data_json,'$.probation_result'),'')))>0 THEN 'recorded' ELSE '' END AS probation_result FROM profiles p JOIN employee_cv c ON c.user_id=p.id WHERE p.active=1 AND p.role<>'admin' ORDER BY p.employee_code LIMIT 51").all()).results;
  await actorFor(request,env,{admin:true});
  const items=rows.slice(0,50).flatMap(({id,employee_code,full_name,...cv})=>hrDeadlines(cv,day).map(x=>({id,employee_code,full_name,...x}))).sort((a,b)=>a.end.localeCompare(b.end)||a.employee_code.localeCompare(b.employee_code));
  return reply({available:true,day,window_days:30,items,truncated:rows.length>50});
 }
 const id=identifier(u.searchParams.get('user_id')||actor.id);
 if(!canRead(actor,id))throw new ApiError(404,'Không tìm thấy hồ sơ');
 if(!await ready(db))return reply({available:false});
 const hash=await digest('babymark-session-v1:'+request.headers.get('authorization').slice(7));
 const person=await db.prepare("SELECT t.id,t.employee_code,t.full_name,t.role,t.department,t.active,v.data_json,v.revision,v.updated_at FROM profiles t LEFT JOIN employee_cv v ON v.user_id=t.id JOIN sessions s ON s.token_hash=? AND s.expires_at>? JOIN credentials c ON c.user_id=s.user_id AND c.version=s.credential_version JOIN profiles p ON p.id=s.user_id AND p.active=1 WHERE t.id=? AND (p.role='admin' OR p.id=t.id)").bind(hash,Date.now(),id).first();
 if(!person)throw new ApiError(404,'Không tìm thấy hồ sơ');
 const periods=(await db.prepare('SELECT start_date,end_date FROM employment_periods WHERE user_id=? ORDER BY start_date DESC LIMIT 101').bind(id).all()).results;
 const branches=(await db.prepare('SELECT DISTINCT b.code,b.name FROM assignments a JOIN branches b ON b.id=a.branch_id WHERE a.user_id=? ORDER BY b.code LIMIT 50').bind(id).all()).results;
 // Recheck the account after the multi-query read; no cross-account CV data.
 const latest=await actorFor(request,env);if(!canRead(latest,id))throw new ApiError(404,'Không tìm thấy hồ sơ');
 const {data_json,revision,updated_at,...profile}=person;
 return reply({available:true,profile,cv:data_json?JSON.parse(data_json):{},revision:revision||0,updated_at,periods:periods.slice(0,100),periods_truncated:periods.length>100,branches,can_edit:latest.role==='admin'&&profile.role!=='admin'});
 }catch(e){return apiFailure(e)}}
export async function onRequestPost({request,env}){try{
 const actor=await actorFor(request,env,{admin:true}),db=env.DB,b=await jsonLimited(request,32000);
 if(!await ready(db))throw new ApiError(409,'Cần migration 0021 để lưu CV');
 const id=identifier(b?.user_id),expected=b?.expected_revision;
 if(!Number.isSafeInteger(expected)||expected<0||expected>=2147483647)invalid('Phiên bản CV không hợp lệ');
 const data=JSON.stringify(clean(b.cv)),hash=await digest('babymark-session-v1:'+request.headers.get('authorization').slice(7)),now=Date.now();
 // Single guarded statement + database trigger, atomic revision and audit.
 const r=await db.prepare(`INSERT INTO employee_cv(user_id,data_json,revision,updated_by,updated_at)
 SELECT t.id,?,?,p.id,? FROM profiles t JOIN sessions s ON s.token_hash=? AND s.expires_at>? JOIN credentials c ON c.user_id=s.user_id AND c.version=s.credential_version JOIN profiles p ON p.id=s.user_id AND p.active=1 AND p.role='admin'
 WHERE t.id=? AND t.role<>'admin' AND COALESCE((SELECT revision FROM employee_cv WHERE user_id=t.id),0)=?
 ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at
 WHERE employee_cv.revision=? RETURNING revision,updated_at`).bind(data,expected+1,now,hash,now,id,expected,expected).first();
 if(!r)throw new ApiError(409,'Hồ sơ hoặc quyền đã thay đổi; tải lại trước khi lưu');
 return reply({ok:true,...r},expected===0?201:200);
 }catch(e){return apiFailure(e)}}
