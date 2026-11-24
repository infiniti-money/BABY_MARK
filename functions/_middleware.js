export async function onRequest(context){
 const {request}=context,url=new URL(request.url);
 // Tokens are sent only in Authorization headers. Never permit cross-origin API
 // calls from another website, including multipart requests.
 const origin=request.headers.get('origin');
 if(url.pathname.startsWith('/api/')&&origin&&origin!==url.origin)return Response.json({error:'Nguồn yêu cầu không được phép'},{status:403,headers:{'Cache-Control':'no-store'}});
 const response=await context.next();
 const out=new Response(response.body,response);
 out.headers.set('X-Content-Type-Options','nosniff');
 out.headers.set('Referrer-Policy','no-referrer');
 out.headers.set('Permissions-Policy','camera=(self), geolocation=(self), microphone=()');
 out.headers.set('X-Frame-Options','DENY');
 if(url.pathname.startsWith('/api/'))out.headers.set('Cache-Control','private, no-store');
 return out;
}
