import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {adminFixture} from './helpers/admin-fixture.mjs';import {createBackend} from '../backend/app.mjs';import {createRepository,BackendError} from '../backend/repository.mjs';import {SESSION_TTL_MS} from '../backend/session-policy.mjs';import {sessionKey,cookieToken} from '../backend/security.mjs';import {createGoogleAuth,oauthToken} from '../backend/google-auth.mjs';import {createApiClient} from '../src/services/api-client.js';import {createGames} from '../backend/games.mjs';import {onRequest as proxy} from '../functions/api/[[path]].js';
const DAY=86400000;
async function use(work){
 const f=await adminFixture({extended:true});let clock=Date.now(),turn=0,extra={};const options=()=>({repository:f.repository,moderation:f.moderation,administration:f.administration,sessionStore:'supabase',allowSessionWrites:true,now:()=>clock,csrfSecret:'s'.repeat(40),...extra});let instances=[createBackend(options())];
 const server=http.createServer((req,res)=>instances[turn++%instances.length](req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,{cookie,csrf,method='GET',body}={})=>{const r=await fetch(base+'/api'+path,{method,headers:{Origin:'http://127.0.0.1:4173',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual'});const type=r.headers.get('content-type')??'';return {status:r.status,data:type.includes('json')?await r.json():await r.text(),headers:r.headers,cookies:r.headers.getSetCookie?.()??[]}};
 const login=async(nick='Usuario')=>{const r=await request('/auth/login',{method:'POST',body:{nick,password:'clave-local-pruebas'}});assert.equal(r.status,200,JSON.stringify(r.data));return {cookie:r.cookies.find(c=>c.startsWith('pw2_session=')).split(';')[0],csrf:r.headers.get('x-csrf-token'),response:r}};
 const restart=(extras={},count=1)=>{extra={...extra,...extras};instances=Array.from({length:count},()=>createBackend(options()))};
 try{await work({...f,request,login,restart,clock:()=>clock,advance:ms=>clock+=ms})}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await f.db.close()}
}
const row=async(f,cookie)=>(await f.db.query('SELECT * FROM shop_sessions WHERE token=$1',[sessionKey(cookieToken(cookie))])).rows[0];
const moderate=(f,mode,overrides={})=>f.administration.execute(f.admin,{action:'moderation',operationId:randomUUID(),target:'Usuario',mode,expectedSanctionId:null,reason:'Prueba de persistencia',confirmed:true,...overrides});

test('persistencia: cookie protegida 365 días, token aleatorio hasheado y mismo contrato de acceso',()=>use(async f=>{
 const a=await f.login();const cookie=a.response.cookies.find(c=>c.startsWith('pw2_session='));assert.match(cookie,/Max-Age=31536000/);assert.match(cookie,/HttpOnly; SameSite=Strict/);assert.match(cookie,/Path=\//);
 const saved=await row(f,a.cookie);assert.match(saved.token,/^v2:[a-f0-9]{64}$/);assert.notEqual(saved.token,cookieToken(a.cookie));assert.equal(new Date(saved.expires_at).getTime()-f.clock(),SESSION_TTL_MS);
 assert.equal((await f.request('/session',{cookie:a.cookie})).data.authenticated,true);assert.equal((await f.request('/profile',{cookie:a.cookie})).status,200);
 f.restart({production:true,publicOrigin:'https://perrisushi.com'});const state=await f.request('/session',{cookie:a.cookie});assert.equal(state.data.authenticated,true);assert.match(state.cookies[0],/; Secure;/);
}));

test('persistencia: recarga, nueva pestaña/instancia y regreso tras 24 h, 7, 30, 200 y 500 días con renovación',()=>use(async f=>{
 const a=await f.login();let current=0,renewals=0;const original=f.repository.renewSession;f.repository.renewSession=async args=>{const result=await original(args);if(result)renewals++;return result};
 for(const days of [0,1,7,30,200,500]){
  f.advance((days-current)*DAY);current=days;f.restart();const response=await f.request('/session',{cookie:a.cookie});assert.equal(response.data.nick,'Usuario','regreso día '+days);assert.equal(response.data.authenticated,true);
  assert.equal((await f.request('/profile',{cookie:a.cookie})).status,200);assert.equal((await row(f,a.cookie)).nick,'Usuario');assert.ok(new Date((await row(f,a.cookie)).expires_at).getTime()>f.clock()+364*DAY);
 }
 assert.equal(renewals,5);assert.equal((await f.db.query("SELECT count(*)::int n FROM shop_sessions WHERE nick='Usuario'")).rows[0].n,2);
}));

test('compatibilidad: una sesión antigua válida de ocho horas se amplía sin cambiar token, nick o CSRF',()=>use(async f=>{
 await f.db.query('UPDATE shop_sessions SET expires_at=$1 WHERE token=$2',[new Date(f.clock()+8*3600000).toISOString(),sessionKey(f.user.token)]);
 const cookie='pw2_session='+f.user.token;const response=await f.request('/session',{cookie});assert.equal(response.data.nick,'Usuario');assert.match(response.cookies[0],/Max-Age=31536000/);assert.equal(cookieToken(response.cookies[0]),f.user.token);
 f.advance(30*DAY);f.restart();assert.equal((await f.request('/session',{cookie})).data.authenticated,true);
}));

test('renovación: solicitudes simultáneas entre instancias mantienen token y solo una modificación efectiva',()=>use(async f=>{
 const a=await f.login(),csrf=a.csrf;f.advance(2*DAY);let effective=0;const original=f.repository.renewSession;f.repository.renewSession=async args=>{const result=await original(args);if(result)effective++;return result};f.restart({},2);
 const results=await Promise.all(Array.from({length:20},()=>f.request('/session',{cookie:a.cookie})));assert.ok(results.every(r=>r.data.authenticated&&r.data.nick==='Usuario'&&r.headers.get('x-csrf-token')===csrf));assert.equal(effective,1);
 for(let i=0;i<5;i++)await f.request('/profile',{cookie:a.cookie});assert.equal(effective,1);assert.equal(cookieToken(a.cookie),cookieToken(results[0].cookies[0]));
}));

test('dispositivos: sesiones independientes, logout con CSRF revoca solo una y no vuelve al recargar',()=>use(async f=>{
 const a=await f.login(),b=await f.login();assert.notEqual(a.cookie,b.cookie);
 const denied=await f.request('/auth/logout',{method:'POST',cookie:a.cookie,csrf:'invalid',body:{}});assert.equal(denied.status,403);assert.equal((await f.request('/session',{cookie:a.cookie})).data.authenticated,true);
 const logout=await f.request('/auth/logout',{method:'POST',cookie:a.cookie,csrf:a.csrf,body:{}});assert.equal(logout.status,200);assert.match(logout.cookies[0],/Max-Age=0/);assert.equal(await row(f,a.cookie),undefined);
 f.advance(2*DAY);assert.equal((await f.request('/session',{cookie:a.cookie})).data.authenticated,false);assert.equal((await f.request('/session',{cookie:b.cookie})).data.authenticated,true);
}));

test('expulsión: revoca todos los dispositivos, ninguna credencial antigua se renueva y permite login nuevo',()=>use(async f=>{
 const a=await f.login(),b=await f.login();await moderate(f,'kick');for(const c of [a.cookie,b.cookie])assert.equal((await f.request('/session',{cookie:c})).data.authenticated,false);
 assert.equal((await f.db.query("SELECT count(*)::int n FROM shop_sessions WHERE nick='Usuario'")).rows[0].n,0);const fresh=await f.login();assert.notEqual(fresh.cookie,a.cookie);
}));

test('revocación concurrente a renovación: PATCH sin fila no puede resucitar sesión ni emitir una cookie válida',()=>use(async f=>{
 const a=await f.login();f.advance(2*DAY);let fired=false;const original=f.repository.renewSession;f.repository.renewSession=async args=>{if(!fired){fired=true;await moderate(f,'kick')}return original(args)};
 const r=await f.request('/session',{cookie:a.cookie});assert.equal(r.data.authenticated,false);assert.equal(r.cookies.length,0);assert.equal(await row(f,a.cookie),undefined);assert.equal((await f.request('/profile',{cookie:a.cookie})).status,401);
}));

test('suspensión y baneo: bloquean login, renovación y rutas de juego; levantar exige nueva sesión',()=>use(async f=>{
 for(const mode of ['temporary','permanent']){
  const a=await f.login();const sanction=await moderate(f,mode,mode==='temporary'?{durationSeconds:900}:{});
  assert.equal((await f.request('/session',{cookie:a.cookie})).data.authenticated,false);assert.equal((await f.request('/games/context',{cookie:a.cookie})).status,401);
  const login=await f.request('/auth/login',{method:'POST',body:{nick:'Usuario',password:'clave-local-pruebas'}});assert.equal(login.data.error,mode==='temporary'?'account_suspended':'account_banned');
  const games=createGames({pool:f.pool,moderation:f.moderation,enabled:true,legacy:{handleShopAction:()=>{throw Error('No ejecutar')}}});await assert.rejects(games.execute({nick:'Usuario',token:cookieToken(a.cookie)},{action:'publicShopRpgState',idempotencyKey:randomUUID()}),e=>['account_suspended','account_banned'].includes(e.code));
  await moderate(f,'lift',{expectedSanctionId:sanction.sanctionId});assert.equal((await f.request('/session',{cookie:a.cookie})).data.authenticated,false);await f.login();
 }
}));

test('sesión activa antigua no se renueva si la cuenta está inactiva o sancionada aunque conserve una fila',()=>use(async f=>{
 const cookie='pw2_session='+f.user.token,before=await row(f,cookie);let writes=0;const original=f.repository.renewSession;f.repository.renewSession=async args=>{writes++;return original(args)};
 await f.db.exec("UPDATE shop_access SET active=false WHERE nick='Usuario'");assert.equal((await f.request('/session',{cookie})).data.authenticated,false);assert.equal(writes,0);
 await f.db.exec("UPDATE shop_access SET active=true WHERE nick='Usuario'");await f.db.query("INSERT INTO pw2_account_sanctions(id,nick,kind,reason,actor) VALUES($1,'Usuario','permanent','Local','Perrisushi')",[randomUUID()]);
 assert.equal((await f.request('/session',{cookie})).data.error,'account_banned');assert.equal(writes,0);assert.deepEqual(await row(f,cookie),before);
}));

test('errores temporales: sin cookie de borrado, sin sesión resucitada y recuperación al volver el servicio',()=>use(async f=>{
 const a=await f.login(),before=await row(f,a.cookie);const original=f.repository.session;f.repository.session=async()=>{throw new BackendError(503,'backend_unavailable')};
 const failed=await f.request('/session',{cookie:a.cookie});assert.equal(failed.status,503);assert.equal(failed.cookies.length,0);f.repository.session=original;assert.deepEqual(await row(f,a.cookie),before);assert.equal((await f.request('/session',{cookie:a.cookie})).data.authenticated,true);
 f.advance(2*DAY);const renew=f.repository.renewSession;f.repository.renewSession=async()=>{throw new BackendError(503,'backend_unavailable')};const failedRenew=await f.request('/session',{cookie:a.cookie});assert.equal(failedRenew.status,503);assert.equal(failedRenew.cookies.length,0);f.repository.renewSession=renew;assert.equal((await f.request('/session',{cookie:a.cookie})).data.authenticated,true);
}));

test('cookie manipulada, identidad ajena y sesión caducada no se aceptan ni se renuevan',()=>use(async f=>{
 const a=await f.login();for(const cookie of ['pw2_session=invalid','pw2_session='+'z'.repeat(43),a.cookie+'; '+a.cookie])assert.equal((await f.request('/session',{cookie})).data.authenticated,false);
 assert.equal((await f.request('/profile?nick=Perrisushi',{cookie:a.cookie})).status,400);assert.equal((await f.request('/admin/context',{cookie:a.cookie})).data.isAdmin,false);
 await f.db.query('UPDATE shop_sessions SET expires_at=$1 WHERE token=$2',[new Date(f.clock()-1000).toISOString(),sessionKey(cookieToken(a.cookie))]);assert.equal((await f.request('/session',{cookie:a.cookie})).data.authenticated,false);
 assert.equal(new Date((await row(f,a.cookie)).expires_at).getTime(),f.clock()-1000);
}));

test('Google: mismo plazo y renovación después de 30 días; vínculo y contraseña conservados',()=>use(async f=>{
 await f.db.exec('CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY)');await f.db.exec(await readFile('sql/002-google-auth.sql','utf8'));const id=randomUUID();await f.db.query('INSERT INTO auth.users VALUES($1)',[id]);await f.db.query("INSERT INTO pw2_google_links(auth_user_id,nick) VALUES($1,'Usuario')",[id]);
 const access=(await f.db.query("SELECT to_jsonb(a) row FROM shop_access a WHERE nick='Usuario'")).rows;
 const google=createGoogleAuth({pool:f.pool,moderation:f.moderation,origin:'http://127.0.0.1:4173',secret:'s'.repeat(40),provider:{authorize:()=> 'https://local.invalid',exchange:async()=>id}});f.restart({google});
 const flow=oauthToken((await google.start()).cookie);const callback=await f.request('/auth/google/callback?code=local',{cookie:'pw2_oauth='+flow});assert.equal(callback.status,303);const cookie=callback.cookies.find(c=>c.startsWith('pw2_session='));assert.match(cookie,/Max-Age=31536000/);assert.match(cookie,/SameSite=Strict/);
 f.advance(30*DAY);f.restart({google});assert.equal((await f.request('/session',{cookie:cookie.split(';')[0]})).data.nick,'Usuario');assert.deepEqual((await f.db.query("SELECT to_jsonb(a) row FROM shop_access a WHERE nick='Usuario'")).rows,access);assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_google_links')).rows[0].n,1);
 const ban=await moderate(f,'permanent');const blocked=oauthToken((await google.start()).cookie);await assert.rejects(google.callback(blocked,'local'),e=>e.code==='account_banned');assert.equal((await f.request('/session',{cookie:cookie.split(';')[0]})).data.authenticated,false);
 await moderate(f,'lift',{expectedSanctionId:ban.sanctionId});const fresh=oauthToken((await google.start()).cookie);const restored=await google.callback(fresh,'local');assert.notEqual(restored.token,cookieToken(cookie));

}));

test('persistencia no cambia administración, inventarios, monedas, boletos, sorteos ni progreso',()=>use(async f=>{
 const snapshot=async()=>{const all={};for(const table of ['shop_access','shop_players','shop_inventories','shop_profiles','pw2_raffles','pw2_raffle_entries'])all[table]=(await f.db.query('SELECT to_jsonb(t) row FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows;return all};
 const before=await snapshot(),a=await f.login('Perrisushi');f.advance(30*DAY);const context=await f.request('/admin/context',{cookie:a.cookie});assert.equal(context.data.isAdmin,true);assert.deepEqual(await snapshot(),before);
}));

test('PostgREST: renovación PATCH con propietario, token hash, expiración anterior y corte temporal, nunca UPSERT',async()=>{
 const calls=[],token=sessionKey('a'.repeat(43)),instant=new Date().toISOString(),prior=new Date(Date.now()+3600000).toISOString(),next=new Date(Date.now()+SESSION_TTL_MS).toISOString();
 const repository=createRepository({url:'https://local.invalid',key:'LOCAL',allowSessionWrites:true,fetchImpl:async(url,options)=>{calls.push({url:new URL(url),options});return Response.json([{token,nick:'Usuario',expires_at:next}])}});
 await repository.renewSession({token,nick:'Usuario',expectedExpiresAt:prior,expiresAt:next,now:instant});const c=calls[0];assert.equal(c.options.method,'PATCH');assert.equal(c.url.searchParams.get('nick'),'eq.Usuario');assert.equal(c.url.searchParams.get('token'),'eq.'+token);assert.equal(c.url.searchParams.get('expires_at'),'eq.'+prior);assert.match(c.url.searchParams.get('and'),/^\(expires_at.gt./);assert.equal(c.options.headers.Prefer,'return=representation');assert.deepEqual(Object.keys(JSON.parse(c.options.body)),['expires_at','updated_at']);assert.ok(!JSON.stringify(c).includes('a'.repeat(43)));
 const disabled=createRepository({url:'https://local.invalid',key:'LOCAL',fetchImpl:()=>{throw Error('No llamar')}});await assert.rejects(disabled.renewSession({token,nick:'Usuario',expectedExpiresAt:prior,expiresAt:next,now:instant}),e=>e.code==='session_writes_disabled');
});

test('cliente y proxy: errores de red no borran credenciales; cookie renovada conserva sus atributos',async()=>{
 let expired=0;for(const fetchImpl of [async()=>{throw Error('offline')},async()=>Response.json({error:'backend_unavailable'},{status:503})]){const api=createApiClient({fetchImpl,onSessionExpired:()=>expired++});await assert.rejects(api.getSession());}assert.equal(expired,0);
 const old=globalThis.fetch;try{globalThis.fetch=async()=>Response.json({authenticated:true},{headers:{'Set-Cookie':'pw2_session=opaque; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000'}});const response=await proxy({request:new Request('https://perrisushi.com/api/session'),env:{PERRIWEB_BACKEND_ORIGIN:'https://backend.invalid',PERRIWEB_PROXY_SECRET:'p'.repeat(40)}});assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict; Max-Age=31536000/)}finally{globalThis.fetch=old}
});


test('minijuegos originales: el refresco legado de 30 días no acorta la sesión de 365 días',()=>use(async f=>{
 process.env.SUPABASE_URL='https://only-local.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='LOCAL-TEST-NOT-A-CREDENTIAL';
 const {default:legacy}=await import('../backend/games-original.cjs');const a=await f.login();const before=await row(f,a.cookie);
 const games=createGames({pool:f.pool,moderation:f.moderation,enabled:true,legacy});
 const result=await games.execute({nick:'Usuario',token:cookieToken(a.cookie)},{action:'publicShopGetPerriCasillas',idempotencyKey:randomUUID()});assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(new Date((await row(f,a.cookie)).expires_at).getTime(),new Date(before.expires_at).getTime());
 f.advance(31*DAY);assert.equal((await f.request('/session',{cookie:a.cookie})).data.authenticated,true);
}));
