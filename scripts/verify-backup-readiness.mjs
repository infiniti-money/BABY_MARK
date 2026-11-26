// Read-only offline verification. No Cloudflare access; never prints record values.
import {DatabaseSync} from 'node:sqlite';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyBackup,sha256} from './backup-local.mjs';
import {schemaReadiness} from '../cloudflare/lib/schema-readiness.mjs';
export async function verifyReadiness(directory){
 const manifest=await verifyBackup(directory),path=join(resolve(directory),'database.sqlite'),db=new DatabaseSync(path,{readOnly:true});
 try{
  const integrity=db.prepare('PRAGMA integrity_check').all();
  if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok')throw Error('Full integrity check failed');
  const adapter={prepare(sql){return {async all(){return {results:db.prepare(sql).all()}}}}};
  const schema=await schemaReadiness(adapter);
  const missing=schema.migrations.filter(m=>m.status==='missing').map(m=>({id:m.id,missing:m.missing}));
  if(await sha256(path)!==manifest.sha256)throw Error('Backup changed during verification');
  return {verified:true,full_integrity:true,foreign_keys:true,schema_target:schema.target,schema_ready:schema.ready,missing,optional_missing:schema.migrations.filter(m=>m.status==='optional_missing').map(m=>m.id),kv_verified:false,production_restore_verified:false,scope:'local offline snapshot only'};
 }finally{db.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv.length!==3)throw Error('Usage: node scripts/verify-backup-readiness.mjs BACKUP_DIR');const result=await verifyReadiness(process.argv[2]);console.log(JSON.stringify(result,null,2));if(!result.schema_ready)process.exitCode=1}
 catch(e){console.error(e.message);process.exitCode=1}
}
