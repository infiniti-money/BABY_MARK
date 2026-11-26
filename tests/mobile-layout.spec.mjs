import {test,expect} from '@playwright/test';
async function login(page){
 await page.goto('/');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test-staff');await page.getByLabel('Mật khẩu hoặc mã truy cập',{exact:true}).fill('1'.repeat(48));await page.getByTestId('login-submit').click();
 await expect(page.getByRole('heading',{name:'Chấm công hôm nay',exact:true})).toBeVisible();await expect(page.locator('#content .loading')).toHaveCount(0);
}
test('portrait, landscape and reduced height keep profile close control reachable',async({page},testInfo)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await login(page);await page.getByRole('button',{name:'Tiện ích',exact:true}).click();await page.locator('#navigation-menu').getByRole('button',{name:'Hồ sơ của tôi',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:390,height:360}]){
  await page.setViewportSize(viewport);const button=page.getByRole('button',{name:'Đóng',exact:true});await expect(button).toBeVisible();
  const box=await button.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.setViewportSize({width:390,height:844});const path=testInfo.outputPath('profile-mobile.png');await page.screenshot({path});await testInfo.attach('Profile mobile',{path,contentType:'image/png'});
});
test('long message text fits mobile viewport and composer remains reachable',async({page},testInfo)=>{
 const peer='Tên'.repeat(35),body='X'.repeat(2000);
 await page.route('**/api/messages*',async route=>{
  if(route.request().method()==='POST')return route.fulfill({json:{ok:true}});
  const u=new URL(route.request().url());
  return route.fulfill({json:u.searchParams.has('thread')?{available:true,thread:{id:'mobile-test',kind:'DIRECT'},members:[{id:'peer',full_name:peer}],messages:[{id:1,sender_id:'peer',sender_name:peer,body,created_at:Date.now()}],more:false}:{available:true,threads:[{id:'mobile-test',kind:'DIRECT',peer_name:peer,latest_body:body.slice(0,100)}],contacts:[]}});
 });
 await login(page);await page.getByRole('button',{name:'Tin nhắn nội bộ',exact:true}).click();await page.locator('#chat-threads [data-action="chat-open"]').click();await expect(page.locator('#chat-stream')).toContainText(body);
 for(const viewport of [{width:320,height:640},{width:390,height:360},{width:844,height:390}]){
  await page.setViewportSize(viewport);const input=page.locator('[data-form="chat-send"] textarea');await input.fill('Tin nhắn nháp');await input.scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const box=await input.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
  expect(await page.locator('.chat-room .card-head h2').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=el.closest('.card').getBoundingClientRect().right)).toBe(true);
 }
 await page.setViewportSize({width:390,height:844});const path=testInfo.outputPath('chat-mobile.png');await page.screenshot({path,fullPage:true});await testInfo.attach('Chat mobile',{path,contentType:'image/png'});
});

test('mobile report cells and wrapped labels never overlap; native desktop table stays intact',async({page},testInfo)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const longName='Nguyễn Thị '+('Tên nhân viên rất dài '.repeat(6)),longCode='CODE'+('X'.repeat(100));
 const rows=[0,1].map(i=>({id:'mobile-row-'+i,user_id:'u'+i,employee_code:longCode,full_name:longName,work_date:'2026-11-01',branch_id:'BM-001',branch_name:'Cửa hàng '+('Địa chỉ rất dài '.repeat(8)),branch_code:'BM-001',shift_name:'Ca kiểm thử '+('dài '.repeat(20)),starts_at:1,ends_at:2,in_id:'photo-'+i,in_distance_m:12,in_accuracy_m:5,summary:{minutes:480,work_units:1,status:'Đủ công'}}));
 await page.route('**/api/reports?*',async route=>{
  const u=new URL(route.request().url()),common={from:u.searchParams.get('from'),to:u.searchParams.get('to'),branches:[],summary:{assignments:2,shifts:2,work_units:2,minutes:960,late:0,leaveDays:0}};
  return route.fulfill({json:u.searchParams.get('view')==='summary'?common:{...common,rows,next:null}});
 });
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test-admin');await page.getByLabel('Mật khẩu hoặc mã truy cập',{exact:true}).fill('1'.repeat(48));await page.getByTestId('login-submit').click();
 await expect(page.getByRole('heading',{name:'Tổng quan quản trị',exact:true})).toBeVisible();await expect(page.locator('#content .loading')).toHaveCount(0);
 const nav=page.locator('#main-nav [data-view="reports"]');if(await nav.isVisible())await nav.click();else{await page.locator('[data-action="mobile-menu"]').click();await page.locator('#navigation-menu [data-view="reports"]').click();}
 const table=page.locator('#report-page .responsive-table');await expect(table.locator('tbody tr')).toHaveCount(2);
 // Simulate a translated/large-font label that previously overflowed its short cell.
 await table.locator('tbody tr').first().locator('td').nth(2).evaluate(el=>{el.dataset.label='Thông tin chi tiết về ca làm việc và phân công nhân viên '.repeat(4);});
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:844});
  const issues=await table.evaluate(el=>{
   const problems=[],wrap=el.closest('.table-wrap').getBoundingClientRect();
   for(const row of el.tBodies[0].rows){
    const cells=[...row.cells];
    for(let i=0;i<cells.length;i++){
     const cell=cells[i],b=cell.getBoundingClientRect(),label=getComputedStyle(cell,'::before');
     if(label.position!=='static'||label.display==='none')problems.push('label out of flow '+i);
     if(b.left<wrap.left-1||b.right>wrap.right+1||cell.scrollWidth>cell.clientWidth+1)problems.push('horizontal overflow '+i);
     if(i+1<cells.length&&b.bottom>cells[i+1].getBoundingClientRect().top+1)problems.push('cell overlap '+i);
     const range=document.createRange();range.selectNodeContents(cell);for(const rect of range.getClientRects())if(rect.right>b.right+1||rect.bottom>b.bottom+1||rect.top<b.top-1)problems.push('content outside '+i);
     for(const btn of cell.querySelectorAll('button')){const rect=btn.getBoundingClientRect();if(rect.height<44||rect.right>b.right+1)problems.push('button overflow '+i);}
    }
   }
   return problems;
  });
  expect(issues).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.setViewportSize({width:844,height:390});
 expect(await table.evaluate(el=>getComputedStyle(el).display)).toBe('table');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.setViewportSize({width:1440,height:900});expect(await table.evaluate(el=>getComputedStyle(el).display)).toBe('table');
 await page.setViewportSize({width:390,height:844});const path=testInfo.outputPath('report-mobile-no-overlap.png');await page.screenshot({path,fullPage:true});await testInfo.attach('Report mobile no overlap',{path,contentType:'image/png'});
});

test('overview date stays inside its filter column on compact Safari layouts',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test-admin');
 await page.getByLabel('Mật khẩu hoặc mã truy cập',{exact:true}).fill('1'.repeat(48));
 await page.getByTestId('login-submit').click();
 const form=page.locator('.overview-filter');
 await expect(form).toBeVisible();
 for(const width of [320,375,390,430,590,768]){
  await page.setViewportSize({width,height:844});
  const bounds=await form.evaluate(form=>{
   const date=form.querySelector('input[type="date"]').getBoundingClientRect();
   const store=form.querySelector('select[name="branch"]').getBoundingClientRect();
   const parent=form.getBoundingClientRect();
   const label=form.querySelector('input[type="date"]').parentElement.getBoundingClientRect();
   return {inside:date.left>=parent.left&&date.right<=parent.right+1&&date.right<=label.right+1,
    separated:date.bottom<=store.top+1||date.right<=store.left+1};
  });
  expect(bounds).toEqual({inside:true,separated:true});
 }
 const date=form.locator('[name="day"]');
 await date.fill('2026-11-25');
 await form.getByRole('button',{name:'Xem tổng quan',exact:true}).click();
 await expect(page.locator('.overview-filter [name="day"]')).toHaveValue('2026-11-25');
});
