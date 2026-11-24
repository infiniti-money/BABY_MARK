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

export function currentPosition() {
  if (!navigator.geolocation) return Promise.reject(new Error('Trình duyệt không hỗ trợ vị trí GPS.'));
  return new Promise((resolve,reject) => navigator.geolocation.getCurrentPosition(
    p => {
      if (p.coords.accuracy > 50) return reject(new Error(`GPS hiện sai số ±${Math.round(p.coords.accuracy)} m; cần tối đa 50 m. Hãy ra nơi thoáng và thử lại.`));
      resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy});
    },
    e => reject(new Error(e.code === 1 ? 'Chưa được cấp quyền vị trí. Hãy bật vị trí cho trang này trong trình duyệt.' : 'Chưa lấy được vị trí GPS. Kiểm tra vị trí trên thiết bị và thử lại.')),
    {enableHighAccuracy:true,maximumAge:0,timeout:20000}
  ));
}
