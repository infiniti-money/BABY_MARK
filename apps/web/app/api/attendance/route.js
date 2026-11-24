import {createClient} from '@supabase/supabase-js';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
export const runtime='nodejs';
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function POST(req){
 const reply=(message,status=400)=>Response.json({error:message},{status});
 let service,path,committed=false;
 try{
 const now=new Date(), token=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(!token)return reply('Chưa đăng nhập',401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const userClient=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
 const {data:{user},error:authError}=await userClient.auth.getUser(token);
 if(authError||!user)return reply('Phiên không hợp lệ',401);
 service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 if(Number(req.headers.get('content-length'))>3500000)return reply('Ảnh quá lớn',413);
 const f=await req.formData(), photo=f.get('photo'),type=f.get('type'),assignment=f.get('assignment_id');
 const lat=Number(f.get('lat')),lng=Number(f.get('lng')),accuracy=Number(f.get('accuracy'));
 if(!['IN','OUT'].includes(type)||typeof assignment!=='string'||! /^[0-9a-f-]{36}$/i.test(assignment)||!['lat','lng','accuracy'].every(k=>typeof f.get(k)==='string'&&f.get(k).trim())||![lat,lng,accuracy].every(Number.isFinite)||Math.abs(lat)>90||Math.abs(lng)>180||accuracy<0||accuracy>50||f.get('mocked')==='true')return reply('Vị trí hoặc dữ liệu không hợp lệ');
 if(!(photo instanceof Blob)||photo.size<1000||photo.size>3000000)return reply('Ảnh không hợp lệ');
 const {data:profile}=await service.from('profiles').select('full_name,employee_code,active').eq('id',user.id).single();
 if(!profile?.active)return reply('Tài khoản chưa kích hoạt',403);
 const {data:a}=await service.from('assignments').select('id').eq('id',assignment).eq('user_id',user.id).single();
 if(!a)return reply('Không có ca được phân công',403);
 let address='';
 if(process.env.GOONG_API_KEY){try{
 const u=new URL('https://rsapi.goong.io/Geocode');u.searchParams.set('latlng',lat+','+lng);u.searchParams.set('api_key',process.env.GOONG_API_KEY);
 const r=await fetch(u,{signal:AbortSignal.timeout(3500),cache:'no-store'});if(r.ok)address=String((await r.json()).results?.[0]?.formatted_address||'').slice(0,180);
 }catch{}}
 const base=await sharp(Buffer.from(await photo.arrayBuffer()),{limitInputPixels:20000000}).rotate().resize(800,1066,{fit:'contain',background:'#18212d'}).jpeg({quality:80}).toBuffer();
 const stamp=[profile.full_name+' | '+profile.employee_code,type==='IN'?'VÀO CA':'TAN CA',new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'medium'}).format(now)+' ICT',lat.toFixed(6)+', '+lng.toFixed(6)+' ± '+Math.round(accuracy)+' m',address.slice(0,65)||'Chưa xác định địa chỉ'];
 if(address.length>65)stamp.push(address.slice(65,130));if(address.length>130)stamp.push(address.slice(130));
 const svg='<svg width="800" height="1066" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="'+(1066-stamp.length*30-20)+'" width="800" height="'+(stamp.length*30+20)+'" fill="black" opacity=".8"/>'+stamp.map((s,i)=>'<text x="14" y="'+(1066-stamp.length*30+12+i*30)+'" font-family="sans-serif" font-size="22" fill="white">'+xml(s)+'</text>').join('')+'</svg>';
 let image=await sharp(base).composite([{input:Buffer.from(svg)}]).jpeg({quality:72}).toBuffer();
 if(image.length>250000)image=await sharp(image).jpeg({quality:55}).toBuffer();
 path=user.id+'/'+randomUUID()+'.jpg';
 const {error:upload}=await service.storage.from('attendance-private').upload(path,image,{contentType:'image/jpeg',upsert:false});
 if(upload)throw new Error('UPLOAD_FAILED');
 const {data,error}=await service.rpc('record_attendance',{p_user:user.id,p_assignment:assignment,p_type:type,p_time:now.toISOString(),p_lat:lat,p_lng:lng,p_accuracy:accuracy,p_address:address,p_photo:path});
 if(error){await service.storage.from('attendance-private').remove([path]);path=null;return reply('Không thể chấm công: '+(error.code==='23505'?'Đã chấm công':error.message),409)}
 committed=true;return Response.json(data);
 }catch{if(service&&path&&!committed)await service.storage.from('attendance-private').remove([path]).catch(()=>{});return reply('Không thể xử lý yêu cầu. Vui lòng kiểm tra lại lịch sử trước khi thử lại.',500)}
}
