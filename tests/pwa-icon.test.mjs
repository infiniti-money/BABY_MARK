import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=p=>readFile(new URL('../'+p,import.meta.url));
const gitHash=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const dims=b=>[b.readUInt32BE(16),b.readUInt32BE(20)];
test('supplied BABY MARK assets are exact source files and PWA dimensions are accurate',async()=>{
 const assets=[{"paths":["public/brand/logo.png","apps/mobile/assets/logo.png","apps/web/public/brand/logo.png","docs/logo.png"],"sha":"9fe6c132e74cf13d987a5927a08a79c0f1c618eb"},{"paths":["public/brand/full.svg"],"sha":"cf72f0438d9a79dff9ebd436a405723992ab57f2"},{"paths":["public/brand/lockup.svg"],"sha":"b9446ab7111612c0f5e1101c8dc8780070a42ad2"},{"paths":["public/brand/symbol.svg"],"sha":"e0e16d3a0dd984cce52eb9edd93bfca55b2f09a5"},{"paths":["public/brand/wordmark-full.svg"],"sha":"11eeefee516323ed292afb496700f6563e726061"},{"paths":["public/brand/wordmark.svg"],"sha":"877a5421ee3918759a402f7018b98f6f9ee2aabc"},{"paths":["public/brand/horizontal.svg"],"sha":"6aeb0f5ca43f61383f04f768626121c853c275f5"},{"paths":["public/brand/symbol-white.svg"],"sha":"d85af1044b393f154e0b0730a71dc2e14b884533"},{"paths":["public/brand/wordmark-white.svg"],"sha":"17f54f84a553d8e7e68828771e60c764d1e528bc"},{"paths":["public/brand/print-black.png"],"sha":"30d281545d208247355e6983e37a72c3e38ab12d"},{"paths":["public/apple-touch-icon.png","public/apple-touch-icon-precomposed.png"],"sha":"affe7b1c66ea6062634d415668cf6e6c0bc51660"},{"paths":["public/favicon-128x128.png"],"sha":"ebed28f13190a5273fd120bca9a025f25f76943e"},{"paths":["public/favicon-16x16.png"],"sha":"3a7484dbeacc956599a096da62744609c6ccbe84"},{"paths":["public/favicon-192x192.png"],"sha":"b628738051f4cd162059760e9f7a515f6a16fb1f"},{"paths":["public/favicon-32x32.png"],"sha":"77f227f437aaa61a3acbb68ddc79c55213b0f5be"},{"paths":["public/favicon-48x48.png"],"sha":"5299957dd350cbdb13e6878d1a91ada8dc20a921"},{"paths":["public/favicon-512x512.png"],"sha":"e2b7621a1a5f3ebc769eab1013e3cc21119b22eb"},{"paths":["public/favicon-64x64.png"],"sha":"43569e392ecb1eecbc5ae268694c93841674f755"},{"paths":["public/favicon.ico"],"sha":"809877ebbc7fcff8ac3f129dae36f282295a15e8"},{"paths":["apps/mobile/assets/app-icon.png"],"sha":"62b06d44201872e3d550c9394476de5adb19c2e6"},{"paths":["apps/mobile/assets/adaptive-icon.png"],"sha":"d3eb38f31cb201d35033d8d7f9adbe25fad4cf28"},{"paths":["public/brand/timemark.png"],"sha":"7f9133bf0c72552f725eda44ae8bd78d7ba15a19"}];
 for(const a of assets)for(const path of a.paths)assert.equal(gitHash(await read(path)),a.sha,path);
 const icon=await read('public/apple-touch-icon.png');
 assert.deepEqual(dims(icon),[180,180]);
 assert.deepEqual(dims(await read('public/brand/logo.png')),[632,697]);
 const m=JSON.parse(await read('public/manifest.webmanifest'));
 assert.equal(m.short_name,'BABY MARK');assert.equal(m.start_url,'/');assert.equal(m.theme_color,'#D2282F');
 assert.deepEqual(m.icons.map(i=>i.sizes),['192x192','512x512']);
 for(const i of m.icons){const n=Number(i.sizes.split('x')[0]);assert.equal(i.purpose,'any');assert.deepEqual(dims(await read('public'+i.src.split('?')[0])),[n,n]);}
 const html=(await read('public/index.html')).toString();
 assert.match(html,/rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png/);
 assert.match(html,/name="apple-mobile-web-app-title" content="BABY MARK"/);
 assert.match(html,/name="theme-color" content="#D2282F"/);
 const sw=(await read('public/sw.js')).toString();assert.match(sw,/favicon-192x192\.png/);
 const native=JSON.parse(await read('apps/mobile/app.json')).expo;
 assert.deepEqual(dims(await read('apps/mobile/'+native.icon.replace('./',''))),[1024,1024]);
 assert.equal(native.android.adaptiveIcon.backgroundColor,'#FFFFFF');
 assert.deepEqual(dims(await read('apps/mobile/'+native.android.adaptiveIcon.foregroundImage.replace('./',''))),[432,432]);
});
test('future Timemark uses the transparent official-logo derivative without altering layout',async()=>{
 const b=await read('public/brand/timemark.png');
 for(const p of ['public/timemark-layout.mjs','docs/assets/timemark-layout.mjs']){
  const s=(await read(p)).toString(),encoded=s.match(/const logo='data:image\/png;base64,([^']+)'/)[1];
  assert.deepEqual(Buffer.from(encoded,'base64'),b);
 }
});
