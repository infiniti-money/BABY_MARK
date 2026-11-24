import {makeTimemark,WIDTH,HEIGHT,MAX_BYTES} from './timemark-layout.mjs';

export function cameraFrame(video) {
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) throw new Error('Camera chưa sẵn sàng. Vui lòng đợi hình ảnh xuất hiện.');
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const scale = Math.max(WIDTH / video.videoWidth, HEIGHT / video.videoHeight);
  const sw = WIDTH / scale, sh = HEIGHT / scale;
  ctx.drawImage(video, (video.videoWidth-sw)/2, (video.videoHeight-sh)/2, sw, sh, 0, 0, WIDTH, HEIGHT);
  return canvas;
}

// A browser composition from server metadata. This does not attest camera liveness,
// GPS truth, or that the pixels match the record; the server records that limitation.
export async function composeTimemark(frame, metadata) {
  const overlay = await new Promise((resolve,reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([makeTimemark(metadata)],{type:'image/svg+xml'}));
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không tạo được lớp Timemark.')); };
    img.src = url;
  });
  frame.getContext('2d').drawImage(overlay,0,0,frame.width,frame.height);
  for (const width of [WIDTH,720,640,560,480]) {
    const output = document.createElement('canvas');
    output.width = width; output.height = Math.round(width*HEIGHT/WIDTH);
    output.getContext('2d').drawImage(frame,0,0,output.width,output.height);
    for (const quality of [.86,.75,.64,.52,.40]) {
      const blob = await new Promise(resolve => output.toBlob(resolve,'image/jpeg',quality));
      if (blob && blob.type === 'image/jpeg' && blob.size <= MAX_BYTES) return blob;
    }
  }
  throw new Error('Ảnh vẫn vượt 200 KB. Vui lòng chụp lại ở nơi đủ sáng, nền đơn giản.');
}

// Bounded foreground acquisition: keep trying for a precise fix, then release GPS.
// A browser position is still untrusted; server checks its reported accuracy.
export function currentPosition({onProgress=()=>{},signal,timeout=20000,geo=globalThis.navigator?.geolocation}={}) {
  if(!geo)return Promise.reject(new Error('Trình duyệt không hỗ trợ vị trí GPS.'));
  return new Promise((resolve,reject)=>{
    let watch,timer,done=false,best=Infinity;
    const cancel=()=>finish(new Error('Đã hủy lấy vị trí. Vui lòng thử lại.'));
    const finish=(error,result)=>{
      if(done)return;done=true;clearTimeout(timer);if(watch!==undefined)geo.clearWatch(watch);signal?.removeEventListener('abort',cancel);
      if(error)reject(error);else resolve(result);
    };
    if(signal?.aborted)return cancel();
    signal?.addEventListener('abort',cancel,{once:true});
    const expired=()=>finish(new Error(Number.isFinite(best)?'GPS hiện sai số ±'+Math.round(best)+' m; cần tối đa 50 m. Hãy ra nơi thoáng và thử lại.':'Chưa lấy được vị trí GPS. Kiểm tra vị trí trên thiết bị và thử lại.'));
    timer=setTimeout(expired,timeout);
    try{
      watch=geo.watchPosition(p=>{
        if(done)return;
        const {latitude:lat,longitude:lng,accuracy}=p.coords;
        if(![lat,lng,accuracy].every(Number.isFinite)||accuracy<0||Math.abs(lat)>90||Math.abs(lng)>180)return;
        best=Math.min(best,accuracy);
        if(accuracy<=50)return finish(null,{lat,lng,accuracy});
        onProgress(best);
      },e=>{if(e.code===1)finish(new Error('Chưa được cấp quyền vị trí. Hãy bật vị trí cho trang này trong trình duyệt.'));else if(e.code===3)expired();},{enableHighAccuracy:true,maximumAge:0,timeout});
      if(done)geo.clearWatch(watch);
    }catch(e){finish(e);}
  });
}
