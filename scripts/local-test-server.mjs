// Ephemeral acceptance environment: local workerd+D1+KV only. No remote APIs,
// no account credentials, no persistent database, no production operations.
import {createServer} from 'node:http';
import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {seedApp} from '../cloudflare/tests/helpers/app.mjs';
import {seedDemo} from '../cloudflare/tests/helpers/demo.mjs';
import {randomHex} from '../cloudflare/lib/auth.mjs';
const demo=process.argv.includes('--demo'),cronSecret=demo?randomHex(32):undefined;
const root=resolve(import.meta.dirname,'..'),port=Number(process.env.TEST_PORT||8788);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:resolve(root,'work/functions-build/index.js'),compatibilityDate:'2026-11-24',
 d1Databases:['DB'],kvNamespaces:['TIMEMARKS'],bindings:{PHOTO_EVICTION_ENABLED:'false',ATTENDANCE_RETENTION_ENABLED:'false',...(demo?{ROSTER_CRON_SECRET:cronSecret}:{})}}));
await mf.ready;
const db=await mf.getD1Database('DB');
// D1 exec accepts one SQL statement per line. Keep trigger bodies intact by
// splitting only at statement boundaries outside a BEGIN...END trigger body.
function statements(sql){
 const noComments=sql.replace(/--[^\n]*/g,'');const result=[];let buffer='',trigger=false;
 for(const part of noComments.split(/(;)/)){
  buffer+=part;
  if(/^\s*CREATE\s+TRIGGER\b/i.test(buffer))trigger=true;
  if(part===';'&&(!trigger||/\bEND\s*;\s*$/i.test(buffer))){if(buffer.trim())result.push(buffer.trim());buffer='';trigger=false;}
 }
 if(buffer.trim())result.push(buffer.trim());return result;
}
for(const file of (await readdir(resolve(root,'cloudflare/d1'))).filter(x=>x.endsWith('.sql')).sort()){
 const sql=await readFile(resolve(root,'cloudflare/d1',file),'utf8');
 for(const statement of statements(sql))await db.prepare(statement).run();
}
if(demo){const d=await seedDemo(db,cronSecret);console.log('\n=== CHỈ DỮ LIỆU DEMO LOCAL ===\nTên đăng nhập: demo-admin / demo-ql-01 / demo-ql-02 / demo-01-a ... demo-14-b\nMã truy cập tạm thời cho các tài khoản DEMO: '+d.secret+'\nTháng đối soát: '+d.prevMonth+'\nCa tương lai đã tạo: '+d.created+'\nDữ liệu sẽ mất khi dừng máy chủ. Không dùng mã này trên production.\n');}else await seedApp(db);
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp','.json':'application/json','.webmanifest':'application/manifest+json; charset=utf-8'};
const assetRoot=resolve(root,'dist');
// Apply the global and exact-path Cloudflare header rules separately. Otherwise
// /apple-touch-icon.png's Content-Type overwrites every HTML and JS response.
const headerRules=new Map();let currentRule=null;
try{const content=await readFile(resolve(root,'public/_headers'),'utf8');for(const line of content.split(/\r?\n/)){
 if(line.trim().startsWith('#')||!line.trim())continue;
 if(!/^\s/.test(line)){currentRule=line.trim();headerRules.set(currentRule,{});continue;}
 const m=line.match(/^\s+([^:]+):\s*(.*)$/);if(m&&currentRule)headerRules.get(currentRule)[m[1].trim()]=m[2];
}}catch{}
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/__test__/ready'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"local":true,"ephemeral":true}');return;}
  if(req.url.startsWith('/api/')){
   const chunks=[];let length=0;for await(const c of req){length+=c.length;if(length>300000){res.writeHead(413);res.end();return;}chunks.push(c);}
   const response=await mf.dispatchFetch(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=resolve(assetRoot,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(assetRoot+sep)||!await stat(file).then(s=>s.isFile()).catch(()=>false)){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream',...(headerRules.get('/*')||{}),...(headerRules.get(pathname)||{})});res.end(await readFile(file));
 }catch(e){console.error('Local acceptance request failed:',e.message);res.writeHead(500);res.end('Local test server error');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Ephemeral Cloudflare acceptance environment: http://127.0.0.1:${port}`));
const stop=async()=>{server.close();await mf.dispose();process.exit(0)};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
