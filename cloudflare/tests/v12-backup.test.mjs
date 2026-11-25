import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {appFixture} from './helpers/app.mjs';
import {createBackup,verifyBackup,restoreRehearsal,sha256} from '../../scripts/backup-local.mjs';
test('offline backup and isolated restore preserve identities, counts and source; refuse overwrite and corrupt backup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'babymark-rehearsal-')),f=await appFixture();
 try{
  const source=join(root,'source.sqlite'),backup=join(root,'backup'),restored=join(root,'restore');
  f.db.sqlite.prepare('VACUUM INTO ?').run(source);
  const original=await sha256(source),manifest=await createBackup(source,backup);
  assert.equal(manifest.counts.profiles,4);assert.equal(manifest.counts.assignments,2);assert.equal(manifest.kv_included,false);
  assert.equal((await verifyBackup(backup)).sha256,manifest.sha256);
  const rehearsal=await restoreRehearsal(backup,restored);assert.equal(rehearsal.verified,true);
  const db=new DatabaseSync(join(restored,'rehearsal.sqlite'),{readOnly:true});try{
   assert.equal(db.prepare('SELECT username FROM credentials WHERE user_id=?').get(f.ids.staff).username,'test-staff');
   assert.equal(db.prepare('SELECT count(*) AS n FROM assignments').get().n,2);
  }finally{db.close()}
  await assert.rejects(createBackup(source,backup),/EEXIST/);
  await assert.rejects(restoreRehearsal(backup,restored),/EEXIST/);
  await appendFile(join(backup,'database.sqlite'),'corrupt');
  await assert.rejects(verifyBackup(backup),/checksum/);
  assert.equal(await sha256(source),original);
 }finally{f.close();await rm(root,{recursive:true,force:true})} // disposable fixtures only
});
