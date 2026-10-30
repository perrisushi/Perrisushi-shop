import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {serveSite} from '../backend/site.mjs';
import {onRequest as pages} from '../functions/_middleware.js';
import {labels,renderLiveUsers,renderLiveInventory,renderLiveShop,setPageData} from '../src/services/live-ui.js';
import {createApiClient} from '../src/services/api-client.js';

const forbidden=/maqueta|demostraci[oó]n|vista previa|fictici|pendiente|supabase|backend|datos de prueba|se mantendr[aá]n intactos|acciones desactivadas/i;
test('las vistas de producción y los errores públicos no contienen textos provisionales',async()=>{
 for(const state of [{status:'loading'},{status:'signedOut'},{status:'ready',items:[],inventory:{pc:0},randomKey:{},raffles:{}}]){
  for(const kind of ['users','inventory','shop'])setPageData(kind,state);
  for(const render of [renderLiveUsers,renderLiveInventory,renderLiveShop])assert.doesNotMatch(render(),forbidden);
 }
 for(const value of Object.values(labels))assert.doesNotMatch(value,forbidden);
 const source=await readFile('src/main.js','utf8');
 assert.doesNotMatch(source,/render\w+Preview|bindPreview|google-signin|or-rule|security-note|pw04-demo-badge|Las cuentas actuales|Por ahora conservamos|Ver opciones de acceso/);
 assert.doesNotMatch(await readFile('scripts/build.mjs','utf8'),/preview-pages\.js/);
 const auth=source.slice(source.indexOf('return `<div class="modal-head"><h2 id="modal-title">Entrar'),source.indexOf('async function initializeGoogleAccess'));
 assert.doesNotMatch(auth,/close-modal|disabled/i);
 assert.match(await readFile('index.html','utf8'),/body data-access="checking"/);
});

test('los recursos originales de juegos necesitan sesión verificada en servidor',async()=>{
 let authenticated=false;const serve=serveSite({root:process.cwd(),authenticate:async()=>authenticated});
 const call=async url=>{let status,headers;await serve({url,method:'GET'},{writeHead:(s,h)=>{status=s;headers=h},end:()=>{}});return {status,headers}};
 for(const path of ['/perricasillas','/perrirpg.html','/perripet-app/index.html','/perriduelos-app/index.html','/games/original/perrirpg.js']){
  assert.equal((await call(path)).status,303);authenticated=true;assert.equal((await call(path)).status,200);authenticated=false;
 }
});

test('Pages protege también las rutas directas y nunca conserva juegos en caché',async()=>{
 const previous=globalThis.fetch;let authenticated=false,served=0;
 try{
  globalThis.fetch=async()=>Response.json({authenticated});
  const context={request:new Request('https://site.example/perrirpg.html'),env:{PERRIWEB_BACKEND_ORIGIN:'https://api.example',PERRIWEB_PROXY_SECRET:'x'.repeat(40)},next:async()=>{served++;return new Response('game')}};
  assert.equal((await pages(context)).status,303);assert.equal(served,0);
  authenticated=true;const response=await pages(context);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(served,1);
 }finally{globalThis.fetch=previous}
});

test('caducidad privada avisa al acceso obligatorio y un password incorrecto no lo confunde',async()=>{
 let expired=0;const api=createApiClient({onSessionExpired:()=>expired++,fetchImpl:async()=>Response.json({error:'invalid_credentials'},{status:401})});
 await assert.rejects(api.login('A','bad'));assert.equal(expired,0);
 await assert.rejects(api.getInventory());assert.equal(expired,1);
});
