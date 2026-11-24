// Shared public layout: no secrets, personal data or network requests.
export const WIDTH=800, HEIGHT=1200, PHOTO_HEIGHT=1200, MAX_BYTES=200000;
export const PANEL_OPACITY=0.40, LOGO_OPACITY=0.70;
const logo='data:image/png;base64,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';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const clean=s=>String(s??'').normalize('NFC').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').trim().replace(/\s+/g,' ');
const tz='Asia/Ho_Chi_Minh';
const time=new Intl.DateTimeFormat('vi-VN',{timeZone:tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const date=new Intl.DateTimeFormat('vi-VN',{timeZone:tz,day:'2-digit',month:'2-digit',year:'numeric'});
const hm=t=>time.format(t).slice(0,5);
function widthUnits(s){return [...s].reduce((n,c)=>n+(/\p{Mark}/u.test(c)?0:/[ilI1.,:;!| ]/.test(c)?.38:/[MW@%]/.test(c)?1.05:/[A-Z0-9]/.test(c)?.76:/[\u1100-\uffff]/.test(c)?1:.65),0)}
export function fitLines(value,maxUnits,maxLines){
 const chars=[...clean(value)];const lines=[];let current='';
 for(const c of chars){if(widthUnits(current+c)>maxUnits&&current){const split=current.lastIndexOf(' ');if(split>current.length*.5){lines.push(current.slice(0,split));current=current.slice(split+1)+c}else{lines.push(current);current=c}}else current+=c;
 if(lines.length>=maxLines){lines[maxLines-1]=lines[maxLines-1].trimEnd().slice(0,-1)+'…';return lines}}
 if(current.trim())lines.push(current.trim());return lines;
}
export function distanceMeters(lat,lng,bLat,bLng){const r=x=>x*Math.PI/180;const h=Math.sin(r(lat-bLat)/2)**2+Math.cos(r(lat))*Math.cos(r(bLat))*Math.sin(r(lng-bLng)/2)**2;return 6371000*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))))}
export function attendanceTiming({type,serverTimestamp,shiftStart,shiftEnd,graceMinutes=0}){
 if(type==='IN'){const late=serverTimestamp>shiftStart+graceMinutes*60000?Math.ceil((serverTimestamp-shiftStart)/60000):0;return {status:late?'Đi muộn':'Đúng giờ',minutes:late}}
 const early=Math.max(0,Math.ceil((shiftEnd-serverTimestamp)/60000));return {status:early?'Về sớm':'Đủ giờ ra ca',minutes:early};
}
export function makeTimemark(meta,{preview=false}={}){
 const {serverTimestamp,shiftStart,shiftEnd,lat,lng,accuracy,distance,radius,type,branchName,employeeName,employeeCode,address='',graceMinutes=0,branchCode='',shiftName='',reference=''}=meta;
 if(![serverTimestamp,shiftStart,shiftEnd,lat,lng,accuracy,distance,radius,graceMinutes].every(Number.isFinite)||Math.abs(lat)>90||Math.abs(lng)>180||accuracy<0||accuracy>50||distance<0||radius<20||radius>1000||graceMinutes<0||graceMinutes>120||shiftEnd<=shiftStart||!['IN','OUT'].includes(type)||!clean(branchName)||!clean(employeeName)||!clean(employeeCode))throw Error('INVALID_TIMEMARK_METADATA');
 const timing=attendanceTiming(meta),outside=distance>radius,uncertain=!outside&&distance+accuracy>radius;
 const location=outside?'NGOÀI VÙNG':uncertain?'SÁT RANH GIỚI':'TRONG VÙNG';
 const status=timing.status+(timing.minutes?' · '+timing.minutes+' phút':'');
 const rows=[];
 const rose='#ffd5e1',white='#ffffff',muted='#f0e7eb',ok='#d1f7de',warn='#ffd28c',bad='#ffd0d0';
 const panel=(x,y,w,h,opacity=PANEL_OPACITY,fill='#17121c')=>rows.push('<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="18" fill="'+fill+'" fill-opacity="'+opacity+'" stroke="#ffffff" stroke-opacity=".24" stroke-width="1"/>');
 const text=(x,y,s,size=22,fill=white,weight=500)=>rows.push('<text x="'+x+'" y="'+y+'" font-family="DejaVu Sans, Arial, sans-serif" font-size="'+size+'" font-weight="'+weight+'" fill="'+fill+'" stroke="#171019" stroke-opacity=".85" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke fill">'+esc(s)+'</text>');
 const rect=(x,y,w,h,fill,opacity=1)=>rows.push('<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="3" fill="'+fill+'" fill-opacity="'+opacity+'"/>');
 const single=(x,y,value,max,size,fill=white,weight=650)=>text(x,y,fitLines(value,max,1)[0]||'',size,fill,weight);
 // Brand signature and timestamp remain in opposite corners; central portrait is clear.
 panel(18,18,116,116,LOGO_OPACITY,'#fff1f4');
 rows.push('<image x="23" y="23" width="106" height="106" xlink:href="'+logo+'"/>');
 panel(18,143,356,45);
 text(32,172,'BABY MARK  /  TIMEMARK',20,white,750);
 panel(398,18,384,190);
 rect(414,35,5,35,'#f58ba9');
 text(430,60,type==='IN'?'VÀO CA':'TAN CA',27,rose,750);
 text(418,118,time.format(serverTimestamp),56,white,750);
 text(420,149,date.format(serverTimestamp)+' · UTC+7',23,white,600);
 single(420,178,status,27,21,timing.minutes?warn:ok,700);
 text(420,196,'Giờ máy chủ cấp dấu',14,muted,500);
 // Employee and workplace: large names, codes and planned shift.
 panel(18,824,764,190);
 rect(36,838,5,21,'#f58ba9');
 single(51,852,'CỬA HÀNG'+(branchCode?' · '+branchCode:''),48,17,rose,750);
 fitLines(branchName,39,2).forEach((v,k)=>text(36,879+k*25,v,24,white,700));
 single(36,929,'NHÂN VIÊN · '+employeeCode,49,17,rose,750);
 fitLines(employeeName,42,2).forEach((v,k)=>text(36,954+k*24,v,23,white,700));
 const shift='CA LÀM: '+hm(shiftStart)+' – '+hm(shiftEnd)+(date.format(shiftStart)!==date.format(shiftEnd)?' (+1 ngày)':'');
 text(36,1002,shift,21,white,650);
 if(clean(shiftName)&&shift.length<32)single(420,1002,shiftName,25,17,muted,600);
 // Location: independent GPS classification and reported accuracy.
 panel(18,1024,764,158);
 const tint=outside?bad:uncertain?warn:ok;
 rect(36,1037,5,22,tint);
 text(51,1055,location+' · '+Math.round(distance)+' / '+Math.round(radius)+' m',24,tint,750);
 text(36,1083,'GPS '+lat.toFixed(6)+', '+lng.toFixed(6)+'  ·  Sai số ±'+Math.round(accuracy)+' m',20,white,600);
 text(36,1107,'ĐỊA CHỈ CỬA HÀNG',15,rose,750);
 fitLines(address||'Chưa xác định địa chỉ',51,2).forEach((v,k)=>text(36,1131+k*22,v,19,white,600));
 if(clean(reference))single(36,1172,'Mã dấu: '+reference+' · Ảnh ghép trên thiết bị',59,14,muted,500);
 else text(36,1172,'Ảnh ghép trên thiết bị',14,muted,500);
 if(preview){panel(150,192,500,44,.7,'#fff1f4');rows.push('<text x="400" y="220" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="bold" fill="#9c3449">MẪU XEM TRƯỚC · KHÔNG PHẢI BẰNG CHỨNG</text>')}
 return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800" height="1200" viewBox="0 0 800 1200">'+rows.join('')+'</svg>';
}
