import {reply} from '../../cloudflare/lib/auth.mjs';
import {actorFor,apiFailure,identifier,invalid,ApiError,dayVN} from '../../cloudflare/lib/access.mjs';
// Usage evidence, not a statutory balance or payroll entitlement.
export async function onRequestGet({request,env}){
 try{
  const actor=await actorFor(request,env),u=new URL(request.url);
  const year=u.searchParams.get('year')||dayVN().slice(0,4);
  if(!/^20[0-9]{2}$/.test(year))invalid('Năm không hợp lệ');
  const id=u.searchParams.has('user_id')?identifier(u.searchParams.get('user_id')):actor.id;
  if(id!==actor.id&&actor.role!=='admin')throw new ApiError(403,'Không có quyền xem thống kê này');
  if(!await env.DB.prepare("SELECT id FROM profiles WHERE id=? AND role<>'admin'").bind(id).first())throw new ApiError(404,'Không tìm thấy nhân viên');
  const {results}=await env.DB.prepare(`SELECT substr(a.work_date,1,7) AS month,
   COUNT(CASE WHEN r.state='APPROVED' THEN 1 END) AS approved_shifts,
   COUNT(DISTINCT CASE WHEN r.state='APPROVED' THEN a.work_date END) AS approved_dates,
   COUNT(CASE WHEN r.state='PENDING' THEN 1 END) AS pending_shifts,
   COUNT(DISTINCT CASE WHEN r.state='PENDING' THEN a.work_date END) AS pending_dates
   FROM assignments a JOIN workforce_requests r ON r.assignment_id=a.id AND r.user_id=a.user_id
   WHERE a.user_id=? AND a.work_date BETWEEN ? AND ? AND r.kind='LEAVE' AND r.state IN ('APPROVED','PENDING')
   GROUP BY substr(a.work_date,1,7) ORDER BY month`).bind(id,year+'-01-01',year+'-12-31').all();
  await actorFor(request,env,{admin:id!==actor.id});
  const totals={approved_shifts:0,approved_dates:0,pending_shifts:0,pending_dates:0};
  for(const row of results)for(const key of Object.keys(totals))totals[key]+=row[key];
  return reply({year,months:results,totals,entitlement:null,balance:null,policy_configured:false,scope:'retained_assignment_records',unit_note:'Số ngày có ca nghỉ không phải số ngày phép bị trừ; chưa có chính sách cấp và tính phép.'});
 }catch(error){return apiFailure(error)}
}
