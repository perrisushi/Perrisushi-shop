import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {createRepository} from '../backend/repository.mjs';
import {createBackend} from '../backend/app.mjs';
import {serveSite} from '../backend/site.mjs';
import {metricsContext,timed,measuredClient,timingHeader} from '../backend/metrics.mjs';
import {Readable} from 'node:stream';
import {digest} from '../backend/security.mjs';
import transport from '../backend/game-transport.cjs';

test('un login rechazado no expone contadores que permitan distinguir cuentas existentes',async()=>{
 const repository=createRepository({url:'https://local.invalid',key:'LOCAL',fetchImpl:async input=>Response.json(new URL(input).searchParams.get('nick')==='eq.Known'?[{nick:'Known',active:true,code_hash:digest('correct')}]:[])}),handle=createBackend({repository});
 for(const nick of ['Known','Unknown']){
  const req=Readable.from([JSON.stringify({nick,password:'incorrect'})]);Object.assign(req,{url:'/api/auth/login',method:'POST',headers:{origin:'http://127.0.0.1:4173','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}});
  let status,headers;await handle(req,{setHeader(){},writeHead(s,h){status=s;headers=h},end(){}});assert.equal(status,401);assert.match(headers['Server-Timing'],/^app;dur=[\d.]+$/);
 }
});

test('recursos simultáneos deduplican solo verificaciones pendientes y mantienen revocación e identidad separadas',async()=>{
 let calls=0,active=true;
 const repository={configured:true,authenticatedSession:async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return active?{nick:'Owner',expires_at:new Date(Date.now()+10000).toISOString()}:null}};
 const handle=createBackend({repository,sessionStore:'supabase'}),req={headers:{cookie:'pw2_session='+'x'.repeat(43)}};
 const results=await Promise.all(Array.from({length:10},()=>handle.authenticate(req)));assert.equal(calls,1);assert.ok(results.every(r=>r.nick==='Owner'));
 active=false;assert.equal(await handle.authenticate(req),null);assert.equal(calls,2);
 await Promise.all([handle.authenticate(req),handle.authenticate({headers:{cookie:'pw2_session='+'z'.repeat(43)}})]);assert.equal(calls,4);
});

test('sesión agrupada verifica usuario y acceso en cada lectura sin cachear revocaciones',async()=>{
 let active=true,calls=0;const tokens=[];
 const repo=createRepository({url:'https://local.invalid',key:'LOCAL',fetchImpl:async input=>{calls++;const u=new URL(input);tokens.push(u.searchParams.get('token'));assert.equal(u.searchParams.get('select'),'nick,expires_at,shop_players!inner(active,shop_access!inner(active))');return Response.json([{nick:'Owner',expires_at:new Date(Date.now()+10000).toISOString(),shop_players:{active:true,shop_access:{active}}}])}});
 assert.equal((await repo.authenticatedSession('v2:OWN')).nick,'Owner');assert.equal(calls,1);
 active=false;assert.equal(await repo.authenticatedSession('v2:OWN'),null);assert.equal(calls,2);assert.deepEqual(tokens,['eq.v2:OWN','eq.v2:OWN']);
});

test('relaciones ausentes conservan las tres validaciones; permisos no se ocultan con fallback',async()=>{
 let count=0,joined=0;
 const fetchImpl=async input=>{count++;const u=new URL(input),table=u.pathname.split('/').pop();if(u.searchParams.get('select').includes('!inner')){joined++;return Response.json({code:'PGRST200'},{status:400})}return Response.json([{nick:'Owner',active:true,expires_at:new Date(Date.now()+10000).toISOString()}])};
 const repo=createRepository({url:'https://local.invalid',key:'LOCAL',fetchImpl});
 assert.equal((await repo.authenticatedSession('v2:OWN')).nick,'Owner');assert.equal(count,4);
 assert.equal((await repo.authenticatedSession('v2:OWN')).nick,'Owner');assert.equal(count,7);assert.equal(joined,1);
 const denied=createRepository({url:'https://local.invalid',key:'LOCAL',fetchImpl:async()=>Response.json({code:'42501'},{status:403})});
 await assert.rejects(denied.authenticatedSession('v2:OWN'),e=>e.diagnostic.upstreamCode==='42501');
});

test('lecturas deduplicadas solo dentro de una transacción; las escrituras invalidan y no se deduplican',async()=>{
 let value=1,reads=0,writes=0;
 const client={query:async(sql)=>{if(sql.startsWith('SELECT')){reads++;return {rows:[{pc:value}]}}writes++;value++;return {rows:[]}}};
 const url='https://local.invalid/rest/v1/shop_inventories?select=pc&nick=eq.Owner';
 await transport.withClient(client,async()=>{
  const [a,b]=await Promise.all([transport.fetch(url),transport.fetch(url)]);assert.equal(await a.text(),await b.text());assert.equal(reads,1);
  await transport.fetch('https://local.invalid/rest/v1/shop_notifications?id=eq.1',{method:'PATCH',body:JSON.stringify({read_at:'now'})});
  assert.equal(JSON.parse(await (await transport.fetch(url)).text())[0].pc,2);assert.equal(reads,2);
  await transport.fetch('https://local.invalid/rest/v1/shop_notifications?id=eq.1',{method:'PATCH',body:JSON.stringify({read_at:'now'})});assert.equal(writes,2);
 });
 value=10;await transport.withClient(client,async()=>assert.equal(JSON.parse(await (await transport.fetch(url)).text())[0].pc,10));assert.equal(reads,3);
});

test('gzip conserva recursos; ETag evita descargas y la sesión se valida antes de devolver 304',async()=>{
 let authorized=true,authChecks=0;const site=serveSite({root:process.cwd(),authenticate:async()=>{authChecks++;return authorized}});
 const call=async(url,headers={},method='GET')=>{let status,returned,body;await site({url,headers,method},{writeHead:(s,h)=>{status=s;returned=h},end:b=>{body=b}});return {status,headers:returned,body}};
 const first=await call('/src/main.js',{'accept-encoding':'gzip'});assert.equal(first.headers['Content-Encoding'],'gzip');assert.deepEqual(gunzipSync(first.body),await readFile('src/main.js'));
 assert.equal((await call('/src/main.js',{'if-none-match':first.headers.ETag})).status,304);
 assert.equal((await call('/src/main.js',{'accept-encoding':'gzip;q=0'})).headers['Content-Encoding'],undefined);
 const game=await call('/perrirpg.js');assert.equal(game.status,200);assert.match(game.headers['Cache-Control'],/private.*no-cache/);
 const again=await call('/perrirpg.js',{'if-none-match':game.headers.ETag});assert.equal(again.status,304);assert.equal(authChecks,2);
 authorized=false;assert.equal((await call('/perrirpg.js',{'if-none-match':game.headers.ETag})).status,303);assert.equal(authChecks,3);
 authorized=true;assert.equal((await call('/perrirpg.html')).headers['Cache-Control'],'no-store');assert.equal((await call('/src/main.js',{},'HEAD')).body,undefined);
});

test('una escritura invalida también comprobaciones de jugador por posibles triggers',async()=>{
 let active=true;const client={query:async sql=>{if(sql.startsWith('SELECT nick,active'))return {rows:[{nick:'Owner',active}]};active=false;return {rows:[]}}};
 await transport.withClient(client,async()=>{
  const ensure=()=>transport.fetch('https://local.invalid/rest/v1/shop_players?on_conflict=nick',{method:'POST',body:JSON.stringify({nick:'Owner'})});
  await ensure();await transport.fetch('https://local.invalid/rest/v1/shop_inventories?nick=eq.Owner',{method:'PATCH',body:JSON.stringify({pc:0})});
  await assert.rejects(ensure(),/existing_player_required/);
 });
});

test('métricas separan SQL y espera de pool sin registrar consultas ni identidad',async()=>{
 const metric={queries:0};await metricsContext.run(metric,async()=>{
  const c=measuredClient({query:async()=>({rows:[]}),release(){}});await timed('poolMs',()=>Promise.resolve());await c.query('SELECT PRIVATE-OWNER');
  const header=timingHeader(performance.now());assert.match(header,/sqlq;desc="1"/);assert.ok(!header.includes('PRIVATE'));assert.equal(metric.sqlQueries,1);assert.ok(metric.sqlMs>=0);assert.ok(metric.poolMs>=0);
 });
});
