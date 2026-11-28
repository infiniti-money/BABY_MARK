import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateMetadata} from '../scripts/check-release-metadata.mjs';
import {evaluateChecks} from '../scripts/check-release-gate.mjs';
import {appVersion} from '../cloudflare/lib/app-version.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('P4 exact runtime, version and dependency lock metadata; drift fails closed',async()=>{
 const [p,l,n]=await Promise.all([read('package.json'),read('package-lock.json'),read('.node-version')]);
 const input={pkg:JSON.parse(p),lock:JSON.parse(l),nodePin:n.trim(),runtime:n.trim(),appVersion};
 assert.equal(validateMetadata(input),appVersion);
 assert.throws(()=>validateMetadata({...input,expected:'0.0.0'}),/version mismatch/);
 assert.throws(()=>validateMetadata({...input,runtime:'0.0.0'}),/Node runtime/);
 const drift=structuredClone(input);drift.pkg.devDependencies.wrangler='^4.0.0';
 assert.throws(()=>validateMetadata(drift),/differ from lockfile/);
 const integrity=structuredClone(input);delete integrity.lock.packages['node_modules/wrangler'].integrity;
 assert.throws(()=>validateMetadata(integrity),/integrity/);
});
const sha='a'.repeat(40);
const run=(name,slug,overrides={})=>({name,app:{slug},head_sha:sha,status:'completed',conclusion:'success',...overrides});
const ci=run('cloudflare','github-actions'),pages=run('Cloudflare Pages','cloudflare-workers-and-pages');
const android=run('android','github-actions');
const ios=run('ios','github-actions');
const result=(...runs)=>evaluateChecks([{check_runs:runs}],sha);
test('P4 release gate rejects missing, wrong provider/SHA, failed, skipped, pending and ambiguous checks',()=>{
 assert.equal(evaluateChecks([{check_runs:[ci]},{check_runs:[pages,android,ios]}],sha).ready,true);
 for(const rows of [[ci],[ci,{...pages,app:{slug:'github-actions'}}],[ci,{...pages,head_sha:'b'.repeat(40)}],[ci,{...pages,conclusion:'failure'}],[ci,{...pages,conclusion:'skipped'}],[ci,{...pages,status:'in_progress'}],[ci,pages,pages]])assert.equal(result(...rows,android,ios).ready,false);
 assert.throws(()=>evaluateChecks([],sha));assert.throws(()=>evaluateChecks([{check_runs:[]}],'bad'));
});

test('Native release checks are mandatory and fail closed',()=>{
 const valid=[ci,pages,android,ios];
 assert.equal(result(...valid).ready,true);

 for(const native of [android,ios]){
  const remaining=valid.filter(r=>r!==native);
  assert.equal(result(...remaining).ready,false);

  for(const overrides of [
   {conclusion:'failure'},
   {conclusion:'skipped'},
   {status:'in_progress'},
   {app:{slug:'untrusted-provider'}},
   {head_sha:'b'.repeat(40)}
  ]){
   assert.equal(
    result(...remaining,{...native,...overrides}).ready,
    false
   );
  }

  assert.equal(result(...valid,native).ready,false);
 }
});