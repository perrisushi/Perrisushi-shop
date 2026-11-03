import test from 'node:test';
import assert from 'node:assert/strict';
import {startAuthenticatedUI} from '../src/services/startup.js';
import {createApiClient} from '../src/services/api-client.js';
import {adminFixture} from './helpers/admin-fixture.mjs';
import {createBackend} from '../backend/app.mjs';
import {createCommunity} from '../backend/community.mjs';
import {Readable} from 'node:stream';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const tick=()=>new Promise(r=>setImmediate(r));
test('arranque: solo sesión bloquea; pantalla precede a tareas y ninguna tarea espera a otra',async()=>{
 const session=deferred(),blocked=deferred(),events=[],metrics=[];
 const loading=startAuthenticatedUI({getSession:()=>session.promise,onSession:s=>s.authenticated,show:()=>events.push('screen'),tasks:{admin:()=>{events.push('admin');return blocked.promise},profile:()=>events.push('profile'),community:()=>events.push('community'),notifications:()=>events.push('notifications')},record:m=>metrics.push(m)});
 await tick();assert.deepEqual(events,[]);session.resolve({authenticated:true});const {pending}=await loading;await tick();assert.deepEqual(events,['screen','admin','profile','community','notifications']);assert.ok(metrics.some(m=>m.name==='session'&&m.duration>=0));blocked.resolve();await pending;
});
test('sin sesión o sesión invalidada durante espera: ninguna carga privada ni pantalla autenticada',async()=>{
 for(const authenticated of [{authenticated:false},{authenticated:true}]){let calls=0;await startAuthenticatedUI({authenticated,onSession:()=>false,show:()=>calls++,tasks:{profile:()=>calls++}});assert.equal(calls,0)}
 await assert.rejects(startAuthenticatedUI({getSession:()=>Promise.reject(Error('revoked')),onSession:()=>true,show:()=>assert.fail()}),/revoked/);
});
test('error secundario no impide que perfil o interfaz terminen',async()=>{
 let shown=false,profile=false;const errors=[];const {pending}=await startAuthenticatedUI({authenticated:{authenticated:true},onSession:()=>true,show:()=>shown=true,tasks:{admin:()=>Promise.reject(Error('timeout')),profile:()=>profile=true},onError:(e,n)=>errors.push(n)});await pending;assert.ok(shown&&profile);assert.deepEqual(errors,['admin']);
});
test('community y perfil: lecturas simultáneas compartidas, caché corta, force actualiza y mutación invalida',async()=>{
 let value=1,calls=0;const api=createApiClient({fetchImpl:async(path,options)=>{calls++;await tick();return Response.json({value:options.method==='POST'?++value:value})}});
 const [a,b]=await Promise.all([api.getCommunity(),api.getCommunity()]);assert.equal(calls,1);assert.equal(a,b);await api.getCommunity();assert.equal(calls,1);await api.getCommunity({force:true});assert.equal(calls,2);await api.getCommunity();assert.equal(calls,2);
 await api.markNotificationRead('local');assert.equal(calls,3);assert.equal((await api.getCommunity()).value,1);assert.equal(calls,3);
 await Promise.all([api.getProfile(),api.getProfile()]);assert.equal(calls,4);await api.equipCosmetic('frame','marco-basico');await api.getProfile();assert.equal(calls,6);
});
test('cosméticos pendientes anteriores a una mutación nunca repueblan caché ni seleccionan capas antiguas',async()=>{
 const old=deferred();let first=true;const api=createApiClient({fetchImpl:async(path,options)=>path.endsWith('/cosmetics')&&options.method==='GET'&&first?(first=false,old.promise):Response.json({selected:{frame:'nuevo'}})});
 const pending=api.getCosmetics();await tick();await api.equipCosmetic('frame','nuevo');old.resolve(Response.json({selected:{frame:'antiguo'}}));await assert.rejects(pending,e=>e.code==='session_changed');assert.equal((await api.getCosmetics()).selected.frame,'nuevo');
});
test('perfil resumido no consulta ni espera cosméticos; lectura separada mantiene sesión, sanciones y límites',async()=>{
 const f=await adminFixture({extended:true,cosmetics:true});try{
  const base=createCommunity({pool:f.pool,moderation:f.moderation,cosmeticsEnabled:true});let cosmeticReads=0;const community={...base,read:async(u,k)=>{if(k==='cosmetics')cosmeticReads++;return base.read(u,k)}};
  const handler=createBackend({repository:f.repository,moderation:f.moderation,community,sessionStore:'supabase'});
  async function call(path,cookie='pw2_session='+f.user.token){const req=Readable.from([]);Object.assign(req,{method:'GET',url:'/api'+path,headers:{cookie},socket:{remoteAddress:'127.0.0.1'}});let status,body;await handler(req,{setHeader(){},writeHead:s=>status=s,end:b=>body=JSON.parse(b)});return {status,body}}
  const main=await call('/profile?deferCosmetics=1');assert.equal(main.status,200);assert.ok(main.body.balances);assert.equal(main.body.cosmeticsEnabled,true);assert.equal(main.body.cosmetics,undefined);assert.equal(cosmeticReads,0);
  assert.equal((await call('/profile/cosmetics')).body.selected.frame,'marco-basico');assert.equal(cosmeticReads,1);
  assert.equal((await call('/profile/cosmetics','')).status,401);assert.equal((await call('/profile/cosmetics?nick=Perrisushi')).status,400);
  await f.db.query("UPDATE shop_access SET active=false WHERE nick=$1",[f.user.nick]);assert.equal((await call('/profile/cosmetics')).status,401);
 }finally{await f.db.close()}
});
