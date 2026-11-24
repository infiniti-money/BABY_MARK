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

export {currentPosition} from './gps.mjs';
