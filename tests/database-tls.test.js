import test from 'node:test';
import assert from 'node:assert/strict';
import {rootCertificates} from 'node:tls';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import pg from 'pg';
import {databasePoolOptions} from '../backend/database-config.mjs';
import {createGames} from '../backend/games.mjs';
const url='postgresql://postgres:LOCAL-TEST-ONLY@localhost:5432/postgres';
const ca=rootCertificates[0];

test('TLS conserva validación de CA y nombre; la CA PEM llega al cliente pg real',()=>{
 const options=databasePoolOptions({DATABASE_URL:url,DATABASE_SSL_CA:ca},{max:1});
 const actual=new pg.Client(options).connectionParameters.ssl;
 assert.equal(options.max,1);assert.equal(actual.rejectUnauthorized,true);assert.equal(actual.ca,ca.trim()+'\n');assert.equal(actual.checkServerIdentity,undefined);
 assert.equal(databasePoolOptions({DATABASE_URL:url}).ssl.rejectUnauthorized,true);
 assert.equal(databasePoolOptions({DATABASE_URL:url}).ssl.ca,undefined);
});

test('sslmode, ssl y uselibpqcompat no desactivan TLS ni sustituyen la CA',()=>{
 for(const query of ['sslmode=no-verify','sslmode=disable','ssl=false','ssl=0','sslmode=require&uselibpqcompat=true','sslmode=verify-ca&uselibpqcompat=true','sslnegotiation=direct']){
  const actual=new pg.Client(databasePoolOptions({DATABASE_URL:url+'?'+query,DATABASE_SSL_CA:ca.replace(/\n/g,'\\n')})).connectionParameters.ssl;
  assert.equal(actual.rejectUnauthorized,true,query);assert.equal(actual.ca,ca.trim()+'\n',query);assert.equal(actual.checkServerIdentity,undefined,query);
 }
});

test('rootcert existente se conserva y certificados erróneos fallan sin exponer valores privados',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'perri-tls-'));
 try{
  const file=join(dir,'root.crt');await writeFile(file,ca);
  const actual=new pg.Client(databasePoolOptions({DATABASE_URL:url+'?sslmode=require&sslrootcert='+encodeURIComponent(file)})).connectionParameters.ssl;
  assert.equal(actual.ca,ca.trim()+'\n');assert.equal(actual.rejectUnauthorized,true);
  for(const invalid of ['PRIVATE-INVALID-PEM','-----BEGIN CERTIFICATE-----\nPRIVATE-INVALID-PEM\n-----END CERTIFICATE-----','PRIVATE-EXTRA-TEXT\n'+ca]){
   assert.throws(()=>databasePoolOptions({DATABASE_URL:url,DATABASE_SSL_CA:invalid}),e=>e.code==='database_tls_configuration_invalid'&&!e.message.includes('PRIVATE')&&!e.message.includes('LOCAL-TEST-ONLY'));
  }
  assert.throws(()=>databasePoolOptions({DATABASE_URL:'https://PRIVATE-INVALID-URL'}),e=>e.code==='database_configuration_invalid'&&!e.message.includes('PRIVATE'));
 }finally{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert.ok(dir.includes('perri-tls-'));await rm(dir,{recursive:true,force:true})}
});

test('reproduce diagnóstico TLS de producción sin registrar cadena, URL, identidad ni tokens',async()=>{
 const events=[];const games=createGames({enabled:true,legacy:{handleShopAction(){}},pool:{connect:async()=>{throw Object.assign(Error('PRIVATE-CREDENTIALS'),{code:'SELF_SIGNED_CERT_IN_CHAIN'})}},onDiagnostic:e=>events.push(e)});
 assert.equal((await games.availability({nick:'PRIVATE-NICK',token:'x'.repeat(43)})).available,false);
 assert.deepEqual(events,[{event:'games_runtime',reason:'database_unavailable',failure:'SELF_SIGNED_CERT_IN_CHAIN'}]);
});
