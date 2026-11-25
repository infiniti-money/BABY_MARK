// Private image storage with D1 reservations. The caller supplies client-rendered
// bytes; this helper does not verify a visible Timemark, camera, or GPS evidence.
export const RETENTION_SECONDS=90*86400;
export const MAX_IMAGE_BYTES=200000;
export const STORAGE_BUDGET_BYTES=900000000;
export function validatePhoto(key,bytes,capturedAt,now=Date.now()){
 if(typeof key!=='string'||!/^timemark\/[0-9a-f-]{36}\.jpg$/i.test(key))throw Error('INVALID_KEY');
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<4||bytes.byteLength>MAX_IMAGE_BYTES)throw Error('INVALID_IMAGE_SIZE');
 const jpg=new Uint8Array(bytes);
 if(jpg[0]!==255||jpg[1]!==216||jpg[jpg.length-2]!==255||jpg[jpg.length-1]!==217)throw Error('INVALID_JPEG');
 if(!Number.isSafeInteger(capturedAt)||capturedAt>now+1000||capturedAt<now-120000)throw Error('INVALID_SERVER_TIME');
 return Math.floor(capturedAt/1000)+RETENTION_SECONDS;
}
export function excessBytes(used,incoming,budget=STORAGE_BUDGET_BYTES){return Math.max(0,used+incoming-budget)}
export async function storeStampedPhoto(db,namespace,key,bytes,capturedAt,{allowEviction=true}={}){
 if(!db||!namespace||typeof namespace.put!=='function'||typeof namespace.delete!=='function')throw Error('KV_NOT_CONFIGURED');
 const expiration=validatePhoto(key,bytes,capturedAt),now=Date.now(),owner=crypto.randomUUID();
 // Single writer with no automatic lease stealing. An interrupted worker requires an
 // operator to confirm it has stopped before clearing a stuck lock. Fail closed.
 const lock=await db.prepare('UPDATE photo_storage_lock SET owner=?,acquired_at=? WHERE id=1 AND owner IS NULL RETURNING id').bind(owner,now).first();
 if(!lock)throw Error('PHOTO_STORAGE_BUSY');
 try{
  // Unknown previous puts remain counted until TTL, then become expired.
  await db.prepare("UPDATE photo_inventory SET state='expired',removed_at=?,removal_reason='TTL' WHERE state IN ('pending','stored','evicting') AND expires_at<=?").bind(now,now-120000).run();
  if(await db.prepare('SELECT photo_path FROM photo_inventory WHERE photo_path=?').bind(key).first())throw Error('PHOTO_KEY_ALREADY_USED');
  const usage=await db.prepare("SELECT COALESCE(SUM(byte_size),0) AS used FROM photo_inventory WHERE state IN ('pending','stored','evicting')").first();
  let needed=excessBytes(Number(usage.used),bytes.byteLength);
  if(needed>0&&!allowEviction)throw Error('PHOTO_STORAGE_CAPACITY_EVICTION_DISABLED');
  let removed=0;
  while(needed>0){
   // Oldest first. Bound each request's work; caller can retry after reconciliation.
   if(removed>=10)throw Error('PHOTO_STORAGE_CLEANUP_REQUIRED');
   const oldest=await db.prepare("SELECT photo_path,byte_size FROM photo_inventory WHERE state IN ('stored','evicting') ORDER BY captured_at,photo_path LIMIT 1").first();
   if(!oldest)throw Error('PHOTO_STORAGE_RECONCILIATION_REQUIRED');
   // Hide immediately from authorized photo reads even if KV cache still has the value.
   await db.prepare("UPDATE photo_inventory SET state='evicting',removal_reason='CAPACITY' WHERE photo_path=?").bind(oldest.photo_path).run();
   await namespace.delete(oldest.photo_path);
   await db.prepare("UPDATE photo_inventory SET state='evicted',removed_at=? WHERE photo_path=? AND state='evicting'").bind(Date.now(),oldest.photo_path).run();
   needed-=oldest.byte_size;removed++;
  }
  // Reserve first. An uncertain put is counted as pending; never assume a failed
  // network response means the value was not written.
  await db.prepare("INSERT INTO photo_inventory(photo_path,byte_size,captured_at,expires_at,state) VALUES(?,?,?,?,'pending')").bind(key,bytes.byteLength,capturedAt,expiration*1000).run();
  await namespace.put(key,bytes,{expiration});
  await db.prepare("UPDATE photo_inventory SET state='stored' WHERE photo_path=? AND state='pending'").bind(key).run();
  return {photo_path:key,photo_expires_at:expiration*1000,evicted_count:removed};
 }finally{
  await db.prepare('UPDATE photo_storage_lock SET owner=NULL,acquired_at=NULL WHERE id=1 AND owner=?').bind(owner).run();
 }
}
