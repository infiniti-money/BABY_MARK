import {test,expect} from '@playwright/test';

// Generated, disposable local fixtures only. No production credentials or resources.
const secret='1'.repeat(48);
const username={admin:'test-admin',staff:'test-staff',manager:'test-manager',other:'test-other'};
const dayVN=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
const tomorrow=()=>dayVN(Date.now()+86400000);

async function login(page,role='admin') {
  await page.goto('/');
  await page.getByLabel('Tên đăng nhập',{exact:true}).fill(username[role]);
  await page.getByLabel('Mật khẩu hoặc mã truy cập',{exact:true}).fill(secret);
  await page.getByTestId('login-submit').click();
  await expect(page.getByRole('heading',{name:role==='admin'?'Tổng quan quản trị':'Chấm công hôm nay',exact:true})).toBeVisible();
  await expect(page.locator('#content .loading')).toHaveCount(0);
}
async function apiToken(request,role) {
  const response=await request.post('/api/auth/login',{data:{username:username[role],secret}});
  expect(response.ok()).toBeTruthy();
  return (await response.json()).token;
}
async function loginAccount(page,name,accessSecret) {
  await page.goto('/');
  await page.getByLabel('Tên đăng nhập',{exact:true}).fill(name);
  await page.getByLabel('Mật khẩu hoặc mã truy cập',{exact:true}).fill(accessSecret);
  await page.getByTestId('login-submit').click();
  await expect(page.getByRole('heading',{name:'Chấm công hôm nay',exact:true})).toBeVisible();
  await expect(page.locator('#content .loading')).toHaveCount(0);
}
async function disposableAccount(request,adminToken,prefix) {
  const suffix=Date.now().toString(36).slice(-6),name=prefix+'-'+suffix;
  const response=await request.post('/api/auth/create',{headers:auth(adminToken),data:{username:name,employee_code:name.toUpperCase(),full_name:'Nhân viên '+name,role:'staff',department:'Kiểm thử cục bộ'}});
  expect(response.status()).toBe(201);
  return {...await response.json(),employee_code:name.toUpperCase()};
}
const auth=token=>({Authorization:`Bearer ${token}`});
async function screenshot(page,testInfo,name) {
  const path=testInfo.outputPath(name+'.png');
  await page.screenshot({path,fullPage:true});
  await testInfo.attach(name,{path,contentType:'image/png'});
}
function errorsOn(page) {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  return errors;
}

test.describe.serial('Cloudflare local frontend and actual D1/KV endpoints',()=>{
  test('administrator creates account, configures store GPS, shift and overnight assignment',async({page,request},testInfo)=>{
    const suffix=Date.now().toString(36).slice(-6),newCode='TEST-NEW-'+suffix,newUsername='test-new-'+suffix,shiftName='Ca kiểm thử qua đêm '+suffix;
    const errors=errorsOn(page);
    await login(page);
    await page.getByRole('button',{name:'Quản trị',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Nhân viên',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Cấp tài khoản',exact:true}).click();
    await page.getByLabel('Mã nhân viên',{exact:true}).fill(newCode);
    await page.getByLabel('Họ và tên',{exact:true}).fill('Nhân viên kiểm thử mới');
    await page.getByLabel('Tên đăng nhập',{exact:true}).fill(newUsername);
    await expect(page.locator('#employee-departments option[value="Kho"]')).toHaveCount(1);
    await expect(page.locator('#employee-departments option[value="Lái xe"]')).toHaveCount(1);
    await expect(page.locator('#employee-departments option[value="Kế toán"]')).toHaveCount(1);
    await page.getByLabel('Bộ phận',{exact:true}).fill('Kho');
    await page.getByRole('button',{name:'Tạo và cấp mã truy cập',exact:true}).click();
    const issued=page.getByTestId('issued-secret');
    await expect(issued).toHaveText(/^[0-9a-f]{48}$/);
    const issuedSecret=await issued.textContent();
    const createdLogin=await request.post('/api/auth/login',{data:{username:newUsername,secret:issuedSecret}});
    expect(createdLogin.status()).toBe(200);
    await page.getByRole('button',{name:'Đã lưu mã an toàn',exact:true}).click();
    await expect(page.getByRole('row').filter({hasText:'Nhân viên kiểm thử mới'})).toBeVisible();

    await page.getByRole('tab',{name:'Cửa hàng',exact:true}).click();
    const store=page.getByRole('row').filter({hasText:'BABYMARK LUXURY LIÊN NGHĨA'});
    await store.getByRole('button',{name:'Sửa',exact:true}).click();
    await page.getByLabel('Tọa độ hoặc liên kết Google Maps',{exact:true}).fill('https://www.google.com/maps/search/?api=1&query=20%2C106');
    await page.getByRole('button',{name:'Điền tọa độ',exact:true}).click();
    await expect(page.getByLabel('Vĩ độ',{exact:true})).toHaveValue('20');
    await expect(page.getByLabel('Kinh độ',{exact:true})).toHaveValue('106');
    await page.getByLabel('Bán kính chấm công (20–1000 m)',{exact:true}).fill('100');
    await page.getByLabel('Địa chỉ',{exact:true}).fill('Địa chỉ tổng hợp cho kiểm thử cục bộ');
    await page.getByRole('button',{name:'Lưu thông tin',exact:true}).click();
    await expect(store).toContainText('20.000000, 106.000000');

    await page.getByRole('tab',{name:'Ca làm',exact:true}).click();
    await page.getByRole('button',{name:'Thêm mới',exact:true}).click();
    await page.getByLabel('Tên ca làm',{exact:true}).fill(shiftName);
    await page.getByLabel('Giờ bắt đầu',{exact:true}).fill('22:00');
    await page.getByLabel('Giờ kết thúc',{exact:true}).fill('06:00');
    await page.getByRole('button',{name:'Lưu thông tin',exact:true}).click();
    await expect(page.getByRole('row').filter({hasText:shiftName})).toContainText('Kết thúc ngày kế tiếp');

    await page.getByRole('tab',{name:'Phân ca',exact:true}).click();
    await page.getByRole('button',{name:'Thêm mới',exact:true}).click();
    const assignmentDialog=page.getByRole('dialog',{name:'Thêm lịch phân công',exact:true});
    await expect(assignmentDialog).toBeVisible();
    await assignmentDialog.getByRole('combobox',{name:'Nhân viên',exact:true}).selectOption({label:'Nhân viên kiểm thử mới · '+newCode});
    await assignmentDialog.getByRole('combobox',{name:'Cửa hàng',exact:true}).selectOption('BM-001');
    await assignmentDialog.getByRole('combobox',{name:'Ca làm',exact:true}).selectOption({label:shiftName});
    await page.getByLabel('Ngày bắt đầu ca (Việt Nam)',{exact:true}).fill(tomorrow());
    await page.getByRole('button',{name:'Lưu thông tin',exact:true}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const adminToken=await apiToken(request,'admin');
    const assigned=await request.get(`/api/admin/assignments?from=${tomorrow()}&to=${tomorrow()}`,{headers:auth(adminToken)});
    expect(assigned.status()).toBe(200);
    const created=(await assigned.json()).assignments.find(a=>a.employee_code===newCode);
    expect(created).toBeTruthy();
    expect(created.ends_at-created.starts_at).toBe(8*3600000);
    await screenshot(page,testInfo,'desktop-admin');
    expect(errors).toEqual([]);
  });

  test('staff captures IN and OUT, reads protected JPEG, and cannot see admin controls',async({page,request},testInfo)=>{
    const errors=errorsOn(page);
    await login(page,'staff');
    await expect(page.getByRole('button',{name:'Quản trị',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Báo cáo',exact:true})).toHaveCount(0);
    await expect(page.getByText('Ảnh Timemark được ghép trên thiết bị từ thông tin máy chủ.',{exact:false})).toBeVisible();
    const option=page.locator('#capture-assignment option').nth(1);
    const assignmentId=await option.getAttribute('value');expect(assignmentId).toBeTruthy();
    await page.locator('#capture-assignment').selectOption(assignmentId);
    for(const [type,title] of [['in','Đã ghi nhận vào ca'],['out','Đã ghi nhận tan ca']]){
      await page.getByRole('button',{name:'Bật camera',exact:true}).click();
      await expect.poll(()=>page.locator('#camera').evaluate(v=>v.videoWidth>0&&v.readyState>=2)).toBeTruthy();
      let submitted=0;const countSubmit=r=>{if(r.url().includes('/api/attendance/submit')&&r.method()==='POST')submitted++;};page.on('request',countSubmit);
      await page.getByTestId(`attendance-${type}`).click();
      await expect(page.getByRole('heading',{name:'Xác nhận ảnh chấm công',exact:true})).toBeVisible({timeout:30000});
      expect(submitted).toBe(0);
      if(type==='in'){await page.getByRole('button',{name:'Chụp lại',exact:true}).click();expect(submitted).toBe(0);await expect.poll(()=>page.locator('#camera').evaluate(v=>v.videoWidth>0&&v.readyState>=2)).toBeTruthy();await page.getByTestId('attendance-in').click();await expect(page.getByRole('heading',{name:'Xác nhận ảnh chấm công',exact:true})).toBeVisible({timeout:30000});expect(submitted).toBe(0);}
      await page.getByRole('button',{name:'Xác nhận chấm công',exact:true}).click();
      await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible({timeout:30000});
      expect(submitted).toBe(1);page.off('request',countSubmit);
      const preview=page.getByRole('img',{name:'Ảnh Timemark vừa ghi nhận',exact:true});
      await expect.poll(()=>preview.evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();
      await expect(page.getByRole('dialog')).toContainText('/ 200 KB');
      if(type==='in')await screenshot(page,testInfo,'timemark-capture');
      await page.getByRole('button',{name:'Hoàn tất',exact:true}).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await page.locator('#capture-assignment').selectOption(assignmentId);
    }
    await page.getByRole('button',{name:'Lịch sử',exact:true}).click();
    await expect(page.getByRole('button',{name:'Xem ảnh',exact:true})).toHaveCount(2);
    const photoResponse=page.waitForResponse(r=>r.url().includes('/api/cloudflare/photo/'));
    await page.getByRole('button',{name:'Xem ảnh',exact:true}).first().click();
    const response=await photoResponse;
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/jpeg');
    const bytes=await response.body();expect(bytes.length).toBeLessThanOrEqual(200000);
    expect([...bytes.subarray(0,2)]).toEqual([255,216]);
    const photo=page.getByRole('img',{name:'Ảnh Timemark chấm công',exact:true});
    await expect.poll(()=>photo.evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();
    const photoURL=response.url();
    const anonymous=await request.get(photoURL);expect(anonymous.status()).toBe(401);
    const otherToken=await apiToken(request,'other');
    const forbidden=await request.get(photoURL,{headers:auth(otherToken)});expect(forbidden.status()).toBe(404);
    await page.getByRole('button',{name:'Đóng',exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Chấm công',exact:true}).click();
    await expect(page.locator('#content .loading')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
    await screenshot(page,testInfo,'mobile-attendance');
    expect(errors).toEqual([]);
  });

  test('scoped manager sees reports and exports a real CSV while other staff is denied',async({page,request},testInfo)=>{
    const errors=errorsOn(page);
    await login(page,'manager');
    await page.getByRole('button',{name:'Báo cáo',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Bảng công theo ca',exact:true})).toBeVisible();
    const downloadEvent=page.waitForEvent('download');
    await page.getByRole('button',{name:'Xuất CSV',exact:true}).click();
    const download=await downloadEvent;
    expect(download.suggestedFilename()).toMatch(/BABY_MARK.*\.csv$/);
    const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
    const csv=Buffer.concat(chunks).toString('utf8');expect(csv).toContain('Nhân viên');
    const excelEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất Excel tổng chấm công',exact:true}).click();const excel=await excelEvent;expect(excel.suggestedFilename()).toMatch(/BABY_MARK_CHAM_CONG_TONG.*\.xlsx$/);const excelStream=await excel.createReadStream(),excelChunks=[];for await(const chunk of excelStream)excelChunks.push(chunk);const excelBytes=Buffer.concat(excelChunks);expect([...excelBytes.subarray(0,4)]).toEqual([80,75,3,4]);expect(excelBytes.toString('utf8')).toContain('Công từng ngày');
    const managerToken=await apiToken(request,'manager');
    const managerMe=await request.get('/api/auth/me',{headers:auth(managerToken)}),managerId=(await managerMe.json()).user.id;
    const scoped=await request.get(`/api/reports?from=${dayVN(Date.now()-86400000)}&to=${dayVN(Date.now())}`,{headers:auth(managerToken)});
    expect(scoped.status()).toBe(200);
    expect((await scoped.json()).rows.every(row=>row.branch_id==='BM-001'||row.user_id===managerId)).toBeTruthy();
    const staffToken=await apiToken(request,'other');
    const adminDenied=await request.get('/api/admin/employees',{headers:auth(staffToken)});expect(adminDenied.status()).toBe(403);
    await screenshot(page,testInfo,'manager-report');
    expect(errors).toEqual([]);
  });

  test('transparent overlay retains a clear center and browser JPEG is bounded',async({page})=>{
    await page.goto('/');
    const result=await page.evaluate(async()=>{
      const {makeTimemark}=await import('/timemark-layout.mjs');
      const {composeTimemark}=await import('/capture.mjs');
      const now=Date.now();
      const meta={serverTimestamp:now,shiftStart:now-3600000,shiftEnd:now+7*3600000,lat:20,lng:106,accuracy:5,distance:0,radius:100,type:'IN',branchName:'Cửa hàng kiểm thử',employeeName:'Nhân viên kiểm thử',employeeCode:'TEST',address:'Dữ liệu tổng hợp cục bộ',graceMinutes:0};
      const overlay=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(makeTimemark(meta));});
      const layer=document.createElement('canvas');layer.width=800;layer.height=1200;
      const ctx=layer.getContext('2d');ctx.drawImage(overlay,0,0);
      const centerAlpha=ctx.getImageData(400,500,1,1).data[3],panelAlpha=ctx.getImageData(25,850,1,1).data[3];
      const frame=document.createElement('canvas');frame.width=800;frame.height=1200;
      const image=frame.getContext('2d').createImageData(800,1200);let seed=1729;
      for(let i=0;i<image.data.length;i+=4){seed=(1664525*seed+1013904223)>>>0;image.data[i]=seed&255;image.data[i+1]=(seed>>>8)&255;image.data[i+2]=(seed>>>16)&255;image.data[i+3]=255;}
      frame.getContext('2d').putImageData(image,0,0);
      const photo=await composeTimemark(frame,meta);
      return {centerAlpha,panelAlpha,bytes:photo.size,type:photo.type};
    });
    expect(result.centerAlpha).toBe(0);
    expect(result.panelAlpha).toBeGreaterThanOrEqual(100);expect(result.panelAlpha).toBeLessThanOrEqual(104);
    expect(result.type).toBe('image/jpeg');expect(result.bytes).toBeLessThanOrEqual(200000);
  });

  test.describe('workforce and account controls without credential artifacts',()=>{
    // These tests read one-time codes. Disable screenshots/traces for this group
    // and never print generated codes, including in assertion error messages.

    test('staff submits leave and scoped manager approves without changing original attendance',async({page,request})=>{
      const errors=errorsOn(page),adminToken=await apiToken(request,'admin');
      const employee=await disposableAccount(request,adminToken,'test-leave');
      const workDate=tomorrow(),otherDate=dayVN(Date.now()+2*86400000);
      const assign=async(branch_id,work_date)=>{
        const response=await request.post('/api/admin/assignments',{headers:auth(adminToken),data:{user_id:employee.id,branch_id,shift_id:'test-day',work_date}});
        expect(response.status()).toBe(201);return response.json();
      };
      const assignment=await assign('BM-001',workDate),outsideAssignment=await assign('BM-002',otherDate);
      const historyURL=`/api/attendance/history?from=${dayVN(Date.now()-86400000)}&to=${otherDate}`;
      const originalStaffToken=await apiToken(request,'staff');
      const originalResponse=await request.get(historyURL,{headers:auth(originalStaffToken)});expect(originalResponse.status()).toBe(200);
      const originalRecords=(await originalResponse.json()).attendances;
      expect(originalRecords.length).toBeGreaterThanOrEqual(2);

      await loginAccount(page,employee.username,employee.secret);
      await page.getByRole('button',{name:'Yêu cầu công',exact:true}).click();
      await page.getByLabel('Từ ngày',{exact:true}).fill(workDate);
      await page.getByLabel('Đến ngày',{exact:true}).fill(otherDate);
      await page.getByRole('button',{name:'Xem dữ liệu',exact:true}).click();
      await page.getByRole('button',{name:'Tạo yêu cầu',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'Gửi yêu cầu công',exact:true});
      await dialog.getByRole('combobox',{name:'Ca làm',exact:true}).selectOption(assignment.id);
      const reason='Việc gia đình kiểm thử '+employee.employee_code;
      await dialog.getByLabel('Lý do',{exact:true}).fill(reason);
      await dialog.getByRole('button',{name:'Gửi yêu cầu',exact:true}).click();
      await expect(dialog).not.toBeVisible();
      await expect(page.getByRole('row').filter({hasText:reason})).toContainText('Chờ duyệt');

      const employeeLogin=await request.post('/api/auth/login',{data:{username:employee.username,secret:employee.secret}});
      expect(employeeLogin.status()).toBe(200);const employeeToken=(await employeeLogin.json()).token;
      const outside=await request.post('/api/workforce',{headers:auth(employeeToken),data:{assignment_id:outsideAssignment.id,kind:'LEAVE',reason:'Yêu cầu ngoài phạm vi '+employee.employee_code}});
      expect(outside.status()).toBe(201);const outsideRequest=await outside.json();
      const pendingResponse=await request.get(`/api/workforce?from=${workDate}&to=${otherDate}`,{headers:auth(employeeToken)});
      const ownRequest=(await pendingResponse.json()).requests.find(r=>r.assignment_id===assignment.id);
      expect(Boolean(ownRequest)).toBeTruthy();
      const selfDecision=await request.post('/api/workforce',{headers:auth(employeeToken),data:{action:'decide',id:ownRequest.id,state:'APPROVED',decision_note:'Không được tự duyệt'}});
      expect(selfDecision.status()).toBe(403);

      await page.getByRole('button',{name:'Đăng xuất tài khoản',exact:true}).click();
      await expect(page.getByTestId('login-submit')).toBeVisible();
      await login(page,'manager');
      await page.getByRole('button',{name:'Yêu cầu công',exact:true}).click();
      await page.getByLabel('Từ ngày',{exact:true}).fill(workDate);
      await page.getByLabel('Đến ngày',{exact:true}).fill(otherDate);
      await page.getByRole('button',{name:'Xem dữ liệu',exact:true}).click();
      const managedRow=page.getByRole('row').filter({hasText:reason});
      await expect(managedRow).toContainText('Chờ duyệt');
      await expect(page.getByRole('row').filter({hasText:'Yêu cầu ngoài phạm vi '+employee.employee_code})).toHaveCount(0);
      await managedRow.getByRole('button',{name:'Xem xét',exact:true}).click();
      const decisionDialog=page.getByRole('dialog',{name:'Xem xét yêu cầu công',exact:true});
      await decisionDialog.getByLabel('Ghi chú quyết định',{exact:true}).fill('Đã đối soát và đồng ý nghỉ theo ca');
      await decisionDialog.getByRole('button',{name:'Lưu quyết định',exact:true}).click();
      await expect(decisionDialog).not.toBeVisible();
      await expect(managedRow).toContainText('Đã duyệt');

      const managerToken=await apiToken(request,'manager');
      const denied=await request.post('/api/workforce',{headers:auth(managerToken),data:{action:'decide',id:outsideRequest.id,state:'APPROVED',decision_note:'Ngoài phạm vi quản lý'}});
      expect(denied.status()).toBe(403);
      const report=await request.get(`/api/reports?from=${workDate}&to=${otherDate}&user_id=${employee.id}`,{headers:auth(managerToken)});
      expect(report.status()).toBe(200);const reportData=await report.json();
      expect(reportData.rows.length).toBe(1);expect(reportData.rows[0].request_state).toBe('APPROVED');
      expect(reportData.rows[0].in_id).toBeNull();expect(reportData.rows[0].out_id).toBeNull();
      expect(reportData.rows[0].starts_at).toBe(assignment.starts_at);expect(reportData.rows[0].ends_at).toBe(assignment.ends_at);
      expect(reportData.summary.leaveDays).toBe(1);expect(reportData.summary.minutes).toBe(0);
      const afterResponse=await request.get(historyURL,{headers:auth(originalStaffToken)});expect(afterResponse.status()).toBe(200);
      expect((await afterResponse.json()).attendances).toEqual(originalRecords);
      expect(errors).toEqual([]);
    });

    test('administrator resets, locks and unlocks a disposable account and revokes its sessions',async({page,request})=>{
      const errors=errorsOn(page),adminToken=await apiToken(request,'admin');
      const employee=await disposableAccount(request,adminToken,'test-controls');
      const firstLogin=await request.post('/api/auth/login',{data:{username:employee.username,secret:employee.secret}});
      expect(firstLogin.status()).toBe(200);const oldToken=(await firstLogin.json()).token;
      const before=await request.get('/api/auth/me',{headers:auth(oldToken)});expect(before.status()).toBe(200);
      await login(page);
      await page.getByRole('button',{name:'Quản trị',exact:true}).click();
      const employeeRow=page.getByRole('row').filter({hasText:employee.employee_code});
      await expect(employeeRow).toBeVisible();
      await employeeRow.getByRole('button',{name:'Đổi tên đăng nhập / mật khẩu',exact:true}).click();
      const resetDialog=page.getByRole('dialog',{name:'Đổi tên đăng nhập và mật khẩu',exact:true});
      const renamed=employee.username+'-new';
      const username=resetDialog.locator('input[name="username"]');
      await username.fill('invalid name');expect(await username.evaluate(e=>e.checkValidity())).toBe(false);
      await username.fill(renamed);expect(await username.evaluate(e=>e.checkValidity())).toBe(true);
      await resetDialog.getByRole('button',{name:'Lưu thông tin đăng nhập',exact:true}).click();
      const issued=page.getByTestId('issued-secret');await issued.waitFor({state:'visible'});
      const newSecret=await issued.textContent();
      await page.getByRole('button',{name:'Đã lưu mã an toàn',exact:true}).click();
      expect(/^[0-9a-f]{48}$/.test(newSecret)).toBeTruthy();
      expect(newSecret!==employee.secret).toBeTruthy();
      await expect(employeeRow).toContainText(renamed);
      const oldName=await request.post('/api/auth/login',{data:{username:employee.username,secret:newSecret}});expect(oldName.status()).toBe(401);
      const oldSession=await request.get('/api/auth/me',{headers:auth(oldToken)});expect(oldSession.status()).toBe(401);
      const oldCredential=await request.post('/api/auth/login',{data:{username:employee.username,secret:employee.secret}});expect(oldCredential.status()).toBe(401);
      const newLogin=await request.post('/api/auth/login',{data:{username:renamed,secret:newSecret}});expect(newLogin.status()).toBe(200);
      const newToken=(await newLogin.json()).token;

      await employeeRow.getByRole('button',{name:'Khóa',exact:true}).click();
      const lockDialog=page.getByRole('dialog',{name:'Khóa tài khoản',exact:true});
      await lockDialog.getByRole('button',{name:'Khóa tài khoản',exact:true}).click();
      await expect(lockDialog).not.toBeVisible();await expect(employeeRow).toContainText('Đã khóa');
      const revoked=await request.get('/api/auth/me',{headers:auth(newToken)});expect(revoked.status()).toBe(401);
      const disabledLogin=await request.post('/api/auth/login',{data:{username:renamed,secret:newSecret}});expect(disabledLogin.status()).toBe(401);

      await employeeRow.getByRole('button',{name:'Mở khóa',exact:true}).click();
      const unlockDialog=page.getByRole('dialog',{name:'Mở khóa tài khoản',exact:true});
      await unlockDialog.getByRole('button',{name:'Mở khóa',exact:true}).click();
      await expect(unlockDialog).not.toBeVisible();await expect(employeeRow).toContainText('Đang hoạt động');
      const restored=await request.post('/api/auth/login',{data:{username:renamed,secret:newSecret}});expect(restored.status()).toBe(200);
      const stillRevoked=await request.get('/api/auth/me',{headers:auth(newToken)});expect(stillRevoked.status()).toBe(401);
      expect(errors).toEqual([]);
    });
  });
});

test('offline logout still clears local account data and camera access',async({page,context})=>{
  await login(page,'staff');
  expect(await page.evaluate(()=>Boolean(localStorage.getItem('babymark-session')||sessionStorage.getItem('babymark-session')))).toBeTruthy();
  await page.getByRole('button',{name:'Bật camera',exact:true}).click();
  await expect.poll(()=>page.locator('#camera').evaluate(v=>v.readyState>=2)).toBeTruthy();
  await page.evaluate(()=>{window.__lastCameraTracks=[...document.querySelector('#camera').srcObject.getTracks()];});
  await context.setOffline(true);
  await page.getByRole('button',{name:'Đăng xuất tài khoản',exact:true}).click();
  await expect(page.getByTestId('login-submit')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('babymark-session')||sessionStorage.getItem('babymark-session'))).toBeNull();
  expect(await page.evaluate(()=>window.__lastCameraTracks.every(track=>track.readyState==='ended'))).toBeTruthy();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await context.setOffline(false);
});

test('administrator creates and resets a chosen password and staff logs in through the browser',async({page})=>{
  const name='test-human-'+Date.now().toString(36).slice(-6),pwd='Test8!ab',next='Second local test passphrase!';
  await login(page);
  await page.getByRole('button',{name:'Quản trị',exact:true}).click();
  await page.getByRole('button',{name:'Cấp tài khoản',exact:true}).click();
  await page.getByLabel('Mã nhân viên',{exact:true}).fill(name.toUpperCase());
  await page.getByLabel('Họ và tên',{exact:true}).fill('Nhân viên mật khẩu thử nghiệm');
  await page.getByLabel('Tên đăng nhập',{exact:true}).fill(name);
  await page.getByLabel('Mật khẩu nhân viên (không bắt buộc)',{exact:true}).fill(pwd);
  await page.getByRole('button',{name:'Tạo và cấp mã truy cập',exact:true}).click();
  const row=page.getByRole('row').filter({hasText:name.toUpperCase()});await expect(row).toBeVisible();
  await page.getByRole('button',{name:'Đăng xuất tài khoản',exact:true}).click();
  await loginAccount(page,name,pwd);
  await page.getByRole('button',{name:'Đăng xuất tài khoản',exact:true}).click();
  await login(page);
  await page.getByRole('button',{name:'Quản trị',exact:true}).click();
  await row.getByRole('button',{name:'Đổi tên đăng nhập / mật khẩu',exact:true}).click();
  await page.getByLabel('Mật khẩu nhân viên (không bắt buộc)',{exact:true}).fill(next);
  await page.getByRole('dialog').getByRole('button',{name:'Lưu thông tin đăng nhập',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'Đăng xuất tài khoản',exact:true}).click();
  await loginAccount(page,name,next);
  await expect(page.getByRole('button',{name:'Quản trị',exact:true})).toHaveCount(0);
});

test('admin settings and branch lifecycle are available after migration 0009',async({page})=>{
 await login(page);
 await page.getByRole('button',{name:'Quản trị',exact:true}).click();
 await page.getByRole('tab',{name:'Cài đặt',exact:true}).click();
 await page.getByLabel('Giới hạn cửa hàng hoạt động (1–50)',{exact:true}).fill('15');
 await page.getByLabel('Thông báo đi muộn trong ứng dụng',{exact:true}).check();
 await page.getByRole('button',{name:'Lưu cài đặt',exact:true}).click();
 await expect(page.getByLabel('Giới hạn cửa hàng hoạt động (1–50)',{exact:true})).toHaveValue('15');
 await page.getByRole('tab',{name:'Cửa hàng',exact:true}).click();
 const row=page.getByRole('row').filter({hasText:'BABYMARK LUXURY KEO'});
 await row.getByRole('button',{name:'Ngừng hoạt động',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Xác nhận',exact:true}).click();
 await expect(row.getByRole('button',{name:'Khôi phục',exact:true})).toBeVisible();
 await row.getByRole('button',{name:'Khôi phục',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Xác nhận',exact:true}).click();
 await expect(row.getByRole('button',{name:'Ngừng hoạt động',exact:true})).toBeVisible();
});

test('responsive admin navigation, readable records and forms at narrow, tablet and desktop widths',async({page})=>{
 await page.setViewportSize({width:320,height:640});
 await login(page);
 const more=page.getByRole('button',{name:'Thêm',exact:true});
 await expect(more).toBeVisible();
 await expect(more).toHaveAttribute('aria-expanded','false');
 await more.click();
 await expect(more).toHaveAttribute('aria-expanded','true');
 await page.getByRole('button',{name:'Quản trị',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Nhân viên',exact:true})).toBeVisible();
 await expect(page.locator('.responsive-table td[data-label="Nhân viên"]').first()).toBeVisible();
 await expect(more).toHaveAttribute('aria-expanded','false');
 const fits=()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
 expect(await fits()).toBeTruthy();
 await page.getByRole('button',{name:'Cấp tài khoản',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByLabel('Mật khẩu nhân viên (không bắt buộc)',{exact:true})).toBeVisible();
 expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();
 await page.getByRole('button',{name:'Hủy',exact:true}).click();
 for(const size of [{width:390,height:844},{width:768,height:1024},{width:1024,height:768},{width:1440,height:900},{width:844,height:390}]){
  await page.setViewportSize(size);expect(await fits()).toBeTruthy();
 }
 await more.click();await expect(page.getByRole('button',{name:'Thiết bị & thông báo',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(more).toHaveAttribute('aria-expanded','false');
});
test('mobile employee can reach own password settings without sideways scrolling',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await login(page,'staff');
 await page.getByRole('button',{name:'Thêm',exact:true}).click();
 await page.getByRole('button',{name:'Đổi mật khẩu',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Đổi mật khẩu của bạn'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});

test('PWA header rules preserve HTML, JavaScript, manifest and image MIME types',async({request})=>{
 for(const [path,mime] of [['/','text/html'],['/app.mjs','text/javascript'],['/sw.js','text/javascript'],['/manifest.webmanifest?v=2','application/manifest+json'],['/apple-touch-icon.png?v=2','image/png']]){
  const response=await request.get(path);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toContain(mime);
 }
});

test('device permission setup explicitly checks camera and GPS without uploading attendance',async({page})=>{
 await login(page,'staff');
 await page.getByRole('button',{name:'Thiết lập quyền thiết bị',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Thiết lập quyền thiết bị',exact:true})).toBeVisible();
 // Wait for final Push panel so permission results aren't replaced by initial loading.
 await expect(page.getByRole('heading',{name:'Thông báo khi đóng ứng dụng',exact:true})).toBeVisible();
 const requests=[];page.on('request',r=>{if(r.url().includes('/api/attendance/')&&r.method()==='POST')requests.push(r.url());});
 await page.getByRole('button',{name:'Cho phép / kiểm tra camera',exact:true}).click();
 await expect(page.locator('[data-permission-status="camera"]')).toContainText('Đã kiểm tra camera thành công');
 await page.getByRole('button',{name:'Cho phép / kiểm tra vị trí',exact:true}).click();
 await expect(page.locator('[data-permission-status="location"]')).toContainText('Đã kiểm tra GPS thành công');
 expect(requests).toEqual([]);
});

test('remembered staff session survives closing the tab',async({page,context})=>{
 await login(page,'staff');
 const expiry=await page.evaluate(()=>JSON.parse(localStorage.getItem('babymark-session')||'null')?.expires_at);
 expect(expiry-Date.now()).toBeGreaterThan(29*86400000);
 const next=await context.newPage();await next.goto('/');await expect(next.getByRole('button',{name:'Chấm công',exact:true})).toBeVisible();await expect(next.locator('form[data-form="login"]')).toHaveCount(0);await next.close();
});

test('admin directory loads on demand and filters locally',async({page})=>{
 await login(page);
 const requests=[];page.on('request',r=>{if(r.method()==='GET'&&r.url().includes('/api/admin/'))requests.push(new URL(r.url()).pathname);});
 await page.getByRole('button',{name:'Quản trị',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Nhân viên',exact:true})).toBeVisible();
 expect(requests).toContain('/api/admin/employees');expect(requests).not.toContain('/api/admin/assignments');
 await page.getByRole('searchbox',{name:'Tìm kiếm'}).fill('zz-nonexistent-employee');await expect(page.getByText('Không tìm thấy kết quả.',{exact:true})).toBeVisible();
 await page.getByRole('searchbox',{name:'Tìm kiếm'}).fill('');
 await page.getByRole('tab',{name:'Cửa hàng',exact:true}).click();await expect(page.getByRole('heading',{name:'Cửa hàng',exact:true})).toBeVisible();
 expect(requests).toContain('/api/admin/branches');expect(requests).not.toContain('/api/admin/assignments');
});
test('camera selection before opening and stop camera',async({page})=>{
 await login(page,'staff');
 await page.getByRole('button',{name:'Đổi camera',exact:true}).click();await expect(page.locator('#camera-facing')).toHaveText('Camera sau');
 await page.getByRole('button',{name:'Đổi camera',exact:true}).click();await expect(page.locator('#camera-facing')).toHaveText('Camera trước');
 await page.getByRole('button',{name:'Bật camera',exact:true}).click();
 await expect(page.getByRole('button',{name:'Tắt camera',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Tắt camera',exact:true}).click();await expect(page.getByRole('button',{name:'Bật camera',exact:true})).toBeVisible();
 expect(await page.locator('#camera').evaluate(v=>v.srcObject===null)).toBeTruthy();
});

test('admin overview and role navigation do not duplicate primary modules',async({page})=>{
 await login(page);
 await expect(page.getByRole('heading',{name:'Việc cần xử lý'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Bật camera',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Quản trị',exact:true}).click();
 for(const name of ['Báo cáo','Bảng công & lương','Yêu cầu công','Thông báo'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Yêu cầu công',exact:true}).click();
 await expect(page.getByRole('button',{name:'Nghỉ phép / điều chỉnh',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Ca bổ sung / thay ca',exact:true}).click();await expect(page.getByRole('heading',{name:'Chấm công ngoài lịch / thay ca',exact:true})).toBeVisible();
});

test('v1.2 admin opens diagnostics from overview; staff is denied',async({page,request})=>{
 await login(page);
 await page.getByRole('button',{name:'Sức khỏe và phục hồi',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Sức khỏe hệ thống · v1.2.0 RC',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Migration đến 0020',exact:true})).toBeVisible();
 await expect(page.getByText('0016 · Có dấu hiệu schema',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Sao lưu và phục hồi',exact:true})).toBeVisible();
 const staff=await apiToken(request,'staff');
 expect((await request.get('/api/admin/diagnostics',{headers:auth(staff)})).status()).toBe(403);
});

test('v1.2 calendar and audit log are accessible from admin navigation',async({page})=>{
 await login(page);
 await page.getByRole('button',{name:'Nhật ký quản trị',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Nhật ký quản trị',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Lọc nhật ký',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Đóng',exact:true}).last().click();
 await page.getByRole('button',{name:'Lịch làm việc',exact:true}).click();
 await page.getByRole('button',{name:'Xem lịch trực quan',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Lịch tuần',exact:true})).toBeVisible();
 await expect(page.locator('.calendar-day')).toHaveCount(7);
});

test('RC.4 overview distribution and quick actions fit narrow and desktop screens',async({page})=>{
 await page.setViewportSize({width:390,height:844});await login(page);
 await expect(page.getByRole('heading',{name:'Phân bố trạng thái ca',exact:true})).toBeVisible();
 await expect(page.locator('.distribution-item')).toHaveCount(9);
 await expect(page.locator('.quick-actions').getByRole('button',{name:'Sức khỏe và phục hồi',exact:true})).toBeVisible();
 for(const size of [{width:320,height:640},{width:390,height:844},{width:768,height:1024},{width:1440,height:900}]){
  await page.setViewportSize(size);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 }
});

test('RC.5 compact overview uses full rows and keeps all quick actions accessible',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await login(page);
 const grid=page.locator('.overview-grid');
 await expect(grid.locator('.overview-command')).toBeVisible();
 await expect(grid.locator('.quick-actions .btn')).toHaveCount(8);
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:900});
  const bounds=await grid.evaluate(el=>{
   const r=el.getBoundingClientRect();
   const full=['.overview-command','.overview-kpis','.overview-attendance','.overview-branches'].map(s=>el.querySelector(s).getBoundingClientRect());
   return {fits:full.every(x=>Math.abs(x.left-r.left)<2&&Math.abs(x.width-r.width)<2),ordered:full[0].bottom<=full[1].top&&full[1].bottom<=full[2].top&&full[2].bottom<=full[3].top,overflow:document.documentElement.scrollWidth>window.innerWidth};
  });
  expect(bounds.fits).toBeTruthy();expect(bounds.ordered).toBeTruthy();expect(bounds.overflow).toBeFalsy();
 }
 await expect(grid.getByRole('button',{name:'Mở danh sách yêu cầu',exact:true})).toBeVisible();
});

test('RC.6 employee capture comes first, idle camera is compact, live preview expands',async({page})=>{
 await page.setViewportSize({width:390,height:844});await login(page,'staff');
 const work=page.locator('.employee-workspace'),camera=work.locator('.employee-camera');
 await expect(work.getByLabel('Chọn ca làm')).toBeVisible();
 await expect(work.getByTestId('attendance-in')).toBeVisible();
 const idle=await camera.evaluate(el=>el.getBoundingClientRect().height);
 expect(idle).toBeLessThan(190);
 const order=await work.evaluate(el=>{const top=s=>el.querySelector(s).getBoundingClientRect().top;return top('.employee-checkin')<top('.employee-summary')&&top('.employee-summary')<top('.employee-shifts')&&top('.employee-shifts')<top('.employee-tools')});
 expect(order).toBeTruthy();
 await expect(work.getByRole('button',{name:'Kết quả duyệt của tôi',exact:true})).toBeVisible();
 await expect(work.getByRole('button',{name:'Xin nghỉ / điều chỉnh',exact:true})).toBeVisible();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 }
 await page.setViewportSize({width:390,height:844});
 await work.getByRole('button',{name:'Bật camera',exact:true}).click();
 await expect.poll(()=>camera.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(idle+50);
 await work.getByRole('button',{name:'Tắt camera',exact:true}).click();
 await expect.poll(()=>camera.evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(190);
});
