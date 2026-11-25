import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,readdir,mkdir,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {seedApp} from './app.mjs';
function statements(sql){
 const parts=[];let buffer='',trigger=false;
 for(const part of sql.replace(/--[^\n]*/g,'').split(/(;)/)){
  buffer+=part;if(/^\s*CREATE\s+TRIGGER\b/i.test(buffer))trigger=true;
  if(part===';'&&(!trigger||/\bEND\s*;\s*$/i.test(buffer))){if(buffer.trim())parts.push(buffer.trim());buffer='';trigger=false;}
 }
 if(buffer.trim())parts.push(buffer.trim());return parts;
}
export async function runtimeFixture(){
 const directoryURL=new URL('../../../work/',import.meta.url);await mkdir(directoryURL,{recursive:true});
 const bundle=fileURLToPath(new URL('d1-fixture-'+crypto.randomUUID()+'.mjs',directoryURL));
 await build({entryPoints:[fileURLToPath(new URL('./runtime-worker.mjs',import.meta.url))],outfile:bundle,bundle:true,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:bundle,compatibilityDate:'2026-11-24',d1Databases:['DB'],kvNamespaces:['TIMEMARKS']}));
 const close=async()=>{try{await mf.dispose();}finally{await unlink(bundle).catch(()=>{});}};
 try{
  await mf.ready;const db=await mf.getD1Database('DB'),directory=new URL('../../d1/',import.meta.url);
  for(const file of (await readdir(directory)).filter(f=>f.endsWith('.sql')).sort())for(const statement of statements(await readFile(new URL(file,directory),'utf8')))await db.prepare(statement).run();
  const seed=await seedApp(db),env={DB:db};
  const call=async(route,who,{method='POST',body,form,query='',resource}={})=>{
   const headers={};if(who)headers.Authorization='Bearer '+seed.tokens[who];if(body!==undefined)headers['Content-Type']='application/json';
   const url=new URL('https://fixture.invalid'+route+query);if(resource)url.searchParams.set('__resource',resource);
   // Serialize native Node FormData before crossing Miniflare's fetch classes.
   let payload;if(body!==undefined)payload=JSON.stringify(body);else if(form){const encoded=new Request(url,{method,body:form});headers['Content-Type']=encoded.headers.get('Content-Type');payload=new Uint8Array(await encoded.arrayBuffer());}
   return mf.dispatchFetch(url,{method,headers,...(payload!==undefined?{body:payload}:{})});
  };
  return {db,env,...seed,call,close};
 }catch(error){await close();throw error;}
}
