import {timingSafeEqual} from 'node:crypto';
import {serviceClient} from '../../../../lib/server-auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req){
 const secret=process.env.CRON_SECRET||'',given=req.headers.get('authorization')||'',expected='Bearer '+secret;
 if(secret.length<32||Buffer.byteLength(given)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return new Response('Unauthorized',{status:401});
 try{
 const db=serviceClient(),queued=await db.rpc('enqueue_attendance_notifications');if(queued.error)throw queued.error;
 const {data:jobs,error}=await db.rpc('claim_push_deliveries');if(error)throw error;
 if(!jobs.length)return Response.json({claimed:0});
 // Recheck device owner immediately before delivery. Generic lock-screen text protects employee data.
 const {data:current,error:checkError}=await db.from('push_deliveries').select('id,token,notification_id,attendance_notifications!inner(recipient_id),push_devices!inner(user_id)').in('id',jobs.map(x=>x.delivery_id)).eq('state','sending');
 if(checkError)throw checkError;
 const valid=(current||[]).filter(x=>x.attendance_notifications.recipient_id===x.push_devices.user_id);
 const headers={'Content-Type':'application/json','Accept':'application/json'};
 if(process.env.EXPO_ACCESS_TOKEN)headers.Authorization='Bearer '+process.env.EXPO_ACCESS_TOKEN;
 let accepted=0;
 if(valid.length){
 const res=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers,signal:AbortSignal.timeout(12000),body:JSON.stringify(valid.map(x=>({to:x.token,title:'BABY_MARK',body:'Bạn có thông báo chấm công mới. Mở ứng dụng để xem.',sound:'default',data:{notificationId:x.notification_id}})))});
 if(!res.ok)throw Error('Push service HTTP error');
 const payload=await res.json(),tickets=payload.data;
 if(!Array.isArray(tickets)||tickets.length!==valid.length)throw Error('Invalid ticket response');
 for(let i=0;i<valid.length;i++){
 const t=tickets[i],v=valid[i],ok=t.status==='ok';
 const update=await db.from('push_deliveries').update({state:ok?'accepted':'failed',ticket_id:ok?t.id:null,updated_at:new Date().toISOString()}).eq('id',v.id).eq('state','sending');
 if(update.error)throw update.error;if(ok)accepted++;
 if(t.details?.error==='DeviceNotRegistered')await db.from('push_devices').delete().eq('token',v.token).eq('user_id',v.push_devices.user_id);
 }
 }
 // No automatic resend of unknown sending states: avoid duplicate pushes after timeouts.
 return Response.json({claimed:jobs.length,accepted});
 }catch{return Response.json({error:'Notification job failed; inspect queue and receipts'},{status:500})}
}
