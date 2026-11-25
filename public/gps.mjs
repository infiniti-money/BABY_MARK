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
        const improved=accuracy<best;best=Math.min(best,accuracy);
        if(accuracy<=50)return finish(null,{lat,lng,accuracy});
        if(improved){try{onProgress(best);}catch(e){finish(e);}}
      },e=>{if(e.code===1)finish(new Error('Chưa được cấp quyền vị trí. Hãy bật vị trí cho trang này trong trình duyệt.'));else if(e.code===3)expired();},{enableHighAccuracy:true,maximumAge:0,timeout});
      if(done)geo.clearWatch(watch);
    }catch(e){finish(e);}
  });
}
