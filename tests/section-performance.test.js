import test from 'node:test';import assert from 'node:assert/strict';import {createApiClient} from '../src/services/api-client.js';import {adminFixture} from './helpers/admin-fixture.mjs';import {createBackend} from '../backend/app.mjs';import {createGames} from '../backend/games.mjs';import {createModeration} from '../backend/moderation.mjs';import {createCommunity} from '../backend/community.mjs';import {Readable} from 'node:stream';
const tick=()=>new Promise(r=>setImmediate(r));
test('lectura de notificaciones no invalida ni interrumpe inventario/catálogo; equipar solo su dominio',async()=>{
 const calls=[];let done;const api=createApiClient({fetchImpl:async(path,o)=>{calls.push([new URL(path,'http://local').pathname,o.method]);if(path.includes('/inventory')&&o.method==='GET')return new Promise(r=>done=r);return Response.json({items:[]})}});
 const pending=api.getInventory();await tick();await api.getStore();await api.markNotificationRead('test');done(Response.json({inventory:{pc:8}}));await pending;
 await api.getInventory();await api.getStore();assert.equal(calls.filter(([p,m])=>p==='/api/inventory'&&m==='GET').length,1);assert.equal(calls.filter(([p,m])=>p==='/api/store'&&m==='GET').length,1);
 await api.equipCosmetic('frame','marco-basico');await api.getInventory();await api.getStore();assert.equal(calls.filter(([p,m])=>p==='/api/store'&&m==='GET').length,1);
});
test('catálogo: TTL 60s, instantánea conservada, petición compartida y cambio administrativo invalida',async()=>{
 let clock=10,calls=0;const api=createApiClient({now:()=>clock,fetchImpl:async()=>Response.json({items:[{version:++calls}]})});
 await Promise.all([api.getStore(),api.getStore()]);assert.equal(calls,1);clock+=59000;await api.getStore();assert.equal(calls,1);clock+=2000;assert.equal(api.peek('store').items[0].version,1);await api.getStore();assert.equal(calls,2);
 await api.adminExecute({action:'product'});assert.equal(api.peek('store').items[0].version,2);await api.getStore();assert.equal(calls,4);
});
test('snapshot del perfil precarga inventario sin segunda lectura y caduca sin borrar datos',async()=>{
 let clock=10,calls=0;const api=createApiClient({now:()=>clock,fetchImpl:async()=>{calls++;return Response.json({inventorySnapshot:{inventory:{pc:7,llaves:2}}})}});
 await api.getProfile();assert.deepEqual((await api.getInventory()).inventory,{pc:7,llaves:2});assert.equal(calls,1);clock+=21000;assert.equal(api.peek('inventory').inventory.pc,7);
});
test('comprar aplica solo saldo/propiedad confirmados; no equipa y conserva campos no modificados',async()=>{
 let calls=0;const profile={balances:{pc:1000,gemas:20},profile:{ownedLogoIds:['logo-pelusa-1']},inventorySnapshot:{inventory:{pc:1000,monedas:5,llaves:2}}};
 const cosmetics={owned:{background:['fondo-logo-negro'],frame:['marco-basico'],logo:['logo-pelusa-1']},selected:{background:'fondo-logo-negro',frame:'marco-basico',logo:'logo-pelusa-1'},items:[]};
 const api=createApiClient({fetchImpl:async(path,o)=>{calls++;return Response.json(o.method==='POST'?{acquired:'fondo-logo-piedra',balances:{pc:500}}:path.includes('/cosmetics')?cosmetics:profile)}});
 await api.getProfile();await api.getCosmetics();await api.buyProduct({id:'local',expectedVersion:1});const before=calls;assert.equal((await api.getInventory()).inventory.pc,500);assert.equal((await api.getProfile()).balances.pc,500);assert.equal((await api.getCosmetics()).selected.background,'fondo-logo-negro');assert.ok(api.peek('cosmetics').owned.background.includes('fondo-logo-piedra'));assert.equal(api.peek('inventory').inventory.llaves,2);assert.equal(calls,before);
});
test('cambio de cuenta y respuestas antiguas no reutilizan datos privados',async()=>{
 let finish;const api=createApiClient({fetchImpl:async(path)=>path.includes('/inventory')?new Promise(r=>finish=r):Response.json({authenticated:true,nick:'B'})});const old=api.getInventory();await tick();await api.login('B','local');assert.equal(api.peek('inventory'),undefined);finish(Response.json({inventory:{pc:777}}));await assert.rejects(old,e=>e.code==='session_changed');assert.equal(api.peek('inventory'),undefined);
});
test('sanción recibida al revalidar elimina instantáneas, sin usar un resultado guardado para autorizar',async()=>{
 let reject=false,expired=0;const api=createApiClient({fetchImpl:async()=>reject?Response.json({error:'account_banned'},{status:403}):Response.json({inventory:{pc:7}}),onSessionExpired:()=>expired++});await api.getInventory();reject=true;api.invalidate(['inventory']);await assert.rejects(api.getInventory(),e=>e.code==='account_banned');assert.equal(api.peek('inventory'),undefined);assert.equal(expired,1);
});
test('inventario rápido no espera readiness; readiness conserva sesión, permisos, esquema y no agrega historial',async()=>{
 const f=await adminFixture({extended:true,cosmetics:true});try{
  const queries=[];const pool={connect:async()=>{const c=await f.pool.connect();return {release:()=>c.release(),query:(sql,args)=>{queries.push(sql);return c.query(sql,args)}}}};
  const moderation=createModeration({pool,enabled:true}),games=createGames({pool,moderation,legacy:{handleShopAction(){}},enabled:true}),community=createCommunity({pool,moderation,cosmeticsEnabled:true});const handler=createBackend({repository:f.repository,games,moderation,community,sessionStore:'supabase'});
  async function call(path,cookie='pw2_session='+f.user.token){queries.length=0;const req=Readable.from([]);Object.assign(req,{method:'GET',url:'/api'+path,headers:{cookie},socket:{remoteAddress:'127.0.0.1'}});let status,body,headers;await handler(req,{setHeader(){},writeHead:(s,h)=>{status=s;headers=h},end:b=>body=JSON.parse(b)});return {status,body,headers,sql:[...queries]}}
  const fast=await call('/inventory?deferReadiness=1');assert.equal(fast.status,200);assert.equal(fast.sql.filter(q=>q.includes('shop_inventory_chests')).length,0);assert.equal(fast.body.inventory.pc,100);assert.equal(fast.body.canOpenContainers,false);
  const ready=await call('/inventory/readiness');assert.equal(ready.status,200);assert.equal(ready.body.canOpenContainers,true);assert.ok(ready.sql.some(q=>q.includes('has_table_privilege')));assert.ok(ready.sql.every(q=>!q.includes('count(*)')));assert.equal((await call('/inventory/readiness','')).status,401);
  const store=await call('/store');assert.match(store.headers['Server-Timing'],new RegExp('sqlq;desc="'+store.sql.length+'"'));
  await f.db.exec('DROP TABLE shop_inventory_chests CASCADE');assert.equal((await call('/inventory/readiness')).body.canOpenContainers,false);assert.equal((await call('/inventory?deferReadiness=1')).body.inventory.pc,100);
 }finally{await f.db.close()}
});
test('un perfil retrasado no pisa un inventario validado más recientemente',async()=>{
 let finish;const api=createApiClient({fetchImpl:async path=>path.includes('/profile?')?new Promise(r=>finish=r):Response.json({inventory:{pc:20}})});const profile=api.getProfile();await tick();await api.getInventory();finish(Response.json({inventorySnapshot:{inventory:{pc:10}}}));await profile;assert.equal(api.peek('inventory').inventory.pc,20);
});
test('leer catálogo antes de una edición administrativa no repuebla la caché con el precio antiguo',async()=>{
 let finish,slow=false,price=500;const api=createApiClient({fetchImpl:async(path,o)=>{if(o.method==='POST'){price=700;return Response.json({ok:true})}return slow?new Promise(r=>finish=r):Response.json({items:[{price}]})}});await api.getStore();api.invalidate(['store']);slow=true;const old=api.getStore();await tick();await api.adminExecute({action:'product'});finish(Response.json({items:[{price:500}]}));await assert.rejects(old,e=>e.code==='session_changed');assert.equal(api.peek('store').items[0].price,500);slow=false;assert.equal((await api.getStore()).items[0].price,700);
});
