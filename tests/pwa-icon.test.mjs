import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('home screen uses original BABY MARK logo with accurate size and short name',async()=>{
 const read=p=>readFile(new URL('../public/'+p,import.meta.url));
 const original=await read('brand/logo.png'),icon=await read('apple-touch-icon.png');
 assert.deepEqual(icon,original);
 assert.equal(icon.readUInt32BE(16),288);assert.equal(icon.readUInt32BE(20),288);
 const m=JSON.parse(await read('manifest.webmanifest'));
 assert.equal(m.short_name,'BABY MARK');assert.equal(m.start_url,'/');
 assert.equal(m.icons[0].src.split('?')[0],'/apple-touch-icon.png');assert.equal(m.icons[0].sizes,'288x288');
 const html=(await read('index.html')).toString();
 assert.match(html,/rel="apple-touch-icon" sizes="288x288" href="\/apple-touch-icon\.png/);
 assert.match(html,/name="apple-mobile-web-app-title" content="BABY MARK"/);
});
