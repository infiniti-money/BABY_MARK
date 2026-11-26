import {test,expect} from '@playwright/test';
const secret='1'.repeat(48),origin='http://127.0.0.1:8788',auth=token=>({Authorization:'Bearer '+token});
const views={staff:['today','schedule','history','requests','handover','messages','push','sessions'],manager:['today','schedule','history','requests','handover','reports','alerts','messages','push','sessions'],admin:['overview','admin','schedule','reports','alerts','payroll','history','requests','handover','messages','push','sessions']};
const primary={staff:['today','schedule','requests'],manager:['today','requests','reports'],admin:['overview','requests','admin']};
async function login(page,role){await page.goto(origin);await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test-'+role);await page.getByLabel('Mật khẩu hoặc mã truy cập',{exact:true}).fill(secret);await page.getByTestId('login-submit').click();await expect(page.locator('#content')).toBeVisible();await expect(page.locator('#content .loading')).toHaveCount(0);}
async function open(page,view){const button=page.locator('#main-nav .nav-group [data-view="'+view+'"]');if(await button.isVisible())await button.click();else{await page.locator('#main-nav [data-action="mobile-menu"]').click();await page.locator('#navigation-menu [data-view="'+view+'"]').click();}await expect(page.locator('#content .loading')).toHaveCount(0);}
for(const role of ['staff','manager','admin'])test(role+' can reach every authorized screen with grouped menu, touch and keyboard support',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.emulateMedia({reducedMotion:'reduce'});await login(page,role);
 expect((await page.locator('#main-nav .nav-group [data-view]').evaluateAll(nodes=>nodes.map(n=>n.dataset.view))).sort()).toEqual([...views[role]].sort());
 const order=await page.locator('#main-nav .nav-group .primary-nav').evaluateAll(nodes=>nodes.map(n=>({view:n.dataset.view,order:Number(n.dataset.navOrder)})).sort((a,b)=>a.order-b.order).map(n=>n.view));expect(order).toEqual(primary[role]);
 await page.locator('[data-action="mobile-menu"]').click();const menu=page.locator('#navigation-menu');await expect(menu).toBeVisible();expect(await menu.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
 for(let i=0;i<8;i++)await page.keyboard.press('Tab');expect(await menu.evaluate(n=>n.contains(document.activeElement))).toBe(true);
 for(const action of role==='admin'?['employee-cv','self-password']:[])await expect(menu.locator('[data-action="'+action+'"]').first()).toHaveCount(0);
 const controls=await menu.locator('button').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));expect(controls.every(b=>b.w>=44&&b.h>=44)).toBe(true);
 await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(page.locator('[data-action="mobile-menu"]')).toHaveAttribute('aria-expanded','false');
 for(const view of views[role]){await open(page,view);await expect(page.locator('#content')).toHaveAttribute('data-screen',view);await expect(page.locator('#content .table-error')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.setViewportSize({width:844,height:390});await page.locator('[data-action="mobile-menu"]').click();await expect(menu).toBeVisible();await menu.getByRole('button',{name:'Lịch làm việc',exact:true}).click();await expect(menu).toBeHidden();
 await page.setViewportSize({width:1440,height:900});await expect(page.locator('[data-action="mobile-menu"]')).toBeHidden();for(const view of views[role])await expect(page.locator('#main-nav .nav-group [data-view="'+view+'"]')).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.locator('[data-action="mobile-menu"]').click();await page.evaluate(()=>{localStorage.clear();window.dispatchEvent(new StorageEvent('storage',{key:null}));});await expect(menu).toBeHidden();await expect(page.getByTestId('login-submit')).toBeVisible();expect(await page.locator('#app').evaluate(n=>n.inert)).toBe(false);
 expect(errors).toEqual([]);
});

test('mobile thread list leaves unseen messages unread and keeps private drafts in the active session',async({page,request})=>{
 const tokens={};for(const role of ['staff','other','manager','admin']){const r=await request.post('/api/auth/login',{data:{username:'test-'+role,secret}});tokens[role]=(await r.json()).token;}
 const me=async role=>(await (await request.get('/api/auth/me',{headers:auth(tokens[role])})).json()).user;
 const other=await me('other'),manager=await me('manager'),thread=async id=>(await (await request.post('/api/messages',{headers:auth(tokens.staff),data:{action:'direct',user_id:id}})).json()).id;
 const first=await thread(other.id),second=await thread(manager.id),message='Tin chưa mở UX '+Date.now();expect((await request.post('/api/messages',{headers:auth(tokens.other),data:{action:'send',thread_id:first,body:message}})).status()).toBe(201);
 const notice='Thông báo hệ thống chưa mở '+Date.now();expect((await request.post('/api/messages',{headers:auth(tokens.admin),data:{action:'send',thread_id:'system',body:notice}})).status()).toBe(201);
 let reads=0,sends=0;page.on('request',r=>{if(r.url().includes('/api/messages')&&r.method()==='POST'){const b=r.postDataJSON();if(b.action==='read')reads++;if(b.action==='send')sends++;}});
 await login(page,'staff');await expect(page.locator('.dashboard-notices')).toContainText(notice);
 const bell=page.getByRole('button',{name:'Thông báo',exact:true});await expect(bell.locator('[data-dashboard-bell-count]')).toHaveText(/^[1-9]\d*$/);
 await bell.click();await expect(page.locator('.chat-layout')).toHaveAttribute('data-pane','list');await expect(page.locator('#chat-room')).toBeHidden();expect(reads).toBe(0);
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
   const r=el.getBoundingClientRect(),s=getComputedStyle(el),buttons=[...el.querySelectorAll('#main-nav button')].filter(b=>b.getClientRects().length);
   return {left:r.left,right:r.right,bottom:r.bottom,height:r.height,radius:parseFloat(s.borderRadius),position:s.position,
    reserve:parseFloat(getComputedStyle(document.querySelector('.workspace')).paddingBottom),
    targets:buttons.map(b=>{const q=b.getBoundingClientRect(),icon=[...b.querySelectorAll('.dashboard-dock-icon,.icon')].find(node=>node.getClientRects().length).getBoundingClientRect();return {x:q.x,right:q.right,w:q.width,h:q.height,iconW:icon.width,iconH:icon.height};})};
  });
  expect(geometry.position).toBe('fixed');expect(geometry.left).toBeGreaterThanOrEqual(8);expect(geometry.right).toBeLessThanOrEqual(viewport.width-8);
  expect(geometry.bottom).toBeLessThanOrEqual(viewport.height-5);expect(geometry.radius).toBeGreaterThanOrEqual(20);
  expect(geometry.reserve).toBeGreaterThanOrEqual(geometry.height+viewport.height-geometry.bottom);
  expect(geometry.targets).toHaveLength(4);
  for(const t of geometry.targets){expect(t.w).toBeGreaterThanOrEqual(44);expect(t.h).toBeGreaterThanOrEqual(44);expect(t.iconW).toBeGreaterThanOrEqual(viewport.width===844?34:48);expect(t.iconH).toBeGreaterThanOrEqual(viewport.width===844?34:48);}
  const sorted=[...geometry.targets].sort((a,b)=>a.x-b.x);for(let i=1;i<sorted.length;i++)expect(sorted[i].x).toBeGreaterThanOrEqual(sorted[i-1].right-1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.setViewportSize({width:390,height:844});
 for(const label of ['Trang chủ','Chấm công','Tiện ích','Cá nhân'])await expect(nav.getByRole('button',{name:label,exact:true})).toBeVisible();
 const order=await nav.locator('[data-dashboard-dock]').evaluateAll(nodes=>nodes.sort((a,b)=>a.getBoundingClientRect().x-b.getBoundingClientRect().x).map(node=>node.dataset.dashboardDock));
 expect(order).toEqual(['home','attendance','utilities','profile']);
 const home=nav.getByRole('button',{name:'Trang chủ',exact:true});await expect(home).toHaveAttribute('aria-current','page');
 await open(page,'schedule');await expect(page.locator('#content')).toHaveAttribute('data-screen','schedule');
 await expect(home).not.toHaveAttribute('aria-current','page');await home.click();await expect(home).toHaveAttribute('aria-current','page');
 await nav.getByRole('button',{name:'Cá nhân',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
 await nav.getByRole('button',{name:'Tiện ích',exact:true}).click();await expect(page.locator('#navigation-menu')).toBeVisible();await page.keyboard.press('Escape');
 await page.setViewportSize({width:1440,height:900});await expect(nav.locator('[data-action="mobile-menu"]')).toBeHidden();await expect(nav.locator('[data-view="schedule"]')).toBeVisible();
});

test('portrait dashboard reflects the assigned shift and starts the existing camera flow on demand',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});
 const userResponse=page.waitForResponse(r=>r.url().endsWith('/api/auth/me')&&r.ok());
 const scheduleResponse=page.waitForResponse(r=>r.url().includes('/api/assignments?')&&r.ok());
 await login(page,'staff');
 const {user}=await (await userResponse).json();
 const {assignments}=await (await scheduleResponse).json();
 const shift=assignments.find(row=>row.user_id===user.id);
 const welcome=page.locator('.ios-welcome'),attendance=page.locator('.dashboard-attendance'),schedule=page.locator('.dashboard-shift');
 await expect(welcome).toBeVisible();await expect(welcome.locator('strong')).toContainText(user.full_name);
 await expect(welcome).toContainText(shift.branch_name);await expect(schedule).toContainText(shift.shift_name);
 const hm=stamp=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(stamp);
 await expect(schedule).toContainText(hm(shift.starts_at));await expect(schedule).toContainText(hm(shift.ends_at));
 const times=attendance.locator('.ios-attendance-times');await expect(times).toBeVisible();
 await page.evaluate(()=>{
  window.attendanceCameraRequests=0;
  const getUserMedia=async()=>{
   window.attendanceCameraRequests++;
   throw new DOMException('Test camera unavailable','NotAllowedError');
  };
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia}});
 });
 const [arrival,departure]=await times.locator('strong').allTextContents();
 for(const [value,stamp] of [[arrival,shift.in_at],[departure,shift.out_at]]){
  if(stamp==null)expect(value).toMatch(/^[—–-]+:[—–-]+$/);
  else expect(value).toBe(hm(stamp));
 }
 await expect(page.locator('.dashboard-shortcuts')).toBeVisible();await expect(page.locator('.dashboard-notices')).toBeVisible();
 const capture=page.locator('#attendance-workspace'),assignment=capture.locator('#capture-assignment'),start=attendance.locator('[data-action="attendance-start"]');
 await expect(assignment).toHaveValue(shift.id);
 await expect(page.getByTestId('attendance-in')).toBeDisabled();await expect(page.getByTestId('attendance-out')).toBeDisabled();
 expect(await page.evaluate(()=>window.attendanceCameraRequests)).toBe(0);
 const attendancePosts=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/attendance/'))attendancePosts.push(r.url());});
 await start.click();await expect(capture).toBeFocused();await expect(capture).toBeInViewport();
 await expect.poll(()=>page.evaluate(()=>window.attendanceCameraRequests)).toBe(1);
 await assignment.selectOption('');await start.click();await expect(assignment).toBeFocused();
 expect(await page.evaluate(()=>window.attendanceCameraRequests)).toBe(1);
 await expect(page.getByTestId('attendance-in')).toBeDisabled();await expect(page.getByTestId('attendance-out')).toBeDisabled();expect(attendancePosts).toEqual([]);
 await expect(page.locator('.employee-tool-grid button')).toHaveCount(6);
 for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
 await page.setViewportSize({width:1440,height:900});await expect(welcome).toBeHidden();await expect(attendance).toBeHidden();await expect(capture).toBeVisible();
});

test('phone filters share one column and submit dates, calendar mode and audit source',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await login(page,'admin');
 const check=async form=>{
  await expect(form).toBeVisible();
  const problems=await form.evaluate(el=>{
   const controls=[...el.querySelectorAll(':scope > label > input:not([type=checkbox]), :scope > label > select, :scope > button.btn')];
   const s=getComputedStyle(el),rect=el.getBoundingClientRect(),left=rect.left+parseFloat(s.paddingLeft)+parseFloat(s.borderLeftWidth),right=rect.right-parseFloat(s.paddingRight)-parseFloat(s.borderRightWidth);
   const out=[];if(controls.length<2)out.push('missing controls');
   if(s.gridTemplateColumns.trim().split(/\s+/).length!==1)out.push('not single column');
   if(parseFloat(s.rowGap)!==12)out.push('inconsistent gap');
   let prev=null;for(const control of controls){const b=control.getBoundingClientRect();if(Math.abs(b.left-left)>1||Math.abs(b.right-right)>1||Math.abs(b.height-56)>1)out.push(control.name+' geometry');if(prev&&b.top-prev.bottom<11)out.push('overlap or gap');prev=b;}
   return out;
  });expect(problems).toEqual([]);
 };
 const form=page.locator('[data-form="overview-filter"]');for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});await check(form);}
 const day='2026-11-12',from='2026-11-01',to='2026-11-13';
 const response=async(path,values,action)=>{const wait=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname===path&&Object.entries(values).every(([k,v])=>u.searchParams.get(k)===v)});await action();expect((await wait).ok()).toBe(true);};
 await form.locator('[name=day]').fill(day);await response('/api/admin/overview',{day},()=>form.locator('[type=submit]').click());await expect(form.locator('[name=day]')).toHaveValue(day);
 await page.locator('[data-action="audit-open"]').click();const audit=page.locator('[data-form="audit-filter"]');await check(audit);await audit.locator('[name=source]').selectOption('auth');await audit.locator('[name=from]').fill(from);await audit.locator('[name=to]').fill(to);
 await response('/api/admin/audit-log',{source:'auth',from,to},()=>audit.locator('[type=submit]').click());await expect(audit.locator('[name=source]')).toHaveValue('auth');await expect(audit.locator('[name=to]')).toHaveValue(to);await page.locator('dialog[open] [data-action="close-modal"]').last().click();
 await open(page,'schedule');const calendar=page.locator('[data-form="calendar-filter"]');await check(calendar);await calendar.locator('[name=day]').fill(day);await calendar.locator('[name=mode]').selectOption('month');await response('/api/assignments',{from:'2026-11-01',to:'2026-11-30'},()=>calendar.locator('[type=submit]').click());await expect(page.getByRole('heading',{name:'Lịch tháng',exact:true})).toBeVisible();await expect(page.locator('.calendar-day')).toHaveCount(30);await page.locator('dialog[open] [data-action="close-modal"]').last().click();
 for(const [view,path] of [['schedule','/api/assignments'],['history','/api/attendance/history'],['handover','/api/handover'],['reports','/api/reports'],['requests','/api/workforce'],['alerts','/api/alerts']]){
  if(view!=='schedule')await open(page,view);const range=page.locator('[data-form="filter"]');await check(range);
  await range.locator('[name=from]').fill(from);await range.locator('[name=to]').fill(to);await response(path,{from,to},()=>range.locator('[type=submit]').click());await expect(range.locator('[name=from]')).toHaveValue(from);await expect(range.locator('[name=to]')).toHaveValue(to);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await open(page,'payroll');await check(page.locator('[data-form="payroll-filter"]'));
 await page.setViewportSize({width:844,height:390});await check(page.locator('[data-form="payroll-filter"]'));
});

test('rounded controls and floating audit modal preserve accepted filters; pull refresh reads once and ignores dirty form',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await login(page,'admin');
 const form=page.locator('[data-form="overview-filter"]'),button=form.locator('button[type=submit]');
 await expect(button).toHaveCSS('border-top-left-radius','16px');await expect(button).toHaveCSS('height','56px');
 await page.locator('[data-action="audit-open"]').click();const dialog=page.locator('#modal');await expect(dialog).toBeVisible();await expect(dialog).toHaveCSS('border-top-left-radius','26px');await expect(dialog.locator('[data-form="audit-filter"] button')).toHaveCSS('height','56px');await dialog.locator('[data-action="close-modal"]').last().click();
 const gesture=async(dy)=>page.evaluate(distance=>{
  const target=document.querySelector('.page-head h1');
  const fire=(name,touches)=>{const e=new Event(name,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:touches});target.dispatchEvent(e);};
  fire('touchstart',[{clientX:100,clientY:60}]);fire('touchmove',[{clientX:100,clientY:60+distance}]);fire('touchend',[]);
 },dy);
 let reads=0,writes=0;page.on('request',r=>{if(r.url().includes('/api/admin/overview?'))reads++;if(r.method()==='POST')writes++;});
 await page.evaluate(()=>window.scrollTo(0,0));await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
 const day=form.locator('[name=day]');const original=await day.inputValue();await day.fill(original==='2026-11-01'?'2026-11-02':'2026-11-01');
 await gesture(150);await expect(page.locator('#pull-refresh')).toBeHidden();expect(reads).toBe(0);await expect(day).not.toHaveValue(original);
 await day.fill(original);await day.blur();
 await gesture(25);await expect(page.locator('#pull-refresh')).toBeHidden();expect(reads).toBe(0);
 let release;const pending=new Promise(resolve=>release=resolve);await page.route('**/api/admin/overview?*',async route=>{await pending;await route.continue();});
 try{await gesture(150);await expect(page.locator('#pull-refresh')).toBeVisible();await expect(page.locator('#pull-refresh')).toHaveAttribute('data-state','refreshing');await expect(page.locator('#pull-refresh strong')).toHaveText('Thấu hiểu điều mẹ muốn');const overlay=await page.locator('#pull-refresh').evaluate(el=>{const b=el.getBoundingClientRect(),logo=el.querySelector('.pull-refresh-logo').getBoundingClientRect(),brand=el.querySelector('.pull-refresh-brand').getBoundingClientRect(),s=getComputedStyle(el);return {full:Math.abs(b.width-innerWidth)<=1&&Math.abs(b.height-innerHeight)<=1,center:Math.abs(brand.x+brand.width/2-innerWidth/2)<=2&&Math.abs(brand.y+brand.height/2-innerHeight/2)<=2,logo:logo.width,blur:s.backdropFilter||s.webkitBackdropFilter};});expect(overlay.full).toBe(true);expect(overlay.center).toBe(true);expect(overlay.logo).toBeGreaterThanOrEqual(132);expect(overlay.blur).toContain('blur(18px)');await gesture(150);await expect.poll(()=>reads).toBe(1);}finally{release();}
 await expect(page.locator('#pull-refresh')).toBeHidden();await expect(page.locator('#pull-refresh-status')).toHaveText('Đã làm mới dữ liệu.');expect(writes).toBe(0);await expect(form.locator('[name=day]')).toHaveValue(original);
});

test('shared icon scale and compact labels reach all roles and tables without losing filter or touch geometry',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:844});
 await login(page,'admin');
 const filter=page.locator('[data-form="overview-filter"]');
 await expect(filter.locator('[name=day]')).toHaveCSS('font-size','16px');
 await expect(filter.locator('button[type=submit]')).toHaveCSS('height','56px');
 await expect(filter.locator('button[type=submit]')).toHaveCSS('font-size','13px');
 await expect(page.locator('.overview-command .quick-actions .btn .icon').first()).toHaveCSS('width','42px');
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 for(const view of ['schedule','history','handover','reports','requests','alerts','payroll','admin']){
  await open(page,view);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const cells=page.locator('.table-wrap .responsive-table td[data-label]');
  if(await cells.count())await expect(cells.first()).toHaveCSS('font-size','13px');
 }
});

test('scroll text reveals slowly from both sides and respects reduced motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:390,height:844});await login(page,'admin');
 const left=page.locator('#content [data-motion-side="left"]').first(),right=page.locator('#content [data-motion-side="right"]').last();
 await left.scrollIntoViewIfNeeded();await expect(left).toHaveClass(/motion-revealed/);await expect(left).toHaveCSS('animation-duration','0.85s');await expect(left).toHaveCSS('animation-name','bm-reveal-left');
 await right.scrollIntoViewIfNeeded();await expect(right).toHaveClass(/motion-revealed/);await expect(right).toHaveCSS('animation-duration','0.85s');await expect(right).toHaveCSS('animation-name','bm-reveal-right');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(left).toHaveCSS('animation-name','none');await expect(right).toHaveCSS('animation-name','none');
});

test('keyboard focus remains visible on compact controls and screen reader labels remain present',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await login(page,'admin');
 const button=page.locator('[data-form="overview-filter"] button[type=submit]');
 await page.keyboard.press('Tab');await button.focus();
 await expect(button).toBeFocused();await expect(button).toHaveCSS('outline-style','solid');await expect(button).toHaveCSS('outline-width','3px');
 await expect(button).toHaveAccessibleName(/.+/);
 expect(await button.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
 await page.locator('[data-action="audit-open"]').click();
 const dialog=page.getByRole('dialog');await expect(dialog).toHaveAccessibleName(/Nhật ký/);await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});
