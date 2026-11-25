import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:8788',secret='1'.repeat(48),auth=token=>({Authorization:'Bearer '+token});
const day=t=>new Date(t+7*3600000).toISOString().slice(0,10);
async function token(request,role){const r=await request.post('/api/auth/login',{data:{username:'test-'+role,secret}});expect(r.status()).toBe(200);return (await r.json()).token;}
async function login(page,username='test-staff',password=secret){await page.goto(origin);await page.getByLabel('Tên đăng nhập',{exact:true}).fill(username);await page.getByLabel('Mật khẩu hoặc mã truy cập',{exact:true}).fill(password);await page.getByTestId('login-submit').click();await expect(page.locator('#content')).toBeVisible();await expect(page.locator('#content .loading')).toHaveCount(0);}
async function employee(request,admin){const suffix=crypto.randomUUID().slice(0,8),r=await request.post('/api/auth/create',{headers:auth(admin),data:{username:'ux-'+suffix,employee_code:'UX-'+suffix,full_name:'Nhân viên UX '+suffix,department:'Kiểm thử',role:'staff'}});expect(r.status()).toBe(201);return {...await r.json(),full_name:'Nhân viên UX '+suffix};}
async function assign(request,admin,user,branch,date){const r=await request.post('/api/admin/assignments',{headers:auth(admin),data:{user_id:user,branch_id:branch,shift_id:'test-day',work_date:date}});expect(r.status()).toBe(201);return (await r.json()).id;}

test('future leave stays visible and scoped manager approves only another worker at the assigned store',async({page,request,browser})=>{
 await page.setViewportSize({width:390,height:844});const admin=await token(request,'admin'),person=await employee(request,admin),from=day(Date.now()+2*86400000),to=day(Date.now()+3*86400000);
 const inside=await assign(request,admin,person.id,'BM-001',from),outside=await assign(request,admin,person.id,'BM-002',to);
 await login(page,person.username,person.secret);await page.locator('#main-nav [data-view="requests"]').click();
 await page.getByRole('button',{name:'Tạo yêu cầu',exact:true}).click();await expect(page.locator('[data-form="request-create"] select[name="assignment_id"] option[value="'+inside+'"]')).toHaveCount(1);await page.getByRole('button',{name:'Hủy',exact:true}).click();
 await page.getByRole('button',{name:'Xin nghỉ nhiều ngày',exact:true}).click();const form=page.locator('[data-form="leave-range"]');await form.locator('[name="from"]').fill(from);await form.locator('[name="to"]').fill(to);const reason='Đơn nghỉ tương lai '+person.id;await form.locator('[name="reason"]').fill(reason);await form.locator('[type="submit"]').click();
 await expect(page.locator('.request-table tbody tr').filter({hasText:reason})).toHaveCount(2);expect((await page.locator('[data-form="filter"] [name="to"]').inputValue())>=to).toBe(true);
 await page.getByRole('button',{name:'Tạo yêu cầu',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('#notice')).toContainText('đã có đơn chờ duyệt');
 const manager=await token(request,'manager'),ownUser=(await (await request.get('/api/auth/me',{headers:auth(manager)})).json()).user.id,ownDay=day(Date.now()+4*86400000),own=await assign(request,admin,ownUser,'BM-002',ownDay);
 expect((await request.post('/api/workforce',{headers:auth(manager),data:{assignment_id:own,kind:'LEAVE',reason:'Đơn riêng quản lý UX'}})).status()).toBe(201);
 const context=await browser.newContext({viewport:{width:390,height:844}}),review=await context.newPage();try{
  await login(review,'test-manager');await review.locator('#main-nav [data-view="requests"]').click();await review.getByRole('button',{name:/Cần tôi duyệt/}).click();
  const row=review.locator('.request-table tbody tr').filter({hasText:reason});await expect(row).toHaveCount(1);await expect(review.locator('#request-results')).not.toContainText('Đơn riêng quản lý UX');
  await row.getByRole('button',{name:'Xem xét',exact:true}).click();await expect(review.getByRole('dialog')).toContainText(person.full_name);await review.getByLabel('Ghi chú quyết định',{exact:true}).fill('Đã đối soát lịch và phê duyệt');await review.getByRole('button',{name:'Lưu quyết định',exact:true}).click();await expect(review.locator('#notice')).toContainText('Đã lưu quyết định');
  const all=await (await request.get('/api/workforce?from='+from+'&to='+ownDay,{headers:auth(admin)})).json();const chosen=all.requests.find(r=>r.assignment_id===inside),other=all.requests.find(r=>r.assignment_id===outside),self=all.requests.find(r=>r.assignment_id===own);
  expect(chosen.state).toBe('APPROVED');expect(other.state).toBe('PENDING');expect(self.state).toBe('PENDING');
  for(const r of [other,self])expect((await request.post('/api/workforce',{headers:auth(manager),data:{action:'decide',id:r.id,state:'APPROVED',decision_note:'Thử vượt phạm vi'}})).status()).toBe(403);
  expect((await request.get('/api/admin/payroll',{headers:auth(manager)})).status()).toBe(403);
 }finally{await context.close();}
});

test('extra attendance review shows the worker, store and reason and requires a rejection note',async({page,request})=>{
 const admin=await token(request,'admin'),person=await employee(request,admin),signIn=await request.post('/api/auth/login',{data:{username:person.username,secret:person.secret}}),worker=(await signIn.json()).token,reason='Ca thay UX '+crypto.randomUUID().slice(0,8);
 const now=Date.now(),start=now-1800000,end=now+5400000,clock=t=>new Date(t+7*3600000).toISOString().slice(11,16),shift=await request.post('/api/admin/shifts',{headers:auth(admin),data:{name:'Ca thay UX '+person.id,start_time:clock(start),end_time:clock(end),grace_period:5}});expect(shift.status()).toBe(201);
 const created=await request.post('/api/extra-attendance',{headers:auth(worker),data:{action:'create',branch_id:'BM-001',shift_id:(await shift.json()).id,work_date:day(start),kind:'COVER',replaced_name:'Người được thay thử nghiệm',reason}});expect(created.status()).toBe(201);const id=(await created.json()).assignment_id;
 await page.setViewportSize({width:390,height:844});await login(page,'test-admin');await page.locator('#main-nav [data-view="requests"]').click();await page.getByRole('button',{name:'Ca bổ sung / thay ca',exact:true}).click();await page.locator('.assignment-card').filter({hasText:reason}).getByRole('button',{name:'Xem xét',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText(person.full_name);await expect(dialog).toContainText(reason);await expect(dialog).toContainText('BABYMARK');
 await dialog.getByRole('combobox',{name:'Quyết định',exact:true}).selectOption('REJECTED');await expect(dialog.locator('[name="note"]')).toHaveAttribute('required','');let posts=0;page.on('request',r=>{if(r.url().includes('/api/extra-attendance')&&r.method()==='POST')posts++;});
 await dialog.getByRole('button',{name:'Lưu quyết định',exact:true}).click();expect(posts).toBe(0);await dialog.locator('[name="note"]').fill('Không đủ thông tin ca thay, cần xác minh');await dialog.getByRole('button',{name:'Lưu quyết định',exact:true}).click();await expect(dialog).toBeHidden();expect(posts).toBe(1);
 const data=await (await request.get('/api/extra-attendance',{headers:auth(admin)})).json();expect(data.rows.find(r=>r.assignment_id===id).state).toBe('REJECTED');
});

test('attendance enables the next valid action and stops GPS/camera controls during processing',async({page,request})=>{
 const admin=await token(request,'admin'),person=await employee(request,admin),now=Date.now(),hm=t=>new Date(t+7*3600000).toISOString().slice(11,16),start=now-3600000,end=now+3600000;
 const shift=await request.post('/api/admin/shifts',{headers:auth(admin),data:{name:'Ca UX '+person.id,start_time:hm(start),end_time:hm(end),grace_period:5}});expect(shift.status()).toBe(201);
 const a=await request.post('/api/admin/assignments',{headers:auth(admin),data:{user_id:person.id,branch_id:'BM-001',shift_id:(await shift.json()).id,work_date:day(start)}});expect(a.status()).toBe(201);
 await page.setViewportSize({width:390,height:844});await login(page,person.username,person.secret);await expect(page.getByTestId('attendance-in')).toBeDisabled();await expect(page.getByTestId('attendance-out')).toBeDisabled();await expect(page.locator('#capture-guidance')).toContainText('Bật camera');
 await page.getByRole('button',{name:'Bật camera',exact:true}).click();await expect(page.getByTestId('attendance-in')).toBeEnabled();await expect(page.getByTestId('attendance-out')).toBeDisabled();await page.getByTestId('attendance-in').click();await expect(page.getByRole('heading',{name:'Xác nhận ảnh chấm công',exact:true})).toBeVisible();await page.getByRole('button',{name:'Xác nhận chấm công',exact:true}).click();await expect(page.getByRole('heading',{name:'Đã ghi nhận vào ca',exact:true})).toBeVisible();await page.getByRole('button',{name:'Hoàn tất',exact:true}).click();
 await page.getByRole('button',{name:'Bật camera',exact:true}).click();await expect(page.getByTestId('attendance-in')).toBeDisabled();await expect(page.getByTestId('attendance-out')).toBeEnabled();await expect(page.locator('#capture-guidance')).toContainText('tan ca');
 await page.getByRole('button',{name:'Tắt camera',exact:true}).click();await expect(page.getByTestId('attendance-out')).toBeDisabled();
 await page.locator('#main-nav [data-view="requests"]').click();await page.getByRole('button',{name:'Tạo yêu cầu',exact:true}).click();const correction=page.locator('[data-form="request-create"]');await correction.locator('[name="assignment_id"]').selectOption({index:1});await expect(correction.locator('#request-kind')).toHaveValue('CORRECTION');await expect(correction.locator('#request-kind option[value="LEAVE"]')).toBeDisabled();await expect(correction.locator('[name="proposed_in"]')).toHaveValue(/^\d{4}-\d{2}-\d{2}T/);await expect(correction.locator('[name="proposed_out"]')).toHaveValue('');await page.getByRole('button',{name:'Hủy',exact:true}).click();
});

test('pending request submission stays open and duplicate submit events write only once',async({page,request})=>{
 const admin=await token(request,'admin'),person=await employee(request,admin),date=day(Date.now()+5*86400000);await assign(request,admin,person.id,'BM-001',date);
 await login(page,person.username,person.secret);await page.getByRole('button',{name:'Yêu cầu công',exact:true}).click();await page.getByRole('button',{name:'Tạo yêu cầu',exact:true}).click();const form=page.locator('[data-form="request-create"]');await form.locator('[name="assignment_id"]').selectOption({index:1});const reason='Gửi một lần UX '+person.id;await form.locator('[name="reason"]').fill(reason);
 let count=0,release;const gate=new Promise(resolve=>release=resolve);await page.route('**/api/workforce',async route=>{if(route.request().method()==='POST'){count++;await gate;}await route.continue();});
 try{await form.locator('[type="submit"]').click();await expect.poll(()=>count).toBe(1);await form.evaluate(el=>el.requestSubmit());await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('button',{name:'Đóng',exact:true})).toBeDisabled();expect(count).toBe(1);}finally{release();}
 await expect(page.getByRole('dialog')).toBeHidden();await expect(page.locator('.request-table tbody tr').filter({hasText:reason})).toHaveCount(1);expect(count).toBe(1);
});
