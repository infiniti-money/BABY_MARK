// No caching of private data or API responses.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 event.waitUntil(self.registration.showNotification('BABY MARK',{body:'Bạn có cập nhật về ca làm việc hoặc chấm công. Mở ứng dụng để kiểm tra.',icon:'/favicon-192x192.png?v=3',tag:'babymark-work-update',data:{path:'/'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.focus();return}}await self.clients.openWindow('/')})());
});
