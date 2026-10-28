import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
async function db(){const pg=new PGlite();await pg.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE shop_access(nick text primary key,active boolean);
 CREATE TABLE shop_players(nick text primary key,active boolean);
 CREATE TABLE shop_inventories(nick text primary key,pc integer,random_key integer,boleto_sorteo2 integer,monedas integer,updated_at timestamptz);
 CREATE TABLE shop_public_users(nick text primary key,pc integer,updated_at timestamptz);
 CREATE TABLE shop_activity(id bigint generated always as identity primary key,nick text,game text,result text,details text,created_at timestamptz);
 CREATE TABLE shop_operations(operation_id text primary key,nick text,action text,response jsonb,created_at timestamptz);
 CREATE TABLE shop_random_key_tickets(id uuid primary key,nick text,status text,obtained_at timestamptz,expires_at timestamptz,updated_at timestamptz);
 CREATE TABLE shop_random_key_pool(id bigint generated always as identity primary key,game text,key text,status text,assigned_to text,delivered_at timestamptz);
 CREATE TABLE shop_random_key_claims(id uuid primary key,nick text,game text,key text,claimed_at timestamptz);
 INSERT INTO shop_access VALUES('A',true),('B',true); INSERT INTO shop_players SELECT * FROM shop_access;
 INSERT INTO shop_inventories VALUES('A',10000,2,0,9,now()),('B',10000,2,0,8,now());
 INSERT INTO shop_public_users SELECT nick,pc,now() FROM shop_inventories;
 INSERT INTO shop_random_key_tickets VALUES(gen_random_uuid(),'A','Activa',now(),now()+interval '1 day',now()),(gen_random_uuid(),'A','Activa',now(),now()+interval '1 day',now()),(gen_random_uuid(),'B','Activa',now(),now()+interval '1 day',now());
 INSERT INTO shop_random_key_pool(game,key,status) VALUES('Game','UNIQUE-KEY','Disponible'),('Game','UNIQUE-KEY','Disponible'),('Other','OTHER-KEY','Disponible');
 `);await pg.exec(await readFile('sql/001-economia-atomica.sql','utf8'));return pg}
const run=async(pg,{nick='A',id=randomUUID(),action='raffle-buy',price=3500,max=3}={})=>(await pg.query('select pw2_economy_operation($1,$2,$3,$4,$5) as result',[nick,id,action,price,max])).rows[0].result;
const inv=async(pg,nick='A')=>(await pg.query('select * from shop_inventories where nick=$1',[nick])).rows[0];
test('SQL real PostgreSQL: compra repetida y simultánea cobra una sola vez',async()=>{const pg=await db();try{
 const id=randomUUID(),results=await Promise.all(Array.from({length:10},()=>run(pg,{id})));
 assert.ok(results.every(r=>r.pc===6500&&r.tickets===1));assert.equal((await inv(pg)).pc,6500);assert.equal((await inv(pg)).monedas,9);
 assert.equal((await pg.query('select count(*)::int as n from shop_operations')).rows[0].n,1);
}finally{await pg.close()}});
test('SQL: saldo, límite, política y estado de cuenta se validan sin cobro parcial',async()=>{const pg=await db();try{
 await run(pg);await run(pg);await assert.rejects(run(pg),/insufficient_balance/);
 assert.equal((await inv(pg)).pc,3000);await assert.rejects(run(pg,{nick:'B',price:0}),/raffle_policy_missing/);
 await pg.exec("update shop_inventories set boleto_sorteo2=3 where nick='B'");await assert.rejects(run(pg,{nick:'B'}),/ticket_limit/);
 await pg.exec("update shop_access set active=false where nick='B'");await assert.rejects(run(pg,{nick:'B'}),/account_inactive/);
}finally{await pg.close()}});
test('SQL: operation_id vinculado a identidad, acción y política',async()=>{const pg=await db();try{
 const id=randomUUID();await run(pg,{id});await assert.rejects(run(pg,{id,nick:'B'}),/operation_conflict/);
 await assert.rejects(run(pg,{id,price:1}),/operation_conflict/);
 await assert.rejects(run(pg,{id,action:'random-redeem',price:null,max:null}),/operation_conflict/);
 assert.equal((await inv(pg,'B')).pc,10000);
}finally{await pg.close()}});
test('SQL: canje repetido, claves duplicadas del pool y consumo único',async()=>{const pg=await db();try{
 const id=randomUUID(),a=await run(pg,{id,action:'random-redeem',price:null,max:null});
 assert.deepEqual(await run(pg,{id,action:'random-redeem',price:null,max:null}),a);
 await run(pg,{nick:'B',action:'random-redeem',price:null,max:null});
 const claims=(await pg.query('select key from shop_random_key_claims')).rows;assert.equal(claims.length,2);assert.equal(new Set(claims.map(c=>c.key)).size,2);
 assert.equal((await inv(pg)).random_key,1);assert.equal((await inv(pg,'B')).random_key,1);
 assert.equal((await pg.query("select count(*)::int n from shop_random_key_tickets where status='Canjeada'")).rows[0].n,2);
}finally{await pg.close()}});
test('SQL: fallo al registrar la operación revierte saldo, ticket, clave, premio e historial',async()=>{const pg=await db();try{
 await pg.exec("create function fail_operation() returns trigger language plpgsql as $$ begin raise exception 'injected_failure'; end $$; create trigger fail before insert on shop_operations for each row execute function fail_operation();");
 for(const action of ['raffle-buy','random-redeem'])await assert.rejects(run(pg,{action,...(action==='random-redeem'?{price:null,max:null}:{})}),/injected_failure/);
 const i=await inv(pg);assert.equal(i.pc,10000);assert.equal(i.random_key,2);assert.equal(i.boleto_sorteo2,0);
 assert.equal((await pg.query('select count(*)::int n from shop_random_key_claims')).rows[0].n,0);assert.equal((await pg.query('select count(*)::int n from shop_activity')).rows[0].n,0);
 assert.equal((await pg.query("select count(*)::int n from shop_random_key_pool where status='Disponible'")).rows[0].n,3);
}finally{await pg.close()}});
test('SQL: sin ticket válido o stock no consume recursos; funciones no públicas',async()=>{const pg=await db();try{
 await pg.exec("update shop_random_key_tickets set expires_at=now()-interval '1 day' where nick='A'");
 await assert.rejects(run(pg,{action:'random-redeem',price:null,max:null}),/no_active_ticket/);assert.equal((await inv(pg)).random_key,2);
 await pg.exec("delete from shop_random_key_pool");await assert.rejects(run(pg,{nick:'B',action:'random-redeem',price:null,max:null}),/no_stock/);
 await pg.exec('set role authenticated');await assert.rejects(pg.query('select pw2_economy_status()'),/permission denied/);
}finally{await pg.close()}});
test('SQL: variantes de mayúsculas y espacios del mismo código no generan dos premios',async()=>{const pg=await db();try{
 await pg.exec("delete from shop_random_key_pool;insert into shop_random_key_pool(game,key,status) values('Game',' ABC-DEF ','Disponible'),('Game','abc-def','Disponible')");
 await run(pg,{action:'random-redeem',price:null,max:null});
 await assert.rejects(run(pg,{nick:'B',action:'random-redeem',price:null,max:null}),/no_stock/);
 assert.equal((await inv(pg,'B')).random_key,2);assert.equal((await pg.query('select count(*)::int n from shop_random_key_claims')).rows[0].n,1);
}finally{await pg.close()}});
