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
const cancelled=()=>new Error('Đã hủy xử lý ảnh. Vui lòng chụp lại.');
function imageOperation(start,signal){
  return new Promise((resolve,reject)=>{
    let done=false,dispose=()=>{};
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);dispose();error?reject(error):resolve(value);};
    const abort=()=>finish(cancelled());
    const timer=setTimeout(()=>finish(new Error('Xử lý ảnh quá lâu. Vui lòng chụp lại.')),8000);
    if(signal?.aborted)return abort();
    signal?.addEventListener('abort',abort,{once:true});
    try{dispose=start(value=>finish(null,value),error=>finish(error))||dispose;if(done)dispose();}catch(e){finish(e);}
  });
}
export async function composeTimemark(frame, metadata,{signal}={}) {
  if(signal?.aborted)throw cancelled();
  let overlay,output;
  try{
  overlay = await imageOperation((resolve,reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([makeTimemark(metadata)],{type:'image/svg+xml'}));
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không tạo được lớp Timemark.'));
    img.src = url;
    return ()=>{URL.revokeObjectURL(url);img.onload=null;img.onerror=null;if(signal?.aborted)img.src='';};
  },signal);
  if(signal?.aborted)throw cancelled();
  frame.getContext('2d').drawImage(overlay,0,0,frame.width,frame.height);
  overlay.src='';
  for (const width of [WIDTH,720,640,560,480]) {
    if(signal?.aborted)throw cancelled();
    // Use the full-size frame directly, and one reusable downscale surface.
    const surface=width===WIDTH?frame:(output??=document.createElement('canvas'));
    if(surface!==frame){surface.width=width;surface.height=Math.round(width*HEIGHT/WIDTH);surface.getContext('2d').drawImage(frame,0,0,surface.width,surface.height);}
    for (const quality of [.86,.75,.64,.52,.40]) {
      const blob = await imageOperation(resolve=>{surface.toBlob(resolve,'image/jpeg',quality);},signal);
      if(signal?.aborted)throw cancelled();
      if (blob && blob.type === 'image/jpeg' && blob.size <= MAX_BYTES) return blob;
    }
  }
  throw new Error('Ảnh vẫn vượt 200 KB. Vui lòng chụp lại ở nơi đủ sáng, nền đơn giản.');
  }finally{if(output){output.width=0;output.height=0;}if(overlay)overlay.src='';}
}

export {currentPosition} from './gps.mjs';
