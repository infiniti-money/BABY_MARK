import test from 'node:test';import assert from 'node:assert/strict';
import {appFixture} from './helpers/app.mjs';
import {faceEvidence,faceRequired} from '../lib/face-verification.mjs';
import {summarizeAssignment} from '../lib/reports.mjs';
test('face pilot disabled by default; no browser-supplied score trusted; proof bound and one use',async()=>{
 const f=await appFixture();try{
 const user={id:f.ids.staff},a={id:f.assignment},now=Date.now(),b={type:'IN',liveness_passed:true,match_passed:true};
 assert.equal(await faceRequired(f.db,user.id),false);
 assert.deepEqual(await faceEvidence(f.env,user,a,b,now),{mode:'NOT_REQUIRED'});
 await f.db.prepare('INSERT INTO face_pilot(user_id,enabled_at,enabled_by) VALUES(?,?,?)').bind(user.id,now,f.ids.admin).run();
 await assert.rejects(()=>faceEvidence(f.env,user,a,b,now));
 assert.equal((await faceEvidence(f.env,user,a,{...b,face_exception:'Camera gặp lỗi'},now)).mode,'EXCEPTION');
 const sid=crypto.randomUUID();await f.db.prepare('INSERT INTO face_sessions(id,user_id,assignment_id,type,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(sid,user.id,a.id,'IN',now,now+180000).run();
 const env={...f.env,FACE_GATEWAY_URL:'https://verify.example.test',FACE_GATEWAY_TOKEN:'x'.repeat(40)};
 const good=async()=>Response.json({session_id:sid,subject_id:user.id,assignment_id:a.id,type:'IN',liveness_passed:true,match_passed:true,enrollment_verified:true});
 await assert.rejects(()=>faceEvidence(env,user,a,{type:'OUT',face_session:sid},now,good));
 await assert.rejects(()=>faceEvidence(env,user,a,{type:'IN',face_session:sid},now,async()=>Response.json({liveness_passed:true,match_passed:true})));
 assert.equal((await faceEvidence(env,user,a,{type:'IN',face_session:sid},now,good)).mode,'VERIFIED');
 await assert.rejects(()=>faceEvidence(env,user,a,{type:'IN',face_session:sid},now,good));
 assert.equal(summarizeAssignment({in_face:'EXCEPTION',in_at:now,out_at:now+60000}).minutes,0);
 }finally{f.close()}
});
