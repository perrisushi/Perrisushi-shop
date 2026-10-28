import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient,ApiError} from '../src/services/api-client.js';
const json=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});
test('usa mismo origen y nunca expone secretos ni tokens',async()=>{
 const calls=[];const api=createApiClient({fetchImpl:async(url,opts)=>{calls.push([url,opts]);return json({authenticated:false});}});
 await api.getSession();
 assert.equal(calls[0][0],'/api/session');assert.equal(calls[0][1].credentials,'same-origin');
 assert.equal(calls[0][1].cache,'no-store');assert.equal(calls[0][1].method,'GET');
});
test('sin polling: consultas deduplicadas y caché temporal',async()=>{
 let n=0, clock=100;const api=createApiClient({fetchImpl:async()=>{n++;return json({n});},now:()=>clock});
 const both=await Promise.all([api.getInventory(),api.getInventory()]);
 assert.deepEqual(both,[{n:1},{n:1}]);assert.equal(n,1);
 await api.getInventory();assert.equal(n,1);
 clock+=21000;await api.getInventory();assert.equal(n,2);
});
test('una mutación invalida la caché y nunca reintenta',async()=>{
 let n=0;const api=createApiClient({fetchImpl:async()=>json({n:++n})});
 await api.getInventory();await api.getInventory();assert.equal(n,1);
 await api.updateAvatar('gato-1');assert.equal(n,2);
 await api.getInventory();assert.equal(n,3);
});
test('401 invalida la sesión temporal',async()=>{
 const api=createApiClient({fetchImpl:async()=>json({},401)});
 await assert.rejects(api.getInventory(),err=>err instanceof ApiError&&err.code==='session_expired');
});
test('bloquea bases no locales y limita paginación',async()=>{
 assert.throws(()=>createApiClient({fetchImpl:async()=>json({}),base:'https://test.invalid/api'}));
 let seen='';const api=createApiClient({fetchImpl:async(u)=>{seen=u;return json({items:[]})}});
 await api.listUsers({limit:1000,cursor:'a b'});
 assert.match(seen,/limit=50/);assert.match(seen,/cursor=a\+b/);
});

test('errores de transporte síncronos se normalizan y no bloquean solicitudes posteriores',async()=>{
 let calls=0;
 const api=createApiClient({fetchImpl:()=>{if(++calls===1)throw new Error('detalle interno');return Promise.resolve(json({ok:true}));}});
 await assert.rejects(api.getInventory(),e=>e instanceof ApiError&&e.code==='network_error'&&!e.message.includes('detalle'));
 assert.deepEqual(await api.getInventory(),{ok:true});
});

test('invalida lecturas pendientes antes de comenzar login y logout, incluso si fallan',async()=>{
 for(const action of ['login','logout']){
  let resolveOld;
  const api=createApiClient({fetchImpl:(url)=>url.endsWith('/inventory')?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve(json({},403))});
  const pending=api.getInventory();
  await Promise.resolve();
  await assert.rejects(action==='login'?api.login('demo','no-real-password'):api.logout(),e=>e.code==='forbidden');
  resolveOld(json({private:'old-session'}));
  await assert.rejects(pending,e=>e instanceof ApiError&&e.code==='session_changed');
 }
});

test('una respuesta vieja no elimina la deduplicación ni la caché de la sesión nueva',async()=>{
 const resolves=[];let calls=0;
 const api=createApiClient({fetchImpl:()=>{calls++;return new Promise(resolve=>resolves.push(resolve));}});
 const old=api.getProfile();await Promise.resolve();api.clearCache();
 const current=api.getProfile();await Promise.resolve();
 resolves[0](json({},401));await assert.rejects(old,e=>e.code==='session_changed');
 const duplicate=api.getProfile();resolves[1](json({name:'new-session'}));
 assert.deepEqual(await current,await duplicate);assert.equal(calls,2);
 assert.deepEqual(await api.getProfile(),{name:'new-session'});assert.equal(calls,2);
});

test('deduplica sesión sin almacenar su respuesta',async()=>{
 let calls=0;const api=createApiClient({fetchImpl:async()=>json({n:++calls})});
 await Promise.all([api.getSession(),api.getSession()]);assert.equal(calls,1);
 await api.getSession();assert.equal(calls,2);
});

test('paginación siempre usa enteros entre 1 y 50',async()=>{
 const seen=[];const api=createApiClient({fetchImpl:async url=>{seen.push(url);return json({items:[]})}});
 for(const limit of [NaN,Infinity,-Infinity,3.9,-4,0,70]){api.clearCache();await api.getHistory({limit});}
 assert.deepEqual(seen.map(url=>Number(new URL(url,'https://example.invalid').searchParams.get('limit'))),[20,20,20,3,1,1,50]);
});

test('normaliza barra final y rechaza bases con dobles barras',async()=>{
 assert.throws(()=>createApiClient({base:'/api//other'}));
 for(const [base,want] of [['/','/session'],['/api/','/api/session']]){
  let seen;const api=createApiClient({base,fetchImpl:async url=>{seen=url;return json({})}});await api.getSession();assert.equal(seen,want);
 }
});

test('rechaza respuesta JSON inválida sin detalles internos',async()=>{
 const api=createApiClient({fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('contenido privado')}})});
 await assert.rejects(api.getProfile(),e=>e instanceof ApiError&&e.code==='invalid_server_response');
});

test('timeout y mutaciones fallidas no se reintentan',async()=>{
 let calls=0;
 const api=createApiClient({timeoutMs:10,fetchImpl:(_url,{signal})=>{calls++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('cancelado','AbortError')),{once:true}));}});
 await assert.rejects(api.updateAvatar('gato-1'),e=>e instanceof ApiError&&e.code==='timeout');assert.equal(calls,1);
});

test('cada instancia tiene caché privada y crearla no inicia solicitudes',async()=>{
 let calls=0;const fetchImpl=async()=>json({n:++calls});
 const a=createApiClient({fetchImpl}),b=createApiClient({fetchImpl});assert.equal(calls,0);
 await a.getProfile();await b.getProfile();assert.equal(calls,2);
});
test('propaga solo errores públicos conocidos y conserva CSRF en memoria para logout',async()=>{
 const calls=[],token='x'.repeat(43);
 const api=createApiClient({fetchImpl:async(url,opts)=>{calls.push([url,opts]);return {...json(url.endsWith('/session')?{authenticated:true}:{authenticated:false}),headers:{get:()=>url.endsWith('/session')?token:null}}}});
 await api.getSession();await api.logout();assert.equal(calls[1][1].headers['X-CSRF-Token'],token);
 const offline=createApiClient({fetchImpl:async()=>json({error:'backend_not_configured'},503)});
 await assert.rejects(offline.getSession(),e=>e.code==='backend_not_configured');
 const unsafe=createApiClient({fetchImpl:async()=>json({error:'private_server_details'},500)});
 await assert.rejects(unsafe.getProfile(),e=>e.code==='request_failed');
});
