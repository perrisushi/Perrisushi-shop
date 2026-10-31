import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {rewardFixture} from './fixtures/reward-notifications.mjs';
import transport from '../backend/game-transport.cjs';
import {createGames} from '../backend/games.mjs';
import {notificationCard} from '../src/services/notifications.js';
const fields=['perri_cofres','perri_cofres_minijuego','cajita_armas','bolsa_especial','bolsa_chatarra','bolsa_gemas','monedas'];
const rows=async db=>(await db.query('SELECT * FROM shop_notifications ORDER BY created_at,id')).rows;

test('recompensas: siete identificadores exactos, aumentos solamente, sin alterar saldos, históricos ni avisos sociales',async()=>{
 const f=await rewardFixture({historic:true});try{
  const before=await rows(f.db);const historic=before.find(n=>n.title==='Histórico intacto');
  await f.db.exec('UPDATE shop_inventories SET '+fields.map(k=>k+'='+k+'+2').join(',')+" WHERE nick='LocalA'");
  const added=(await rows(f.db)).slice(before.length);assert.equal(added.length,7);assert.deepEqual(added.map(n=>n.kind).sort(),[...fields].sort());
  for(const row of added){assert.equal(row.nick,'LocalA');assert.equal(row.payload.itemId,row.kind);assert.equal(row.payload.amount,2);assert.equal(row.read_at,null)}
  const inventory=(await f.db.query("SELECT * FROM shop_inventories WHERE nick='LocalA'")).rows[0];
  for(const field of fields)assert.equal(inventory[field],field==='monedas'?12:2);
  const count=(await rows(f.db)).length;
  const excluded=(await f.db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='shop_inventories' AND data_type IN ('integer','bigint','numeric')")).rows.map(r=>r.column_name).filter(k=>!fields.includes(k));
  await f.db.exec('UPDATE shop_inventories SET '+excluded.map(k=>k+'='+k+'+1').join(',')+" WHERE nick='LocalA'");
  await f.db.exec("UPDATE shop_inventories SET monedas=monedas-1,bolsa_gemas=bolsa_gemas-1 WHERE nick='LocalA'");assert.equal((await rows(f.db)).length,count);
  for(const kind of ['llaves','fragmento','random_key','ticket','chatarra','saco_chatarra','espada','pc'])await f.db.query("insert into shop_notifications(nick,kind,title,message,payload) values('LocalA',$1,'No se emite','Recompensa excluida',$2)",[kind,JSON.stringify({category:'reward',itemId:kind,amount:1})]);assert.equal((await rows(f.db)).length,count);
  assert.deepEqual((await rows(f.db)).find(n=>n.id===historic.id),historic);
  await f.db.exec(f.migration);assert.equal((await rows(f.db)).length,count);await f.db.exec("UPDATE shop_inventories SET bolsa_especial=bolsa_especial+1 WHERE nick='LocalA'");assert.equal((await rows(f.db)).length,count+1);
  await f.db.exec("BEGIN;UPDATE shop_inventories SET monedas=monedas+10 WHERE nick='LocalA';ROLLBACK");assert.equal((await rows(f.db)).length,count+1);
 }finally{await f.db.close()}
});

test('cofres y bolsas: premios reales, reintentos sin duplicados y exclusión de equipo, gemas y chatarra',async()=>{
 const f=await rewardFixture();try{
  await f.db.exec("update shop_inventories set perri_cofres=1,perri_cofres_minijuego=1,bolsa_gemas=1,bolsa_chatarra=1,bolsa_especial=1,cajita_armas=1 where nick='LocalA'");
  for(const [itemKey,action] of [['perriCofres','publicShopOpenInventoryChest'],['perriCofresMinijuego','publicShopOpenInventoryChest'],['bolsaGemas','publicShopOpenRewardContainer'],['bolsaChatarra','publicShopOpenRewardContainer'],['bolsaEspecial','publicShopOpenRewardContainer'],['cajitaArmas','publicShopOpenRewardContainer']]){
   const before=(await rows(f.db)).length,id=randomUUID();const request={action,idempotencyKey:id,...(action==='publicShopOpenInventoryChest'?{chestType:itemKey,chestOpenId:'server'}:{itemKey,openId:'server'})};
   const result=await f.games.execute(f.user,request);assert.equal(result.ok,true,itemKey);const after=await rows(f.db);
   assert.ok(after.slice(before).every(n=>fields.includes(n.kind)));assert.equal(new Set(after.slice(before).map(n=>n.kind)).size,after.length-before);
   const repeat=await f.games.execute(f.user,request);assert.deepEqual(repeat,result);assert.equal((await rows(f.db)).length,after.length);
   if(itemKey==='perriCofres')assert.ok(after.slice(before).some(n=>n.kind==='monedas'));
   if(itemKey==='perriCofresMinijuego')assert.ok(after.slice(before).some(n=>n.kind==='cajita_armas'));
   if(['bolsaGemas','bolsaChatarra','cajitaArmas','bolsaEspecial'].includes(itemKey))assert.equal(after.length,before);
  }
 }finally{await f.db.close()}
});

test('premio bruto: moneda consumida y recuperada genera un aviso; contexto no se filtra ni acepta recompensas excluidas',async()=>{
 const f=await rewardFixture();try{
  const before=(await rows(f.db)).length;
  const client={query:(...args)=>f.db.query(...args)};
  await f.db.exec('BEGIN');
  await transport.withClient(client,()=>transport.withNotificationRewards('LocalA',{monedas:1,polvoGema:999},()=>f.db.exec("UPDATE shop_inventories SET monedas=monedas WHERE nick='LocalA'")));
  await f.db.exec('COMMIT');
  const added=(await rows(f.db)).slice(before);assert.equal(added.length,1);assert.equal(added[0].kind,'monedas');assert.equal(added[0].payload.amount,1);
  assert.equal((await f.db.query("SELECT current_setting('pw2.notification_rewards',true) AS value")).rows[0].value,'');
  await f.db.exec("UPDATE shop_inventories SET monedas=monedas WHERE nick='LocalA'");assert.equal((await rows(f.db)).length,before+1);
  await f.db.exec('BEGIN');await transport.withClient(client,()=>transport.withNotificationRewards('LocalA',{monedas:2},()=>f.db.exec("UPDATE shop_inventories SET monedas=monedas WHERE nick='LocalB'")));await f.db.exec('COMMIT');assert.equal((await rows(f.db)).length,before+1);
 }finally{await f.db.close()}
});

test('migración cancela productores desconocidos sin retirar los originales ni borrar datos',async()=>{
 const f=await rewardFixture();try{
  await f.db.exec("CREATE FUNCTION public.unknown_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.shop_notifications(nick,kind,title) VALUES(NEW.nick,'welcome','Otro productor');RETURN NEW;END $$;CREATE TRIGGER unknown_notify AFTER UPDATE ON shop_inventories FOR EACH ROW EXECUTE FUNCTION unknown_notify()");
  const before=await rows(f.db);await assert.rejects(f.db.exec(f.migration),/productores desconocidos/);await f.db.exec('ROLLBACK');assert.deepEqual(await rows(f.db),before);
  assert.equal((await f.db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='trg_pw2_inventory_reward_notifications'")).rows[0].n,1);
 }finally{await f.db.close()}
});

test('tarjetas: solo recursos originales locales, contenido escapado y ningún cambio al marco exterior',async()=>{
 for(const itemId of fields){const html=notificationCard({id:'x',kind:itemId,title:'<script>Premio</script>',message:'2 objetos',created_at:'2026-01-01T00:00:00Z',payload:{itemId,amount:2,image:'https://evil.invalid/x'}});assert.ok(html.includes('notification-graphic'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('evil.invalid'));const image=html.match(/src="([^"]+)"/)[1];await readFile(image.replace('./',''));}
});

test('PerriCasillas real: siete premios, coste intacto, moneda recuperada y repetición sin duplicados',async()=>{
 const f=await rewardFixture();try{
  await f.games.execute(f.user,{action:'publicShopGetPerriCasillas',idempotencyKey:randomUUID()});
  for(const field of fields){
   const key=field.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
   const cells=(await f.db.query("SELECT cells FROM perri_casillas_games WHERE nick='LocalA'")).rows[0].cells;
   cells[0]={opened:false,reward:{kind:key,amount:1,label:'Premio '+field,inventoryDelta:{[key]:1},image:''}};
   await f.db.query("UPDATE perri_casillas_games SET cells=$1,plays_in_window=0,window_started_at=NULL WHERE nick='LocalA'",[JSON.stringify(cells)]);
   const before=(await rows(f.db)).length,coins=(await f.db.query("SELECT monedas FROM shop_inventories WHERE nick='LocalA'")).rows[0].monedas;
   const id=randomUUID(),body={action:'publicShopOpenPerriCasilla',cellIndex:0,openId:id,idempotencyKey:id};
   const result=await f.games.execute(f.user,body);assert.equal(result.ok,true,field);const notices=(await rows(f.db)).slice(before);
   assert.equal(notices.length,1,field);assert.equal(notices[0].kind,field);assert.equal(notices[0].payload.amount,1);
   assert.equal((await f.db.query("SELECT monedas FROM shop_inventories WHERE nick='LocalA'")).rows[0].monedas,coins-1+(field==='monedas'?1:0));
   await f.games.execute(f.user,body);assert.equal((await rows(f.db)).length,before+1);
  }
 }finally{await f.db.close()}
});

test('filtro definitivo: permite comunicaciones sociales, administrativas y de otros sistemas aunque compartan kind o itemId',async()=>{
 const f=await rewardFixture();try{
  const before=(await rows(f.db)).length;
  const notices=[['twitch','Directo',{category:'social'}],['youtube','Vídeo',{}],['welcome','Bienvenida',{}],['admin','Aviso administrativo',{category:'admin',itemId:'espada'}],['ticket','Revisión de boleto',{amount:1}],['pc','Ajuste administrativo',{amount:5}],['llaves','Llaves conseguidas',{category:'admin',amount:1}],['system','Mantenimiento',{category:'system',itemId:'random_key'}]];
  for(const [kind,title,payload]of notices)await f.db.query("INSERT INTO shop_notifications(nick,kind,title,message,payload) VALUES('LocalA',$1,$2,'Mensaje conservado',$3)",[kind,title,JSON.stringify(payload)]);
  assert.equal((await rows(f.db)).length,before+notices.length);
  for(const [kind,title]of [['fragmento','Fragmento conseguido'],['llaves','Llaves conseguidas'],['random_key','Random Key conseguida'],['ticket','Ticket recibido']])await f.db.query("INSERT INTO shop_notifications(nick,kind,title,message,payload) VALUES('LocalA',$1,$2,'Premio legado',$3)",[kind,title,JSON.stringify({amount:1})]);
  assert.equal((await rows(f.db)).length,before+notices.length);
  await f.db.query("INSERT INTO shop_notifications(nick,kind,title,payload) VALUES('LocalA','admin','Cantidad no numérica',$1)",[JSON.stringify({amount:'pendiente'})]);
  assert.equal((await rows(f.db)).length,before+notices.length+1);
 }finally{await f.db.close()}
});

test('copia privada y restauración: instantánea intacta, históricos recuperables y saldos posteriores preservados',async()=>{
 const f=await rewardFixture({historic:true});try{
  const manifest=(await f.db.query('SELECT * FROM pw2_backup_003.manifest')).rows;
  assert.equal(manifest.length,1);assert.equal(Number(manifest[0].inventories),2);assert.equal(Number(manifest[0].notifications),3);
  const backup=(await f.db.query('SELECT * FROM pw2_backup_003.shop_notifications ORDER BY id')).rows;
  const victim=backup.find(n=>n.kind==='llaves'),existing=backup.find(n=>n.kind==='welcome');
  for(const role of ['anon','authenticated','service_role']){
   assert.equal((await f.db.query("SELECT has_schema_privilege($1,'pw2_backup_003','USAGE') AS allowed",[role])).rows[0].allowed,false);
   assert.equal((await f.db.query("SELECT has_table_privilege($1,'pw2_backup_003.shop_inventories','SELECT') AS allowed",[role])).rows[0].allowed,false);
  }
  await f.db.query('DELETE FROM shop_notifications WHERE id=$1',[victim.id]);
  await f.db.query('UPDATE shop_notifications SET read_at=now() WHERE id=$1',[existing.id]);
  await f.db.exec("UPDATE shop_inventories SET monedas=monedas+9,bolsa_gemas=bolsa_gemas+3 WHERE nick='LocalA'");
  const currentInventory=(await f.db.query('SELECT * FROM shop_inventories ORDER BY nick')).rows;
  const retained=(await f.db.query('SELECT * FROM shop_notifications ORDER BY id')).rows;
  await f.db.exec(f.migration);assert.deepEqual((await f.db.query('SELECT * FROM pw2_backup_003.manifest')).rows,manifest);
  const restore=await readFile('sql/003-notificaciones-restaurar.sql','utf8');await f.db.exec(restore);
  assert.deepEqual((await f.db.query('SELECT * FROM shop_inventories ORDER BY nick')).rows,currentInventory);
  const actual=(await f.db.query('SELECT * FROM shop_notifications ORDER BY id')).rows;
  for(const note of retained)assert.deepEqual(actual.find(n=>n.id===note.id),note);
  assert.deepEqual(actual.find(n=>n.id===victim.id),victim);
  assert.deepEqual((await f.db.query('SELECT * FROM pw2_backup_003.shop_notifications ORDER BY id')).rows,backup);
  const originals=(await f.db.query('SELECT trigger_name,definition FROM pw2_backup_003.triggers ORDER BY trigger_name')).rows;
  const restored=(await f.db.query("SELECT t.tgname AS trigger_name,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname LIKE '%notify%' ORDER BY trigger_name")).rows;
  assert.deepEqual(restored,originals);await f.db.exec(restore);assert.equal((await rows(f.db)).length,actual.length);
 }finally{await f.db.close()}
});
