export async function onRequest(context){
 const {request}=context,url=new URL(request.url),api=url.pathname==='/api'||url.pathname.startsWith('/api/');
 const started=performance.now(),requestId=api?crypto.randomUUID():null;
 const origin=request.headers.get('origin');
 let response;
 if(api&&origin&&origin!==url.origin)response=Response.json({error:'Nguồn yêu cầu không được phép',code:'ORIGIN_DENIED'},{status:403});
 else try{response=await context.next();}catch(error){
  if(!api)throw error;
  response=Response.json({error:'Lỗi hệ thống; kiểm tra lại trạng thái trước khi thử lại.',code:'API_UNAVAILABLE'},{status:500});
 }
 const out=new Response(response.body,response);
 out.headers.set('X-Content-Type-Options','nosniff');
 out.headers.set('Referrer-Policy','no-referrer');
 out.headers.set('Permissions-Policy','camera=(self), geolocation=(self), microphone=()');
 out.headers.set('X-Frame-Options','DENY');
 if(api){
  out.headers.set('Cache-Control','private, no-store');
  out.headers.set('X-Request-ID',requestId);
  out.headers.set('Server-Timing','app;dur='+Math.round(performance.now()-started));
 }
 return out;
}
