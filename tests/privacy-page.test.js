import test from 'node:test';
import assert from 'node:assert/strict';
import {serveSite} from '../backend/site.mjs';
import {readFile} from 'node:fs/promises';

test('Privacidad: pública sin sesión, HTML accesible y sin modificar autenticación',async()=>{
 let authCalls=0;const serve=serveSite({root:process.cwd(),authenticate:async()=>{authCalls++;throw Error('No debe consultar sesiones')}});
 for(const url of ['/privacidad','/privacidad/','/privacidad.html']){
  let status,headers,body;await serve({url,method:'GET',headers:{}},{writeHead:(s,h)=>{status=s;headers=h},end:b=>body=String(b??'')});
  assert.equal(status,200);assert.match(headers['Content-Type'],/text\/html/);assert.match(headers['Content-Security-Policy'],/default-src 'none'/);
  assert.match(body,/PerriWeb/);assert.match(body,/mailto:perrisushi22@gmail.com/);
  assert.doesNotMatch(body,/data-legal-(draft|required)|Completar antes de publicar/);
 }
 assert.equal(authCalls,0);
});

test('Privacidad: HEAD público y la publicación no expone los borradores privados',async()=>{
 const serve=serveSite({root:process.cwd()});
 let status,body;await serve({url:'/privacidad',method:'HEAD',headers:{}},{writeHead:s=>status=s,end:b=>body=b});
 assert.equal(status,200);assert.equal(body,undefined);
 await serve({url:'/docs/google-auth/legal/PRIVACIDAD_PERRIWEB_PARA_REVISION.html',method:'GET',headers:{}},{writeHead:s=>status=s,end:()=>{}});
 assert.equal(status,404);
 const main=await readFile('src/main.js','utf8');assert.match(main,/<a href="\/privacidad"/);
});
