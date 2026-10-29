import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createGames} from '../backend/games.mjs';
import {sessionKey} from '../backend/security.mjs';
import {createHash,randomUUID} from 'node:crypto';
import transport from '../backend/game-transport.cjs';
import {gamesEnabled,inspectGameStorage} from '../backend/game-readiness.mjs';
import {checkGames} from '../scripts/check-games.mjs';
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
 return {db,user,pool,games:createGames({pool,legacy,enabled:true})};
}

test('arranque de juegos automático con conexión existente; apagado explícito conservado',()=>{
 assert.equal(gamesEnabled(undefined,true),true);assert.equal(gamesEnabled(undefined,false),false);assert.equal(gamesEnabled('false',true),false);assert.equal(gamesEnabled('true',false),true);assert.throws(()=>gamesEnabled('yes',true));
});

test('los límites SQL siguen activos en la transacción y no se filtran a la conexión reutilizada',async()=>{
 const f=await fixture();try{
  const before=await f.db.query("select current_setting('lock_timeout') lock,current_setting('statement_timeout') statement");
  const games=createGames({pool:f.pool,enabled:true,legacy:{handleShopAction:async()=>{const row=(await f.db.query("select current_setting('lock_timeout') lock,current_setting('statement_timeout') statement")).rows[0];assert.equal(row.lock,'5s');assert.equal(row.statement,'10s');return {ok:true}}}});
  assert.equal((await games.execute(f.user,{action:'publicShopRpgState',idempotencyKey:randomUUID()})).ok,true);
  assert.deepEqual((await f.db.query("select current_setting('lock_timeout') lock,current_setting('statement_timeout') statement")).rows,before.rows);
 }finally{await f.db.close()}
});

test('disponibilidad distingue desactivación, conexión ausente, proyecto distinto, sesión y errores sin revelar secretos',async()=>{
 assert.equal((await createGames().availability({})).reason,'games_disabled');
 assert.equal((await createGames({enabled:true,legacy}).availability({})).reason,'database_not_configured');
 assert.equal((await createGames({enabled:true,pool:{},legacy,sourceCompatible:false}).availability({})).reason,'database_project_mismatch');
 const events=[];const games=createGames({enabled:true,legacy,pool:{connect:async()=>{throw Object.assign(Error('postgres://user:SECRET@PRIVATE'),{code:'28P01'})}},onDiagnostic:e=>events.push(e)});
 assert.equal((await games.availability({nick:'PRIVATE',token:'x'.repeat(43)})).reason,'database_unavailable');
 assert.equal(events[0].failure,'28P01');assert.ok(!JSON.stringify(events).includes('PRIVATE'));assert.ok(!JSON.stringify(events).includes('SECRET'));
});

test('esquema original habilita los cuatro juegos; sesión ajena y permisos ausentes no se disimulan',async()=>{
 const f=await fixture();try{
  const status=await f.games.availability(f.user);assert.equal(status.available,true);assert.ok(Object.values(status.games).every(Boolean),JSON.stringify(status));
  assert.equal((await f.games.availability({...f.user,nick:'LocalB'})).reason,'session_not_shared');
  await f.db.exec('revoke execute on function shop_rpg_consume_item(text,text,integer) from public; create role limited_game; grant usage on schema public to limited_game; grant select on all tables in schema public to limited_game;set role limited_game;');
  const checked=await inspectGameStorage(f.db);assert.equal(checked.games.PerriRPG,false);assert.ok(checked.deniedFunctions.length>0);
  await f.db.exec('reset role');
 }finally{await f.db.close()}
});

test('comprobador de despliegue solo lectura no abre partidas ni crea datos',async()=>{
 const f=await fixture();try{
  const before=await f.db.query('select (select count(*) from shop_perripet_states)::int pet,(select count(*) from perri_casillas_games)::int casillas,(select count(*) from shop_operations)::int operations');
  const result=await checkGames({pool:f.pool,connections:{projectMatch:'same'}});assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual((await f.db.query('select (select count(*) from shop_perripet_states)::int pet,(select count(*) from perri_casillas_games)::int casillas,(select count(*) from shop_operations)::int operations')).rows,before.rows);
 }finally{await f.db.close()}
});

test('datos antiguos de Pet se recuperan sin crear cuentas ni perder el progreso al renovar la sesión',async()=>{
 const f=await fixture();try{
  const snapshot={version:1,pet:{name:'PROGRESO-ANTIGUO-A',stage:'adult1',hp:67,xp:345,normalFood:3,scrap:12},farm:{plots:[]},encounters:[]};
  const id='perripet-state-'+createHash('sha256').update('locala').digest('hex').slice(0,32);
  await f.db.query("insert into shop_operations(operation_id,action,nick,response) values($1,'perripet_state','LocalA',$2)",[id,JSON.stringify({snapshot})]);
  const before=(await f.db.query('select * from shop_players order by nick')).rows;
  const loaded=await f.games.execute(f.user,{action:'publicShopPerriPetState',idempotencyKey:randomUUID()});assert.equal(loaded.ok,true);assert.equal(loaded.snapshot.pet.name,'PROGRESO-ANTIGUO-A');assert.equal(loaded.snapshot.pet.hp,67);assert.equal(loaded.snapshot.pet.xp,345);
  await f.db.query('delete from shop_sessions where token=$1',[sessionKey(f.user.token)]);const renewed={nick:'LocalA',token:'z'.repeat(43)};
  await f.db.query("insert into shop_sessions(token,nick,expires_at) values($1,$2,now()+interval '1 day')",[sessionKey(renewed.token),renewed.nick]);
  const restarted=createGames({pool:f.pool,legacy,enabled:true});
  const restored=await restarted.execute(renewed,{action:'publicShopPerriPetState',idempotencyKey:randomUUID()});assert.equal(restored.snapshot.pet.name,'PROGRESO-ANTIGUO-A');assert.equal(restored.snapshot.pet.hp,67);
  const other={nick:'LocalB',token:'b'.repeat(43)};await f.db.query("insert into shop_sessions(token,nick,expires_at) values($1,$2,now()+interval '1 day')",[sessionKey(other.token),other.nick]);
  const isolated=await restarted.execute(other,{action:'publicShopPerriPetState',idempotencyKey:randomUUID()});assert.ok(!JSON.stringify(isolated).includes('PROGRESO-ANTIGUO-A'));
  assert.deepEqual((await f.db.query('select * from shop_players order by nick')).rows,before);
 }finally{await f.db.close()}
});

test('Pet y RPG comparten gemas e inventario; un guardado antiguo no restaura saldos ya gastados',async()=>{
 const f=await fixture();try{
  const state=await f.games.execute(f.user,{action:'publicShopPerriPetState',idempotencyKey:randomUUID()});
  const snapshot=structuredClone(state.snapshot);snapshot.syncBase={revision:state.shared.revision,coins:state.shared.gems,perriCoins:state.shared.perriCoins,scrap:state.shared.scrap,perriPetInventory:state.shared.perriPetInventory,rpgInventory:state.shared.rpgInventory};snapshot.pet.normalFood=(snapshot.pet.normalFood??0)+1;
  const saved=await f.games.execute(f.user,{action:'publicShopPerriPetSave',snapshot,idempotencyKey:randomUUID()});assert.equal(saved.ok,true,JSON.stringify(saved));
  assert.equal((await f.db.query("select polvo_gema from shop_inventories where nick='LocalA'")).rows[0].polvo_gema,4990);
  await f.games.execute(f.user,{action:'publicShopRpgState',idempotencyKey:randomUUID()});
  const item=(await f.db.query("select item_id,price_pg from shop_rpg_catalog where item_id='potion-weak'")).rows[0];assert.ok(item);
  assert.equal((await f.games.execute(f.user,{action:'publicShopRpgPurchase',itemId:item.item_id,quantity:1,idempotencyKey:randomUUID()})).ok,true);
  const stale=await f.games.execute(f.user,{action:'publicShopPerriPetSave',snapshot,idempotencyKey:randomUUID()});assert.equal(stale.error,'perripet_state_conflict');
  const fresh=await f.games.execute(f.user,{action:'publicShopPerriPetState',idempotencyKey:randomUUID()});assert.equal(fresh.shared.gems,4990-item.price_pg);assert.equal(fresh.shared.rpgInventory.smallRedPotion,1);
  const used=await f.games.execute(f.user,{action:'publicShopRpgConsume',itemId:item.item_id,idempotencyKey:randomUUID()});assert.equal(used.ok,true);
  const updated=await f.games.execute(f.user,{action:'publicShopPerriPetState',idempotencyKey:randomUUID()});assert.equal(updated.shared.rpgInventory.smallRedPotion,0);
 }finally{await f.db.close()}
});

test('sesión expirada no puede repetir una operación guardada ni consumir premios de otra cuenta',async()=>{
 const f=await fixture();try{
  const payload={action:'publicShopOpenPerriCasilla',cellIndex:0,openId:randomUUID(),idempotencyKey:randomUUID()};
  const first=await f.games.execute(f.user,payload);assert.equal(first.ok,true);
  const before=(await f.db.query("select * from shop_inventories where nick='LocalA'")).rows;
  await f.db.query("update shop_sessions set expires_at=now()-interval '1 second' where token=$1",[sessionKey(f.user.token)]);
  await assert.rejects(f.games.execute(f.user,payload),e=>e.code==='session_expired');
  assert.deepEqual((await f.db.query("select * from shop_inventories where nick='LocalA'")).rows,before);
 }finally{await f.db.close()}
});

test('los juegos no reactivan cuentas ni prolongan la sesión del login tradicional',async()=>{
 const f=await fixture();try{
  const expiry=(await f.db.query('select expires_at from shop_sessions where token=$1',[sessionKey(f.user.token)])).rows;
  await f.games.execute(f.user,{action:'publicShopGetPerriCasillas',idempotencyKey:randomUUID()});
  assert.deepEqual((await f.db.query('select expires_at from shop_sessions where token=$1',[sessionKey(f.user.token)])).rows,expiry);
  await f.db.exec("update shop_players set active=false where nick='LocalA'");
  await assert.rejects(f.games.execute(f.user,{action:'publicShopGetPerriCasillas',idempotencyKey:randomUUID()}),e=>e.code==='session_expired');
  assert.equal((await f.db.query("select active from shop_players where nick='LocalA'")).rows[0].active,false);
 }finally{await f.db.close()}
});
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
  const restored=await createGames({pool:f.pool,legacy,enabled:true}).execute(f.user,{action:'publicShopGetPerriCasillas',idempotencyKey:randomUUID()});
  assert.equal(restored.game.roundId,first.game.roundId);assert.equal(restored.game.cells[0].opened,true);assert.deepEqual(restored.game.cells[0].reward,first.game.cells[0].reward);
  await assert.rejects(f.games.execute(f.user,{...payload,cellIndex:1}),e=>e.code==='operation_conflict');
 }finally{await f.db.close()}
});

test('RPG recupera equipo y recompensa original del jefe una sola vez, con consumo verificado',async()=>{
 const f=await fixture();try{
  const initial=await f.games.execute(f.user,{action:'publicShopRpgState',idempotencyKey:randomUUID()});
  assert.equal(initial.ok,true);assert.ok(Object.keys(initial.equipment).length>0);
  const restarted=createGames({pool:f.pool,legacy,enabled:true});
  const restored=await restarted.execute(f.user,{action:'publicShopRpgState',idempotencyKey:randomUUID()});assert.deepEqual(restored.equipment,initial.equipment);
  const combat={round:1,playerHp:100,playerMaxHp:100,enemyHp:5000,enemyMaxHp:5000};
  assert.equal((await restarted.execute(f.user,{action:'publicShopRpgSaveCombat',combat,idempotencyKey:randomUUID()})).ok,true);
  // Estado previo local cercano al final; no altera reglas ni utiliza datos reales.
  await f.db.exec("update shop_rpg_combat_state set enemy_hp=1,updated_at=now()-interval '1 minute' where nick='LocalA';insert into shop_rpg_inventory(nick,item_id,quantity) values('LocalA','sword-worn',1) on conflict(nick,item_id) do update set quantity=1");
  const finish={action:'publicShopRpgSaveCombat',combat:{...combat,round:2,enemyHp:0},idempotencyKey:randomUUID()};
  const forged=await restarted.execute(f.user,finish);assert.equal(forged.error,'unverified_rpg_combat_result');
  const consumed=await restarted.execute(f.user,{action:'publicShopRpgConsume',itemId:'sword-worn',idempotencyKey:randomUUID()});assert.equal(consumed.ok,true,JSON.stringify(consumed));
  const won=await restarted.execute(f.user,finish);assert.equal(won.ok,true,JSON.stringify(won));assert.equal(won.bossDefeated,true);
  assert.deepEqual(await restarted.execute(f.user,finish),won);
  assert.equal((await restarted.execute(f.user,{...finish,idempotencyKey:randomUUID()})).ok,true);
  assert.equal((await f.db.query("select pinza_real from shop_inventories where nick='LocalA'")).rows[0].pinza_real,1);
  assert.equal((await f.db.query("select count(*)::int n from shop_rpg_ledger where nick='LocalA' and action='boss_reward'")).rows[0].n,1);
  assert.equal((await f.db.query("select quantity from shop_rpg_inventory where nick='LocalA' and item_id='sword-worn'")).rows[0].quantity,0);
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

test('cofres y bolsas originales: consumo, premios persistidos, recibo idempotente y catálogo intacto',async()=>{
 const f=await fixture();try{
  await f.db.exec("update shop_logo_catalog set name='Nombre conservado' where logo_id='logo-buho-1';update shop_inventories set bolsa_gemas=2,bolsa_chatarra=2,bolsa_especial=2,cajita_armas=2 where nick='LocalA';");
  const catalog=(await f.db.query('select * from shop_logo_catalog order by logo_id')).rows;
  for(const itemKey of ['bolsaGemas','bolsaChatarra','bolsaEspecial','cajitaArmas']){
   const field=itemKey.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),before=(await f.db.query("select * from shop_inventories where nick='LocalA'")).rows[0];
   const payload={action:'publicShopOpenRewardContainer',itemKey,openId:'never-trust-client-id',idempotencyKey:randomUUID()};
   const result=await f.games.execute(f.user,payload);assert.equal(result.ok,true,JSON.stringify(result));assert.ok(result.reward.label);const after=(await f.db.query("select * from shop_inventories where nick='LocalA'")).rows[0];assert.equal(after[field],before[field]-1);
   if(itemKey==='bolsaGemas')assert.ok([100,200,300].includes(after.polvo_gema-before.polvo_gema));
   if(itemKey==='bolsaChatarra')assert.ok([35,70,120].includes(after.chatarra-before.chatarra));
   if(itemKey==='cajitaArmas')assert.equal((await f.db.query("select sum(quantity)::int n from shop_rpg_inventory where nick='LocalA'")).rows[0].n,10);
   assert.deepEqual(await f.games.execute(f.user,payload),result);assert.deepEqual((await f.db.query("select * from shop_inventories where nick='LocalA'")).rows[0],after);
  }
  for(const chestType of ['perriCofres','perriCofresMinijuego']){
   const chestId=randomUUID();await f.db.query("insert into shop_inventory_chests(chest_id,nick,chest_type,expires_at) values($1,'LocalA',$2,now()+interval '1 day')",[chestId,chestType]);
   await f.db.query("update shop_inventories set perri_cofres=case when $1='perriCofres' then 1 else perri_cofres end,perri_cofres_minijuego=case when $1='perriCofresMinijuego' then 1 else perri_cofres_minijuego end where nick='LocalA'",[chestType]);
   const payload={action:'publicShopOpenInventoryChest',chestType,chestOpenId:'untrusted',idempotencyKey:randomUUID()};
   const result=await f.games.execute(f.user,payload);assert.equal(result.ok,true,JSON.stringify(result));assert.ok(result.rewardBundle.rewards.length>=2);assert.equal((await f.db.query('select status from shop_inventory_chests where chest_id=$1',[chestId])).rows[0].status,'opened');
   const inventory=(await f.db.query("select * from shop_inventories where nick='LocalA'")).rows;
   assert.deepEqual(await f.games.execute(f.user,payload),result);assert.deepEqual((await f.db.query("select * from shop_inventories where nick='LocalA'")).rows,inventory);
  }
  assert.deepEqual((await f.db.query('select * from shop_logo_catalog order by logo_id')).rows,catalog);
  assert.equal((await f.db.query("select count(*)::int n from shop_activity where nick='LocalA'")).rows[0].n,6);
 }finally{await f.db.close()}
});

test('apertura: sin propiedad, caducado, identidad ajena, manipulación y fallo de registro no conceden premios',async()=>{
 const f=await fixture();try{
  await f.db.exec("update shop_inventories set bolsa_gemas=1 where nick='LocalA';");
  const before=(await f.db.query("select * from shop_inventories where nick='LocalA'")).rows;
  await assert.rejects(f.games.execute(f.user,{action:'publicShopOpenChest',idempotencyKey:randomUUID()}),e=>e.code==='operation_disabled');
  await assert.rejects(f.games.execute(f.user,{action:'publicShopOpenInventoryChest',chestType:'free-money',idempotencyKey:randomUUID()}),e=>e.code==='invalid_request');
  const request={action:'publicShopOpenRewardContainer',itemKey:'bolsaGemas',openId:'x',idempotencyKey:randomUUID()};
  await assert.rejects(f.games.execute({...f.user,nick:'LocalB'},request),e=>e.code==='session_expired');
  const absent=await f.games.execute(f.user,{...request,itemKey:'bolsaEspecial',idempotencyKey:randomUUID()});assert.equal(absent.ok,false);assert.equal(absent.error,'item_not_owned');
  await f.db.query("insert into shop_inventory_chests(chest_id,nick,chest_type,expires_at) values($1,'LocalA','perriCofres',now()-interval '1 day')",[randomUUID()]);
  assert.equal((await f.games.execute(f.user,{action:'publicShopOpenInventoryChest',chestType:'perriCofres',chestOpenId:'x',idempotencyKey:randomUUID()})).ok,false);
  await f.db.exec("create function reject_chest_receipt() returns trigger language plpgsql as $$ begin if NEW.operation_id like 'pw2:game:%' then raise exception 'fail'; end if; return NEW; end $$;create trigger reject_chest_receipt before insert on shop_operations for each row execute function reject_chest_receipt();");
  await assert.rejects(f.games.execute(f.user,request),e=>e.code==='games_unavailable');
  assert.deepEqual((await f.db.query("select * from shop_inventories where nick='LocalA'")).rows,before);assert.equal((await f.db.query('select count(*)::int n from shop_activity')).rows[0].n,0);
 }finally{await f.db.close()}
});
test('aperturas concurrentes entre instancias: un único consumo, propiedad del recibo y saldo insuficiente',async()=>{
 const f=await fixture();try{
  await f.db.exec("update shop_inventories set bolsa_gemas=1 where nick='LocalA'");
  let tail=Promise.resolve();const pool={async connect(){let release;const before=tail;tail=new Promise(r=>release=r);await before;return {query:(...args)=>f.db.query(...args),release}}};
  const a=createGames({pool,legacy,enabled:true}),b=createGames({pool,legacy,enabled:true});
  const payload={action:'publicShopOpenRewardContainer',itemKey:'bolsaGemas',openId:'server',idempotencyKey:randomUUID()};
  const results=await Promise.all([a.execute(f.user,payload),b.execute(f.user,payload)]);assert.equal(results[0].ok,true);assert.deepEqual(results[1],results[0]);
  const inventory=(await f.db.query("select bolsa_gemas,polvo_gema from shop_inventories where nick='LocalA'")).rows[0];assert.equal(inventory.bolsa_gemas,0);assert.ok([5100,5200,5300].includes(inventory.polvo_gema));
  assert.equal((await b.execute(f.user,{...payload,idempotencyKey:randomUUID()})).error,'item_not_owned');
  await assert.rejects(a.execute(f.user,{...payload,itemKey:'bolsaChatarra'}),e=>e.code==='operation_conflict');
  const user={nick:'LocalB',token:'y'.repeat(43)};await f.db.query("insert into shop_sessions(token,nick,expires_at) values($1,'LocalB',now()+interval '1 day')",[sessionKey(user.token)]);
  await assert.rejects(b.execute(user,payload),e=>e.code==='operation_conflict');
  assert.deepEqual((await f.db.query("select bolsa_gemas,polvo_gema from shop_inventories where nick='LocalA'")).rows[0],inventory);
 }finally{await f.db.close()}
});
test('disponibilidad de cofres lee propiedad y caducidad sin modificar registros ni inventarios',async()=>{
 const f=await fixture();try{
  await f.db.query("insert into shop_inventory_chests(chest_id,nick,chest_type,expires_at) values($1,'LocalA','perriCofres',now()+interval '1 day'),($2,'LocalA','perriCofres',now()-interval '1 day'),($3,'LocalB','perriCofresMinijuego',now()+interval '1 day')",[randomUUID(),randomUUID(),randomUUID()]);
  await f.db.exec("update shop_inventories set perri_cofres=1 where nick='LocalA'");
  const before=(await f.db.query('select * from shop_inventory_chests order by chest_id')).rows;
  const state=await f.games.containerState(f.user);assert.equal(state.available,true);assert.deepEqual(state.counts,{perriCofres:1});
  assert.equal((await f.games.containerState({...f.user,nick:'LocalB'})).available,false);
  assert.deepEqual((await f.db.query('select * from shop_inventory_chests order by chest_id')).rows,before);
  assert.equal((await f.db.query('select count(*)::int n from shop_operations')).rows[0].n,0);
 }finally{await f.db.close()}
});
test('cuentas antiguas sin historial auxiliar: abrir bolsas y cofres conserva contadores y evita duplicados',async()=>{
 const f=await fixture();try{
  await f.db.exec("update shop_inventories set perri_cofres=2,perri_cofres_minijuego=1,bolsa_gemas=1,bolsa_chatarra=1,bolsa_especial=1,cajita_armas=1 where nick='LocalA'");
  assert.equal((await f.games.containerState(f.user)).available,true);
  for(const itemKey of ['bolsaGemas','bolsaChatarra','bolsaEspecial','cajitaArmas']){
   const result=await f.games.execute(f.user,{action:'publicShopOpenRewardContainer',itemKey,openId:'server',idempotencyKey:randomUUID()});assert.equal(result.ok,true,JSON.stringify(result));
   assert.deepEqual((await f.db.query("select perri_cofres,perri_cofres_minijuego from shop_inventories where nick='LocalA'")).rows[0],{perri_cofres:2,perri_cofres_minijuego:1});
  }
  for(const chestType of ['perriCofres','perriCofresMinijuego']){
   const payload={action:'publicShopOpenInventoryChest',chestType,chestOpenId:'server',idempotencyKey:randomUUID()};const result=await f.games.execute(f.user,payload);assert.equal(result.ok,true,JSON.stringify(result));assert.ok(result.rewardBundle.rewards.length>=2);assert.deepEqual(await f.games.execute(f.user,payload),result);
  }
  assert.deepEqual((await f.db.query("select perri_cofres,perri_cofres_minijuego from shop_inventories where nick='LocalA'")).rows[0],{perri_cofres:1,perri_cofres_minijuego:0});
  assert.equal((await f.db.query('select count(*)::int n from shop_inventory_chests')).rows[0].n,0);
 }finally{await f.db.close()}
});

test('una discrepancia con historial existente se rechaza sin borrar objetos ni conceder premios',async()=>{
 const f=await fixture();try{
  await f.db.exec("update shop_inventories set perri_cofres=4,bolsa_gemas=1 where nick='LocalA'");await f.db.query("insert into shop_inventory_chests(chest_id,nick,chest_type,expires_at) values($1,'LocalA','perriCofres',now()-interval '1 day')",[randomUUID()]);
  const before=(await f.db.query("select * from shop_inventories where nick='LocalA'")).rows;
  assert.equal((await f.games.containerState(f.user)).available,false);
  await assert.rejects(f.games.execute(f.user,{action:'publicShopOpenRewardContainer',itemKey:'bolsaGemas',openId:'server',idempotencyKey:randomUUID()}),e=>e.code==='inventory_mismatch');
  assert.deepEqual((await f.db.query("select * from shop_inventories where nick='LocalA'")).rows,before);assert.equal((await f.db.query('select count(*)::int n from shop_operations')).rows[0].n,0);
 }finally{await f.db.close()}
});
test('el historial filtrado por permisos RLS no se interpreta como una cuenta antigua sin historial',async()=>{
 const f=await fixture();try{
  await f.db.exec("update shop_inventories set perri_cofres=4 where nick='LocalA';create role chest_reader;grant usage on schema public to chest_reader;grant select on all tables in schema public to chest_reader;alter table shop_sessions disable row level security;alter table shop_access disable row level security;alter table shop_players disable row level security;alter table shop_logo_catalog disable row level security;alter table shop_inventories disable row level security;set role chest_reader;");
  assert.equal((await f.games.containerState(f.user)).available,false);
  await f.db.exec('reset role');assert.equal((await f.db.query("select perri_cofres from shop_inventories where nick='LocalA'")).rows[0].perri_cofres,4);
 }finally{await f.db.close()}
});
test('disponibilidad de apertura distingue configuración y fallos de datos sin filtrar detalles privados',async()=>{
 assert.equal((await createGames().containerState({})).reason,'games_disabled');
 assert.equal((await createGames({enabled:true}).containerState({})).reason,'database_not_configured');
 assert.equal((await createGames({enabled:true,pool:{},legacy,sourceCompatible:false}).containerState({})).reason,'database_project_mismatch');
 assert.equal((await createGames({enabled:true,pool:{},legacy:{}}).containerState({})).reason,'original_backend_missing');
 for(const [code,reason] of [['42501','storage_permissions'],['42P01','storage_schema_missing'],['28P01','database_credentials'],['ECONNREFUSED','database_unavailable']]){
  const events=[],games=createGames({enabled:true,legacy,pool:{connect:async()=>{throw Object.assign(Error('PRIVATE-DATABASE-SECRET'),{code})}},onDiagnostic:e=>events.push(e)});
  const result=await games.containerState({});assert.equal(result.reason,reason);assert.equal(result.available,false);assert.ok(!JSON.stringify({result,events}).includes('PRIVATE-DATABASE-SECRET'));
 }
});