import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';

// SQLite integration adapter. Executes real migrations, bindings, constraints
// and triggers. It does not emulate workerd timing or KV consistency.
export async function createD1({migrate=true}={}){
 const sqlite=new DatabaseSync(':memory:');
 if(migrate){
  const directory=new URL('../../d1/',import.meta.url);
  for(const file of (await readdir(directory)).filter(name=>name.endsWith('.sql')).sort())sqlite.exec(await readFile(new URL(file,directory),'utf8'));
 }
 const prepare=(sql,values=[])=>({
  bind(...bound){return prepare(sql,bound)},
  async first(column){const row=sqlite.prepare(sql).get(...values);return row?(column===undefined?row:row[column]):null},
  async all(){return {success:true,results:sqlite.prepare(sql).all(...values)}},
  async run(){const result=sqlite.prepare(sql).run(...values);return {success:true,meta:{changes:result.changes}}},
  async raw(){return sqlite.prepare(sql).all(...values).map(row=>Object.values(row))},
  _sql:sql,_values:values
 });
 return {sqlite,prepare,close:()=>sqlite.close(),async exec(sql){sqlite.exec(sql);return {count:0,duration:0}},async batch(statements){
  sqlite.exec('BEGIN');
  try{
   const result=statements.map(statement=>({success:true,results:sqlite.prepare(statement._sql).all(...statement._values),meta:{changes:sqlite.prepare('SELECT changes() AS n').get().n}}));
   sqlite.exec('COMMIT');return result;
  }catch(error){sqlite.exec('ROLLBACK');throw error}
 }};
}
