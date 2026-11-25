import {test,expect} from '@playwright/test';
const secret='1'.repeat(48),origin='http://127.0.0.1:8788',auth=token=>({Authorization:'Bearer '+token});
const views={staff:['today','schedule','history','requests','handover','messages','push','sessions'],manager:['today','schedule','history','requests','handover','reports','alerts','messages','push','sessions'],admin:['overview','admin','schedule','reports','alerts','payroll','history','requests','handover','messages','push','sessions']};
const primary={staff:['today','schedule','requests'],manager:['today','requests','reports'],admin:['overview','requests','admin']};
async function login(page,role){await page.goto(origin);await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test-'+role);await page.getByLabel('Mật khẩu hoặc mã truy cập',{exact:true}).fill(secret);await page.getByTestId('login-submit').click();await expect(page.locator('#content')).toBeVisible();await expect(page.locator('#content .loading')).toHaveCount(0);}
async function open(page,view){const button=page.locator('#main-nav [data-view="'+view+'"]');if(await button.isVisible())await button.click();else{await page.locator('[data-action="mobile-menu"]').click();await page.locator('#navigation-menu [data-view="'+view+'"]').click();}await expect(page.locator('#content .loading')).toHaveCount(0);}
for(const role of ['staff','manager','admin'])test(role+' can reach every authorized screen with grouped menu, touch and keyboard support',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.emulateMedia({reducedMotion:'reduce'});await login(page,role);
 expect((await page.locator('#main-nav [data-view]').evaluateAll(nodes=>nodes.map(n=>n.dataset.view))).sort()).toEqual([...views[role]].sort());
 const order=await page.locator('#main-nav .primary-nav').evaluateAll(nodes=>nodes.map(n=>({view:n.dataset.view,x:n.getBoundingClientRect().x})).sort((a,b)=>a.x-b.x).map(n=>n.view));expect(order).toEqual(primary[role]);
 await page.locator('[data-action="mobile-menu"]').click();const menu=page.locator('#navigation-menu');await expect(menu).toBeVisible();expect(await menu.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
 for(let i=0;i<8;i++)await page.keyboard.press('Tab');expect(await menu.evaluate(n=>n.contains(document.activeElement))).toBe(true);
 for(const action of role==='admin'?['employee-cv','self-password']:[])await expect(menu.locator('[data-action="'+action+'"]').first()).toHaveCount(0);
 const controls=await menu.locator('button').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));expect(controls.every(b=>b.w>=44&&b.h>=44)).toBe(true);
 await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(page.locator('[data-action="mobile-menu"]')).toHaveAttribute('aria-expanded','false');
 for(const view of views[role]){await open(page,view);await expect(page.locator('#content')).toHaveAttribute('data-screen',view);await expect(page.locator('#content .table-error')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.setViewportSize({width:844,height:390});await page.locator('[data-action="mobile-menu"]').click();await expect(menu).toBeVisible();await menu.getByRole('button',{name:'Lịch làm việc',exact:true}).click();await expect(menu).toBeHidden();
 await page.setViewportSize({width:1440,height:900});await expect(page.locator('[data-action="mobile-menu"]')).toBeHidden();for(const view of views[role])await expect(page.locator('#main-nav [data-view="'+view+'"]')).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.locator('[data-action="mobile-menu"]').click();await page.evaluate(()=>{localStorage.clear();window.dispatchEvent(new StorageEvent('storage',{key:null}));});await expect(menu).toBeHidden();await expect(page.getByTestId('login-submit')).toBeVisible();expect(await page.locator('#app').evaluate(n=>n.inert)).toBe(false);
 expect(errors).toEqual([]);
});

test('mobile thread list leaves unseen messages unread and keeps private drafts in the active session',async({page,request})=>{
 const tokens={};for(const role of ['staff','other','manager','admin']){const r=await request.post('/api/auth/login',{data:{username:'test-'+role,secret}});tokens[role]=(await r.json()).token;}
 const me=async role=>(await (await request.get('/api/auth/me',{headers:auth(tokens[role])})).json()).user;
 const other=await me('other'),manager=await me('manager'),thread=async id=>(await (await request.post('/api/messages',{headers:auth(tokens.staff),data:{action:'direct',user_id:id}})).json()).id;
 const first=await thread(other.id),second=await thread(manager.id),message='Tin chưa mở UX '+Date.now();expect((await request.post('/api/messages',{headers:auth(tokens.other),data:{action:'send',thread_id:first,body:message}})).status()).toBe(201);
 expect((await request.post('/api/messages',{headers:auth(tokens.admin),data:{action:'send',thread_id:'system',body:'Thông báo hệ thống chưa mở '+Date.now()}})).status()).toBe(201);
 await login(page,'staff');let reads=0,sends=0;page.on('request',r=>{if(r.url().includes('/api/messages')&&r.method()==='POST'){const b=r.postDataJSON();if(b.action==='read')reads++;if(b.action==='send')sends++;}});
 await page.getByRole('button',{name:'Tin nhắn nội bộ',exact:true}).click();await expect(page.locator('.chat-layout')).toHaveAttribute('data-pane','list');await expect(page.locator('#chat-room')).toBeHidden();expect(reads).toBe(0);
 await page.locator('[data-action="chat-open"][data-id="'+first+'"]').click();await expect(page.locator('#chat-stream')).toContainText(message);await expect.poll(()=>reads).toBeGreaterThan(0);await page.locator('[data-form="chat-send"] textarea').fill('Bản nháp riêng A');await page.locator('[data-action="chat-list"]').click();
 await page.locator('[data-action="chat-open"][data-id="'+second+'"]').click();await page.locator('[data-form="chat-send"] textarea').fill('Bản nháp riêng B');await page.locator('[data-action="chat-list"]').click();await page.locator('[data-action="chat-open"][data-id="'+first+'"]').click();await expect(page.locator('[data-form="chat-send"] textarea')).toHaveValue('Bản nháp riêng A');
 await open(page,'requests');await open(page,'messages');await page.locator('[data-action="chat-open"][data-id="'+first+'"]').click();await expect(page.locator('[data-form="chat-send"] textarea')).toHaveValue('Bản nháp riêng A');expect(sends).toBe(0);
 expect(await page.evaluate(()=>[localStorage,sessionStorage].some(store=>Object.values(store).some(value=>typeof value==='string'&&value.includes('Bản nháp riêng'))))).toBe(false);
 await page.locator('[data-action="mobile-menu"]').click();await page.locator('#navigation-menu [data-action="logout"]').click();await expect(page.getByTestId('login-submit')).toBeVisible();await login(page,'staff');await open(page,'messages');await page.locator('[data-action="chat-open"][data-id="'+first+'"]').click();await expect(page.locator('[data-form="chat-send"] textarea')).toBeEmpty();expect(sends).toBe(0);
});

test('floating iOS-style dock has four touch targets, inset edges and room below content',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await login(page,'staff');
 const dock=page.locator('.sidebar'),nav=page.locator('#main-nav');
 for(const viewport of [{width:320,height:640},{width:375,height:812},{width:390,height:844},{width:430,height:932},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  const geometry=await dock.evaluate(el=>{
   const r=el.getBoundingClientRect(),s=getComputedStyle(el),buttons=[...el.querySelectorAll('#main-nav button')].filter(b=>getComputedStyle(b).display!=='none');
   return {left:r.left,right:r.right,bottom:r.bottom,height:r.height,radius:parseFloat(s.borderRadius),position:s.position,
    reserve:parseFloat(getComputedStyle(document.querySelector('.workspace')).paddingBottom),
    targets:buttons.map(b=>{const q=b.getBoundingClientRect(),icon=b.querySelector('.icon').getBoundingClientRect();return {x:q.x,right:q.right,w:q.width,h:q.height,iconW:icon.width,iconH:icon.height};})};
  });
  expect(geometry.position).toBe('fixed');expect(geometry.left).toBeGreaterThanOrEqual(8);expect(geometry.right).toBeLessThanOrEqual(viewport.width-8);
  expect(geometry.bottom).toBeLessThanOrEqual(viewport.height-5);expect(geometry.radius).toBeGreaterThanOrEqual(20);
  expect(geometry.reserve).toBeGreaterThanOrEqual(geometry.height+viewport.height-geometry.bottom);
  expect(geometry.targets).toHaveLength(4);
  for(const t of geometry.targets){expect(t.w).toBeGreaterThanOrEqual(44);expect(t.h).toBeGreaterThanOrEqual(44);expect(t.iconW).toBeGreaterThanOrEqual(viewport.width===844?34:48);expect(t.iconH).toBeGreaterThanOrEqual(viewport.width===844?34:48);}
  const sorted=[...geometry.targets].sort((a,b)=>a.x-b.x);for(let i=1;i<sorted.length;i++)expect(sorted[i].x).toBeGreaterThanOrEqual(sorted[i-1].right-1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.setViewportSize({width:390,height:844});await nav.locator('[data-view="schedule"]').click();await expect(nav.locator('[data-view="schedule"]')).toHaveAttribute('aria-current','page');
 await nav.locator('[data-action="mobile-menu"]').click();await expect(page.locator('#navigation-menu')).toBeVisible();await page.keyboard.press('Escape');
 await page.setViewportSize({width:1440,height:900});await expect(nav.locator('[data-action="mobile-menu"]')).toBeHidden();await expect(nav.locator('[data-view="schedule"]')).toBeVisible();
});

test('prototype keeps real employee identity and attendance controls, without fabricated times',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await login(page,'staff');
 const welcome=page.locator('.ios-welcome');await expect(welcome).toBeVisible();await expect(welcome.locator('strong')).toHaveText(await page.locator('.profile strong').innerText());
 await expect(page.locator('.ios-attendance-times')).toBeVisible();await expect(page.getByTestId('attendance-in')).toBeVisible();await expect(page.getByTestId('attendance-out')).toBeVisible();
 await expect(page.locator('.employee-tool-grid button')).toHaveCount(6);
 const dock=page.locator('#main-nav .primary-nav.active');await expect(dock.locator('.icon')).toHaveCSS('width','54px');await expect(dock).toHaveCSS('font-size','10px');
 for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
 await page.setViewportSize({width:1440,height:900});await expect(welcome).toBeHidden();await expect(page.locator('.ios-attendance-times')).toBeHidden();
});
