import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pairs,validateSchema,inspectSchema,buildReadOnlyDataSql,assertPrivateOutput} from '../tools/prepare-account-merge.mjs';
import {proposal,sumCounter,unionUnique} from '../tools/account-merge-report.mjs';
async function fixture(){
 const db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role');
 await db.exec((await readFile('tests/fixtures/game-schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(await readFile('tests/fixtures/game-rpg.sql','utf8'));
 await db.exec(await readFile('tests/fixtures/game-pet.sql','utf8'));
 for(const p of pairs)for(const nick of [p.keep,p.remove]){
  await db.query('INSERT INTO shop_players(nick) VALUES($1)',[nick]);
  await db.query('INSERT INTO shop_access(nick,code_hash) VALUES($1,$2)',[nick,'a'.repeat(64)]);
  await db.query('INSERT INTO shop_inventories(nick,pc,monedas) VALUES($1,$2,$3)',[nick,nick===p.keep?100:7,3]);
  await db.query("INSERT INTO shop_profiles(nick,owned_logo_ids) VALUES($1,'[\"logo-pelusa-1\"]')",[nick]);
 }
 const schema=async()=>(await db.query(await readFile('sql/fusion-usuarios/01-diagnostico-solo-lectura.sql','utf8'))).rows[0].diagnostic;
 const data=async meta=>{
  const statements=await buildReadOnlyDataSql(meta);
  const result=await db.exec(statements);
  return result.find(r=>r.rows?.[0]?.merge_data)?.rows[0].merge_data;
 };
 return {db,schema,data};
}
test('Fusión: diagnóstico real de PostgreSQL detecta las tres parejas exactas y CASCADE sin escribir',async()=>{
 const f=await fixture();try{
  const before=(await f.db.query('SELECT * FROM shop_players ORDER BY nick')).rows;
  const metadata=await f.schema();assert.equal(validateSchema(metadata).duplicates.length,3);
  assert.ok(inspectSchema(metadata).cascades.some(f=>f.table_name==='shop_inventories'));
  assert.deepEqual((await f.db.query('SELECT * FROM shop_players ORDER BY nick')).rows,before);
  assert.ok(!JSON.stringify(metadata).includes('a'.repeat(64)));
 }finally{await f.db.close()}
});
test('Fusión: consulta generada es de lectura, conserva precisión y no exporta hashes/tokens/claves',async()=>{
 const f=await fixture();try{
  await f.db.query("INSERT INTO shop_sessions(token,nick,expires_at) VALUES('SECRET_SESSION',$1,now()+interval '1 hour')",[pairs[0].keep]);
  await f.db.query("INSERT INTO shop_random_key_claims(id,nick,game,key) VALUES(gen_random_uuid(),$1,'Game','SECRET_GAME_KEY')",[pairs[0].keep]);
  const metadata=await f.schema(),data=await f.data(metadata),json=JSON.stringify(data);
  assert.ok(!json.includes('SECRET_SESSION'));assert.ok(!json.includes('SECRET_GAME_KEY'));assert.ok(!json.includes('a'.repeat(64)));
  assert.equal(data.tables.find(t=>t.table==='shop_inventories').rows[0].pc,'100');
  assert.equal(data.tables.find(t=>t.table==='shop_access').rows[0].traditional_password_present,true);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM shop_players')).rows[0].n,6);
 }finally{await f.db.close()}
});
test('Fusión: informe suma recursos una vez y mantiene las uniones de cosméticos',async()=>{
 const f=await fixture();try{
  await f.db.query("UPDATE shop_profiles SET owned_logo_ids='[\"logo-pelusa-1\",\"logo-buho-1\"]' WHERE nick=$1",[pairs[0].remove]);
  const report=proposal(await f.data(await f.schema()));
  assert.equal(report.pairs[0].inventory.afterProposed.pc,'107');
  assert.equal(report.pairs[0].inventory.afterProposed.monedas,'6');
  assert.deepEqual(report.pairs[0].profileUnionProposed.owned_logo_ids,['logo-pelusa-1','logo-buho-1']);
  assert.equal(report.status,'NOT_AUTHORIZED_FOR_EXECUTION');
 }finally{await f.db.close()}
});
test('Fusión: tabla nueva, referencia sin FK y columna cuantitativa desconocida quedan señaladas',async()=>{
 const f=await fixture();try{
  await f.db.exec('CREATE TABLE extra_progress(id integer PRIMARY KEY,owner_ref text REFERENCES shop_players(nick) ON DELETE CASCADE,quantity bigint,secret_token text);CREATE TABLE soft_reference(id integer PRIMARY KEY,account_text text);ALTER TABLE shop_inventories ADD COLUMN unknown_resource integer NOT NULL DEFAULT 9');
  await f.db.query("INSERT INTO extra_progress VALUES(1,$1,100,'SECRET_VALUE')",[pairs[0].remove]);
  await f.db.query('INSERT INTO soft_reference VALUES(1,$1)',[pairs[0].keep]);
  const metadata=await f.schema(),data=await f.data(metadata),report=proposal(data);
  assert.ok(data.tables.some(t=>t.table==='soft_reference'&&t.rows.length===1));
  assert.ok(report.conflicts.some(c=>c.table==='public.extra_progress'));
  assert.ok(report.conflicts.some(c=>c.table==='public.soft_reference'));
  assert.ok(report.conflicts.some(c=>c.column==='unknown_resource'));
  assert.ok(!JSON.stringify(data).includes('SECRET_VALUE'));
 }finally{await f.db.close()}
});
test('Fusión: niveles, tableros, combates y recursos espejo de Pet nunca se suman a ciegas',async()=>{
 const f=await fixture();try{
  for(const [i,nick]of [pairs[0].keep,pairs[0].remove].entries()){
   await f.db.query("INSERT INTO shop_perripet_states(nick,pet_state) VALUES($1,$2)",[nick,JSON.stringify({level:i+2,normalFood:8})]);
   await f.db.query("INSERT INTO perri_casillas_games(nick,round_id,cells) VALUES($1,$2,'[]')",[nick,'round-'+i]);
   await f.db.query('INSERT INTO shop_rpg_combat_state(nick,round_number) VALUES($1,$2)',[nick,i+1]);
  }
  const report=proposal(await f.data(await f.schema()));
  for(const table of ['shop_perripet_states','perri_casillas_games','shop_rpg_combat_state'])assert.ok(report.conflicts.some(c=>c.table===table));
 }finally{await f.db.close()}
});
test('Fusión: detección de almacenamiento antiguo Pet, restricciones de objetos y cambios de esquema',async()=>{
 const f=await fixture();try{
  await f.db.query("INSERT INTO shop_operations(operation_id,action,nick,response) VALUES('legacy-pet','perripet_state',$1,'{\"snapshot\":{\"pet\":{\"level\":3}},\"key\":\"SECRET_RECEIPT_KEY\"}')",[pairs[0].remove]);
  const metadata=await f.schema(),data=await f.data(metadata),report=proposal(data);
  assert.ok(report.conflicts.some(c=>c.table==='shop_operations'));
  assert.ok(!JSON.stringify(data).includes('SECRET_RECEIPT_KEY'));
  data.diagnostic.catalog_fingerprint='changed';assert.throws(()=>proposal(data),/esquema cambió/);
 }finally{await f.db.close()}
});
test('Fusión: precisión bigint, desbordamiento, objetos únicos y contenidos incompatibles',()=>{
 assert.throws(()=>assertPrivateOutput('docs/export.json'),/private-merge/);
 assert.ok(assertPrivateOutput('private-merge/export.json').includes('private-merge'));
 assert.equal(sumCounter('9007199254740993','2','bigint'),'9007199254740995');
 assert.throws(()=>sumCounter('2147483647','1','integer'),/desbordamiento/);
 assert.throws(()=>sumCounter('-1','5'),/negativo/);
 assert.throws(()=>sumCounter(9007199254740992,1,'bigint'),/impreciso/);
 assert.deepEqual(unionUnique(['a','b'],['b','c']),['a','b','c']);
 assert.throws(()=>unionUnique([{id:'same',level:1}],[{id:'same',level:2}]),/incompatibles/);
});
test('Fusión: nicks inesperados y RLS sin visibilidad completa bloquean la preparación',async()=>{
 const f=await fixture();try{
  const metadata=await f.schema();
  metadata.operator.superuser=false;metadata.operator.bypass_rls=false;
  assert.throws(()=>validateSchema(metadata),/visibilidad/);
  metadata.operator.superuser=true;metadata.duplicates[0].nicks.push('OTRO');
  assert.throws(()=>validateSchema(metadata),/pareja aprobada/);
 }finally{await f.db.close()}
});
test('Fusión: restricción futura se cancela si quedan duplicados y luego impide variantes nuevas',async()=>{
 const f=await fixture();try{
  const sql=await readFile('sql/fusion-usuarios/03-prevenir-duplicados-despues.sql','utf8');
  await assert.rejects(f.db.exec(sql),/duplicados/);await f.db.exec('ROLLBACK');
  assert.equal((await f.db.query("SELECT to_regclass('pw2_shop_players_normalized_nick_uq') name")).rows[0].name,null);
  // SOLO preparación de fixtures para comprobar el índice, no simulación de fusión.
  for(const p of pairs)await f.db.query('DELETE FROM shop_players WHERE nick=$1',[p.remove]);
  await f.db.exec(sql);
  await assert.rejects(f.db.query("INSERT INTO shop_players(nick) VALUES(' ISOLDEQUEEN ')"),e=>e.code==='23505');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM shop_players')).rows[0].n,3);
 }finally{await f.db.close()}
});

test('Fusión: sigue referencias indirectas de varias generaciones y omite defaults de credenciales',async()=>{
 const f=await fixture();try{
  await f.db.exec("ALTER TABLE shop_access ALTER COLUMN code_hash SET DEFAULT '"+'b'.repeat(64)+"'; CREATE TABLE chain_parent(id integer PRIMARY KEY,owner_nick text REFERENCES shop_players(nick));CREATE TABLE chain_child(id integer PRIMARY KEY,parent_id integer REFERENCES chain_parent(id));CREATE TABLE chain_grandchild(id integer PRIMARY KEY,parent_id integer REFERENCES chain_child(id))");
  await f.db.query("INSERT INTO chain_parent VALUES(1,$1)",[pairs[0].remove]);
  await f.db.exec('INSERT INTO chain_child VALUES(2,1);INSERT INTO chain_grandchild VALUES(3,2)');
  const schema=await f.schema();assert.ok(!JSON.stringify(schema).includes('b'.repeat(64)));
  const data=await f.data(schema);
  for(const name of ['chain_parent','chain_child','chain_grandchild'])assert.equal(data.tables.find(t=>t.table===name).rows.length,1);
 }finally{await f.db.close()}
});

test('Fusión: tickets caducados no se vuelven válidos ni se suman otra vez al contador',async()=>{
 const f=await fixture();try{
  await f.db.query("INSERT INTO shop_random_key_tickets(id,nick,status,obtained_at,expires_at) VALUES(gen_random_uuid(),$1,'Activa',now(),now()+interval '1 day'),(gen_random_uuid(),$2,'Activa',now()-interval '2 days',now()-interval '1 day')",[pairs[0].keep,pairs[0].remove]);
  const report=proposal(await f.data(await f.schema()));
  const validity=report.pairs[0].randomKeyTicketValidity;
  assert.equal(validity[pairs[0].keep].activeAndUnexpired,1);
  assert.equal(validity[pairs[0].remove].activeAndUnexpired,0);
  assert.equal(validity[pairs[0].remove].expired,1);
  assert.equal(report.pairs[0].inventory.afterProposed.random_key,'0');
 }finally{await f.db.close()}
});

test('Fusión: CSV Supabase y nicks corregidos se leen sin aceptar las parejas antiguas',async()=>{
 const {parseExport}=await import('../tools/prepare-account-merge.mjs');
 const f=await fixture();try{
  const meta=await f.schema(),text=JSON.stringify(meta);
  const csv='\uFEFFdiagnostic\r\n"'+text.replaceAll('"','""')+'"\r\n';
  assert.deepEqual(parseExport(csv),meta);
  assert.deepEqual(pairs,[{keep:'Isoldequeen',remove:'isoldequeen'},{keep:'Kazzialtime',remove:'KazzialTime'},{keep:'Sr_vic_',remove:'Sr_Vic_'}]);
  const wrong=structuredClone(meta);
  wrong.duplicates.find(g=>g.normalized_nick==='kazzialtime').nicks=['Kazzialtime','kazzialtime'];
  assert.throws(()=>validateSchema(wrong),/pareja aprobada/);
  assert.throws(()=>parseExport('diagnostic,other\n"{}",1'),/una fila y una columna/);
 }finally{await f.db.close()}
});
test('Fusión: estado Pet derivado del nick se detecta incluso con propietario incoherente',async()=>{
 const {legacyPetId}=await import('../tools/prepare-account-merge.mjs');
 const f=await fixture();try{
  await f.db.query("INSERT INTO shop_players(nick) VALUES('OtherLegacyOwner')");
  await f.db.query("INSERT INTO shop_operations(operation_id,action,nick,response) VALUES($1,'perripet_state','OtherLegacyOwner','{\"snapshot\":{\"pet\":{\"level\":7}}}')",[legacyPetId(pairs[1].keep)]);
  const report=proposal(await f.data(await f.schema()));
  assert.ok(report.conflicts.some(c=>c.pair===pairs[1].keep&&c.table==='shop_operations'&&c.ownerMismatch));
 }finally{await f.db.close()}
});
test('Fusión: consulta final se ejecuta sobre las 30 tablas del contrato real sin escribir',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role');
  await db.exec(await readFile('tests/fixtures/account-merge-real-structure.sql','utf8'));
  for(const p of pairs)for(const nick of [p.keep,p.remove]){
   await db.query('INSERT INTO shop_players(nick) VALUES($1)',[nick]);
   await db.query('INSERT INTO shop_access(nick,code_hash,is_admin) VALUES($1,$2,$3)',[nick,'c'.repeat(64),nick===pairs[0].remove]);
   await db.query('INSERT INTO shop_inventories(nick,pc,monedas) VALUES($1,$2,$3)',[nick,nick===p.keep?100:7,3]);
   await db.query('INSERT INTO shop_profiles(nick) VALUES($1)',[nick]);
  }
  await db.query("INSERT INTO shop_random_key_claims(id,nick,game,key) VALUES(gen_random_uuid(),$1,'RepeatedGame','SECRET_DUPLICATE_KEY'),(gen_random_uuid(),$2,'RepeatedGame','SECRET_DUPLICATE_KEY')",[pairs[0].keep,pairs[0].remove]);
  await db.exec("CREATE FUNCTION public.shop_notify_monedas_delta() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SECRET_FUNCTION_BODY'; RETURN NEW; END $$;CREATE TRIGGER test_readonly AFTER UPDATE ON shop_inventories FOR EACH ROW EXECUTE FUNCTION shop_notify_monedas_delta()");
  const before=(await db.query('SELECT * FROM shop_inventories ORDER BY nick')).rows;
  const prepared=await readFile('sql/fusion-usuarios/02-recursos-y-conflictos-solo-lectura.sql','utf8');
  const actual=(await db.query(prepared)).rows[0].merge_data;
  assert.equal(actual.tables.filter(t=>!t.catalog).length,30);
  assert.equal(actual.integrity_review.resources[0].resources.pc.after_proposed,'107');
  assert.equal(actual.integrity_review.duplicate_key_groups.length,1);
  assert.equal(actual.trigger_review.length,1);
  assert.ok(!JSON.stringify(actual).includes('SECRET_FUNCTION_BODY'));
  assert.ok(!JSON.stringify(actual).includes('SECRET_DUPLICATE_KEY'));
  assert.ok(!JSON.stringify(actual).includes('c'.repeat(64)));
  assert.deepEqual((await db.query('SELECT * FROM shop_inventories ORDER BY nick')).rows,before);
  // Un esquema distinto del recibido de producción nunca se acepta para fusionar.
  assert.throws(()=>proposal(actual),/esquema cambió/);
  const localMeta=(await db.query(await readFile('sql/fusion-usuarios/01-diagnostico-solo-lectura.sql','utf8'))).rows[0].diagnostic;
  const localResults=await db.exec(await buildReadOnlyDataSql(localMeta));
  const localData=localResults.find(r=>r.rows?.[0]?.merge_data)?.rows[0].merge_data;
  const report=proposal(localData);
  assert.ok(report.conflicts.some(c=>c.column==='is_admin'));
  assert.ok(report.conflicts.some(c=>c.reason.includes('claves de juegos')));
  assert.equal(report.status,'NOT_AUTHORIZED_FOR_EXECUTION');
 }finally{await db.close()}
});
