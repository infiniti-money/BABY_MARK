// Internal helper for the future authenticated server-side stamping pipeline.
export const RETENTION_SECONDS=60*86400;
export const MAX_IMAGE_BYTES=100000;
export async function storeStampedPhoto(namespace,key,bytes,capturedAt){
 if(!namespace||typeof namespace.put!=='function')throw Error('KV_NOT_CONFIGURED');
 if(typeof key!=='string'||!/^timemark\/[0-9a-f-]{36}\.jpg$/i.test(key))throw Error('INVALID_KEY');
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<4||bytes.byteLength>MAX_IMAGE_BYTES)throw Error('INVALID_IMAGE_SIZE');
 const jpg=new Uint8Array(bytes);
 if(jpg[0]!==255||jpg[1]!==216||jpg[jpg.length-2]!==255||jpg[jpg.length-1]!==217)throw Error('INVALID_JPEG');
 const now=Date.now();
 if(!Number.isSafeInteger(capturedAt)||capturedAt>now+1000||capturedAt<now-120000)throw Error('INVALID_SERVER_TIME');
 const expiration=Math.floor(capturedAt/1000)+RETENTION_SECONDS;
 // Caller must supply a unique server-generated key and a trusted, already stamped image.
 await namespace.put(key,bytes,{expiration});
 return {photo_path:key,photo_expires_at:expiration*1000};
}
