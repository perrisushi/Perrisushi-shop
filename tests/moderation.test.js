import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import http from 'node:http';
import {adminFixture} from './helpers/admin-fixture.mjs';import {createBackend} from '../backend/app.mjs';import {createGoogleAuth,oauthToken} from '../backend/google-auth.mjs';import {sessionKey} from '../backend/security.mjs';
const rejected=code=>e=>e.code===code;
const sanction=(overrides={})=>({action:'moderation',operationId:randomUUID(),target:'Usuario',mode:'temporary',durationSeconds:900,expectedSanctionId:null,reason:'Motivo administrativo privado',confirmed:true,...overrides});
async function use(task){const f=await adminFixture({extended:true});try{await task(f)}finally{await f.db.close()}}
async function change(f,op){return f.administration.execute(f.admin,op)}
test('moderación: 15 minutos y 24 horas calculadas en servidor; historial conservado al cambiar',()=>use(async f=>{
 const start=Date.now(),first=await change(f,sanction());let state=await f.moderation.stateWithClient(await f.pool.connect().then(c=>{c.release();return c}),'Usuario');assert.ok(Date.parse(state.expiresAt)>=start+899000);assert.ok(Date.parse(state.expiresAt)<=Date.now()+901000);
 await change(f,sanction({mode:'change',kind:'temporary',durationSeconds:86400,expectedSanctionId:first.sanctionId}));
 const history=(await f.administration.read(f.admin,'account',new URLSearchParams({target:'Usuario'}))).moderation;assert.equal(history.items.length,2);assert.equal(history.items.filter(s=>s.status==='active').length,1);assert.equal(history.items.find(s=>s.id===first.sanctionId).status,'replaced');assert.ok(Date.parse(history.current.expiresAt)>Date.now()+86399000);
}));
test('moderación: fechas personalizadas válidas, vencidas, inválidas y máximo configurable',()=>use(async f=>{
 for(const until of ['not-a-date',new Date(Date.now()-3600000).toISOString(),new Date(Date.now()+366*86400000).toISOString()])await assert.rejects(change(f,sanction({durationSeconds:undefined,until})),rejected('invalid_sanction_date'));
 const until=new Date(Date.now()+2*86400000).toISOString();await change(f,sanction({durationSeconds:undefined,until}));const data=await f.administration.read(f.admin,'account',new URLSearchParams({target:'Usuario'}));assert.equal(data.moderation.current.expiresAt,until);
}));
test('moderación: caducidad sin cron, sin reactivar accesos deshabilitados por otro motivo',()=>use(async f=>{
 await change(f,sanction());await f.db.query("UPDATE pw2_account_sanctions SET starts_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE nick='Usuario'");await f.moderation.check('Usuario');
 const account=await f.administration.read(f.admin,'account',new URLSearchParams({target:'Usuario'}));assert.equal(account.moderation.current,null);assert.equal(account.moderation.items[0].status,'expired');assert.equal(await f.repository.session(sessionKey(f.user.token)),null);
 await f.db.query("UPDATE shop_access SET active=false WHERE nick='Usuario'");await f.moderation.check('Usuario');assert.equal((await f.repository.accessStatus('Usuario')).active,false);
}));
test('moderación: baneo, retirada y conversión temporal/permanente conservan todas las versiones',()=>use(async f=>{
 const first=await change(f,sanction({mode:'permanent',durationSeconds:undefined}));await assert.rejects(f.moderation.check('Usuario'),rejected('account_banned'));
 const second=await change(f,sanction({mode:'change',kind:'temporary',expectedSanctionId:first.sanctionId}));await assert.rejects(f.moderation.check('Usuario'),rejected('account_suspended'));
 const third=await change(f,sanction({mode:'change',kind:'permanent',durationSeconds:undefined,expectedSanctionId:second.sanctionId}));
 await change(f,sanction({mode:'lift',durationSeconds:undefined,expectedSanctionId:third.sanctionId}));await f.moderation.check('Usuario');
 const history=(await f.administration.read(f.admin,'account',new URLSearchParams({target:'Usuario'}))).moderation.items;assert.equal(history.length,3);assert.equal(history.filter(r=>r.status==='revoked').length,1);assert.ok(history.every(r=>r.closed_by==='Perrisushi'&&r.close_reason));
}));
test('moderación: expulsar elimina todas las sesiones, mantiene activa la cuenta y no crea una sanción',()=>use(async f=>{
 await f.db.query("INSERT INTO shop_sessions(token,nick,expires_at) VALUES('other-local','Usuario',now()+interval '1 day')");await change(f,sanction({mode:'kick',durationSeconds:undefined}));assert.equal((await f.db.query("SELECT count(*)::int n FROM shop_sessions WHERE nick='Usuario'")).rows[0].n,0);assert.equal((await f.repository.accessStatus('Usuario')).active,true);assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_account_sanctions')).rows[0].n,0);
}));
test('moderación: confirmación, administradores protegidos, reenvíos y concurrencia',()=>use(async f=>{
 await assert.rejects(change(f,sanction({confirmed:false})),rejected('invalid_request'));await assert.rejects(change(f,sanction({target:'Perrisushi'})),rejected('admin_protected'));
 const op=sanction();const rows=await Promise.all([change(f,op),change(f,op)]);assert.equal(rows[0].sanctionId,rows[1].sanctionId);assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_account_sanctions')).rows[0].n,1);await assert.rejects(change(f,sanction()),rejected('admin_stale'));
}));
test('moderación: login tradicional solo informa de sanción después de verificar contraseña; sesiones antiguas rechazadas',()=>use(async f=>{
 const before=(await f.db.query('SELECT to_jsonb(i) AS row FROM shop_inventories i ORDER BY nick')).rows;await change(f,sanction());const server=http.createServer(createBackend({repository:f.repository,moderation:f.moderation,sessionStore:'supabase',allowSessionWrites:true}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
 const login=async(password,nick='Usuario')=>{const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:'http://127.0.0.1:4173','Content-Type':'application/json'},body:JSON.stringify({nick,password})});return {status:r.status,body:await r.json()}};
 assert.equal((await login('incorrecta')).status,401);const blocked=await login('clave-local-pruebas');assert.equal(blocked.body.error,'account_suspended');assert.ok(blocked.body.expiresAt);assert.ok(!JSON.stringify(blocked).includes('Motivo administrativo privado'));
 assert.equal((await fetch(base+'/api/profile',{headers:{Cookie:'pw2_session='+f.user.token}})).status,401);assert.equal((await login('clave-local-pruebas','Perrisushi')).status,200);
 await f.db.query("UPDATE pw2_account_sanctions SET starts_at=now()-interval '2 days',expires_at=now()-interval '1 day'");assert.equal((await login('clave-local-pruebas')).status,200);assert.equal(await f.repository.session(sessionKey(f.user.token)),null);assert.deepEqual((await f.db.query('SELECT to_jsonb(i) AS row FROM shop_inventories i ORDER BY nick')).rows,before);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
}));
test('moderación: OAuth de cuenta vinculada no emite sesión estando sancionada y funciona al expirar',()=>use(async f=>{
 await f.db.exec('CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY)');await f.db.exec(await readFile('sql/002-google-auth.sql','utf8'));const id=randomUUID();await f.db.query('INSERT INTO auth.users VALUES($1)',[id]);await f.db.query("INSERT INTO pw2_google_links(auth_user_id,nick) VALUES($1,'Usuario')",[id]);
 const google=createGoogleAuth({pool:f.pool,moderation:f.moderation,origin:'https://perrisushi.com',secret:'s'.repeat(40),provider:{authorize:()=> 'https://local.invalid',exchange:async()=>id}});
 await change(f,sanction());const flow=oauthToken((await google.start()).cookie);await assert.rejects(google.callback(flow,'local-code'),rejected('account_suspended'));assert.equal((await f.db.query("SELECT count(*)::int n FROM shop_sessions WHERE nick='Usuario'")).rows[0].n,0);
 await f.db.query("UPDATE pw2_account_sanctions SET starts_at=now()-interval '2 days',expires_at=now()-interval '1 day'");const fresh=oauthToken((await google.start()).cookie);assert.equal((await google.callback(fresh,'local-code')).outcome,'login');assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_google_links')).rows[0].n,1);
}));
test('migración ampliada: repetible, tablas nuevas privadas y ninguna asignación de roles',()=>use(async f=>{
 await f.db.exec(await readFile('sql/004-administracion-ampliada.sql','utf8'));assert.equal((await f.db.query('SELECT nick FROM shop_access WHERE is_admin=true')).rows[0].nick,'Perrisushi');assert.equal((await f.db.query("SELECT has_table_privilege('authenticated','public.pw2_account_sanctions','SELECT') AS allowed")).rows[0].allowed,false);
}));
