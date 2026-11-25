// Offline SQLite files only. Never accesses Cloudflare, runs SQL imports, or overwrites a database.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,writeFile,readFile,stat,lstat,chmod,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function sha256(path){
 const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');
}
async function regular(path){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink())throw Error('Expected a regular local file');return s;}
export async function inspect(path){
 await regular(path);const db=new DatabaseSync(path,{readOnly:true});
 try{
  const integrity=db.prepare('PRAGMA quick_check').all();
  if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok')throw Error('SQLite integrity check failed');
  if(db.prepare('PRAGMA foreign_key_check').get())throw Error('SQLite foreign key check failed');
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  if(!['profiles','assignments','attendances','credentials'].every(n=>names.includes(n)))throw Error('Not a BABY MARK database');
  const counts=Object.fromEntries(names.map(n=>[n,db.prepare('SELECT count(*) AS n FROM "'+n.replaceAll('"','""')+'"').get().n]));
  return {counts};
 }finally{db.close()}
}
export async function createBackup(source,destination){
 source=resolve(source);destination=resolve(destination);
 await regular(source);
 await mkdir(destination,{mode:0o700}); // fail if destination already exists
 const out=join(destination,'database.sqlite');
 const db=new DatabaseSync(source,{readOnly:true});
 try{db.prepare('VACUUM INTO ?').run(out)}finally{db.close()}
 await chmod(out,0o600);
 const {counts}=await inspect(out);
 const manifest={format:'babymark-sqlite-v1',created_at:new Date().toISOString(),sha256:await sha256(out),bytes:(await stat(out)).size,counts,kv_included:false};
 await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
 return manifest;
}
export async function verifyBackup(directory){
 const manifestPath=join(resolve(directory),'manifest.json'),db=join(resolve(directory),'database.sqlite');
 if((await regular(manifestPath)).size>100000)throw Error('Manifest too large');
 const m=JSON.parse(await readFile(manifestPath,'utf8'));
 if(m.format!=='babymark-sqlite-v1'||!(/^[0-9a-f]{64}$/).test(m.sha256)||m.kv_included!==false)throw Error('Invalid manifest');
 if((await regular(db)).size!==m.bytes||await sha256(db)!==m.sha256)throw Error('Backup checksum mismatch');
 const inspected=await inspect(db);
 if(JSON.stringify(inspected.counts)!==JSON.stringify(m.counts))throw Error('Backup table counts mismatch');
 return m;
}
export async function restoreRehearsal(directory,destination){
 const m=await verifyBackup(directory);
 destination=resolve(destination);await mkdir(destination,{mode:0o700});
 const out=join(destination,'rehearsal.sqlite');
 await copyFile(join(resolve(directory),'database.sqlite'),out,constants.COPYFILE_EXCL);
 await chmod(out,0o600);
 if(await sha256(out)!==m.sha256)throw Error('Rehearsal checksum mismatch');
 const check=await inspect(out);
 if(JSON.stringify(check.counts)!==JSON.stringify(m.counts))throw Error('Rehearsal counts mismatch');
 return {verified:true,mode:'isolated_local_file',kv_included:false,sha256:m.sha256,counts:check.counts};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const [cmd,input,output,...extra]=process.argv.slice(2);
 try{
  if(extra.length||!input||(!['backup','rehearse'].includes(cmd)&&cmd!=='verify')||(cmd==='verify'?output!==undefined:!output))throw Error('Usage: backup-local.mjs backup SOURCE NEW_DIR | verify BACKUP_DIR | rehearse BACKUP_DIR NEW_DIR');
  const result=cmd==='backup'?await createBackup(input,output):cmd==='verify'?await verifyBackup(input):await restoreRehearsal(input,output);
  console.log(JSON.stringify(result,null,2));
 }catch(e){console.error('Offline operation failed:',e.message);process.exitCode=1}
}
