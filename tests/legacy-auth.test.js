import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createBackend} from '../backend/app.mjs';
import {BackendError,createRepository} from '../backend/repository.mjs';
import {digest,matchesPassword} from '../backend/security.mjs';
import {checkAuthSources} from '../scripts/check-auth.mjs';

const secret=' ÁbC ñ 🦊 e\u0301 123 ';
function fixture(){const sessions=new Map();return {configured:true,canonicalAccess:async nick=>nick.toLowerCase()==='olduser'?{nick:'OldUser',active:true,code_hash:digest(secret.trim())}:null,player:async()=>({nick:'OldUser',active:true}),createSession:async row=>sessions.set(row.token,row),session:async token=>sessions.get(token)}}
async function lab(run,{repository=fixture(),sessionStore='supabase'}={}){
 const events=[];const server=http.createServer(createBackend({repository,sessionStore,allowSessionWrites:true,onAuthDiagnostic:event=>events.push(event)}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const login=async(nick=' oLDuSER ',password=secret)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth/login',{method:'POST',headers:{origin:'http://127.0.0.1:4173','content-type':'application/json'},body:JSON.stringify({nick,password})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie'),requestId:response.headers.get('x-request-id')}};
 try{await run({login,repository,events})}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
}

test('misma decisión SHA-256 UTF-8/trim que publicShopLogin ORIGINAL, sin normalizar Unicode ni mayúsculas',async()=>{
 const source=await readFile('backend/games-original.cjs','utf8');
 const hash=source.slice(source.indexOf('function sha256('),source.indexOf('function createSessionToken('));
 const loginSource=source.slice(source.indexOf('async function publicShopLogin('),source.indexOf('async function publicShopRefresh('));
 for(const password of [secret,'\u00a0Clave\t','a b','ABC','é','e\u0301']){
  const stored=digest(password.trim());
  const legacy=vm.runInNewContext(hash+'\n'+loginSource+'\npublicShopLogin',{crypto,normalizeNick:value=>String(value||'').trim(),getLoginAttemptState:()=>({blocked:false}),fetchNickRowCaseInsensitive:async()=>({nick:'OldUser',code_hash:' '+stored+'\n',active:null}),registerFailedLogin:()=>({blocked:false}),clearFailedLogins:()=>{},ensurePlayer:async()=>{},updateRows:async()=>{},nowIso:()=>new Date().toISOString(),createSession:async()=>'LOCAL-MARKER',buildShopState:async()=>({})});
  assert.equal((await legacy('olduser',password)).ok,true);assert.equal(matchesPassword(password.trim(),' '+stored+'\n'),true);
  assert.equal(Boolean((await legacy('olduser',password+'X')).ok),false);assert.equal(matchesPassword((password+'X').trim(),stored),false);
 }
 assert.equal(matchesPassword('é',digest('e\u0301')),false);
 await lab(async({login,events})=>{const result=await login();assert.equal(result.status,200);assert.equal(result.data.nick,'OldUser');assert.equal(events.at(-1).reason,'authenticated')});
});

test('401 distingue internamente usuario ausente, desactivado y password incorrecto sin enumerarlos en la respuesta',async()=>{
 await lab(async({login,repository,events})=>{
  assert.equal((await login('missing')).status,401);assert.equal(events.at(-1).reason,'access_not_found');
  assert.equal((await login('olduser','wrong')).status,401);assert.equal(events.at(-1).reason,'password_mismatch');
  repository.canonicalAccess=async()=>({nick:'OldUser',code_hash:digest(secret.trim()),active:false});
  assert.deepEqual((await login()).data,{error:'invalid_credentials'});assert.equal(events.at(-1).reason,'access_disabled');
 });
});

test('contraseña válida y player ausente: 503 player_missing, nunca error falso de contraseña ni inicialización de datos',()=>lab(async({login,repository,events})=>{
 repository.player=async()=>null;repository.createSession=async()=>assert.fail('No escribir sesión');
 const result=await login();assert.equal(result.status,503);assert.equal(result.cookie,null);assert.equal(events.at(-1).stage,'player_lookup');assert.equal(events.at(-1).reason,'player_missing');
}));

test('hash y active mal formados producen 503 explícito internamente, no un rechazo de contraseña',()=>lab(async({login,repository,events})=>{
 repository.canonicalAccess=async()=>({nick:'OldUser',active:true,code_hash:'bad'});assert.equal((await login()).status,503);assert.equal(events.at(-1).reason,'invalid_hash_format');
 repository.canonicalAccess=async()=>({nick:'OldUser',active:'false',code_hash:digest(secret.trim())});assert.equal((await login()).status,503);assert.equal(events.at(-1).reason,'invalid_active_field');
}));

test('errores de consulta, escritura y recuperación se distinguen y nunca revelan datos privados',async()=>{
 for(const [method,stage]of [['canonicalAccess','access_lookup'],['player','player_lookup'],['createSession','session_create'],['session','session_readback']]){
  await lab(async({login,repository,events})=>{
   repository[method]=async()=>{throw new BackendError(503,'backend_unavailable',{source:'supabase',table:method==='canonicalAccess'?'shop_access':method==='player'?'shop_players':'shop_sessions',method:'GET',httpStatus:403,upstreamCode:'42501',message:secret,nick:'OldUser',token:'PRIVATE-TOKEN'})};
   const result=await login();assert.equal(result.status,503);assert.equal(result.cookie,null);assert.equal(events.at(-1).stage,stage);assert.equal(events.at(-1).upstreamCode,'42501');assert.equal(events.at(-1).requestId,result.requestId);
   const serialized=JSON.stringify(events);for(const value of [secret,'OldUser',digest(secret.trim()),'PRIVATE-TOKEN','message','code_hash'])assert.ok(!serialized.includes(value));
  });
 }
});

test('una escritura de sesión sin fila recuperable no entrega cookie de éxito',()=>lab(async({login,repository,events})=>{
 repository.session=async()=>null;const result=await login();assert.equal(result.status,503);assert.equal(result.cookie,null);assert.equal(events.at(-1).reason,'session_not_recoverable');
}));

test('búsqueda case-insensitive literal conserva apóstrofos y no permite comodines ni identidad arbitraria',async()=>{
 const queries=[];const repository=createRepository({url:'https://fixture.invalid',key:'LOCAL',fetchImpl:async url=>{const parsed=new URL(url);queries.push(parsed);return {ok:true,json:async()=>parsed.searchParams.get('nick').startsWith('eq.')?[]:[{nick:"O'Neil",active:true,code_hash:digest(secret.trim())}]}}});
 const account=await repository.canonicalAccess("o'neil");assert.equal(account.nick,"O'Neil");assert.equal(queries.length,2);assert.equal(queries[1].searchParams.get('nick'),`ilike.o'neil`);
});

test('diagnóstico REST/PostgreSQL solo lectura: detecta otra base o registros distintos sin exponerlos',async()=>{
 const repository=fixture(),queries=[];let released=false;
 const pool={connect:async()=>({release:()=>{released=true},query:async(sql,params)=>{
  queries.push(sql);assert.ok(!/\b(insert|update|delete|create|alter)\b/i.test(sql.replaceAll("'INSERT'",'')));
  if(sql.startsWith('SELECT nick'))return {rows:[{nick:'OldUser',code_hash:digest('different'),active:true}]};
  if(sql.startsWith('SELECT active'))return {rows:[{active:true}]};
  if(sql.startsWith('SELECT EXISTS'))return {rows:[{active_session:false,insert_allowed:true}]};return {rows:[]};
 }})};
 const result=await checkAuthSources({repository,pool,nick:'olduser',password:secret});assert.equal(result.rest.passwordMatches,true);assert.equal(result.postgres.passwordMatches,false);assert.equal(result.sourcesAgree,false);assert.ok(queries.includes('BEGIN READ ONLY'));assert.ok(queries.includes('ROLLBACK'));assert.equal(released,true);assert.doesNotMatch(JSON.stringify(result),/OldUser|code_hash|different/);
});

test('diagnóstico PostgreSQL informa permisos/credenciales sin convertirlos en password incorrecto ni registrar el error crudo',async()=>{
 const result=await checkAuthSources({repository:fixture(),nick:'olduser',password:secret,pool:{connect:async()=>{throw Object.assign(Error('secret-uri-password'),{code:'28P01'})}}});assert.equal(result.postgres.failure,'28P01');assert.equal(result.postgres.reachable,false);assert.ok(!JSON.stringify(result).includes('secret-uri'));
});
