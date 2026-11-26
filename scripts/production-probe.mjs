// Bounded anonymous GETs, no credentials, no writes, no private response data.
import {pathToFileURL} from 'node:url';
const origin='https://babymark.pages.dev';
export async function probe({fetcher=fetch,clock=()=>performance.now(),samples=3}={}){
 if(!Number.isInteger(samples)||samples<1||samples>5)throw Error('Expected 1–5 samples');
 const results=[];
 async function get(path,validate){
  const times=[];let cache=null,bytes=0;
  for(let i=0;i<samples;i++){
   const start=clock(),r=await fetcher(origin+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error('Public probe failed: '+path+' HTTP '+r.status);
   const body=await r.text();times.push(Math.round((clock()-start)*100)/100);
   cache=r.headers.get('Cache-Control')||'';bytes=Buffer.byteLength(body);
   validate?.(body,cache);
  }
  times.sort((a,b)=>a-b);results.push({path,samples,median_ms:times[Math.floor(times.length/2)],max_ms:times.at(-1),decoded_bytes:bytes,cache_control:cache});
 }
 let css;
 await get('/',(body,cache)=>{if(!/no-store/i.test(cache))throw Error('HTML cache policy mismatch');const m=body.match(/href="(\/assets\/immutable\/style-[0-9a-f]{32}\.css)"/);if(!m)throw Error('Hashed CSS not found');css=m[1]});
 await get(css,(_,cache)=>{if(!/immutable/i.test(cache)||!/max-age=31536000/i.test(cache))throw Error('Hashed CSS cache policy mismatch')});
 await get('/app.mjs',(_,cache)=>{if(!/no-cache/i.test(cache))throw Error('JS cache policy mismatch')});
 let health;
 await get('/api/cloudflare/health',(body,cache)=>{if(!/no-store/i.test(cache))throw Error('API cache policy mismatch');const d=JSON.parse(body);health={ready:d.ready===true,schema_ready:d.schema_ready===true,schema_target:typeof d.schema_target==='string'&&/^\d{4}$/.test(d.schema_target)?d.schema_target:null};if(!health.ready)throw Error('Health probe not ready')});
 return {scope:'anonymous public HTTP from runner; not real-user Web Vitals or authenticated D1 latency',origin,checked_at:new Date().toISOString(),health,results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await probe(),null,2))}catch(e){console.error(e.message);process.exitCode=1}}
