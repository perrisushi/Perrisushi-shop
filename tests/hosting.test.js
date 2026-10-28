import test from 'node:test';
import assert from 'node:assert/strict';
import {serveSite} from '../backend/site.mjs';
import {onRequest} from '../functions/api/[[path]].js';
test('servidor público sirve CSS/módulos y rechaza backend, referencias y secretos',async()=>{
 const serve=serveSite({root:process.cwd()});
 const call=async url=>{let status,headers,body;await serve({url,method:'GET'},{writeHead:(s,h)=>{status=s;headers=h},end:b=>{body=b}});return {status,headers,body}};
 for(const path of ['/','/src/desktop-layout-fix.css','/src/services/live-ui.js','/public/assets/objeto-espada.webp'])assert.equal((await call(path)).status,200);
 for(const path of ['/backend/server.mjs','/.env','/backend/.env','/tests/backend.test.js','/.integracion-final/referencia-legacy/supabase-shop-api.js.txt','/package.json','/../backend/server.mjs','/%2e%2e/backend/server.mjs'])assert.equal((await call(path)).status,404);
 assert.match((await call('/src/styles.css')).headers['Content-Type'],/text\/css/);
});
test('proxy Pages: configuración privada, destino cerrado y preservación de cookie/CSRF',async()=>{
 const previous=globalThis.fetch;const calls=[];
 try{
  globalThis.fetch=async(url,options)=>{calls.push([url,options]);return new Response('{"authenticated":true}',{headers:{'Content-Type':'application/json','Set-Cookie':'pw2_session=private; HttpOnly; Secure','X-CSRF-Token':'test'}})};
  const request=new Request('https://preview.example/api/auth/login',{method:'POST',headers:{Origin:'https://preview.example','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:'{}'});
  assert.equal((await onRequest({request:request.clone(),env:{}})).status,503);
  const env={PERRIWEB_BACKEND_ORIGIN:'https://backend.example',PERRIWEB_PROXY_SECRET:'s'.repeat(40)};
  const response=await onRequest({request:request.clone(),env});assert.equal(response.status,200);
  assert.equal(String(calls[0][0]),'https://backend.example/api/auth/login');
  assert.equal(calls[0][1].headers.get('x-perriweb-client-ip'),'192.0.2.1');
  assert.equal(calls[0][1].headers.get('origin'),'https://preview.example');
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.equal(response.headers.get('x-csrf-token'),'test');
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-perriweb-proxy-secret'),null);
  const oversized=new Request('https://preview.example/api/auth/login',{method:'POST',body:'x'.repeat(4097)});
  assert.equal((await onRequest({request:oversized,env})).status,413);assert.equal(calls.length,1);
 }finally{globalThis.fetch=previous}
});
