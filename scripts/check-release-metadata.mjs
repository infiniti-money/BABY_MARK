// Fail closed if package, lock, runtime or application version drift.
// No registry access, credentials, deployment or data mutation.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {appVersion} from '../cloudflare/lib/app-version.mjs';
export function validateMetadata({pkg,lock,appVersion,nodePin,runtime,expected}){
 const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
 const root=lock.packages?.[''];
 assert(/^\d+\.\d+\.\d+$/.test(pkg.version),'Expected a stable semantic version');
 assert(lock.lockfileVersion===3&&root,'Expected npm v3 lockfile');
 assert([lock.version,root.version,appVersion,expected??pkg.version].every(v=>v===pkg.version),'Release version mismatch');
 assert(root.name===pkg.name&&lock.name===pkg.name,'Package name mismatch');
 assert(/^\d+\.\d+\.\d+$/.test(nodePin)&&runtime===nodePin,'Node runtime differs from .node-version');
 assert(root.engines?.node===pkg.engines?.node,'Node engine metadata mismatch');
 for(const key of ['dependencies','devDependencies','optionalDependencies']){
  const direct=pkg[key]||{},locked=root[key]||{};
  assert(JSON.stringify(Object.entries(direct).sort())===JSON.stringify(Object.entries(locked).sort()),key+' differ from lockfile');
  for(const [name,version] of Object.entries(direct)){
   assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version),'Unpinned direct dependency: '+name);
   const entry=lock.packages['node_modules/'+name];
   assert(entry?.version===version&&typeof entry.integrity==='string'&&entry.integrity.length>0,'Missing exact lock or integrity: '+name);
  }
 }
 return pkg.version;
}
export async function checkMetadata(expected){
 const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
 const [p,l,n]=await Promise.all([read('package.json'),read('package-lock.json'),read('.node-version')]);
 return validateMetadata({pkg:JSON.parse(p),lock:JSON.parse(l),appVersion,nodePin:n.trim(),runtime:process.versions.node,expected});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log('Verified release metadata: v'+await checkMetadata(process.argv[2]));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
