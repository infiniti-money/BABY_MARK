import {authenticatedUser,serviceClient} from '../../../../lib/server-auth';
export const runtime='nodejs';
async function handle(req,remove){
 try{
 const user=await authenticatedUser(req);if(!user)return Response.json({error:'Unauthorized'},{status:401});
 const {token}=await req.json();
 if(typeof token!=='string'||token.length>300||! /^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]+\]$/.test(token))return Response.json({error:'Invalid token'},{status:400});
 const db=serviceClient();
 // Delete old account registration first, cascading pending deliveries on shared devices.
 if(!remove){const {error}=await db.from('push_devices').delete().eq('token',token).neq('user_id',user);if(error)throw error}
 const result=remove?await db.from('push_devices').delete().eq('token',token).eq('user_id',user):await db.from('push_devices').upsert({token,user_id:user,updated_at:new Date().toISOString()});
 if(result.error)throw result.error;
 return Response.json({ok:true});
 }catch{return Response.json({error:'Không thể cập nhật đăng ký thông báo'},{status:500})}
}
export const POST=req=>handle(req,false);
export const DELETE=req=>handle(req,true);
