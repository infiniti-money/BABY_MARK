'use client';
import {useEffect,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {dayVN,summarize} from '../lib/metrics.mjs';
import storeCatalog from '../lib/store-catalog.json';
const normalizeStoreName=s=>s.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleUpperCase('vi-VN');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
const fmt=t=>t?new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
export default function Page(){
 const [session,S]=useState(null),[profile,P]=useState(null),[email,E]=useState(''),[password,W]=useState(''),[message,M]=useState(''),[month,Month]=useState(dayVN().slice(0,7)),[day,Day]=useState(dayVN()),[assignments,A]=useState([]),[records,R]=useState([]),[people,U]=useState([]),[branches,B]=useState([]),[shifts,H]=useState([]),[selected,Q]=useState(''),[photo,Photo]=useState(null),[busy,Busy]=useState(false),[camera,Cam]=useState(false),[form,F]=useState({}),[detail,D]=useState(null);
 const video=useRef(null),stream=useRef(null);
 function closeCamera(){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;Cam(false)}
 useEffect(()=>{if(!db)return;db.auth.getSession().then(({data})=>S(data.session));const {data:{subscription}}=db.auth.onAuthStateChange((_,s)=>S(s));return()=>{subscription.unsubscribe();stream.current?.getTracks().forEach(t=>t.stop())}},[]);
 useEffect(()=>{P(null);A([]);R([]);D(null);Photo(null);Q('');if(session)db.from('profiles').select('*').eq('id',session.user.id).single().then(({data,error})=>{if(error)M(error.message);else P(data)})},[session?.user.id]);
 async function load(){
  if(!profile?.active)return;
  const start=month+'-01',n=new Date(month+'-01T00:00:00Z');n.setUTCMonth(n.getUTCMonth()+1);const end=n.toISOString().slice(0,10);
  const res=await db.from('assignments').select('*').gte('work_date',start).lt('work_date',end).order('starts_at');
  if(res.error){M(res.error.message);return} A(res.data);
  const ar=await db.from('attendances').select('*').in('assignment_id',res.data.map(a=>a.id).concat('00000000-0000-0000-0000-000000000000'));
  if(ar.error)M(ar.error.message);else R(ar.data);
  const [u,b,h]=await Promise.all([db.from('profiles').select('*'),db.from('branches').select('*'),db.from('shifts').select('*')]);
  U(u.data||[]);B(b.data||[]);H(h.data||[]);
 }
 useEffect(()=>{if(!profile?.active)return;load();const id=setInterval(load,20000);return()=>clearInterval(id)},[profile,month]);
 useEffect(()=>{if(camera&&video.current)video.current.srcObject=stream.current},[camera]);
 async function login(e){e.preventDefault();M('');const {error}=await db.auth.signInWithPassword({email,password});if(error)M(error.message)}
 async function openCamera(){try{closeCamera();Photo(null);stream.current=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});Cam(true)}catch{M('Cần cấp quyền camera và truy cập qua HTTPS.')}}
 async function capture(type){
  if(!selected||!video.current?.videoWidth)return M('Chọn ca và mở camera trước.');
  Busy(true);M('');
  try{
   const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000}));
   if(pos.coords.accuracy>50)throw Error('GPS chưa đủ chính xác. Hãy thử tại nơi thoáng.');
   const c=document.createElement('canvas');c.width=800;c.height=Math.round(video.current.videoHeight*800/video.current.videoWidth);
   c.getContext('2d').drawImage(video.current,0,0,c.width,c.height);
   const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.75));if(!blob)throw Error('Không thể chụp ảnh');
   const f=new FormData();for(const [k,v] of Object.entries({assignment_id:selected,type,lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy}))f.append(k,String(v));
   f.append('photo',blob,'capture.jpg');closeCamera();
   const {data:{session:s}}=await db.auth.getSession();
   const result=await fetch('/api/attendance',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:f});
   const data=await result.json();if(!result.ok)throw Error(data.error);
   M('Chấm công đã ghi nhận: '+data.status+' · '+fmt(data.server_timestamp));await load();
  }catch(e){M(e.message||'Không thể lấy vị trí/camera')}finally{Busy(false)}
 }
 const name=id=>people.find(p=>p.id===id)?.full_name||'—';
 const branch=id=>branches.find(b=>b.id===id)?.name||'—';
 const logs=id=>records.filter(r=>r.assignment_id===id);
 const summary=a=>{const l=logs(a.id);l.ends_at=a.ends_at;return summarize(l)};
 const daily=assignments.filter(a=>a.work_date===day);
 const days=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
 const stats=p=>assignments.filter(a=>a.user_id===p.id).map(summary).reduce((acc,v)=>({days:acc.days+v.days,minutes:acc.minutes+v.minutes,late:acc.late+v.late,early:acc.early+v.early}),{days:0,minutes:0,late:0,early:0});
 async function view(r){D(r);Photo(null);const {data,error}=await db.storage.from('attendance-private').createSignedUrl(r.photo_path,60);if(error)M(error.message);else Photo(data.signedUrl)}
 async function exportExcel(){
  try{const ExcelJS=(await import('exceljs')).default;const book=new ExcelJS.Workbook(),s=book.addWorksheet('Bảng công');
  s.addRow(['Mã NV','Họ tên','Ngày công','Giờ làm','Phút muộn','Phút sớm',...Array.from({length:days},(_,i)=>i+1)]);
  for(const p of people){const t=stats(p);s.addRow([p.employee_code,p.full_name,t.days,t.minutes/60,t.late,t.early,...Array.from({length:days},(_,i)=>assignments.filter(a=>a.user_id===p.id&&a.work_date===month+'-'+String(i+1).padStart(2,'0')).map(a=>summary(a).status).join('; '))])}
  s.getRow(1).font={bold:true};s.getColumn(2).width=30;const d=book.addWorksheet('Chi tiết');
  d.addRow(['Nhân viên','Ngày','Chi nhánh','Vào','Ra','Trạng thái','Phút làm','Muộn','Sớm']);
  for(const a of assignments){const l=logs(a.id),t=summary(a);d.addRow([name(a.user_id),a.work_date,branch(a.branch_id),fmt(l.find(r=>r.type==='IN')?.server_timestamp),fmt(l.find(r=>r.type==='OUT')?.server_timestamp),t.status,t.minutes,t.late,t.early])}
  const buf=await book.xlsx.writeBuffer(),u=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=u;link.download='BABY_MARK-'+month+'.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(u),3000);
  }catch(e){M(e.message)}
 }
 async function add(table,values){const {error}=await db.from(table).insert(values);M(error?error.message:'Đã lưu');if(!error){F({});load()}}
 const field=(k,label,type='text')=><input required placeholder={label} aria-label={label} type={type} value={form[k]||''} onChange={e=>F({...form,[k]:e.target.value})}/>;
 if(!db)return <main><h1>BABY_MARK</h1><section>Chưa cấu hình Supabase. Xem README.</section></main>;
 if(!session)return <main><h1>BABY_MARK</h1><section><h2>Đăng nhập</h2><form onSubmit={login}><input type="email" required placeholder="Email" value={email} onChange={e=>E(e.target.value)}/><input type="password" required placeholder="Mật khẩu" value={password} onChange={e=>W(e.target.value)}/><button>Đăng nhập</button></form><p role="status">{message}</p></section></main>;
 return <main><header className="row"><h1>BABY_MARK</h1><span>{profile?.full_name||'Đang tải hồ sơ'}</span><button onClick={()=>{closeCamera();db.auth.signOut()}}>Đăng xuất</button></header><p role="status">{message}</p>
 {!profile?.active?<section>Tài khoản chưa có hồ sơ hoặc bị vô hiệu hóa.</section>:<>
 <section className="row"><label>Tháng <input type="month" value={month} onChange={e=>{if(e.target.value){Month(e.target.value);Day(e.target.value+'-01')}}}/></label><label>Ngày <input type="date" value={day} onChange={e=>{if(e.target.value){Day(e.target.value);Month(e.target.value.slice(0,7))}}}/></label><button onClick={load}>Làm mới</button></section>
 {profile.role==='staff'?<section><h2>Chấm công</h2><p>Chỉ lấy vị trí và ảnh khi chấm công. Web không xác minh được Fake GPS.</p><select aria-label="Ca làm việc" value={selected} onChange={e=>Q(e.target.value)}><option value="">Chọn ca được phân công</option>{assignments.map(a=><option key={a.id} value={a.id}>{a.work_date} · {branch(a.branch_id)} · {fmt(a.starts_at)}</option>)}</select><button disabled={busy} onClick={openCamera}>Mở camera trước</button>{camera&&<><video ref={video} autoPlay playsInline muted/><div><button disabled={busy||!selected} onClick={()=>capture('IN')}>Vào ca</button><button disabled={busy||!selected} onClick={()=>capture('OUT')}>Tan ca</button><button onClick={closeCamera}>Đóng camera</button></div></>}</section>:<section><h2>Quản lý ngày {day}</h2><div className="row"><strong>{daily.length} ca phân công</strong><span className="good">{daily.filter(a=>logs(a.id).some(r=>r.type==='IN')).length} đã vào</span><span className="warn">{daily.filter(a=>logs(a.id).some(r=>r.late_minutes>0)).length} đi muộn</span><span className="bad">{daily.filter(a=>!logs(a.id).some(r=>r.type==='IN')&&Date.parse(a.starts_at)<Date.now()).length} chưa vào sau giờ bắt đầu</span></div><button onClick={exportExcel}>Xuất Excel tháng</button></section>}
 <section><h2>Lịch phân công và chấm công ngày</h2><div className="scroll"><table><thead><tr>{['Nhân viên','Chi nhánh','Bắt đầu','Kết thúc','Trạng thái','Ảnh'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{daily.map(a=><tr key={a.id}><td>{name(a.user_id)}</td><td>{branch(a.branch_id)}</td><td>{fmt(a.starts_at)}</td><td>{fmt(a.ends_at)}</td><td>{summary(a).status}</td><td>{logs(a.id).map(r=><button key={r.id} onClick={()=>view(r)}>{r.type} · {r.status}</button>)}</td></tr>)}</tbody></table></div></section>
 {detail&&<section><h2>Chi tiết lần chấm công</h2><p>{fmt(detail.server_timestamp)} · {detail.status} · Cách điểm {Math.round(detail.distance_m)} m · Sai số {Math.round(detail.accuracy_m)} m</p><p>{detail.address_text||'Chưa có địa chỉ'} · {detail.gps_lat}, {detail.gps_lng}</p>{photo&&<img src={photo} alt="Ảnh bằng chứng chấm công" width="300"/>}<p><a target="_blank" rel="noreferrer" href={'https://www.google.com/maps/search/?api=1&query='+detail.gps_lat+','+detail.gps_lng}>Xem vị trí trên bản đồ</a></p><button onClick={()=>{D(null);Photo(null)}}>Đóng</button></section>}
 {profile.role==='admin'&&<>
 <section><h2>Bảng công tháng {month}</h2><div className="scroll"><table><thead><tr><th>Nhân viên</th><th>Công</th><th>Giờ</th><th>Muộn</th><th>Sớm</th>{Array.from({length:days},(_,i)=><th key={i}>{i+1}</th>)}</tr></thead><tbody>{people.map(p=>{const t=stats(p);return <tr key={p.id}><td>{p.full_name}</td><td>{t.days}</td><td>{(t.minutes/60).toFixed(2)}</td><td>{t.late}</td><td>{t.early}</td>{Array.from({length:days},(_,i)=>{const a=assignments.filter(a=>a.user_id===p.id&&a.work_date===month+'-'+String(i+1).padStart(2,'0'));return <td key={i}>{a.map(x=>{const s=summary(x).status;return <div key={x.id} className={s==='Đủ công'?'good':s==='Vắng'||s==='Ngoài vùng'?'bad':'warn'}>{s}</div>})}</td>})}</tr>})}</tbody></table></div><p>Số công tạm tính theo từng ca hoàn tất, không phải bảng lương đã duyệt.</p></section>
 <section><h2>Hệ thống cửa hàng BABY MARK</h2><p>{storeCatalog.length} cửa hàng trong danh mục · {storeCatalog.filter(s=>branches.some(b=>normalizeStoreName(b.name)===normalizeStoreName(s.name))).length} đã có cấu hình GPS</p><div className="scroll"><table><thead><tr><th>Mã danh mục</th><th>Cửa hàng</th><th>GPS</th><th>Bán kính</th><th>Thao tác</th></tr></thead><tbody>{storeCatalog.map(s=>{const b=branches.find(b=>normalizeStoreName(b.name)===normalizeStoreName(s.name));return <tr key={s.code}><td>{s.code}</td><td>{s.name}</td><td className={b?'good':'warn'}>{b?b.latitude+', '+b.longitude:'Chờ xác nhận tọa độ'}</td><td>{b?b.allowed_radius+' m':'—'}</td><td><button onClick={()=>F({...form,bname:s.name,lat:b?String(b.latitude):'',lng:b?String(b.longitude):'',radius:String(b?.allowed_radius??100)})}>{b?'Sửa GPS':'Thiết lập GPS'}</button></td></tr>})}</tbody></table></div><h3>Cấu hình điểm chấm công</h3><p>Chỉ nhập tọa độ đã kiểm tra tại cửa hàng. Chưa cấu hình GPS thì chưa thể phân ca tại điểm đó.</p><form onSubmit={async e=>{e.preventDefault();const name=(form.bname||'').trim(),latitude=Number(form.lat),longitude=Number(form.lng),allowed_radius=Number(form.radius);if(!name||!String(form.lat??'').trim()||!String(form.lng??'').trim()||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180||(latitude===0&&longitude===0)||!Number.isInteger(allowed_radius)||allowed_radius<20||allowed_radius>1000)return M('Kiểm tra tọa độ và bán kính 20–1000 m.');const existing=branches.find(b=>normalizeStoreName(b.name)===normalizeStoreName(name));if(existing){const {error}=await db.from('branches').update({latitude,longitude,allowed_radius}).eq('id',existing.id);M(error?error.message:'Đã cập nhật tọa độ');if(!error){F({});load()}}else await add('branches',{name,latitude,longitude,allowed_radius})}}>{field('bname','Tên chi nhánh')}{field('lat','Vĩ độ')}{field('lng','Kinh độ')}{field('radius','Bán kính mét','number')}<button>Lưu điểm chấm công</button></form></section>
 <section><h2>Thiết lập ca</h2><form onSubmit={e=>{e.preventDefault();add('shifts',{name:form.sname,start_time:form.start,end_time:form.end,grace_period:Number(form.grace)})}}>{field('sname','Tên ca')}{field('start','Giờ bắt đầu','time')}{field('end','Giờ kết thúc','time')}{field('grace','Phút cho phép muộn','number')}<button>Thêm ca</button></form></section>
 <section><h2>Phân công nhân viên</h2><form onSubmit={e=>{e.preventDefault();const s=shifts.find(s=>s.id===form.shift);if(!s)return;const start=new Date(form.date+'T'+s.start_time+'+07:00'),end=new Date(form.date+'T'+s.end_time+'+07:00');if(end<=start)end.setUTCDate(end.getUTCDate()+1);add('assignments',{user_id:form.employee,branch_id:form.branch,shift_id:s.id,work_date:form.date,starts_at:start.toISOString(),ends_at:end.toISOString(),grace_minutes:s.grace_period})}}>{[['employee','Nhân viên',people.filter(p=>p.active)],['branch','Chi nhánh',branches],['shift','Ca làm',shifts]].map(([k,label,items])=><select key={k} required aria-label={label} value={form[k]||''} onChange={e=>F({...form,[k]:e.target.value})}><option value="">{label}</option>{items.map(x=><option key={x.id} value={x.id}>{x.name||x.full_name}</option>)}</select>)}{field('date','Ngày làm việc','date')}<button>Phân công</button></form></section>
 </>}</>}
 </main>
}
