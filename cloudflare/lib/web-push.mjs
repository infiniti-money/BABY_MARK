// RFC 8030 empty-body Web Push + RFC 8292 VAPID. The notification is generic
// and contains no employee names, location, schedule or other sensitive data.
const enc=new TextEncoder();
export function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
export function decode64(s){if(typeof s!=='string'||! /^[A-Za-z0-9_-]+$/.test(s))throw Error('INVALID_BASE64');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0))}
export function pushEndpoint(value){
 if(typeof value!=='string'||value.length>2048)return null;
 try{const u=new URL(value),h=u.hostname;
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return null;
  // Prevent SSRF, including redirect chains. Restrict to browser vendor services.
  if(!(h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='push.services.mozilla.com'||h==='web.push.apple.com'||h.endsWith('.push.apple.com')||h==='wns.windows.com'||h.endsWith('.wns.windows.com')))return null;
  return u.href;
 }catch{return null}
}
// Report only fixed diagnostic codes, never the secret, parser error or JWT.
function inspectVapid(env){
 const raw=env.PUSH_VAPID_JWK;
 if(typeof raw!=='string'||!raw.trim())return {code:'JWK_MISSING'};
 let jwk;
 try{jwk=JSON.parse(raw.trim());}catch{return {code:'JWK_JSON'};}
 if(!jwk||typeof jwk!=='object'||Array.isArray(jwk)||jwk.kty!=='EC'||jwk.crv!=='P-256')return {code:'JWK_CURVE'};
 if(!jwk.d)return {code:'JWK_PRIVATE_MISSING'};
 let x,y,d;
 try{x=decode64(jwk.x);y=decode64(jwk.y);d=decode64(jwk.d);}catch{return {code:'JWK_FIELDS'};}
 if(x.length!==32||y.length!==32||d.length!==32)return {code:'JWK_FIELDS'};
 let subject=typeof env.PUSH_VAPID_SUBJECT==='string'?env.PUSH_VAPID_SUBJECT.trim():'';
 if(!subject)return {code:'SUBJECT_MISSING'};
 // Accept a bare contact email as well as the standard mailto URI.
 if(/^[^\s:@/]+@[^\s@/]+\.[^\s@/]+$/.test(subject))subject='mailto:'+subject;
 if(!(/^mailto:[^\s@]+@[^\s@]+$/.test(subject)||/^https:\/\/[^\s]+$/.test(subject)))return {code:'SUBJECT_INVALID'};
 if(subject.startsWith('https://')){try{const u=new URL(subject);if(u.username||u.password||u.hostname==='localhost')return {code:'SUBJECT_INVALID'};}catch{return {code:'SUBJECT_INVALID'};}}
 return {code:'FORMAT_OK',config:{jwk:{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y,d:jwk.d,ext:true},publicKey:b64url(Uint8Array.from([4,...x,...y])),subject}};
}
export function vapidConfig(env){return inspectVapid(env).config||null}
export async function vapidDiagnosis(env){
 const result=inspectVapid(env);
 if(!result.config)return {ready:false,code:result.code};
 const {config}=result;
 try{
  const privateKey=await crypto.subtle.importKey('jwk',config.jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const publicKey=await crypto.subtle.importKey('raw',decode64(config.publicKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const msg=enc.encode('babymark-vapid-check-v1');
  const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,msg);
  if(sig.byteLength!==64||!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,sig,msg))return {ready:false,code:'KEY_PAIR_MISMATCH'};
  return {ready:true,code:'OK'};
 }catch{return {ready:false,code:'KEY_CRYPTO_INVALID'};}
}
export async function vapidAuthorization(config,endpoint,now=Date.now()){
 const aud=new URL(endpoint).origin,header=b64url(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),payload=b64url(enc.encode(JSON.stringify({aud,exp:Math.floor(now/1000)+3600,sub:config.subject})));
 const input=header+'.'+payload,key=await crypto.subtle.importKey('jwk',config.jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(input)));
 if(signature.length!==64)throw Error('INVALID_SIGNATURE');
 return 'vapid t='+input+'.'+b64url(signature)+', k='+config.publicKey;
}
export async function sendEmptyPush(config,endpoint,fetcher=fetch){
 const url=pushEndpoint(endpoint);if(!url)throw Error('INVALID_ENDPOINT');
 const response=await fetcher(url,{method:'POST',redirect:'error',headers:{Authorization:await vapidAuthorization(config,url),TTL:'300',Urgency:'normal'},signal:AbortSignal.timeout(8000)});
 return response.status;
}
export async function pushSettings(env){
 const fallback={available:false,enabled:false,reminders:true,late_alerts:true,configured:!!vapidConfig(env)};
 try{
  const r=await env.DB.prepare('SELECT * FROM web_push_settings WHERE id=1').first();
  if(!r)throw Error('PUSH_SETTINGS_MISSING');
  return {...fallback,available:true,enabled:!!r.enabled,reminders:!!r.reminders,late_alerts:!!r.late_alerts};
 }catch(e){if(/no such table: (?:main\.)?web_push_settings/i.test(String(e?.message)))return fallback;throw e}
}
export async function dispatchPush(env,now=Date.now(),fetcher=fetch){
 const config=vapidConfig(env),settings=await pushSettings(env);
 if(!config||!settings.enabled)return {enabled:false,accepted:0,failed:0,claimed:0};
 const db=env.DB;
 // 15-minute catch-up for late alerts; 10-minute lead time for upcoming shifts.
 // No personal payload, only a generic wake-up. Existing in-app policy is respected.
 const inApp=await db.prepare('SELECT late_alerts FROM system_settings WHERE id=1').first();
 // Migration 0012 is optional until production has been migrated. Do not
 // send scheduled reminders or late alerts for unapproved additional shifts.
 const extra=!!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='extra_attendance'").first();
 const approvedExtra=extra?" AND NOT EXISTS(SELECT 1 FROM extra_attendance x WHERE x.assignment_id=a.id AND x.state<>'APPROVED')":"";
 const {results}=await db.prepare(`
 WITH candidates AS (
  SELECT a.id||':REMINDER' AS event_key,a.user_id AS recipient FROM assignments a
   JOIN profiles p ON p.id=a.user_id AND p.active=1 JOIN branches b ON b.id=a.branch_id AND b.active=1
   WHERE ?=1 AND a.starts_at>? AND a.starts_at<=?
    AND NOT EXISTS(SELECT 1 FROM attendances t WHERE t.assignment_id=a.id AND t.type='IN')
    AND NOT EXISTS(SELECT 1 FROM workforce_requests w WHERE w.assignment_id=a.id AND w.kind='LEAVE' AND w.state='APPROVED')${approvedExtra}
  UNION
  SELECT a.id||':LATE',p.id FROM assignments a JOIN profiles employee ON employee.id=a.user_id AND employee.active=1
   JOIN branches b ON b.id=a.branch_id AND b.active=1
   JOIN profiles p ON p.active=1 AND (p.role='admin' OR (p.role='manager' AND EXISTS(SELECT 1 FROM branch_managers bm WHERE bm.user_id=p.id AND bm.branch_id=a.branch_id)))
   WHERE ?=1 AND a.starts_at BETWEEN ? AND ?
    AND a.starts_at+a.grace_minutes*60000<? AND a.starts_at+a.grace_minutes*60000>=? AND a.ends_at>?
    AND NOT EXISTS(SELECT 1 FROM attendances t WHERE t.assignment_id=a.id AND t.type='IN' AND t.late_minutes=0)
    AND NOT EXISTS(SELECT 1 FROM workforce_requests w WHERE w.assignment_id=a.id AND w.kind='LEAVE' AND w.state='APPROVED')${approvedExtra}
 )
 SELECT DISTINCT c.event_key,s.endpoint,s.user_id FROM candidates c JOIN web_push_subscriptions s ON s.user_id=c.recipient
 WHERE NOT EXISTS(SELECT 1 FROM web_push_receipts r WHERE r.event_key=c.event_key AND r.endpoint=s.endpoint)
 ORDER BY c.event_key,s.endpoint LIMIT 12`).bind(+settings.reminders,now,now+600000,+(settings.late_alerts&&!!inApp?.late_alerts),now-135*60000,now,now,now-15*60000,now).all();
 let accepted=0,failed=0,claimed=0;
 for(const row of results){
  const claim=await db.prepare("INSERT INTO web_push_receipts(event_key,endpoint,claimed_at,state) SELECT ?,?,?,'claimed' WHERE EXISTS(SELECT 1 FROM web_push_subscriptions s JOIN profiles p ON p.id=s.user_id AND p.active=1 WHERE s.endpoint=? AND s.user_id=?) ON CONFLICT DO NOTHING RETURNING event_key").bind(row.event_key,row.endpoint,now,row.endpoint,row.user_id).first();
  if(!claim)continue;claimed++;
  let status=0;try{status=await sendEmptyPush(config,row.endpoint,fetcher)}catch{}
  const ok=status>=200&&status<300;ok?accepted++:failed++;
  await db.prepare("UPDATE web_push_receipts SET state=? WHERE event_key=? AND endpoint=?").bind(ok?'accepted':'failed',row.event_key,row.endpoint).run();
  if(status===404||status===410)await db.prepare('DELETE FROM web_push_subscriptions WHERE endpoint=? AND user_id=?').bind(row.endpoint,row.user_id).run();
 }
 // Bound cleanup and keep event receipts longer than the scheduling lookback.
 await db.prepare('DELETE FROM web_push_receipts WHERE rowid IN (SELECT rowid FROM web_push_receipts WHERE claimed_at<? LIMIT 100)').bind(now-7*86400000).run();
 return {enabled:true,accepted,failed,claimed};
}
