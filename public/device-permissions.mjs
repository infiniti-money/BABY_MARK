// Permission checks run only following an explicit user action, never on login.
export async function permissionState(name){
 if(name==='camera'&&!navigator.mediaDevices?.getUserMedia)return 'unsupported';
 if(name==='geolocation'&&!navigator.geolocation)return 'unsupported';
 try{return (await navigator.permissions.query({name})).state||'unknown';}catch{return 'unknown';}
}
export async function checkCameraPermission(){
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera không được hỗ trợ; cần HTTPS.');
 let stream;
 try{
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
  return 'Đã kiểm tra camera thành công. iOS có thể hỏi lại sau khi đóng ứng dụng.';
 }catch(e){
  if(e.name==='NotAllowedError'||e.name==='SecurityError')throw Error('Camera chưa được cho phép. Kiểm tra quyền của trang hoặc Web App trong cài đặt iPhone.');
  throw Error('Không mở được camera. Kiểm tra thiết bị hoặc thử lại.');
 }finally{stream?.getTracks().forEach(t=>t.stop());}
}
export async function checkLocationPermission(){
 if(!navigator.geolocation)throw Error('Thiết bị không hỗ trợ dịch vụ vị trí.');
 return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>{
  const accuracy=Math.round(p.coords.accuracy);
  resolve(accuracy<=50?'Đã kiểm tra GPS thành công (sai số khoảng '+accuracy+' m).':'Đã nhận GPS nhưng sai số khoảng '+accuracy+' m; chấm công cần tối đa 50 m.');
 },e=>reject(Error(e.code===1?'Vị trí chưa được cho phép. Bật dịch vụ định vị và quyền vị trí cho Web App.':'Chưa lấy được vị trí. Kiểm tra dịch vụ định vị và thử lại ở nơi thoáng.')),{enableHighAccuracy:true,maximumAge:0,timeout:20000}));
}
