export class HttpError extends Error {
 constructor(status,message,code='INVALID_REQUEST'){super(message);this.status=status;this.code=code;}
}
export async function readLimited(request,maxBytes){
 const declared=Number(request.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>maxBytes)throw new HttpError(413,'Yêu cầu quá lớn','BODY_TOO_LARGE');
 if(!request.body)return new Uint8Array();
 const reader=request.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>maxBytes){await reader.cancel();throw new HttpError(413,'Yêu cầu quá lớn','BODY_TOO_LARGE');}chunks.push(value);
 }}finally{reader.releaseLock();}
 const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.byteLength;}return out;
}
export async function jsonLimited(request,max=8192){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw new HttpError(415,'Cần dữ liệu JSON');
 try{return JSON.parse(new TextDecoder().decode(await readLimited(request,max)));}
 catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'JSON không hợp lệ');}
}
export const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function errorResponse(e){
 return Response.json({error:e instanceof HttpError?e.message:'Không thể xử lý; kiểm tra lịch sử trước khi thử lại',code:e instanceof HttpError?e.code:'INTERNAL_ERROR'},
 {status:e instanceof HttpError?e.status:500,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
