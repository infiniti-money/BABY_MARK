import test from 'node:test';import assert from 'node:assert/strict';
import {generateCredential,credentialHash,validSecret,equalHash,sessionUser,validUsername} from '../lib/auth.mjs';
test('generated 192-bit login code and per-account salt',async()=>{const a=await generateCredential(),b=await generateCredential();assert.ok(validSecret(a.secret));assert.notEqual(a.secret,b.secret);assert.notEqual(a.salt,b.salt);assert.ok(equalHash(a.hash,await credentialHash(a.salt,a.secret)));assert.ok(!equalHash(a.hash,await credentialHash(b.salt,a.secret)));assert.ok(!validSecret('123456'));assert.ok(validUsername('bm-001'));});
test('no bearer means no database access',async()=>assert.equal(await sessionUser(new Request('https://example.test'),{}),null));
test('token lookup checks expiry and current account version',async()=>{let args;const db={prepare(sql){assert.match(sql,/p.active=1/);assert.match(sql,/c.version=s.credential_version/);return {bind(...a){args=a;return {first:async()=>null}}}}};const token='a'.repeat(64);assert.equal(await sessionUser(new Request('https://example.test',{headers:{Authorization:'Bearer '+token}}),db),null);assert.notEqual(args[0],token);assert.equal(args[0].length,64);});

import {createD1} from './helpers/d1.mjs';
import * as authApi from '../../functions/api/auth/[action].js';
import {derivePasswordKey,newPasswordCredential} from '../../public/password.mjs';
import {passwordKeyHash} from '../lib/auth.mjs';
test('admin chosen password login and reset preserve legacy code compatibility and revoke sessions',async()=>{
 const db=await createD1();try{
  const id=crypto.randomUUID(),admin=await generateCredential(),now=Date.now();
  db.sqlite.prepare("INSERT INTO profiles(id,employee_code,full_name,role) VALUES(?,?,?,'admin')").run(id,'ADMIN','Admin');
  db.sqlite.prepare("INSERT INTO credentials(user_id,username,salt,secret_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(id,'admin',admin.salt,admin.hash,now,now);
  const call=(action,body,token)=>authApi.onRequestPost({request:new Request('https://test.invalid/api/auth/'+action,{method:'POST',headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),env:{DB:db},params:{action}});
  const adminLogin=await call('login',{username:'admin',secret:admin.secret});assert.equal(adminLogin.status,200);const adminToken=(await adminLogin.json()).token;
  const pwd='A unique local test passphrase!';
  const material=await newPasswordCredential(pwd);
  const created=await call('create',{username:'test-password',employee_code:'PWD1',full_name:'Password staff',role:'staff',department:'',...material},adminToken);assert.equal(created.status,201);
  const account=await created.json();assert.equal(account.password_configured,true);assert.equal(account.secret,undefined);
  const row=db.sqlite.prepare('SELECT salt,secret_hash FROM credentials WHERE user_id=?').get(account.id);
  assert.notEqual(row.secret_hash,material.password_key);assert.equal(row.secret_hash,await passwordKeyHash(material.password_salt,material.password_key));
  const getSalt=await call('password-salt',{username:'test-password'});assert.equal(getSalt.status,200);assert.equal((await getSalt.json()).salt,material.password_salt);
  const login=await call('login',{username:'test-password',password_key:await derivePasswordKey(pwd,row.salt)});assert.equal(login.status,200);const token=(await login.json()).token;
  assert.ok(await sessionUser(new Request('https://test.invalid',{headers:{Authorization:'Bearer '+token}}),db));
  assert.equal((await call('login',{username:'test-password',password_key:'1'.repeat(64)})).status,401);
  assert.equal((await call('login',{username:'test-password',secret:'1'.repeat(48)})).status,401);
  const changed=await newPasswordCredential('Another unique local test password');
  assert.equal((await call('reset',{user_id:account.id,...changed},adminToken)).status,200);
  assert.equal(await sessionUser(new Request('https://test.invalid',{headers:{Authorization:'Bearer '+token}}),db),null);
  assert.equal((await call('login',{username:'test-password',password_key:material.password_key})).status,401);
  assert.equal((await call('login',{username:'test-password',password_key:changed.password_key})).status,200);
  const resetCode=await call('reset',{user_id:account.id},adminToken);assert.equal(resetCode.status,200);const issued=(await resetCode.json()).secret;
  assert.ok(validSecret(issued));assert.equal((await call('login',{username:'test-password',secret:issued})).status,200);
 }finally{db.close()}
});

test('employee can change own password with existing secret, not another user, and old session is revoked',async()=>{
 const db=await createD1();try{
  const id=crypto.randomUUID(),c=await generateCredential(),now=Date.now();
  db.sqlite.prepare("INSERT INTO profiles(id,employee_code,full_name,role) VALUES(?,?,?,'staff')").run(id,'SELF','Self');
  db.sqlite.prepare("INSERT INTO credentials(user_id,username,salt,secret_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(id,'self-test',c.salt,c.hash,now,now);
  const call=(action,body,token)=>authApi.onRequestPost({request:new Request('https://test.invalid/api/auth/'+action,{method:'POST',headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),env:{DB:db},params:{action}});
  const token=(await (await call('login',{username:'self-test',secret:c.secret})).json()).token;
  const material=await newPasswordCredential('Local employee test password!');
  assert.equal((await call('change-password',{...material,current_secret:'1'.repeat(48)},token)).status,403);
  assert.equal((await call('change-password',{...material,current_secret:c.secret,user_id:'other'},token)).status,200);
  assert.equal(await sessionUser(new Request('https://test.invalid',{headers:{Authorization:'Bearer '+token}}),db),null);
  assert.equal((await call('login',{username:'self-test',secret:c.secret})).status,401);
  assert.equal((await call('login',{username:'self-test',password_key:material.password_key})).status,200);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM auth_audit WHERE actor_id=target_id AND action='RESET'").get().n,1);
 }finally{db.close()}
});

test('password length is at least eight and preserves existing longer passwords',async()=>{
 const salt='a'.repeat(32);
 await assert.rejects(derivePasswordKey('A123456',salt));
 const key=await derivePasswordKey('A1234567',salt);
 assert.match(key,/^[0-9a-f]{64}$/);
 assert.match(await derivePasswordKey('long existing password',salt),/^[0-9a-f]{64}$/);
});
