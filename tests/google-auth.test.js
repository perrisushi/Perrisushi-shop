import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import http from 'node:http';
import {createGoogleAuth,createGoogleProvider,oauthToken,validNewNick} from '../backend/google-auth.mjs';
import {createBackend} from '../backend/app.mjs';
import {digest,sessionKey} from '../backend/security.mjs';
import {onRequest as proxy,responseCookies} from '../functions/api/[[path]].js';
import {createLegalPages} from '../backend/legal-pages.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
async function fixture({termsVersion='local-reviewed-documents',registrationEnabled=true,provider:customProvider}={}){
 const db=new PGlite();
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);');
 await db.exec((await readFile('tests/fixtures/game-schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.query('INSERT INTO auth.users VALUES($1),($2)',[A,B]);
 await db.query("INSERT INTO shop_players(nick) VALUES('OldNick'),('OtherNick')");
 await db.query("INSERT INTO shop_access(nick,code_hash) VALUES('OldNick',$1),('OtherNick',$1)",[digest('original-password')]);
 await db.query("INSERT INTO shop_inventories(nick,pc,monedas,perri_cofres) VALUES('OldNick',987,12,4),('OtherNick',50,1,0)");
 await db.query("INSERT INTO shop_profiles(nick,owned_logo_ids,selected_logo_id) VALUES('OldNick','[\"logo-buho-1\"]','logo-buho-1')");
 await db.exec('ALTER TABLE shop_access ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false');
 const migration=await readFile('sql/002-google-auth.sql','utf8');
 await db.exec(migration);await db.exec(migration); // Reejecución sin perder vínculos ni hashes.
 let tail=Promise.resolve();
 const pool={async connect(){
  const previous=tail;let release;tail=new Promise(r=>release=r);await previous;
  return {query:(...args)=>db.query(...args),release};
 }};
 const provider=customProvider??{authorize:verifier=>'https://project.supabase.co/auth/v1/authorize?provider=google&challenge='+digest(verifier),exchange:async code=>code==='A'?A:code==='B'?B:Promise.reject(Error('provider rejected'))};
 const events=[],google=createGoogleAuth({pool,provider,origin:'https://perrisushi.com',secret:'s'.repeat(40),termsVersion,registrationEnabled,onDiagnostic:event=>events.push(event)});
 const repository={configured:true,access:async nick=>(await db.query('SELECT * FROM shop_access WHERE lower(nick)=lower($1)',[nick])).rows[0],
  player:async nick=>(await db.query('SELECT * FROM shop_players WHERE nick=$1',[nick])).rows[0],
  session:async token=>JSON.parse(JSON.stringify((await db.query('SELECT * FROM shop_sessions WHERE token=$1',[token])).rows[0]??null)),
  createSession:row=>db.query('INSERT INTO shop_sessions(token,nick,expires_at) VALUES($1,$2,$3)',[row.token,row.nick,row.expires_at]),
  deleteSession:token=>db.query('DELETE FROM shop_sessions WHERE token=$1',[token]),
  inventory:async nick=>(await db.query('SELECT * FROM shop_inventories WHERE nick=$1',[nick])).rows[0]};
 const user={nick:'OldNick',token:'x'.repeat(43)};
 await db.query("INSERT INTO shop_sessions(token,nick,expires_at) VALUES($1,$2,now()+interval '1 hour')",[sessionKey(user.token),user.nick]);
 const begin=async(mode='login',who=user)=>{const result=await google.start({mode,user:mode==='link'?who:null});return oauthToken(result.cookie)};
 return {db,pool,google,provider,events,repository,user,begin,close:()=>db.close()};
}
test('Google: PKCE S256 y validación remota del usuario; ningún token se devuelve al cliente',async()=>{
 const calls=[];const provider=createGoogleProvider({url:'https://project.supabase.co',key:'public-key',origin:'https://perrisushi.com',fetchImpl:async(url,options)=>{
  calls.push({url:new URL(url),options});
  return Response.json(calls.length===1?{access_token:'PRIVATE_ACCESS',refresh_token:'PRIVATE_REFRESH'}:{id:A,email_confirmed_at:'2026-10-30',identities:[{provider:'google'}]});
 }});
 const url=new URL(provider.authorize('v'.repeat(43)));
 assert.equal(url.searchParams.get('code_challenge_method'),'s256');assert.equal(url.searchParams.get('code_challenge').length,43);
 assert.equal(url.searchParams.get('redirect_to'),'https://perrisushi.com/api/auth/google/callback');
 assert.equal(await provider.exchange('one-time-code','v'.repeat(43)),A);
 assert.deepEqual(JSON.parse(calls[0].options.body),{auth_code:'one-time-code',code_verifier:'v'.repeat(43)});
 assert.equal(calls[1].options.headers.Authorization,'Bearer PRIVATE_ACCESS');
 assert.equal(calls[0].options.redirect,'error');
});
test('Google: rechazo de proveedor ajeno, usuario sin verificar y errores de Auth sin exponer secretos',async()=>{
 for(const user of [{id:A,email_confirmed_at:'yes',banned_until:'2099-01-01',identities:[{provider:'google'}]},{id:A,email_confirmed_at:'yes',identities:[{provider:'github'}]},{id:A,identities:[{provider:'google'}]},{id:'not-a-uuid',email_confirmed_at:'yes',identities:[{provider:'google'}]}]){
  const provider=createGoogleProvider({url:'https://project.supabase.co',key:'public',origin:'https://perrisushi.com',fetchImpl:async url=>Response.json(String(url).includes('/token?')?{access_token:'secret'}:user)});
  await assert.rejects(provider.exchange('code','verifier'),{code:'google_failed'});
 }
 const provider=createGoogleProvider({url:'https://project.supabase.co',key:'public',origin:'https://perrisushi.com',fetchImpl:async()=>{throw Error('PRIVATE connection')}});
 await assert.rejects(provider.exchange('code','secret'),e=>e.code==='google_unavailable'&&!e.message.includes('PRIVATE'));
});
test('Google: OAuth nuevo no crea jugador; registro explícito y atómico sin contraseña ni regalos inventados',async()=>{
 const f=await fixture();try{
  const before=(await f.db.query('SELECT * FROM shop_inventories ORDER BY nick')).rows;
  const token=await f.begin();assert.equal((await f.google.callback(token,'A')).outcome,'register');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM shop_players')).rows[0].n,2);
  const pending=await f.google.pending(token);assert.equal(pending.pending,true);
  const result=await f.google.register(token,pending.csrf,'NuevoNick');
  assert.equal(result.nick,'NuevoNick');assert.match(result.token,/^[\w-]{43}$/);
  const access=(await f.db.query("SELECT code_hash FROM shop_access WHERE nick='NuevoNick'")).rows[0];
  assert.equal(access.code_hash,null);
  const inventory=(await f.db.query("SELECT pc,monedas FROM shop_inventories WHERE nick='NuevoNick'")).rows[0];
  assert.deepEqual(inventory,{pc:0,monedas:0});
  assert.deepEqual((await f.db.query("SELECT * FROM shop_inventories WHERE nick<>'NuevoNick' ORDER BY nick")).rows,before);
  assert.equal((await f.google.pending(token)).pending,false);
  await assert.rejects(f.google.register(token,pending.csrf,'Duplicate'),{code:'google_expired'});
  const second=await f.begin();assert.equal((await f.google.callback(second,'A')).nick,'NuevoNick');
 }finally{await f.close()}
});
test('Google: vinculación conserva nick, hash, inventario y Perrilogo; permite login posterior',async()=>{
 const f=await fixture();try{
  const before=(await f.db.query("SELECT row_to_json(a) access,row_to_json(i) inventory,row_to_json(p) profile FROM shop_access a JOIN shop_inventories i USING(nick) JOIN shop_profiles p USING(nick) WHERE nick='OldNick'")).rows;
  const token=await f.begin('link');const linked=await f.google.callback(token,'A');assert.equal(linked.nick,'OldNick');assert.equal(linked.outcome,'linked');
  assert.equal((await f.db.query('SELECT 1 FROM shop_sessions WHERE token=$1',[sessionKey(f.user.token)])).rows.length,0);
  assert.deepEqual((await f.db.query("SELECT row_to_json(a) access,row_to_json(i) inventory,row_to_json(p) profile FROM shop_access a JOIN shop_inventories i USING(nick) JOIN shop_profiles p USING(nick) WHERE nick='OldNick'")).rows,before);
  assert.equal((await f.google.callback(await f.begin(),'A')).nick,'OldNick');
 }finally{await f.close()}
});
test('Google: unicidad en ambos sentidos, intentos simultáneos y repetición del callback',async()=>{
 const f=await fixture();try{
  await f.google.callback(await f.begin('link'),'A');
  const other={nick:'OtherNick',token:'y'.repeat(43)};await f.db.query("INSERT INTO shop_sessions(token,nick,expires_at) VALUES($1,$2,now()+interval '1 hour')",[sessionKey(other.token),other.nick]);
  await assert.rejects(f.google.callback(await f.begin('link',other),'A'),{code:'google_conflict'});
  const token=await f.begin();const results=await Promise.allSettled([f.google.callback(token,'A'),f.google.callback(token,'A')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_google_links')).rows[0].n,1);
 }finally{await f.close()}
});
test('Google: nick existente incluso con otras mayúsculas/espacios; CSRF; alta repetida concurrente',async()=>{
 const f=await fixture();try{
  const token=await f.begin();await f.google.callback(token,'A');const {csrf}=await f.google.pending(token);
  await assert.rejects(f.google.register(token,'wrong','NewNick'),{code:'csrf_invalid'});
  await assert.rejects(f.google.register(token,csrf,'oldnick'),{code:'nick_unavailable'});
  await assert.rejects(f.google.register(token,csrf,' OldNick'),{code:'nick_invalid'});
  const results=await Promise.allSettled([f.google.register(token,csrf,'NewNick'),f.google.register(token,csrf,'OtherNewNick')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM shop_players')).rows[0].n,3);
 }finally{await f.close()}
});
test('Google: fallo al crear perfil revierte jugador, acceso, inventario y vínculo completos',async()=>{
 const f=await fixture();try{
  const token=await f.begin();await f.google.callback(token,'A');const {csrf}=await f.google.pending(token);
  await f.db.exec("ALTER TABLE shop_profiles ADD CONSTRAINT reject_new CHECK(nick<>'FailNick')");
  await assert.rejects(f.google.register(token,csrf,'FailNick'),{code:'google_unavailable'});
  assert.equal((await f.db.query("SELECT 1 FROM shop_players WHERE nick='FailNick'")).rows.length,0);
  assert.equal((await f.google.pending(token)).pending,true);
  assert.ok(!JSON.stringify(f.events).includes('FailNick'));
 }finally{await f.close()}
});
test('Google: sesión revocada o cuenta desactivada impiden vinculación y acceso',async()=>{
 const f=await fixture();try{
  const token=await f.begin('link');
  await f.db.query('DELETE FROM shop_sessions WHERE token=$1',[sessionKey(f.user.token)]);
  await assert.rejects(f.google.callback(token,'A'),{code:'session_expired'});
  await f.db.query("INSERT INTO pw2_google_links(auth_user_id,nick) VALUES($1,'OldNick')",[A]);
  for(const table of ['shop_access','shop_players']){
   await f.db.exec('UPDATE '+table+" SET active=false WHERE nick='OldNick'");
   await assert.rejects(f.google.callback(await f.begin(),'A'),{code:'account_inactive'});
   await f.db.exec('UPDATE '+table+" SET active=true WHERE nick='OldNick'");
  }
 }finally{await f.close()}
});
test('Google: estado de un solo uso, caducidad, cancelación y cookies seguras',async()=>{
 const f=await fixture();try{
  const start=await f.google.start();assert.match(start.cookie,/HttpOnly; SameSite=Lax; Secure; Max-Age=600/);
  const token=oauthToken(start.cookie);
  assert.equal(oauthToken('pw2_oauth='+token+'; pw2_oauth='+token),null);
  await f.google.cancel(token);await assert.rejects(f.google.callback(token,'A'),{code:'google_expired'});
  const expired=await f.begin();await f.db.exec("UPDATE pw2_oauth_flows SET expires_at=now()-interval '1 minute'");
  await assert.rejects(f.google.callback(expired,'A'),{code:'google_expired'});
  assert.equal(validNewNick('<script>'),false);assert.equal(validNewNick('Perri_123'),true);
 }finally{await f.close()}
});
test('Google: RLS y permisos niegan acceso de navegador a vínculos y verificadores PKCE',async()=>{
 const f=await fixture();try{
  for(const role of ['anon','authenticated']){
   await f.db.exec('SET ROLE '+role);
   await assert.rejects(f.db.query('SELECT * FROM pw2_google_links'),e=>e.code==='42501');
   await assert.rejects(f.db.query('SELECT * FROM pw2_oauth_flows'),e=>e.code==='42501');
   await f.db.exec('RESET ROLE');
  }
 }finally{await f.close()}
});
async function httpFixture(worker,{legalPublished=true,termsVersion='local-reviewed-documents',registrationEnabled=true,provider}={}){
 const f=await fixture({termsVersion,registrationEnabled,provider});const server=http.createServer(createBackend({repository:f.repository,google:f.google,legalPublished,onAuthDiagnostic:event=>f.events.push(event),publicOrigin:'https://perrisushi.com',production:true,sessionStore:'supabase',allowSessionWrites:true,csrfSecret:'s'.repeat(40)}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const request=async(path,{method='GET',cookie,body,csrf,origin='https://perrisushi.com'}={})=>{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method,redirect:'manual',headers:{origin,...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:response.status,headers:response.headers,data:response.status===303?null:await response.json()};
 };
 try{await worker({...f,request})}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await f.close()}
}
test('HTTP: contraseña y CSRF obligatorios para vincular; acceso tradicional conservado después',()=>httpFixture(async({request})=>{
 const login=await request('/auth/login',{method:'POST',body:{nick:'oldnick',password:'original-password'}});
 assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie()[0].split(';')[0],csrf=login.headers.get('x-csrf-token');
 assert.equal((await request('/auth/google/start',{method:'POST',body:{mode:'link',password:'original-password'}})).status,401);
 assert.equal((await request('/auth/google/start',{method:'POST',cookie,body:{mode:'link',password:'original-password'}})).status,403);
 assert.equal((await request('/auth/google/start',{method:'POST',cookie,csrf,body:{mode:'link',password:'wrong'}})).status,400);
 const start=await request('/auth/google/start',{method:'POST',cookie,csrf,body:{mode:'link',password:'original-password'}});
 assert.equal(start.status,200);assert.ok(!JSON.stringify(start.data).includes('verifier'));
 const flowCookie=start.headers.getSetCookie()[0].split(';')[0];
 const callback=await request('/auth/google/callback?code=A',{cookie:flowCookie});
 assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/?google=linked#profile');
 assert.equal(callback.headers.getSetCookie().length,2);
 const linkedCookie=callback.headers.getSetCookie().find(v=>v.startsWith('pw2_session=')).split(';')[0];
 assert.equal((await request('/session',{cookie:linkedCookie})).data.nick,'OldNick');
 assert.equal((await request('/inventory',{cookie:linkedCookie})).data.inventory.pc,987);
 assert.equal((await request('/auth/login',{method:'POST',body:{nick:'OldNick',password:'original-password'}})).status,200);
}));
test('HTTP: registro acepta términos y CSRF propios, devuelve cookie habitual; Google-only no acepta contraseña',()=>httpFixture(async({request})=>{
 const start=await request('/auth/google/start',{method:'POST',body:{mode:'login'}});
 const cookie=start.headers.getSetCookie()[0].split(';')[0];
 const callback=await request('/auth/google/callback?code=A',{cookie});assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/?google=register#home');
 const pending=await request('/auth/google/pending',{cookie});assert.equal(pending.data.pending,true);
 assert.equal((await request('/auth/google/register',{method:'POST',cookie,body:{nick:'NuevoNick',csrf:pending.data.csrf}})).status,400);
 const result=await request('/auth/google/register',{method:'POST',cookie,body:{nick:'NuevoNick',csrf:pending.data.csrf,acceptedTerms:true,termsVersion:'local-reviewed-documents'}});
 assert.equal(result.status,200);assert.equal(result.data.nick,'NuevoNick');
 assert.ok(!JSON.stringify(result.data).includes('token'));
 const login=await request('/auth/login',{method:'POST',body:{nick:'NuevoNick',password:'anything'}});
 assert.equal(login.status,401);assert.equal(login.data.error,'invalid_credentials');
}));
test('HTTP: origen ajeno bloqueado; callback sin cookie y cancelado vuelve al acceso sin excepción',()=>httpFixture(async({request})=>{
 const bad=await request('/auth/google/start',{method:'POST',origin:'https://evil.example',body:{}});
 assert.equal(bad.status,403);
 const callback=await request('/auth/google/callback?code=A');
 assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/?google=google_expired#home');
 const denied=await request('/auth/google/callback?error=access_denied&error_description=SECRET');
 assert.equal(denied.headers.get('location'),'/?google=google_cancelled#home');
 assert.ok(!denied.headers.get('location').includes('SECRET'));
}));
test('HTTP: el interruptor de altas bloquea el registro independientemente de los legales',()=>httpFixture(async({request})=>{
 assert.equal((await request('/auth/google/config')).data.legalPublished,false);
 const result=await request('/auth/google/register',{method:'POST',body:{nick:'NoAccount',csrf:'no',acceptedTerms:true}});
 assert.equal(result.status,503);assert.equal(result.data.error,'registration_unavailable');
},{legalPublished:false,registrationEnabled:false}));
test('Proxy: solo admite retorno OAuth local y conserva ambas cookies, nunca redirecciones externas',async()=>{
 const previous=globalThis.fetch,env={PERRIWEB_BACKEND_ORIGIN:'https://backend.example',PERRIWEB_PROXY_SECRET:'s'.repeat(40)};
 try{
  for(const [path,location,expected]of [['/api/auth/google/callback','/?google=login#home',303],['/api/auth/google/callback','/?google=google_not_allowed#home',303],['/api/auth/google/callback','/?google=registration_unavailable#home',303],['/api/auth/google/callback','/?google=not_whitelisted#home',503],['/api/auth/google/callback','https://evil.example/',503],['/api/auth/login','/?google=login#home',503],['/api/auth/google/callback','//evil.example/?google=login#home',503]]){
   globalThis.fetch=async()=>{const headers=new Headers({Location:location});headers.append('Set-Cookie','pw2_oauth=; Max-Age=0; HttpOnly; Secure');headers.append('Set-Cookie','pw2_session=private; HttpOnly; Secure');return new Response(null,{status:303,headers})};
   const response=await proxy({request:new Request('https://perrisushi.com'+path),env});
   assert.equal(response.status,expected);if(expected===303)assert.equal(response.headers.getSetCookie().length,2);
  }
 }finally{globalThis.fetch=previous}
});
test('Legales: sin aprobación no publica; los borradores se rechazan incluso al activar la opción',()=>{
 assert.equal(createLegalPages().enabled,false);
 assert.throws(()=>createLegalPages({enabled:true}),/DIRECTORY/);
 assert.throws(()=>createLegalPages({enabled:true,directory:'docs/google-auth/legal'}),/aprobar/);
});

test('Google: otro Google no puede sustituir el ya vinculado al mismo nick',async()=>{
 const f=await fixture();try{
  const linked=await f.google.callback(await f.begin('link'),'A');
  await assert.rejects(f.google.callback(await f.begin('link',{nick:linked.nick,token:linked.token}),'B'),{code:'google_conflict'});
  assert.equal((await f.db.query("SELECT auth_user_id FROM pw2_google_links WHERE nick='OldNick'")).rows[0].auth_user_id,A);
 }finally{await f.close()}
});
test('Google: dos identidades que eligen el mismo nick solo crean un jugador',async()=>{
 const f=await fixture();try{
  const a=await f.begin(),b=await f.begin();
  await f.google.callback(a,'A');await f.google.callback(b,'B');
  const results=await Promise.allSettled([f.google.register(a,(await f.google.pending(a)).csrf,'SameNick'),f.google.register(b,(await f.google.pending(b)).csrf,'SameNick')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='nick_unavailable').length,1);
  const row=(await f.db.query('SELECT terms_version,terms_accepted_at FROM pw2_google_links')).rows[0];
  assert.equal(row.terms_version,'local-reviewed-documents');assert.ok(row.terms_accepted_at);
 }finally{await f.close()}
});
test('Google: sesiones y flujos sobreviven a otra instancia sin almacenar tokens OAuth',async()=>{
 const f=await fixture();try{
  const token=await f.begin();
  const other=createGoogleAuth({pool:f.pool,provider:f.provider,origin:'https://perrisushi.com',secret:'s'.repeat(40),termsVersion:'local-reviewed-documents'});
  await other.callback(token,'A');
  const pending=await f.google.pending(token);
  const result=await other.register(token,pending.csrf,'PersistentNick');
  assert.equal((await f.repository.session(sessionKey(result.token))).nick,'PersistentNick');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_oauth_flows')).rows[0].n,0);
 }finally{await f.close()}
});
test('HTTP: límite de intentos de vinculación preservado y logout invalida la sesión Google',()=>httpFixture(async({request})=>{
 const login=await request('/auth/login',{method:'POST',body:{nick:'OldNick',password:'original-password'}});
 const cookie=login.headers.getSetCookie()[0].split(';')[0],csrf=login.headers.get('x-csrf-token');
 let result;for(let i=0;i<9;i++)result=await request('/auth/google/start',{method:'POST',cookie,csrf,body:{mode:'link',password:'wrong'}});
 assert.equal(result.status,429);
 const logout=await request('/auth/logout',{method:'POST',cookie,csrf,body:{}});
 assert.equal(logout.status,200);assert.equal((await request('/session',{cookie})).data.authenticated,false);
}));

test('Google-only: la sesión emitida sirve en el dispatcher original de minijuegos sin contraseña ficticia',async()=>{
 const f=await fixture();try{
  await f.db.exec(await readFile('tests/fixtures/game-rpg.sql','utf8'));
  await f.db.exec(await readFile('tests/fixtures/game-pet.sql','utf8'));
  process.env.SUPABASE_URL='https://only-local.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='LOCAL-ONLY-NOT-A-SECRET';
  const {createGames}=await import('../backend/games.mjs');
  const {default:legacy}=await import('../backend/games-original.cjs');
  const token=await f.begin();await f.google.callback(token,'A');
  const user=await f.google.register(token,(await f.google.pending(token)).csrf,'GooglePlayer');
  const games=createGames({pool:f.pool,legacy,enabled:true});
  const result=await games.execute(user,{action:'publicShopGetProfile',idempotencyKey:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
  assert.equal(result.ok,true);
  assert.equal((await f.db.query("SELECT code_hash FROM shop_access WHERE nick='GooglePlayer'")).rows[0].code_hash,null);
 }finally{await f.close()}
});

test('Proxy: compatibilidad Workers getAll conserva cookies separadas sin dividir por comas',async()=>{
 const previous=globalThis.fetch;
 try{
  const cookies=['pw2_oauth=; HttpOnly; Max-Age=0','pw2_session=value; HttpOnly; Secure'];
  globalThis.fetch=async()=>({status:303,body:null,headers:{
   get:name=>name.toLowerCase()==='location'?'/?google=linked#profile':null,
   has:name=>name.toLowerCase()==='set-cookie',
   getAll:name=>{assert.equal(name,'Set-Cookie');return cookies}
  }});
  const response=await proxy({request:new Request('https://perrisushi.com/api/auth/google/callback?code=local'),env:{PERRIWEB_BACKEND_ORIGIN:'https://api.example',PERRIWEB_PROXY_SECRET:'s'.repeat(40)}});
  assert.equal(response.status,303);assert.deepEqual(response.headers.getSetCookie(),cookies);
 }finally{globalThis.fetch=previous}
});
test('Legales: HTML aprobado es público, tiene CSP y versión verificable; HEAD y POST correctos',async()=>{
 const {mkdtemp,writeFile,unlink,rmdir}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const directory=await mkdtemp(join(tmpdir(),'pw2-reviewed-legal-test-'));
 try{
  await writeFile(join(directory,'privacidad.html'),'<!doctype html><html lang="es"><title>Privacidad</title></html>');
  await writeFile(join(directory,'condiciones.html'),'<!doctype html><html lang="es"><title>Condiciones</title></html>');
  const legal=createLegalPages({enabled:true,directory});assert.equal(legal.enabled,true);assert.match(legal.version,/^[a-f0-9]{64}$/);
  assert.equal(legal.matches('/api/legal/privacy'),true);assert.equal(legal.matches('/api/legal/not-public'),false);
  for(const [method,status]of [['GET',200],['HEAD',200],['POST',405]]){
   let observed,headers,body;legal.handle({url:'/api/legal/privacy',method},{writeHead:(s,h)=>{observed=s;headers=h},end:value=>body=value});
   assert.equal(observed,status);assert.match(headers['Content-Security-Policy'],/default-src 'none'/);
   if(method==='HEAD')assert.equal(body,'');if(method==='GET')assert.match(body,/Privacidad/);
  }
 }finally{
  await unlink(join(directory,'privacidad.html'));await unlink(join(directory,'condiciones.html'));await rmdir(directory);
 }
});

test('HTTP: fallo de limpieza Google no bloquea login tradicional ni logout',()=>httpFixture(async({request,google,repository})=>{
 google.cancel=async()=>{throw Error('PRIVATE_GOOGLE_CLEANUP')};
 const oauth='pw2_oauth='+'o'.repeat(43);
 const login=await request('/auth/login',{method:'POST',cookie:oauth,body:{nick:'OldNick',password:'original-password'}});
 assert.equal(login.status,200);
 assert.equal(login.headers.getSetCookie().length,2);
 assert.match(login.headers.getSetCookie().find(c=>c.startsWith('pw2_oauth=')),/Max-Age=0/);
 const main=login.headers.getSetCookie().find(c=>c.startsWith('pw2_session=')).split(';')[0];
 const csrf=login.headers.get('x-csrf-token');
 const logout=await request('/auth/logout',{method:'POST',cookie:main+'; '+oauth,csrf,body:{}});
 assert.equal(logout.status,200);
 assert.equal((await request('/session',{cookie:main})).data.authenticated,false);
 assert.ok(!JSON.stringify(logout.data).includes('PRIVATE_GOOGLE_CLEANUP'));
}));
test('Google: el alta nunca hereda administración de un valor por defecto',async()=>{
 const f=await fixture();try{
  await f.db.exec('ALTER TABLE shop_access ALTER COLUMN is_admin SET DEFAULT true');
  const token=await f.begin();await f.google.callback(token,'A');
  await f.google.register(token,(await f.google.pending(token)).csrf,'RegularGoogleUser');
  assert.equal((await f.db.query("SELECT is_admin FROM shop_access WHERE nick='RegularGoogleUser'")).rows[0].is_admin,false);
 }finally{await f.close()}
});
test('Google: SQL de alta reserva el nick también frente a otro escritor',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.db.query("INSERT INTO shop_players(nick) VALUES(' oldnick ')"),e=>e.code==='23505');
  const hashes=(await f.db.query('SELECT nick,code_hash FROM shop_access ORDER BY nick')).rows;
  await f.db.exec(await readFile('sql/002-google-auth.sql','utf8'));
  assert.deepEqual((await f.db.query('SELECT nick,code_hash FROM shop_access ORDER BY nick')).rows,hashes);
 }finally{await f.close()}
});
test('Google: una estructura de índice incompatible cancela toda la migración sin cambios parciales',async()=>{
 const db=new PGlite();try{
  await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE shop_players(nick text PRIMARY KEY);CREATE TABLE shop_access(nick text PRIMARY KEY,code_hash text NOT NULL);CREATE INDEX pw2_shop_players_normalized_nick_uq ON shop_players(nick);INSERT INTO shop_players VALUES('Original');INSERT INTO shop_access VALUES('Original','UNCHANGED_LOCAL_HASH')");
  await assert.rejects(db.exec(await readFile('sql/002-google-auth.sql','utf8')),/restricción de nick/);
  await db.exec('ROLLBACK');
  const column=(await db.query("SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='shop_access' AND column_name='code_hash'")).rows[0];
  assert.equal(column.is_nullable,'NO');
  assert.equal((await db.query("SELECT to_regclass('public.pw2_google_links') name")).rows[0].name,null);
  assert.equal((await db.query("SELECT code_hash FROM shop_access WHERE nick='Original'")).rows[0].code_hash,'UNCHANGED_LOCAL_HASH');
 }finally{await db.close()}
});
test('Google: colisión de nick en la base devuelve un mensaje de disponibilidad',async()=>{
 const google=createGoogleAuth({pool:{connect:async()=>({query:async()=>{throw Object.assign(Error('PRIVATE SQL'),{code:'23505',constraint:'pw2_shop_players_normalized_nick_uq'})},release(){}})},provider:{authorize:()=> 'https://project.supabase.co/auth/v1/authorize?provider=google'},origin:'https://perrisushi.com',secret:'s'.repeat(40),termsVersion:'local'});
 await assert.rejects(google.start(),{code:'nick_unavailable'});
});
test('Legales: retirar solo las marcas no permite publicar texto pendiente',async()=>{
 const {mkdtemp,writeFile,unlink,rmdir}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const directory=await mkdtemp(join(tmpdir(),'pw2-unapproved-legal-'));
 try{
  for(const file of ['privacidad.html','condiciones.html'])await writeFile(join(directory,file),'<html>Completar antes de publicar: responsable</html>');
  assert.throws(()=>createLegalPages({enabled:true,directory}),/aprobar/);
 }finally{for(const file of ['privacidad.html','condiciones.html'])await unlink(join(directory,file));await rmdir(directory)}
});

test('HTTP: no registra una cuenta si cambió la versión legal que aceptó el usuario',()=>httpFixture(async({request,db})=>{
 const config=await request('/auth/google/config');assert.equal(config.data.legalVersion,'local-reviewed-documents');
 const start=await request('/auth/google/start',{method:'POST',body:{mode:'login'}});
 const cookie=start.headers.getSetCookie()[0].split(';')[0];
 await request('/auth/google/callback?code=A',{cookie});
 const pending=await request('/auth/google/pending',{cookie});
 const result=await request('/auth/google/register',{method:'POST',cookie,body:{nick:'NoStaleConsent',csrf:pending.data.csrf,acceptedTerms:true,termsVersion:'old-document'}});
 assert.equal(result.status,409);assert.equal(result.data.error,'legal_changed');
 assert.equal((await db.query("SELECT 1 FROM shop_players WHERE nick='NoStaleConsent'")).rows.length,0);
 assert.equal((await request('/auth/google/pending',{cookie})).data.pending,true);
}));

test('HTTP: prueba OAuth sin legales publicados vincula y permite entrar, pero nunca registra jugadores nuevos',()=>httpFixture(async({request,db})=>{
 const before=(await db.query('SELECT * FROM shop_inventories ORDER BY nick')).rows;
 const originalAccess=(await db.query('SELECT * FROM shop_access ORDER BY nick')).rows;
 const config=await request('/auth/google/config');
 assert.equal(config.data.enabled,true);assert.equal(config.data.legalPublished,false);assert.equal(config.data.legalVersion,null);
 const login=await request('/auth/login',{method:'POST',body:{nick:'OldNick',password:'original-password'}});
 assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().find(v=>v.startsWith('pw2_session=')).split(';')[0];
 const start=await request('/auth/google/start',{method:'POST',cookie,csrf:login.headers.get('x-csrf-token'),body:{mode:'link',password:'original-password'}});
 assert.equal(start.status,200);
 const linked=await request('/auth/google/callback?code=A',{cookie:start.headers.getSetCookie()[0].split(';')[0]});
 assert.equal(linked.headers.get('location'),'/?google=linked#profile');
 const linkedCookie=linked.headers.getSetCookie().find(v=>v.startsWith('pw2_session=')).split(';')[0];
 const session=await request('/session',{cookie:linkedCookie});assert.equal(session.data.nick,'OldNick');
 assert.equal((await request('/auth/logout',{method:'POST',cookie:linkedCookie,csrf:session.headers.get('x-csrf-token'),body:{}})).status,200);
 const googleStart=await request('/auth/google/start',{method:'POST',body:{mode:'login'}});
 const googleLogin=await request('/auth/google/callback?code=A',{cookie:googleStart.headers.getSetCookie()[0].split(';')[0]});
 assert.equal(googleLogin.headers.get('location'),'/?google=login#home');
 const googleCookie=googleLogin.headers.getSetCookie().find(v=>v.startsWith('pw2_session=')).split(';')[0];
 assert.equal((await request('/session',{cookie:googleCookie})).data.nick,'OldNick');
 const strangerStart=await request('/auth/google/start',{method:'POST',body:{mode:'login'}});
 const strangerCookie=strangerStart.headers.getSetCookie()[0].split(';')[0];
 await request('/auth/google/callback?code=B',{cookie:strangerCookie});
 const pending=await request('/auth/google/pending',{cookie:strangerCookie});assert.equal(pending.data.pending,false);
 const denied=await request('/auth/google/register',{method:'POST',cookie:strangerCookie,body:{nick:'BlockedNewPlayer',csrf:pending.data.csrf,acceptedTerms:true,termsVersion:null}});
 assert.equal(denied.status,503);assert.equal(denied.data.error,'registration_unavailable');
 assert.equal((await db.query('SELECT count(*)::integer AS total FROM shop_players')).rows[0].total,2);
 assert.equal((await db.query('SELECT count(*)::integer AS total FROM pw2_google_links')).rows[0].total,1);
 assert.deepEqual((await db.query('SELECT * FROM shop_inventories ORDER BY nick')).rows,before);
 assert.deepEqual((await db.query('SELECT * FROM shop_access ORDER BY nick')).rows,originalAccess);
 assert.equal((await request('/auth/login',{method:'POST',body:{nick:'OldNick',password:'original-password'}})).status,200);
},{legalPublished:false,termsVersion:null,registrationEnabled:false}));

test('Google privado: solo el correo verificado de la identidad Google autorizada; no acepta metadatos ni alias',async()=>{
 const user=(email='owner@example.test')=>({id:A,email,email_confirmed_at:'2026-10-31',identities:[{provider:'google',identity_data:{email,email_verified:true}}]});
 let response=user();
 const provider=createGoogleProvider({url:'https://project.supabase.co',key:'public',origin:'https://perrisushi.com',testOnly:true,testEmail:' OWNER@example.test ',fetchImpl:async url=>Response.json(String(url).includes('/token?')?{access_token:'PRIVATE_ACCESS'}:response)});
 assert.equal(await provider.exchange('A','verifier'),A);
 response=user('other@example.test');response.user_metadata={email:'owner@example.test'};
 await assert.rejects(provider.exchange('B','verifier'),{code:'google_not_allowed'});
 response=user();response.identities[0].identity_data.email='other@example.test';
 await assert.rejects(provider.exchange('B','verifier'),{code:'google_not_allowed'});
 response=user();response.identities[0].identity_data.email_verified=false;
 await assert.rejects(provider.exchange('B','verifier'),{code:'google_not_allowed'});
 response=user('owner+alias@example.test');
 await assert.rejects(provider.exchange('B','verifier'),{code:'google_not_allowed'});
});

test('Google privado: correo ausente o mal configurado no inicia OAuth y no realiza conexiones',async()=>{
 for(const testEmail of [undefined,'','not-an-email','owner@example.test,other@example.test','owner@example.test\nother@example.test']){
  const provider=createGoogleProvider({url:'https://project.supabase.co',key:'public',origin:'https://perrisushi.com',testOnly:true,testEmail,fetchImpl:()=>assert.fail('No debe conectarse')});
  assert.throws(()=>provider.authorize('verifier'),{code:'google_unavailable'});
  await assert.rejects(provider.exchange('A','verifier'),{code:'google_unavailable'});
 }
});

function privateTestProvider(){
 let selected='A';
 return createGoogleProvider({url:'https://project.supabase.co',key:'public',origin:'https://perrisushi.com',testOnly:true,testEmail:'owner@example.test',fetchImpl:async(url,options)=>{
  if(String(url).includes('/token?')){selected=JSON.parse(options.body).auth_code;return Response.json({access_token:'PRIVATE_ACCESS'})}
  const email=selected==='A'?'owner@example.test':'other@example.test';
  return Response.json({id:selected==='A'?A:B,email,email_confirmed_at:'2026-10-31',identities:[{provider:'google',identity_data:{email,email_verified:true}}]});
 }});
}

test('HTTP privado: vinculación y login sin legales; otro Google no obtiene vínculo/sesión y no existe alta pública',()=>httpFixture(async({request,db})=>{
 const inventory=(await db.query('SELECT * FROM shop_inventories ORDER BY nick')).rows;
 const access=(await db.query('SELECT * FROM shop_access ORDER BY nick')).rows;
 const config=await request('/auth/google/config');assert.equal(config.data.registrationEnabled,false);assert.equal(config.data.legalPublished,false);
 const traditional=await request('/auth/login',{method:'POST',body:{nick:'OldNick',password:'original-password'}});
 const cookie=traditional.headers.getSetCookie().find(v=>v.startsWith('pw2_session=')).split(';')[0];
 const start=await request('/auth/google/start',{method:'POST',cookie,csrf:traditional.headers.get('x-csrf-token'),body:{mode:'link',password:'original-password'}});
 const linked=await request('/auth/google/callback?code=A',{cookie:start.headers.getSetCookie()[0].split(';')[0]});
 assert.equal(linked.headers.get('location'),'/?google=linked#profile');
 const loginStart=await request('/auth/google/start',{method:'POST',body:{mode:'login'}});
 const login=await request('/auth/google/callback?code=A',{cookie:loginStart.headers.getSetCookie()[0].split(';')[0]});
 assert.equal(login.headers.get('location'),'/?google=login#home');
 const sessionCookie=login.headers.getSetCookie().find(v=>v.startsWith('pw2_session=')).split(';')[0];
 const session=await request('/session',{cookie:sessionCookie});assert.equal(session.data.nick,'OldNick');
 const countBefore=(await db.query('SELECT count(*) AS total FROM shop_sessions')).rows[0].total;
 const other=await request('/auth/google/start',{method:'POST',body:{mode:'login'}});
 const denied=await request('/auth/google/callback?code=B',{cookie:other.headers.getSetCookie()[0].split(';')[0]});
 assert.equal(denied.headers.get('location'),'/?google=google_not_allowed#home');
 assert.equal((await db.query('SELECT count(*) AS total FROM shop_sessions')).rows[0].total,countBefore);
 assert.equal((await db.query('SELECT count(*)::integer AS total FROM pw2_google_links')).rows[0].total,1);
 assert.equal((await db.query('SELECT count(*)::integer AS total FROM pw2_oauth_flows')).rows[0].total,0);
 assert.equal((await request('/auth/google/register',{method:'POST',body:{nick:'Blocked',acceptedTerms:true}})).data.error,'registration_unavailable');
 assert.deepEqual((await db.query('SELECT * FROM shop_inventories ORDER BY nick')).rows,inventory);
 assert.deepEqual((await db.query('SELECT * FROM shop_access ORDER BY nick')).rows,access);
 assert.equal((await request('/auth/logout',{method:'POST',cookie:sessionCookie,csrf:session.headers.get('x-csrf-token'),body:{}})).status,200);
 assert.equal((await request('/session',{cookie:sessionCookie})).data.authenticated,false);
 assert.equal((await request('/auth/login',{method:'POST',body:{nick:'OldNick',password:'original-password'}})).status,200);
},{legalPublished:false,termsVersion:null,registrationEnabled:false,provider:privateTestProvider()}));

test('HTTP privado: las altas siguen cerradas aunque se publiquen legales; la contraseña no depende del correo de prueba',()=>httpFixture(async({request,google})=>{
 assert.equal((await request('/auth/google/config')).data.registrationEnabled,false);
 const denied=await request('/auth/google/register',{method:'POST',body:{nick:'Blocked',acceptedTerms:true,termsVersion:'local-reviewed-documents'}});
 assert.equal(denied.status,503);assert.equal(denied.data.error,'registration_unavailable');
 await assert.rejects(google.register('any','any','Blocked'),{code:'registration_unavailable'});
 assert.equal((await request('/auth/login',{method:'POST',body:{nick:'OldNick',password:'original-password'}})).status,200);
 const attempt=await request('/auth/google/start',{method:'POST',body:{mode:'login'}});
 assert.equal(attempt.status,503);assert.equal(attempt.data.error,'google_unavailable');
},{legalPublished:true,registrationEnabled:false,provider:createGoogleProvider({url:'https://project.supabase.co',key:'public',origin:'https://perrisushi.com',testOnly:true})}));


test('Proxy OAuth: encabezado combinado o API vacía no pierde la cookie de sesión y respeta Expires',async()=>{
 const raw='pw2_oauth=; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT; HttpOnly; Secure, pw2_session=PRIVATE_TOKEN; Path=/; HttpOnly; SameSite=Strict; Secure';
 const combined={getSetCookie:()=>[],getAll:()=>[],has:name=>name==='set-cookie',get:name=>name==='set-cookie'?raw:null};
 assert.deepEqual(responseCookies(combined),['pw2_oauth=; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT; HttpOnly; Secure','pw2_session=PRIVATE_TOKEN; Path=/; HttpOnly; SameSite=Strict; Secure']);
 const previous=globalThis.fetch,info=console.info,logs=[];
 try{
  console.info=event=>logs.push(JSON.parse(event));
  globalThis.fetch=async()=>({status:303,body:null,headers:{...combined,get:name=>name==='location'?'/?google=login#home':combined.get(name)}});
  const result=await proxy({request:new Request('https://perrisushi.com/api/auth/google/callback?code=PRIVATE_CODE'),env:{PERRIWEB_BACKEND_ORIGIN:'https://api.example',PERRIWEB_PROXY_SECRET:'s'.repeat(40)}});
  assert.equal(result.status,303);assert.equal(result.headers.getSetCookie().length,2);
  assert.equal(logs.at(-1).sessionCookieForwarded,true);assert.equal(logs.at(-1).cookiesForwarded,2);
  assert.ok(!JSON.stringify(logs).includes('PRIVATE'));
 }finally{globalThis.fetch=previous;console.info=info}
});

test('OAuth: vínculo persiste al salir; diagnóstico distingue cookie perdida de sesión válida sin secretos',()=>httpFixture(async({request,db,events})=>{
 const login=await request('/auth/login',{method:'POST',body:{nick:'OldNick',password:'original-password'}});
 const cookie=login.headers.getSetCookie().find(c=>c.startsWith('pw2_session=')).split(';')[0];
 const start=await request('/auth/google/start',{method:'POST',cookie,csrf:login.headers.get('x-csrf-token'),body:{mode:'link',password:'original-password'}});
 const linked=await request('/auth/google/callback?code=A',{cookie:start.headers.getSetCookie()[0].split(';')[0]});
 const linkedCookie=linked.headers.getSetCookie().find(c=>c.startsWith('pw2_session=')).split(';')[0];
 const session=await request('/session',{cookie:linkedCookie});
 await request('/auth/logout',{method:'POST',cookie:linkedCookie,csrf:session.headers.get('x-csrf-token'),body:{}});
 assert.equal((await db.query('SELECT nick FROM pw2_google_links WHERE auth_user_id=$1',[A])).rows[0].nick,'OldNick');
 const again=await request('/auth/google/start',{method:'POST',body:{mode:'login'}});
 const callback=await request('/auth/google/callback?code=A',{cookie:again.headers.getSetCookie()[0].split(';')[0]});
 assert.match(callback.headers.get('x-request-id'),/^[a-f0-9-]{36}$/i);
 const sessionCookie=callback.headers.getSetCookie().find(c=>c.startsWith('pw2_session=')).split(';')[0];
 assert.equal((await request('/session')).data.authenticated,false);
 assert.equal(events.at(-1).reason,'cookie_missing');
 assert.equal((await request('/session',{cookie:sessionCookie})).data.authenticated,true);
 assert.equal(events.at(-1).reason,'session_valid');
 assert.ok(events.some(e=>e.stage==='callback_commit'&&e.reason==='login'&&e.linkFound&&e.sessionCreated));
 assert.ok(events.some(e=>e.stage==='session_visibility'&&e.reason==='session_recoverable'));
 for(const privateValue of ['OldNick',A,'original-password',sessionCookie.slice(12),'PRIVATE_CODE'])assert.ok(!JSON.stringify(events).includes(privateValue));
},{legalPublished:false,termsVersion:null,registrationEnabled:false}));

test('OAuth: no entrega una cookie de éxito si la sesión SQL no se recupera por la API habitual',()=>httpFixture(async({request,repository,db,events})=>{
 await db.query("INSERT INTO pw2_google_links(auth_user_id,nick) VALUES($1,'OldNick')",[A]);
 const start=await request('/auth/google/start',{method:'POST',body:{mode:'login'}});
 repository.session=async()=>null;
 const result=await request('/auth/google/callback?code=A',{cookie:start.headers.getSetCookie()[0].split(';')[0]});
 assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/?google=google_unavailable#home');
 assert.ok(!result.headers.getSetCookie().some(c=>c.startsWith('pw2_session=')));
 assert.ok(events.some(e=>e.stage==='session_visibility'&&e.reason==='session_not_recoverable'));
 assert.equal((await db.query('SELECT count(*)::integer AS n FROM pw2_google_links')).rows[0].n,1);
},{legalPublished:false,termsVersion:null,registrationEnabled:false}));


test('Diagnóstico OAuth: distingue intercambio e identidad sin registrar la respuesta del proveedor',async()=>{
 const events=[];let tokenFails=true;
 const provider=createGoogleProvider({url:'https://project.supabase.co',key:'PRIVATE_KEY',origin:'https://perrisushi.com',onDiagnostic:e=>events.push(e),fetchImpl:async url=>{
  if(String(url).includes('/token?'))return tokenFails?Response.json({error:'PRIVATE_PROVIDER_BODY'},{status:400}):Response.json({access_token:'PRIVATE_TOKEN'});
  return Response.json({id:A,email_confirmed_at:'2026-10-31',identities:[]});
 }});
 await assert.rejects(provider.exchange('PRIVATE_CODE','PRIVATE_VERIFIER'),{code:'google_failed'});
 assert.equal(events.at(-1).stage,'token_exchange');
 tokenFails=false;
 await assert.rejects(provider.exchange('PRIVATE_CODE','PRIVATE_VERIFIER'),{code:'google_failed'});
 assert.equal(events.at(-1).stage,'identity_validation');
 assert.ok(!JSON.stringify(events).includes('PRIVATE'));
});


test('Google público: registro explícito sin publicar borradores ni inventar aceptación legal; cuentas existentes intactas',()=>httpFixture(async({request,db})=>{
 const before=(await db.query('SELECT * FROM shop_inventories ORDER BY nick')).rows;
 const access=(await db.query('SELECT * FROM shop_access ORDER BY nick')).rows;
 const config=(await request('/auth/google/config')).data;
 assert.equal(config.registrationEnabled,true);assert.equal(config.legalPublished,false);assert.equal(config.legalVersion,null);
 const start=await request('/auth/google/start',{method:'POST',body:{mode:'login'}});
 const cookie=start.headers.getSetCookie()[0].split(';')[0];
 const callback=await request('/auth/google/callback?code=B',{cookie});assert.equal(callback.headers.get('location'),'/?google=register#home');
 assert.equal((await db.query('SELECT count(*)::integer AS n FROM shop_players')).rows[0].n,2);
 const pending=(await request('/auth/google/pending',{cookie})).data;
 const forged=await request('/auth/google/register',{method:'POST',cookie,body:{nick:'CommunityUser',csrf:pending.csrf,acceptedTerms:true,termsVersion:'invented'}});
 assert.equal(forged.status,409);
 const invalid=await request('/auth/google/register',{method:'POST',cookie,body:{nick:'OldNick',csrf:pending.csrf,acceptedTerms:false,termsVersion:null}});assert.equal(invalid.data.error,'nick_unavailable');
 const result=await request('/auth/google/register',{method:'POST',cookie,body:{nick:'CommunityUser',csrf:pending.csrf,acceptedTerms:false,termsVersion:null}});
 assert.equal(result.status,200);assert.equal(result.data.nick,'CommunityUser');
 const link=(await db.query("SELECT terms_version,terms_accepted_at FROM pw2_google_links WHERE nick='CommunityUser'")).rows[0];
 assert.equal(link.terms_version,null);assert.equal(link.terms_accepted_at,null);
 const rows=(await db.query("SELECT * FROM shop_inventories WHERE nick<>'CommunityUser' ORDER BY nick")).rows;assert.deepEqual(rows,before);
 assert.deepEqual((await db.query("SELECT * FROM shop_access WHERE nick<>'CommunityUser' ORDER BY nick")).rows,access);
},{legalPublished:false,termsVersion:null,registrationEnabled:true}));
