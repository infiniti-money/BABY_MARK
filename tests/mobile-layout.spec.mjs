import {test,expect} from '@playwright/test';
async function login(page){
 await page.goto('/');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test-staff');await page.getByLabel('Mật khẩu hoặc mã truy cập',{exact:true}).fill('1'.repeat(48));await page.getByTestId('login-submit').click();
 await expect(page.getByRole('heading',{name:'Chấm công hôm nay',exact:true})).toBeVisible();await expect(page.locator('#content .loading')).toHaveCount(0);
}
test('portrait, landscape and reduced height keep profile close control reachable',async({page},testInfo)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await login(page);await page.getByRole('button',{name:'Thêm',exact:true}).click();await page.getByRole('button',{name:'Hồ sơ của tôi',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
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
