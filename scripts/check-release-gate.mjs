// Require exact SHA and trusted check providers. No GitHub write access.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const requiredChecks=[
 ['cloudflare','github-actions'],
 ['Cloudflare Pages','cloudflare-workers-and-pages'],
 ['android','github-actions'],
 ['ios','github-actions']
];
export function evaluateChecks(pages,sha){
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Expected a full commit SHA');
 if(!Array.isArray(pages)||!pages.length||pages.some(p=>!Array.isArray(p.check_runs)))throw Error('Invalid check-run response');
 const runs=pages.flatMap(p=>p.check_runs);
 const checks=requiredChecks.map(([name,slug])=>{
  const matching=runs.filter(r=>r.name===name&&r.app?.slug===slug&&r.head_sha===sha);
  // With filter=latest, multiple matching checks are ambiguous; fail closed.
  const r=matching.length===1?matching[0]:null;
  const result=matching.length>1?'ambiguous':!r?'missing':r.status!=='completed'?'pending':r.conclusion==='success'?'success':'failed';
  return {name,provider:slug,result,conclusion:r?.conclusion??null};
 });
 return {ready:checks.every(c=>c.result==='success'),checks};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=evaluateChecks(JSON.parse(await readFile(process.argv[2],'utf8')),process.argv[3]);console.log(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=1;}
 catch(e){console.error(e.message);process.exitCode=1;}
}
