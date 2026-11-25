import test from 'node:test';import assert from 'node:assert/strict';
import {primaryViews,initialFilters,includeRequestDates,captureControls,requestMatches} from '../public/workspace.mjs';
test('daily navigation follows role without granting new capabilities',()=>{
 assert.deepEqual(primaryViews('staff'),['today','schedule','requests']);assert.deepEqual(primaryViews('manager'),['today','requests','reports']);assert.deepEqual(primaryViews('admin'),['overview','requests','admin']);
 assert.ok(!primaryViews('staff').includes('admin'));assert.ok(!primaryViews('manager').includes('payroll'));
});
test('request dates include upcoming shifts and newly sent leave, within the API range',()=>{
 const d=initialFilters('requests','2026-12-31');assert.equal(d.from,'2026-12-01');assert.equal(d.to,'2027-01-31');
 assert.equal(initialFilters('reports','2026-12-31').to,'2026-12-31');assert.equal(initialFilters('requests','2028-02-01').to,'2028-03-03');
 assert.equal(initialFilters('requests','2027-01-01').from,'2026-12-02');
 assert.deepEqual(includeRequestDates(d,'2027-02-01'),{...d,to:'2027-02-01'});
 assert.deepEqual(includeRequestDates(d,'2027-06-01','2027-06-05'),{...d,from:'2027-06-01',to:'2027-06-05'});
});
test('capture guides IN then OUT and blocks finished, rejected, leave, expired and uncertain work',()=>{
 const a={starts_at:1000000,ends_at:2000000},options={now:1500000,ready:true};
 let c=captureControls(a,options);assert.equal(c.inDisabled,false);assert.equal(c.outDisabled,true);
 c=captureControls({...a,in_id:'in'},options);assert.equal(c.inDisabled,true);assert.equal(c.outDisabled,false);assert.equal(c.next,'OUT');
 for(const row of [undefined,{...a,in_id:'in',out_id:'out'},{...a,extra_state:'REJECTED'},{...a,request_kind:'LEAVE',request_state:'APPROVED'},{starts_at:0,ends_at:1}]){
  const result=captureControls(row,{...options,now:100000000});assert.equal(result.inDisabled,true);assert.equal(result.outDisabled,true);
 }
 for(const opt of [{ready:false},{busy:true},{blocked:true}]){const result=captureControls(a,{...options,...opt});assert.equal(result.inDisabled,true);assert.equal(result.outDisabled,true);}
});
test('review queue excludes own requests and never treats staff as approvers',()=>{
 const user={id:'manager',role:'manager'},other={user_id:'staff',state:'PENDING'};
 assert.equal(requestMatches(other,'REVIEW',user),true);assert.equal(requestMatches({...other,user_id:user.id},'REVIEW',user),false);
 assert.equal(requestMatches(other,'REVIEW',{id:'staff',role:'staff'}),false);assert.equal(requestMatches({...other,state:'APPROVED'},'REVIEW',user),false);assert.equal(requestMatches(other,'ALL',user),true);
});
