import test from 'node:test';import assert from 'node:assert/strict';
import {pushEndpoint,vapidConfig,vapidDiagnosis,vapidAuthorization,decode64,sendEmptyPush,pushSettings,dispatchPush} from '../lib/web-push.mjs';
import {appFixture} from './helpers/app.mjs';
test('only vendor HTTPS endpoints; deny SSRF and redirects',()=>{assert.equal(pushEndpoint('https://fcm.googleapis.com/fcm/send/a'),'https://fcm.googleapis.com/fcm/send/a');for(const url of ['http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://127.0.0.1/a','https://user@fcm.googleapis.com/a','https://fcm.googleapis.com:444/a'])assert.equal(pushEndpoint(url),null)});
async function keyEnv(){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {pair,PUSH_VAPID_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey)),PUSH_VAPID_SUBJECT:'mailto:test@example.com'}}
test('VAPID signed audience and signature; no plaintext payload',async()=>{const env=await keyEnv(),c=vapidConfig(env),endpoint='https://fcm.googleapis.com/fcm/send/a',now=Date.now();const auth=await vapidAuthorization(c,endpoint,now);const token=auth.match(/t=([^,]+)/)[1],parts=token.split('.');assert.equal(JSON.parse(new TextDecoder().decode(decode64(parts[1]))).aud,'https://fcm.googleapis.com');assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},env.pair.publicKey,decode64(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])),true);const status=await sendEmptyPush(c,endpoint,async(url,opt)=>{assert.equal(opt.redirect,'error');assert.equal(opt.body,undefined);assert.equal(opt.method,'POST');return {status:201}});assert.equal(status,201)});
test('push dispatch disabled by default; scoped late reminder and dedup',async()=>{const f=await appFixture();try{const env={...f.env,...await keyEnv()},now=Date.now(),db=f.db;assert.equal((await pushSettings(env)).enabled,false);assert.equal((await dispatchPush(env,now)).claimed,0);await db.prepare('UPDATE web_push_settings SET enabled=1 WHERE id=1').run();await db.prepare('UPDATE system_settings SET late_alerts=1 WHERE id=1').run();await db.prepare('UPDATE assignments SET starts_at=?,ends_at=? WHERE id=?').bind(now-360000,now+3600000,f.assignment).run();await db.prepare('UPDATE assignments SET starts_at=?,ends_at=? WHERE id=?').bind(now+300000,now+3600000,f.otherAssignment).run();for(const role of ['admin','manager','staff','other'])await db.prepare('INSERT INTO web_push_subscriptions(endpoint,user_id,created_at,updated_at) VALUES(?,?,?,?)').bind('https://fcm.googleapis.com/fcm/send/'+role,f.ids[role],now,now).run();const seen=[];const send=async(url)=>{seen.push(url.split('/').pop());return {status:201}};const result=await dispatchPush(env,now,send);assert.equal(result.accepted,3);assert.deepEqual(seen.sort(),['admin','manager','other']);assert.equal((await dispatchPush(env,now,send)).claimed,0)}finally{f.close()}});

test('VAPID diagnostics distinguish missing, malformed, public-only and bad subject; accept pasted email without prefix',async()=>{
 const env=await keyEnv();
 assert.deepEqual(await vapidDiagnosis({}),{ready:false,code:'JWK_MISSING'});
 assert.equal((await vapidDiagnosis({...env,PUSH_VAPID_JWK:'not json'})).code,'JWK_JSON');
 const jwk=JSON.parse(env.PUSH_VAPID_JWK);delete jwk.d;
 assert.equal((await vapidDiagnosis({...env,PUSH_VAPID_JWK:JSON.stringify(jwk)})).code,'JWK_PRIVATE_MISSING');
 assert.equal((await vapidDiagnosis({...env,PUSH_VAPID_SUBJECT:''})).code,'SUBJECT_MISSING');
 assert.equal((await vapidDiagnosis({...env,PUSH_VAPID_SUBJECT:'invalid'})).code,'SUBJECT_INVALID');
 assert.deepEqual(await vapidDiagnosis({...env,PUSH_VAPID_SUBJECT:'  test@example.com  '}),{ready:true,code:'OK'});
 assert.equal(vapidConfig({...env,PUSH_VAPID_SUBJECT:'test@example.com'}).subject,'mailto:test@example.com');
 const other=JSON.parse((await keyEnv()).PUSH_VAPID_JWK);
 const broken={...JSON.parse(env.PUSH_VAPID_JWK),d:other.d};
 const bad=await vapidDiagnosis({...env,PUSH_VAPID_JWK:JSON.stringify(broken)});
 assert.equal(bad.ready,false);assert.ok(['KEY_PAIR_MISMATCH','KEY_CRYPTO_INVALID'].includes(bad.code));
});

test('unapproved extra shifts do not emit reminder or late pushes; approved ones do',async()=>{
 const f=await appFixture();try{
 const env={...f.env,...await keyEnv()},now=Date.now(),db=f.db;
 await db.prepare('UPDATE web_push_settings SET enabled=1 WHERE id=1').run();
 await db.prepare('UPDATE system_settings SET late_alerts=1 WHERE id=1').run();
 await db.prepare('UPDATE assignments SET starts_at=?,ends_at=? WHERE id=?').bind(now-360000,now+3600000,f.assignment).run();
 await db.prepare('UPDATE assignments SET starts_at=?,ends_at=? WHERE id=?').bind(now+300000,now+3600000,f.otherAssignment).run();
 await db.prepare("INSERT INTO extra_attendance(assignment_id,kind,reason,created_at) VALUES(?,'EXTRA','Ca bổ sung',?)").bind(f.assignment,now).run();
 await db.prepare("INSERT INTO extra_attendance(assignment_id,kind,reason,state,created_at,decided_by,decided_at) VALUES(?,'EXTRA','Ca bổ sung','REJECTED',?,?,?)").bind(f.otherAssignment,now,f.ids.admin,now).run();
 for(const role of ['admin','manager','other'])await db.prepare('INSERT INTO web_push_subscriptions(endpoint,user_id,created_at,updated_at) VALUES(?,?,?,?)').bind('https://fcm.googleapis.com/fcm/send/'+role,f.ids[role],now,now).run();
 const send=async()=>({status:201});assert.equal((await dispatchPush(env,now,send)).claimed,0);
 await db.prepare("UPDATE extra_attendance SET state='APPROVED',decided_by=?,decided_at=? WHERE assignment_id=?").bind(f.ids.admin,now,f.assignment).run();
 assert.equal((await dispatchPush(env,now,send)).accepted,2);
 }finally{f.close()}
});

test('50 employees with three endpoints queue 150 reminders and drain in bounded batches',async()=>{const f=await appFixture();try{
 const db=f.db,now=Date.now(),env={...f.env,...await keyEnv()};await db.prepare('UPDATE web_push_settings SET enabled=1,late_alerts=0 WHERE id=1').run();
 const users=[f.ids.staff,f.ids.other,f.ids.manager];for(let i=0;i<47;i++){const id=crypto.randomUUID();users.push(id);await db.prepare("INSERT INTO profiles(id,employee_code,full_name,role) VALUES(?,?,?,'staff')").bind(id,'LOAD-'+i,'Load '+i).run();}
 await db.prepare('UPDATE assignments SET starts_at=?,ends_at=?').bind(now+25*60000,now+8*3600000).run();
 for(const [i,user] of users.entries()){if(i>=2)await db.prepare("INSERT INTO assignments(id,user_id,branch_id,shift_id,work_date,starts_at,ends_at,grace_minutes) VALUES(?,?,'BM-001','test-day',?,?,?,5)").bind(crypto.randomUUID(),user,f.workDate,now+25*60000,now+8*3600000).run();for(let j=0;j<3;j++)await db.prepare('INSERT INTO web_push_subscriptions(endpoint,user_id,created_at,updated_at) VALUES(?,?,?,?)').bind('https://fcm.googleapis.com/fcm/send/load-'+i+'-'+j,user,now,now).run();}
 const seen=new Set();let n=0;const send=async url=>{assert.ok(!seen.has(url));seen.add(url);return {status:201}};
 for(let i=0;i<13;i++){const d=await dispatchPush(env,now+i*2*60000,send);assert.ok(d.claimed<=12);n+=d.accepted;}
 assert.equal(n,150);assert.equal(seen.size,150);assert.equal((await db.prepare("SELECT count(*) AS n FROM push_queue WHERE state='accepted'").first()).n,150);
 }finally{f.close()}});
