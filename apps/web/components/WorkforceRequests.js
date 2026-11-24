'use client';
import {useState} from 'react';
const fmt=t=>t?new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
export default function WorkforceRequests({db,profile,assignments,requests,people,onChange}){
 const [id,Id]=useState(''),[kind,Kind]=useState('LEAVE'),[reason,Reason]=useState(''),[start,Start]=useState(''),[end,End]=useState(''),[note,Note]=useState(''),[message,Message]=useState(''),[busy,Busy]=useState(false);
 const own=assignments.filter(a=>a.user_id===profile.id);
 async function send(body){Busy(true);Message('');try{
 const {data:{session}}=await db.auth.getSession();if(!session)throw Error('Hãy đăng nhập lại.');
 const res=await fetch('/api/workforce',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const r=await res.json();if(!res.ok)throw Error(r.error);Message('Đã lưu yêu cầu.');Reason('');Note('');onChange();
 }catch(e){Message(e.message)}finally{Busy(false)}}
 return <section id="requests"><h2>Nghỉ phép và điều chỉnh công</h2><p>Điều chỉnh đã duyệt chỉ tác động báo cáo; ảnh và nhật ký gốc không bị sửa. Nghỉ phép chưa được quy đổi lương.</p>
 {own.length>0&&<form onSubmit={e=>{e.preventDefault();send({action:'submit',assignment_id:id,kind,reason,proposed_in:kind==='CORRECTION'?start+':00+07:00':null,proposed_out:kind==='CORRECTION'?end+':00+07:00':null})}}>
 <select required value={id} onChange={e=>Id(e.target.value)} aria-label="Ca cần gửi yêu cầu"><option value="">Chọn ca của bạn</option>{own.map(a=><option key={a.id} value={a.id}>{a.work_date} · {fmt(a.starts_at)}</option>)}</select>
 <select value={kind} onChange={e=>Kind(e.target.value)}><option value="LEAVE">Xin nghỉ ca</option><option value="CORRECTION">Điều chỉnh giờ vào / ra</option></select>
 {kind==='CORRECTION'&&<div className="row"><label>Giờ vào (VN)<input required type="datetime-local" value={start} onChange={e=>Start(e.target.value)}/></label><label>Giờ ra (VN)<input required type="datetime-local" value={end} onChange={e=>End(e.target.value)}/></label></div>}
 <input required minLength={5} maxLength={1000} placeholder="Lý do yêu cầu" value={reason} onChange={e=>Reason(e.target.value)}/><button disabled={busy}>Gửi yêu cầu</button></form>}
 {profile.role!=='staff'&&<label>Ghi chú khi duyệt/từ chối <input value={note} onChange={e=>Note(e.target.value)} maxLength={1000} placeholder="Nêu căn cứ quyết định"/></label>}
 <p role="status">{message}</p><div className="scroll"><table><thead><tr>{['Nhân viên','Ca','Yêu cầu','Lý do','Giờ đề nghị','Trạng thái','Quyết định'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{requests.map(r=><tr key={r.id}><td>{people.find(p=>p.id===r.user_id)?.full_name||'—'}</td><td>{assignments.find(a=>a.id===r.assignment_id)?.work_date||'—'}</td><td>{r.kind==='LEAVE'?'Nghỉ ca':'Điều chỉnh công'}</td><td style={{whiteSpace:'normal',maxWidth:280}}>{r.reason}</td><td>{r.kind==='CORRECTION'?fmt(r.proposed_in)+' → '+fmt(r.proposed_out):'—'}</td><td>{({PENDING:'Chờ duyệt',APPROVED:'Đã duyệt',REJECTED:'Từ chối'})[r.state]}</td><td>{r.state==='PENDING'&&r.user_id!==profile.id&&profile.role!=='staff'?<><button disabled={busy||note.trim().length<3} onClick={()=>send({action:'decide',id:r.id,decision:'APPROVED',note})}>Duyệt</button><button className="secondary" disabled={busy||note.trim().length<3} onClick={()=>send({action:'decide',id:r.id,decision:'REJECTED',note})}>Từ chối</button></>:<>{r.decision_note||'—'} {r.decided_at&&fmt(r.decided_at)}</>}</td></tr>)}</tbody></table></div>{!requests.length&&<p>Chưa có yêu cầu trong phạm vi đang xem.</p>}</section>
}
