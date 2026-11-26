// Build-time only. Stable module URLs keep lazy imports and existing clients compatible.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {transform} from 'esbuild';
const bytes=s=>Buffer.byteLength(s);
export async function optimizeStaticAssets(root){
 const stats={js:{before:0,after:0,gzip_before:0,gzip_after:0,files:0},css:null};
 for(const file of (await readdir(root)).filter(x=>x.endsWith('.mjs')).sort()){
  const path=resolve(root,file),source=await readFile(path,'utf8');
  // No bundling, renaming exports or transpiling modern browser APIs.
  const {code}=await transform(source,{loader:'js',format:'esm',target:'esnext',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false,legalComments:'inline',sourcefile:file});
  stats.js.before+=bytes(source);stats.js.after+=bytes(code);stats.js.gzip_before+=gzipSync(source).length;stats.js.gzip_after+=gzipSync(code).length;stats.js.files++;
  await writeFile(path,code);
 }
 const index=resolve(root,'index.html'),html=await readFile(index,'utf8');
 // The application links plain CSS files consecutively. Preserve exact order
 // and source contents, and fail rather than change relative URL semantics.
 const tags=/<link rel="stylesheet" href="\/([^"?#/]+\.css)">/g,matches=[...html.matchAll(tags)];
 if(!matches.length)throw Error('No plain stylesheets found');
 const first=matches[0].index,last=matches.at(-1),end=last.index+last[0].length;
 if(html.slice(first,end).replace(tags,'').trim())throw Error('Stylesheets are not a contiguous group');
 const sheets=await Promise.all(matches.map(async m=>{
  const css=await readFile(resolve(root,m[1]),'utf8');
  if(/@(?:import|charset)\b/i.test(css))throw Error('CSS import/charset requires explicit build handling: '+m[1]);
  for(const u of css.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi))if(!/^(?:\/|data:|https?:|#)/i.test(u[1]))throw Error('Relative CSS URL requires explicit build handling: '+m[1]);
  return css;
 }));
 const combined=sheets.join('\n'),hash=createHash('sha256').update(combined).digest('hex').slice(0,32),url='/assets/immutable/style-'+hash+'.css';
 await mkdir(resolve(root,'assets/immutable'),{recursive:true});await writeFile(resolve(root,'.'+url),combined);
 await writeFile(index,html.slice(0,first)+'<link rel="stylesheet" href="'+url+'">'+html.slice(end));
 stats.css={requests_before:matches.length,requests_after:1,bytes:bytes(combined),gzip_combined:gzipSync(combined).length,gzip_separate:sheets.reduce((n,s)=>n+gzipSync(s).length,0),url};
 return stats;
}
