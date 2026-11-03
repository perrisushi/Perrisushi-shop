import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../sql/administracion/01-verificar-perrisushi-solo-lectura.sql',import.meta.url),'utf8');
async function fixture(withId=false){
 const db=new PGlite();
 await db.exec(`CREATE TABLE shop_players(nick text PRIMARY KEY,active boolean NOT NULL DEFAULT true${withId?',id uuid UNIQUE NOT NULL':''});CREATE TABLE shop_access(nick text PRIMARY KEY REFERENCES shop_players(nick),active boolean DEFAULT true,is_admin boolean DEFAULT false,code_hash text);`);
 return db;
}
async function diagnostic(db){
 const results=await db.exec(sql);
 return results.find(r=>r.rows?.[0]?.admin_identity_diagnostic)?.rows[0].admin_identity_diagnostic;
}
test('diagnóstico: cuenta exacta e identificador único sin filtrar secretos ni conceder rol',async()=>{
 const db=await fixture(true);
 try{
 await db.exec("INSERT INTO shop_players(nick,id) VALUES('Perrisushi','11111111-1111-4111-8111-111111111111');INSERT INTO shop_access(nick,code_hash) VALUES('Perrisushi','SECRETO_NO_EXPORTAR');");
 const d=await diagnostic(db);
 assert.equal(d.identity_check,'exact_account_unique_review_identifier');
 assert.equal(d.assignment_performed,false);
 assert.equal(d.accounts.find(a=>a.source==='shop_players').identifier_candidates.id,'11111111-1111-4111-8111-111111111111');
 assert.ok(d.constraints.some(k=>k.definition.includes('UNIQUE (id)')));
 assert.ok(!JSON.stringify(d).includes('SECRETO_NO_EXPORTAR'));
 assert.deepEqual((await db.query('SELECT nick,is_admin FROM shop_access')).rows,[{nick:'Perrisushi',is_admin:false}]);
 }finally{await db.close()}
});
test('diagnóstico: detiene variantes con mayúsculas y espacios sin escoger por aproximación',async()=>{
 const db=await fixture();
 try{
 await db.exec("INSERT INTO shop_players(nick) VALUES('Perrisushi'),(' perrisushi ');INSERT INTO shop_access(nick) VALUES('Perrisushi'),(' perrisushi ');");
 const d=await diagnostic(db);assert.equal(d.identity_check,'STOP_missing_or_ambiguous_account');assert.equal(d.counts.normalized_players,2);assert.equal(d.counts.normalized_access,2);
 }finally{await db.close()}
});
test('diagnóstico: una cuenta parecida no sustituye al nick exacto solicitado',async()=>{
 const db=await fixture();
 try{
 await db.exec("INSERT INTO shop_players(nick) VALUES('perrisushi');INSERT INTO shop_access(nick) VALUES('perrisushi');");
 const d=await diagnostic(db);assert.equal(d.identity_check,'STOP_missing_or_ambiguous_account');assert.equal(d.counts.exact_players,0);assert.equal(d.accounts[0].exact_match,false);
 }finally{await db.close()}
});
test('diagnóstico: nick como clave no se presenta como identificador interno y conserva roles existentes',async()=>{
 const db=await fixture();
 try{
 await db.exec("INSERT INTO shop_players(nick) VALUES('Perrisushi'),('Otro');INSERT INTO shop_access(nick,is_admin) VALUES('Perrisushi',false),('Otro',true);");
 const d=await diagnostic(db);assert.ok(d.accounts.every(a=>Object.keys(a.identifier_candidates).length===0));assert.deepEqual(d.legacy_admin_accounts,['Otro']);
 assert.deepEqual((await db.query('SELECT nick,is_admin FROM shop_access ORDER BY nick')).rows,[{nick:'Otro',is_admin:true},{nick:'Perrisushi',is_admin:false}]);
 }finally{await db.close()}
});
test('diagnóstico: ejecución PostgreSQL en transacción de solo lectura',async()=>{
 assert.match(sql,/BEGIN TRANSACTION READ ONLY/);assert.match(sql,/ROLLBACK;/);
 const db=await fixture();try{const d=await diagnostic(db);assert.equal(d.identity_check,'STOP_missing_or_ambiguous_account');assert.deepEqual(d.accounts,[])}finally{await db.close()}
});
