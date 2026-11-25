import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const secret='1'.repeat(48);
async function login(page,role='staff'){
 await page.goto('/');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test-'+role);await page.getByLabel('Mật khẩu hoặc mã truy cập',{exact:true}).fill(secret);await page.getByTestId('login-submit').click();
 await expect(page.getByRole('heading',{name:role==='admin'?'Tổng quan quản trị':'Chấm công hôm nay',exact:true})).toBeVisible();await expect(page.locator('#content .loading')).toHaveCount(0);
}

test('login defers camera/Timemark, CV and workbook modules until use',async({page})=>{
 const loaded=[];page.on('request',r=>loaded.push(new URL(r.url()).pathname));
 await login(page);
 for(const name of ['capture','timemark-layout','employee-cv','cv-print','report-documents','xlsx'])expect(loaded).not.toContain('/'+name+'.mjs');
 await page.getByRole('button',{name:'Hồ sơ của tôi',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 expect(loaded).toContain('/employee-cv.mjs');expect(loaded).not.toContain('/cv-print.mjs');expect(loaded).not.toContain('/capture.mjs');
});

test('server report pages keep totals and full Excel export beyond the visible page',async({page})=>{
 let fullReads=0;const pages=[];
 await page.route('**/api/reports?*',async route=>{
  const u=new URL(route.request().url()),summary={assignments:63,shifts:0,work_units:0,minutes:0,late:0,leaveDays:0},rows=Array.from({length:63},(_,i)=>({id:'row-'+i,user_id:'u-'+i,employee_code:'PAGING-ROW-'+String(i).padStart(2,'0'),full_name:'Nhân viên giả lập '+i,work_date:'2026-11-01',branch_id:'BM-001',branch_name:'Cửa hàng kiểm thử',branch_code:'BM-001',shift_name:'Ca giả lập',starts_at:1,ends_at:2,summary:{minutes:0,work_units:0,status:'Vắng',days:0}}));
  const common={from:u.searchParams.get('from'),to:u.searchParams.get('to'),branches:[],summary};
  if(u.searchParams.get('view')==='summary')return route.fulfill({json:common});
  if(u.searchParams.has('page_size')){
   const start=u.searchParams.has('after_id')?Number(u.searchParams.get('after_id')):0;pages.push(start);
   return route.fulfill({json:{...common,rows:rows.slice(start,start+30),next:start+30<63?{after_id:String(start+30)}:null}});
  }
  fullReads++;return route.fulfill({json:{...common,rows}});
 });
 await login(page,'admin');await page.locator('[data-view="reports"]').click();
 await expect(page.locator('#report-page tbody tr')).toHaveCount(30);await expect(page.locator('#report-page')).toContainText('/ 63 ca');
 await page.locator('[data-action="report-next"]').click();await expect(page.locator('#report-page')).toContainText('PAGING-ROW-30');
 await page.locator('[data-action="report-next"]').click();await expect(page.locator('#report-page tbody tr')).toHaveCount(3);await expect(page.locator('[data-action="report-next"]')).toBeDisabled();
 await page.locator('[data-action="report-prev"]').click();await expect(page.locator('#report-page')).toContainText('PAGING-ROW-30');expect(pages).toEqual([0,30,60,30]);
 const download=page.waitForEvent('download');await page.locator('[data-action="report-xlsx-all"]').click();const file=await download;
 expect(fullReads).toBe(1);const bytes=await readFile(await file.path());expect(bytes.subarray(0,2).toString()).toBe('PK');expect(bytes.toString()).toContain('PAGING-ROW-62');expect(bytes.toString()).toContain('PAGING-ROW-00');
});

test('chat read polling backs off, respects Retry-After, pauses offline and resumes without sending',async({page,context})=>{
 await page.clock.install();await login(page);await page.getByRole('button',{name:'Tin nhắn',exact:true}).click();await expect(page.locator('#chat-stream')).toBeVisible();let polls=0,writes=0;
 page.on('request',r=>{if(r.url().includes('/api/messages')&&r.method()==='POST')writes++;});
 await page.route('**/api/messages?*',async route=>{polls++;return route.fulfill({status:429,headers:{'Retry-After':'120'},json:{error:'Synthetic throttling'}});});
 await page.clock.fastForward(30001);await expect.poll(()=>polls).toBe(1);
 await page.clock.fastForward(119000);expect(polls).toBe(1);
 await page.clock.fastForward(2000);await expect.poll(()=>polls).toBe(2);
 await context.setOffline(true);await page.clock.fastForward(600000);expect(polls).toBe(2);
 await context.setOffline(false);await page.clock.fastForward(1001);await expect.poll(()=>polls).toBe(3);
 expect(writes).toBe(0);
});

test('closing branch GPS releases its watch; navigation cancels only pending reads',async({page})=>{
 await page.addInitScript(()=>{
  window.__gps=new Set();navigator.geolocation.watchPosition=()=>{window.__gps.add(7);return 7;};navigator.geolocation.clearWatch=id=>window.__gps.delete(id);
  const original=window.fetch;window.__pendingReads=0;window.__abortedReads=0;
  window.fetch=(input,options={})=>{
   if(window.__stallReads&&String(input).startsWith('/api/reports')){window.__pendingReads++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{window.__abortedReads++;reject(new DOMException('Aborted','AbortError'));},{once:true}));}
   return original(input,options);
  };
 });
 await login(page,'admin');await page.locator('[data-view="admin"]').click();await page.getByRole('tab',{name:'Cửa hàng',exact:true}).click();await page.getByRole('row').filter({hasText:'BABYMARK LUXURY LIÊN NGHĨA'}).getByRole('button',{name:'Sửa',exact:true}).click();
 await page.locator('[data-action="branch-current-gps"]').click();await expect.poll(()=>page.evaluate(()=>window.__gps.size)).toBe(1);
 await page.getByRole('button',{name:'Đóng',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__gps.size)).toBe(0);
 await page.evaluate(()=>window.__stallReads=true);await page.locator('[data-view="reports"]').click();await expect.poll(()=>page.evaluate(()=>window.__pendingReads)).toBe(2);
 await page.locator('[data-view="overview"]').click();await expect(page.getByRole('heading',{name:'Tổng quan quản trị',exact:true})).toBeVisible();expect(await page.evaluate(()=>window.__abortedReads)).toBe(2);await expect(page.locator('#content .table-error')).toHaveCount(0);
 await page.locator('[data-view="reports"]').click();await expect.poll(()=>page.evaluate(()=>window.__pendingReads)).toBe(4);
 await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:null})));await expect(page.getByTestId('login-submit')).toBeVisible();expect(await page.evaluate(()=>window.__abortedReads)).toBe(4);
});

test('stalled encoding cancels promptly, releases URL and reuses one downscale canvas',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{
  const {composeTimemark}=await import('/capture.mjs'),now=Date.now(),meta={serverTimestamp:now,shiftStart:now-3600000,shiftEnd:now+3600000,lat:20,lng:106,accuracy:5,distance:0,radius:100,type:'IN',branchName:'Kiểm thử',employeeName:'Nhân viên',employeeCode:'TEST'};
  const frame=document.createElement('canvas');frame.width=800;frame.height=1200;
  const originalBlob=HTMLCanvasElement.prototype.toBlob,originalCreate=document.createElement.bind(document),originalRevoke=URL.revokeObjectURL;let canvases=[],calls=0,revoked=0,controller=new AbortController();
  document.createElement=function(tag,...args){const el=originalCreate(tag,...args);if(tag==='canvas')canvases.push(el);return el;};URL.revokeObjectURL=function(url){revoked++;originalRevoke.call(URL,url);};
  try{
   HTMLCanvasElement.prototype.toBlob=function(callback){calls++;if(calls===7)callback(new Blob(['ok'],{type:'image/jpeg'}));else callback(new Blob([new Uint8Array(200001)],{type:'image/jpeg'}));};
   const blob=await composeTimemark(frame,meta),allocated=canvases.length,released=canvases.every(c=>c.width===0&&c.height===0);
   HTMLCanvasElement.prototype.toBlob=function(){setTimeout(()=>controller.abort(),0);};
   let error;try{await composeTimemark(frame,meta,{signal:controller.signal});}catch(e){error=e.message;}
   return {bytes:blob.size,calls,allocated,released,revoked,error};
  }finally{HTMLCanvasElement.prototype.toBlob=originalBlob;document.createElement=originalCreate;URL.revokeObjectURL=originalRevoke;frame.width=0;frame.height=0;}
 });
 expect(result.bytes).toBe(2);expect(result.calls).toBe(7);expect(result.allocated).toBe(1);expect(result.released).toBe(true);expect(result.revoked).toBe(2);expect(result.error).toContain('Đã hủy');
});

test('repeated offscreen content replacement releases motion observer targets',async({page})=>{
 await page.addInitScript(()=>{window.__observed=new Set();window.IntersectionObserver=class{observe(n){window.__observed.add(n);}unobserve(n){window.__observed.delete(n);}disconnect(){window.__observed.clear();}};});
 await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
 const counts=await page.evaluate(async()=>{
  const {observeMotion,stopMotion}=await import('/motion.mjs');stopMotion();const root=document.createElement('div');document.body.append(root);
  for(let i=0;i<50;i++){root.innerHTML='<div class="card-head"><h2>Detached fixture</h2></div>';observeMotion(root);}
  const active=window.__observed.size;stopMotion();root.remove();return {active,afterStop:window.__observed.size};
 });expect(counts).toEqual({active:1,afterStop:0});
});

test('saved session reconnects after failed startup API without replaying mutations',async({page})=>{
 await login(page);await page.route('**/api/auth/me',route=>route.abort('internetdisconnected'));await page.reload();await expect(page.getByRole('heading',{name:'Chưa thể kết nối BABY MARK',exact:true})).toBeVisible();
 let mutations=0;page.on('request',r=>{if(r.url().includes('/api/')&&r.method()!=='GET')mutations++;});
 await page.unroute('**/api/auth/me');let reads=0,release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/auth/me',async route=>{reads++;await gate;await route.continue();});
 await page.evaluate(()=>{for(let i=0;i<3;i++)window.dispatchEvent(new Event('online'));});await expect.poll(()=>reads).toBe(1);release();
 await expect(page.getByRole('heading',{name:'Chấm công hôm nay',exact:true})).toBeVisible();expect(mutations).toBe(0);expect(reads).toBe(1);
});

test('overview print keeps its day and branch instead of expanding to report filters',async({page})=>{
 await login(page,'admin');const filter=page.locator('[data-form="overview-filter"]');await filter.locator('[name="branch"]').selectOption('BM-001');await filter.getByRole('button',{name:'Xem tổng quan',exact:true}).click();
 await expect(page.locator('#content .loading')).toHaveCount(0);const day=await page.locator('[data-form="overview-filter"] [name="day"]').inputValue(),reads=[];
 page.on('request',r=>{if(r.url().includes('/api/reports?'))reads.push(new URL(r.url()));});
 await page.locator('[data-action="overview-print"]').click();await expect(page.locator('#document-preview')).toBeVisible();
 expect(reads.length).toBe(1);expect(reads[0].searchParams.get('from')).toBe(day);expect(reads[0].searchParams.get('to')).toBe(day);expect(reads[0].searchParams.get('branch_id')).toBe('BM-001');
});
