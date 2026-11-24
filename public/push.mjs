const supported=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
export async function pushRegistration(){
 if(!supported())return null;
 await navigator.serviceWorker.register('/sw.js',{scope:'/'});
 return navigator.serviceWorker.ready;
}
export function publicKeyBytes(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0))}
export async function disableDevicePush(){try{const reg=await navigator.serviceWorker?.getRegistration('/'),sub=await reg?.pushManager.getSubscription();if(sub)await sub.unsubscribe()}catch{}}
