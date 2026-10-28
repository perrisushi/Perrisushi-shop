import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createGames} from '../backend/games.mjs';
import {sessionKey} from '../backend/security.mjs';
import {createHash,randomUUID} from 'node:crypto';
import transport from '../backend/game-transport.cjs';
process.env.SUPABASE_URL='https://only-local.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='LOCAL-TEST-NOT-A-CREDENTIAL';
const {default:legacy}=await import('../backend/games-original.cjs');
async function fixture(){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;');
 await db.exec((await readFile('tests/fixtures/game-schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(await readFile('tests/fixtures/game-rpg.sql','utf8'));
 await db.exec(await readFile('tests/fixtures/game-pet.sql','utf8'));
 const user={nick:'LocalA',token:'x'.repeat(43)};
 await db.query("insert into shop_players(nick) values ('LocalA'),('LocalB')");
 await db.query("insert into shop_access(nick,code_hash,active) values('LocalA','test',true),('LocalB','test',true)");
 await db.query("insert into shop_inventories(nick,pc,monedas,polvo_gema,duelo) values('LocalA',10000,10,5000,5),('LocalB',10000,10,5000,5)");
 await db.query("insert into shop_profiles(nick,selected_logo_id,owned_logo_ids) values('LocalA','logo-buho-1','[\"logo-buho-1\"]')");
 await db.query('insert into shop_sessions(token,nick,expires_at) values($1,$2,now()+interval \'1 day\')',[sessionKey(user.token),user.nick]);
 const pool={connect:async()=>({query:(...args)=>db.query(...args),release:()=>{}})};
 return {db,user,games:createGames({pool,legacy,enabled:true})};
}
test('los recursos originales de los minijuegos conservan sus bytes y mecánicas',async()=>{
 const manifest=JSON.parse(await readFile('games/manifest.json','utf8'));assert.ok(manifest.files.length>300);
 for(const f of manifest.files)assert.equal(createHash('sha256').update(await readFile(f.path)).digest('hex'),f.sha256,f.path);
});
test('backend original conserva sus reglas: solo cambia transporte y exporta el validador existente',async()=>{
 const original=(await readFile('backend/games-original.cjs','utf8')).replace(/\r/g,'').replace("require('./game-transport.cjs').fetch(`${SUPABASE_URL}/rest/v1/${pathname}`","fetch(`${SUPABASE_URL}/rest/v1/${pathname}`").replace('  validateDuelTarget: readDuelTargetTokenPayload,\n','').trimEnd();
 assert.equal(createHash('sha256').update(original).digest('hex'),'637ad7a7754b70a0995c93c35dcb957ad103626daedb648777782d1c797374fe');
});
test('gateway de juegos bloquea admin, identidad inyectada y falta de configuración',async()=>{
 const disabled=createGames();await assert.rejects(disabled.execute({},{action:'adminSetInventory'}),e=>e.status===403);
 await assert.rejects(disabled.execute({},{action:'publicShopPerriPetState'}),e=>e.code==='games_not_configured');
 const games=createGames({pool:{},legacy,enabled:true});await assert.rejects(games.execute({nick:'A'},{action:'publicShopPerriPetState',nick:'B',idempotencyKey:randomUUID()}),e=>e.status===400);
 await assert.rejects(games.execute({nick:'A'},{action:'publicShopPerriPetState',idempotencyKey:[randomUUID()]}),e=>e.status===400);
});
test('minijuegos originales: estado de Pet, RPG, Casillas y Duelos con PostgreSQL local',async()=>{
 const f=await fixture();try{
  for(const action of ['publicShopPerriPetState','publicShopRpgState','publicShopGetPerriCasillas','publicShopGetDuelTarget']){
   const result=await f.games.execute(f.user,{action,idempotencyKey:randomUUID()});assert.equal(result.ok,true,action+': '+result.error);
   assert.ok(!JSON.stringify(result).includes(sessionKey(f.user.token)));
  }
 }finally{await f.db.close()}
});
test('Casillas conserva coste y premio: repetir operación no cobra dos veces',async()=>{
 const f=await fixture();try{
  await f.games.execute(f.user,{action:'publicShopGetPerriCasillas',idempotencyKey:randomUUID()});
  const id=randomUUID(),payload={action:'publicShopOpenPerriCasilla',cellIndex:0,openId:id,idempotencyKey:id};
  const first=await f.games.execute(f.user,payload);assert.equal(first.ok,true);
  const after=(await f.db.query("select monedas from shop_inventories where nick='LocalA'")).rows[0];
  assert.deepEqual(await f.games.execute(f.user,payload),first);
  assert.deepEqual((await f.db.query("select monedas from shop_inventories where nick='LocalA'")).rows[0],after);
  await assert.rejects(f.games.execute(f.user,{...payload,cellIndex:1}),e=>e.code==='operation_conflict');
 }finally{await f.db.close()}
});
test('fallo del juego revierte sus escrituras y no registra una recompensa incompleta',async()=>{
 const f=await fixture();try{
  const games=createGames({enabled:true,pool:{connect:async()=>({query:(...a)=>f.db.query(...a),release:()=>{}})},legacy:{handleShopAction:async()=>{
   await transport.fetch('https://local.invalid/rest/v1/shop_inventories?nick=eq.LocalA',{method:'PATCH',body:JSON.stringify({monedas:0})});return {ok:false,error:'injected_failure'};
  }}});
  const result=await games.execute(f.user,{action:'publicShopPerriPetState',idempotencyKey:randomUUID()});assert.equal(result.ok,false);
  assert.equal((await f.db.query("select monedas from shop_inventories where nick='LocalA'")).rows[0].monedas,10);
  assert.equal((await f.db.query('select count(*)::int n from shop_operations')).rows[0].n,0);
 }finally{await f.db.close()}
});
test('PerriPet guarda y reintenta su estado sin duplicar saldos compartidos',async()=>{
 const f=await fixture();try{
  const state=await f.games.execute(f.user,{action:'publicShopPerriPetState',idempotencyKey:randomUUID()});
  const snapshot=structuredClone(state.snapshot);snapshot.syncBase={revision:state.shared.revision,coins:state.shared.gems,perriCoins:state.shared.perriCoins,scrap:state.shared.scrap,perriPetInventory:state.shared.perriPetInventory,rpgInventory:state.shared.rpgInventory};
  const payload={action:'publicShopPerriPetSave',snapshot,idempotencyKey:randomUUID()};
  const first=await f.games.execute(f.user,structuredClone(payload));assert.equal(first.ok,true,JSON.stringify(first));
  const repeated=await f.games.execute(f.user,structuredClone(payload));assert.equal(repeated.ok,false);assert.equal(repeated.error,'perripet_state_conflict');
  const balance=(await f.db.query("select pc,polvo_gema from shop_inventories where nick='LocalA'")).rows[0];assert.deepEqual(balance,{pc:10000,polvo_gema:5000});
 }finally{await f.db.close()}
});
test('Duelos ejecuta su ataque original y el mismo resultado no consume dos duelos',async()=>{
 const f=await fixture();try{
  await f.db.exec("update shop_inventories set espada=1 where nick='LocalA'");
  const target=await f.games.execute(f.user,{action:'publicShopGetDuelTarget',idempotencyKey:randomUUID()});assert.equal(target.ok,true);
  const payload={action:'publicShopPerformAttack',targetToken:target.targetToken,idempotencyKey:randomUUID()};
  const first=await f.games.execute(f.user,payload);assert.equal(first.ok,true,JSON.stringify(first));
  const after=(await f.db.query("select duelo,pc,polvo_gema,monedas from shop_inventories where nick='LocalA'")).rows[0];
  assert.deepEqual(await f.games.execute(f.user,payload),first);
  assert.deepEqual((await f.db.query("select duelo,pc,polvo_gema,monedas from shop_inventories where nick='LocalA'")).rows[0],after);
  assert.ok(!Object.hasOwn(first.defenderInventory,'polvoGema'));
  await assert.rejects(f.games.execute({nick:'LocalB',token:f.user.token},{...payload,idempotencyKey:randomUUID()}),e=>e.status===403);
 }finally{await f.db.close()}
});
test('PerriRPG compra y consume un objeto original con saldo compartido e idempotencia',async()=>{
 const f=await fixture();try{
  await f.games.execute(f.user,{action:'publicShopRpgState',idempotencyKey:randomUUID()});
  const item=(await f.db.query("select item_id,price_pg from shop_rpg_catalog where kind='potion' and price_pg>0 order by price_pg,item_id limit 1")).rows[0];
  const payload={action:'publicShopRpgPurchase',itemId:item.item_id,quantity:1,idempotencyKey:randomUUID()};
  const bought=await f.games.execute(f.user,payload);assert.equal(bought.ok,true,JSON.stringify(bought));assert.deepEqual(await f.games.execute(f.user,payload),bought);assert.deepEqual(await f.games.execute(f.user,{...payload,idempotencyKey:payload.idempotencyKey.toUpperCase()}),bought);
  assert.equal((await f.db.query("select polvo_gema from shop_inventories where nick='LocalA'")).rows[0].polvo_gema,5000-item.price_pg);
  const use={action:'publicShopRpgConsume',itemId:item.item_id,idempotencyKey:randomUUID()};const consumed=await f.games.execute(f.user,use);assert.equal(consumed.ok,true,JSON.stringify(consumed));assert.deepEqual(await f.games.execute(f.user,use),consumed);
  assert.equal((await f.db.query("select quantity from shop_rpg_inventory where nick='LocalA' and item_id=$1",[item.item_id])).rows[0].quantity,0);
 }finally{await f.db.close()}
});
