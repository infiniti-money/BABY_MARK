import {cp, mkdir, copyFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {optimizeStaticAssets} from './static-assets.mjs';
const root=resolve(import.meta.dirname,'..');
// Never publish stale files removed from public/ in a later build.
await rm(resolve(root,'dist'),{recursive:true,force:true});
await mkdir(resolve(root,'dist/assets'),{recursive:true});
await cp(resolve(root,'public'),resolve(root,'dist'),{recursive:true});
await copyFile(resolve(root,'docs/assets/timemark-layout.mjs'),resolve(root,'dist/assets/timemark-layout.mjs'));
await copyFile(resolve(root,'docs/assets/timemark-layout.mjs'),resolve(root,'dist/timemark-layout.mjs'));
const stats=await optimizeStaticAssets(resolve(root,'dist'));
console.log('P3 static asset build metrics: '+JSON.stringify(stats));
console.log('Cloudflare static application built in dist; no deployment performed.');
