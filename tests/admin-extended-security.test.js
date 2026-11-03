import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {adminFixture} from './helpers/admin-fixture.mjs';import {createGames} from '../backend/games.mjs';import {installedAdminSchema} from '../backend/moderation.mjs';import {gameScopeFromPath,gameScopeFromAction} from '../backend/service-scopes.mjs';import {serveSite} from '../backend/site.mjs';import {onRequest as proxy} from '../functions/api/[[path]].js';
const fail=code=>e=>e.code===code;
async function use(task,extended=true){const f=await adminFixture({extended});try{await task(f)}finally{await f.db.close()}}
test('seguridad ampliada: mantenimiento bloquea los cuatro juegos antes de ejecutar acciones y permite reabrir',()=>use(async f=>{
 let calls=0;const games=createGames({pool:f.pool,moderation:f.moderation,enabled:true,legacy:{handleShopAction:async()=>{calls++;return {ok:true}}}});
 for(const [scope,action] of [['PerriPet','publicShopPerriPetState'],['PerriRPG','publicShopRpgState'],['PerriCasillas','publicShopGetPerriCasillas'],['PerriDuelos','publicShopGetDuelTarget']]){
 await f.administration.execute(f.admin,{action:'control',operationId:randomUUID(),scope,active:true,message:'Mantenimiento local',expectedVersion:null,reason:'Prueba',confirmed:true});await assert.rejects(games.execute(f.user,{action,idempotencyKey:randomUUID()}),fail('service_maintenance'));
 await f.administration.execute(f.admin,{action:'control',operationId:randomUUID(),scope,active:false,message:'',expectedVersion:1,reason:'Reabrir',confirmed:true});assert.equal((await games.execute(f.user,{action,idempotencyKey:randomUUID()})).ok,true);
 }assert.equal(calls,4);
}));
test('seguridad ampliada: rutas privadas de minijuegos y API rechazan sanciones y mantenimiento',()=>use(async f=>{
 assert.equal(gameScopeFromPath('/perripet-app/index.html'),'PerriPet');assert.equal(gameScopeFromPath('/perrirpg.html'),'PerriRPG');assert.equal(gameScopeFromPath('/perricasillas'),'PerriCasillas');assert.equal(gameScopeFromPath('/perriduelos-app/index.html'),'PerriDuelos');assert.equal(gameScopeFromAction('publicShopPerriPetSave'),'PerriPet');
 await f.administration.execute(f.admin,{action:'control',operationId:randomUUID(),scope:'PerriPet',active:true,message:'Pausa',expectedVersion:null,reason:'Prueba',confirmed:true});let status,body;
 const site=serveSite({root:process.cwd(),authenticate:async req=>{await f.moderation.service(gameScopeFromPath(req.url));return f.user}});
 await site({url:'/perripet-app/index.html',method:'GET',headers:{}},{writeHead:s=>{status=s},end:v=>{body=v}});assert.equal(status,503);assert.match(body,/mantenimiento/);
 await f.administration.execute(f.admin,{action:'moderation',operationId:randomUUID(),target:'Usuario',mode:'permanent',expectedSanctionId:null,reason:'Motivo privado',confirmed:true});const games=createGames({pool:f.pool,moderation:f.moderation,enabled:true,legacy:{handleShopAction:async()=>{throw Error('No debe ejecutarse')}}});await assert.rejects(games.execute(f.user,{action:'publicShopRpgState',idempotencyKey:randomUUID()}),fail('account_banned'));
}));
test('seguridad ampliada: RLS no convierte una sanción oculta en permiso de acceso',()=>use(async f=>{
 await f.db.exec('SET ROLE anon');try{await assert.rejects(f.moderation.check('Usuario'),fail('moderation_unavailable'))}finally{await f.db.exec('RESET ROLE')}
}));
test('seguridad ampliada: detectar esquema completo y cancelar arranque parcial o RPC sin guardas',()=>use(async f=>{
 assert.equal(await installedAdminSchema(f.pool),true);await f.db.exec(await readFile('sql/001-economia-atomica.sql','utf8'));await assert.rejects(installedAdminSchema(f.pool),/inicio cancelado/);await f.db.exec(await readFile('sql/004-administracion-ampliada.sql','utf8'));assert.equal(await installedAdminSchema(f.pool),true);
}));
test('seguridad ampliada: esquema antiguo no necesita migración forzada; uno parcial no se acepta',()=>use(async f=>{
 assert.equal(await installedAdminSchema(f.pool),false);await f.db.exec('CREATE TABLE public.pw2_account_sanctions(id integer)');await assert.rejects(installedAdminSchema(f.pool),/inicio cancelado/);
},false));
test('seguridad ampliada: proxy conserva únicamente retornos OAuth locales de sanción y vencimiento',async()=>{
 const previous=globalThis.fetch;try{for(const target of ['/?google=account_suspended&until=2026-11-03T20%3A30%3A00.000Z#home','/?google=account_banned#home']){
 globalThis.fetch=async()=>new Response(null,{status:303,headers:{Location:target}});const response=await proxy({request:new Request('https://perrisushi.com/api/auth/google/callback?code=LOCAL'),env:{PERRIWEB_BACKEND_ORIGIN:'https://backend.invalid',PERRIWEB_PROXY_SECRET:'p'.repeat(40)}});assert.equal(response.status,303);assert.equal(response.headers.get('location'),target);
 }globalThis.fetch=async()=>new Response(null,{status:303,headers:{Location:'https://other.invalid/?google=account_banned#home'}});const bad=await proxy({request:new Request('https://perrisushi.com/api/auth/google/callback'),env:{PERRIWEB_BACKEND_ORIGIN:'https://backend.invalid',PERRIWEB_PROXY_SECRET:'p'.repeat(40)}});assert.equal(bad.status,503);
 }finally{globalThis.fetch=previous}
});

test('migración ampliada: tabla de origen desconocido cancela todo sin sobrescribir datos',()=>use(async f=>{
 await f.db.exec('CREATE TABLE pw2_store_products(id integer PRIMARY KEY);INSERT INTO pw2_store_products VALUES(42)');
 await assert.rejects(f.db.exec(await readFile('sql/004-administracion-ampliada.sql','utf8')),/origen no verificado/);await f.db.exec('ROLLBACK');
 assert.equal((await f.db.query('SELECT id FROM pw2_store_products')).rows[0].id,42);assert.equal((await f.db.query("SELECT to_regclass('public.pw2_account_sanctions') AS table_name")).rows[0].table_name,null);
},false));
