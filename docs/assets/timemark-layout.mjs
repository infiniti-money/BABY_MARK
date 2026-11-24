// Shared public layout: no secrets, personal data or network requests.
export const WIDTH=800, HEIGHT=1200, PHOTO_HEIGHT=1200, MAX_BYTES=200000;
export const PANEL_OPACITY=0.40, LOGO_OPACITY=1.00;
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
 // A logo with transparent pixels and no surrounding panel.
 rows.push('<image x="18" y="18" width="210" height="145" preserveAspectRatio="xMidYMid meet" xlink:href="'+logo+'"/>');
 // Top-right identity and time. No full-frame or corner background.
 const right=(y,value,size,fill=white,weight=700)=>rows.push('<text x="778" y="'+y+'" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="'+size+'" font-weight="'+weight+'" fill="'+fill+'" stroke="#171019" stroke-width="2" stroke-linejoin="round" paint-order="stroke fill">'+esc(value)+'</text>');
 fitLines(employeeName,25,2).forEach((v,k)=>right(42+k*27,v,25));
 right(97,'Mã NV: '+(fitLines(employeeCode,27,1)[0]||''),20,rose);
 right(155,time.format(serverTimestamp),55,white,750);
 right(185,date.format(serverTimestamp)+' · UTC+7',22);
 right(207,'Giờ máy chủ cấp dấu',15,muted,500);
 // One continuous translucent information block, no duplicate employee identity or clock.
 panel(18,824,764,358);
 rect(36,838,5,25,'#f58ba9');
 text(51,857,type==='IN'?'VÀO CA':'TAN CA',25,rose,750);
 single(235,857,status,38,23,timing.minutes?warn:ok,700);
 const rule=y=>rows.push('<path d="M36 '+y+' H764" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>');
 rule(870);
 single(36,891,'CỬA HÀNG'+(branchCode?' · '+branchCode:''),55,16,rose,750);
 fitLines(branchName,42,2).forEach((v,k)=>text(36,918+k*23,v,23,white,700));
 const shift='CA LÀM: '+hm(shiftStart)+' – '+hm(shiftEnd)+(date.format(shiftStart)!==date.format(shiftEnd)?' (+1 ngày)':'');
 text(36,969,shift,21,white,650);
 if(clean(shiftName))single(36,994,shiftName,50,19,muted,600);
 rule(1005);
 const tint=outside?bad:uncertain?warn:ok;
 text(36,1034,location+' · '+Math.round(distance)+' / '+Math.round(radius)+' m',24,tint,750);
 text(36,1062,'GPS '+lat.toFixed(6)+', '+lng.toFixed(6)+'  ·  Sai số ±'+Math.round(accuracy)+' m',20,white,600);
 rule(1074);
 text(36,1095,'ĐỊA CHỈ CỬA HÀNG',15,rose,750);
 fitLines(address||'Chưa xác định địa chỉ',51,2).forEach((v,k)=>text(36,1118+k*22,v,19,white,600));
 if(clean(reference))single(36,1170,'Mã dấu: '+reference+' · Ảnh ghép trên thiết bị',59,14,muted,500);
 else text(36,1170,'Ảnh ghép trên thiết bị',14,muted,500);
 if(preview){panel(150,222,500,44,.7,'#fff1f4');rows.push('<text x="400" y="250" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="bold" fill="#9c3449">MẪU XEM TRƯỚC · KHÔNG PHẢI BẰNG CHỨNG</text>')}
 return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800" height="1200" viewBox="0 0 800 1200">'+rows.join('')+'</svg>';
}
