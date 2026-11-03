import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import http from 'node:http';
import {adminFixture} from './helpers/admin-fixture.mjs';import {createAdministration,validateAdminOperation,ADMIN_ROUTES} from '../backend/administration.mjs';import {createBackend} from '../backend/app.mjs';import {sessionKey,csrfFor} from '../backend/security.mjs';import {createRepository} from '../backend/repository.mjs';
const resource=(overrides={})=>({action:'resource',operationId:randomUUID(),target:'Usuario',field:'pc',expected:100,value:145,reason:'Corrección comprobada',...overrides});
const fail=(code)=>e=>e.code===code;
async function use(task){const f=await adminFixture();try{await task(f)}finally{await f.db.close()}}
async function apiFixture(task){await use(async f=>{const origin='http://127.0.0.1:4173',secret='s'.repeat(40);const server=http.createServer(createBackend({repository:f.repository,administration:f.administration,sessionStore:'supabase',allowSessionWrites:true,publicOrigin:origin,csrfSecret:secret}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const request=async(path,{actor=f.admin,body,csrf=true,...headers}={})=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:origin,...(actor?{Cookie:'pw2_session='+actor.token}:{}),...(body?{'Content-Type':'application/json',...(csrf&&actor?{'X-CSRF-Token':csrfFor(actor.token,secret)}:{})}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}};try{await task({...f,request})}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}})}
test('admin: rol existente consultado tras sesión; no depende del nombre, claims o mayúsculas',()=>apiFixture(async f=>{
 assert.deepEqual((await f.request('/api/admin/context')).data,{isAdmin:true,available:true});
 assert.deepEqual((await f.request('/api/admin/context',{actor:f.user})).data,{isAdmin:false,available:false});
 assert.equal((await f.request('/api/admin/users',{actor:null})).status,401);
 for(const path of ADMIN_ROUTES.filter(p=>p!=='/api/admin/context'&&p!=='/api/admin/execute'))assert.equal((await f.request(path,{actor:f.user})).status,403);
 assert.equal((await f.request('/api/admin/execute',{actor:f.user,body:resource()})).status,403);
 await f.db.query('UPDATE shop_access SET is_admin=false WHERE nick=$1',[f.admin.nick]);
 assert.equal((await f.request('/api/admin/users')).status,403);
 await f.db.query('UPDATE shop_access SET is_admin=true WHERE nick=$1',[f.user.nick]);
 assert.equal((await f.request('/api/admin/users',{actor:f.user})).status,200);
 assert.equal((await f.request('/api/admin/context?is_admin=true',{actor:f.user})).status,400);
}));
test('admin: REST obtiene solo nick,active,is_admin, con nick exacto y sin hashes',async()=>{
 let url;const repo=createRepository({url:'https://local.invalid',key:'local',fetchImpl:async u=>{url=new URL(u);return Response.json([{nick:'Perrisushi',active:true,is_admin:true}])}});
 assert.equal((await repo.adminAccess('Perrisushi')).is_admin,true);assert.equal(url.searchParams.get('select'),'nick,active,is_admin');assert.equal(url.searchParams.get('nick'),'eq.Perrisushi');
});
test('admin: POST requiere Origin, CSRF y sesión, sin confiar en identidad ni rol del navegador',()=>apiFixture(async f=>{
 assert.equal((await f.request('/api/admin/execute',{body:resource(),csrf:false})).status,403);
 assert.equal((await f.request('/api/admin/execute',{body:resource(),Origin:'https://other.invalid'})).status,403);
 for(const extra of [{is_admin:true},{nick:'Perrisushi'},{role:'admin'},{actor:'Perrisushi'}])assert.equal((await f.request('/api/admin/execute',{body:resource(extra)})).status,400);
 assert.equal((await f.request('/api/admin/users',{actor:f.user,'X-Admin':'true'})).status,403);
 assert.equal((await f.request('/api/admin/execute',{actor:f.user,body:resource()})).status,403);
}));
test('admin: corrige PC una sola vez, sincroniza listado, conserva datos ajenos y registra antes/después',()=>use(async f=>{
 const op=resource();assert.equal((await f.administration.execute(f.admin,op)).ok,true);
 assert.deepEqual(await f.administration.execute(f.admin,op),await f.administration.execute(f.admin,op));
 const inv=(await f.db.query("SELECT pc,polvo_gema FROM shop_inventories WHERE nick='Usuario'")).rows[0];assert.deepEqual(inv,{pc:145,polvo_gema:25});
 assert.equal((await f.db.query("SELECT pc FROM shop_public_users WHERE nick='Usuario'")).rows[0].pc,145);
 const records=await f.administration.read(f.admin,'records',new URLSearchParams());assert.equal(records.items.length,1);assert.deepEqual(records.items[0].audit,{reason:op.reason,target:'Usuario',field:'pc',before:100,after:145});
 assert.equal((await f.db.query("SELECT is_admin FROM shop_access WHERE nick='Perrisushi'")).rows[0].is_admin,true);
 await assert.rejects(f.administration.execute(f.admin,{...op,value:200}),fail('operation_conflict'));
 await assert.rejects(f.administration.execute(f.admin,resource()),fail('admin_stale'));
}));
test('admin: repeticiones concurrentes comparten recibo sin duplicar escritura',()=>use(async f=>{
 const op=resource();const results=await Promise.all([f.administration.execute(f.admin,op),f.administration.execute(f.admin,op)]);assert.deepEqual(results[0],results[1]);assert.equal((await f.db.query("SELECT count(*)::int n FROM shop_operations")).rows[0].n,1);
}));
test('admin: cantidades enteras seguras, recursos permitidos; no altera cofres, boletos ni roles',()=>{
 for(const value of [-1,1.5,2147483648,NaN,'100'])assert.throws(()=>validateAdminOperation(resource({value})),fail('invalid_request'));
 for(const field of ['is_admin','nick','perri_cofres','perri_cofres_minijuego','random_key','mini_sorteo','boleto_sorteo2','pc"=0;--'])assert.throws(()=>validateAdminOperation(resource({field})),fail('invalid_request'));
});
test('admin: suspensión revoca sesiones; reactivar no resucita sesiones; cuenta administradora protegida',()=>use(async f=>{
 const op={action:'access',operationId:randomUUID(),target:f.user.nick,expectedAccess:true,expectedPlayer:true,active:false,reason:'Sanción revisada'};
 await f.administration.execute(f.admin,op);assert.equal((await f.repository.accessStatus(f.user.nick)).active,false);assert.equal(await f.repository.session(sessionKey(f.user.token)),null);
 await assert.rejects(f.administration.read(f.user,'users',new URLSearchParams()),fail('session_expired'));
 await f.administration.execute(f.admin,{...op,operationId:randomUUID(),expectedAccess:false,expectedPlayer:false,active:true});assert.equal(await f.repository.session(sessionKey(f.user.token)),null);
 await assert.rejects(f.administration.execute(f.admin,{...op,operationId:randomUUID(),target:f.admin.nick}),fail('admin_protected'));
}));
test('admin: aviso individual y general usa notificaciones actuales, idempotente y sin duplicados',()=>use(async f=>{
 const op={action:'notice',operationId:randomUUID(),target:f.user.nick,audience:'individual',title:'Aviso de asistencia',message:'Mensaje real de administración',reason:'Consulta atendida'};
 const result=await f.administration.execute(f.admin,op);assert.equal(result.count,1);await f.administration.execute(f.admin,op);
 assert.equal((await f.db.query('SELECT count(*)::int n FROM shop_notifications')).rows[0].n,1);
 await f.db.query("UPDATE shop_access SET active=false WHERE nick='perrisushi'");const all={...op,operationId:randomUUID(),audience:'all'};delete all.target;
 assert.equal((await f.administration.execute(f.admin,all)).count,3);
 assert.equal((await f.db.query("SELECT count(*)::int n FROM shop_notifications WHERE nick='perrisushi'")).rows[0].n,0);
 assert.equal((await f.db.query("SELECT count(*)::int n FROM shop_notifications WHERE read_at IS NULL")).rows[0].n,4);
}));
test('admin: fallo de auditoría revierte la corrección y fallo de conexión no filtra secretos',()=>use(async f=>{
 await f.db.exec("ALTER TABLE shop_operations ADD CONSTRAINT reject_admin CHECK(action NOT LIKE 'admin:%')");await assert.rejects(f.administration.execute(f.admin,resource()),fail('admin_unavailable'));
 assert.equal((await f.repository.inventory(f.user.nick)).pc,100);
 assert.ok(f.diagnostics.some(d=>d.failure==='23514'));
 const log=[];const service=createAdministration({pool:{connect:async()=>{throw Error('postgres://SECRET@PRIVATE')}},onDiagnostic:e=>log.push(e)});
 await assert.rejects(service.read(f.admin,'users',new URLSearchParams()),fail('admin_unavailable'));assert.ok(!JSON.stringify(log).includes('SECRET'));
}));
test('admin: sesión expirada, permiso revocado en SQL y cuenta inactiva se rechazan dentro de la transacción',()=>use(async f=>{
 await f.db.query("UPDATE shop_sessions SET expires_at=now()-interval '1 second' WHERE nick=$1",[f.admin.nick]);await assert.rejects(f.administration.execute(f.admin,resource()),fail('session_expired'));
 await f.db.query("UPDATE shop_sessions SET expires_at=now()+interval '1 day' WHERE nick=$1",[f.admin.nick]);await f.db.query('UPDATE shop_access SET is_admin=false WHERE nick=$1',[f.admin.nick]);await assert.rejects(f.administration.execute(f.admin,resource()),fail('admin_required'));
 await f.db.query('UPDATE shop_access SET is_admin=true,active=false WHERE nick=$1',[f.admin.nick]);await assert.rejects(f.administration.execute(f.admin,resource()),fail('session_expired'));
}));
test('admin: lecturas acotadas y escapadas como datos, cuentas exactas, catálogo y boletos existentes',()=>use(async f=>{
 const list=await f.administration.read(f.admin,'users',new URLSearchParams({search:'Perrisushi'}));assert.equal(list.items.length,2);
 const account=await f.administration.read(f.admin,'account',new URLSearchParams({target:'Perrisushi'}));assert.equal(account.account.is_admin,true);assert.ok(!JSON.stringify(account).includes('code_hash'));assert.ok(!account.editableFields.includes('perri_cofres'));
 assert.equal((await f.administration.read(f.admin,'store',new URLSearchParams())).logos.find(l=>l.logo_id==='logo-buho-1').name,'Búho');assert.equal((await f.administration.read(f.admin,'raffles',new URLSearchParams())).totals.mini_sorteo,'0');
 await assert.rejects(f.administration.read(f.admin,'account',new URLSearchParams({target:'PERRISUSHI'})),fail('not_found'));
 await assert.rejects(f.administration.read(f.admin,'users',new URLSearchParams({role:'admin'})),fail('invalid_request'));
}));
test('admin: acceso tradicional y funciones normales del administrador permanecen operativos',()=>apiFixture(async f=>{
 const login=await f.request('/api/auth/login',{actor:null,body:{nick:'Perrisushi',password:'clave-local-pruebas'}});assert.equal(login.status,200);assert.equal(login.data.nick,'Perrisushi');
 assert.equal((await f.request('/api/profile')).data.nick,'Perrisushi');assert.equal((await f.request('/api/inventory')).data.inventory.pc,100);
 for(const path of ['/api/admin/rename','/api/admin/role','/api/admin/create-account'])assert.equal((await f.request(path,{body:{nick:'Usuario'}})).status,404);
}));

test('admin: RLS que pueda ocultar filas cancela la operación, sin correcciones parciales',()=>use(async f=>{
 await f.db.exec('SET ROLE anon');
 try{await assert.rejects(f.administration.execute(f.admin,resource()),fail('admin_unavailable'))}finally{await f.db.exec('RESET ROLE')}
 assert.equal((await f.repository.inventory('Usuario')).pc,100);
}));
test('admin: registros ordenados por fecha y paginación sin omitir ni repetir cambios',()=>use(async f=>{
 for(let i=0;i<28;i++)await f.db.query("INSERT INTO shop_operations(operation_id,nick,action,response,created_at) VALUES($1,'Perrisushi','admin:notice',$2,'2026-01-01T00:00:00Z'::timestamptz+$3*interval '1 microsecond')",['pw2:admin:'+randomUUID(),JSON.stringify({audit:{reason:'Registro local '+i}}),i]);
 const first=await f.administration.read(f.admin,'records',new URLSearchParams());assert.equal(first.items.length,25);assert.ok(first.next);assert.equal(first.items[0].audit.reason,'Registro local 27');
 const second=await f.administration.read(f.admin,'records',new URLSearchParams({after:first.next}));assert.equal(second.items.length,3);assert.equal(second.next,null);assert.equal(new Set([...first.items,...second.items].map(r=>r.operation_id)).size,28);
 await assert.rejects(f.administration.read(f.admin,'records',new URLSearchParams({after:'not-a-cursor'})),fail('invalid_request'));
}));
test('admin: cuentas e inventarios no se crean al consultar un objetivo inexistente',()=>use(async f=>{
 const before=(await f.db.query('SELECT count(*)::int n FROM shop_players')).rows[0].n;
 await assert.rejects(f.administration.read(f.admin,'account',new URLSearchParams({target:'Inventada'})),fail('not_found'));
 await assert.rejects(f.administration.execute(f.admin,resource({target:'Inventada'})),fail('not_found'));
 assert.equal((await f.db.query('SELECT count(*)::int n FROM shop_players')).rows[0].n,before);
}));

test('admin: PC almacenados como bigint mantienen comparación y corrección exactas',()=>use(async f=>{
 await f.db.exec('ALTER TABLE shop_inventories ALTER COLUMN pc TYPE bigint');
 await f.administration.execute(f.admin,resource());assert.equal(Number((await f.db.query("SELECT pc FROM shop_inventories WHERE nick='Usuario'")).rows[0].pc),145);
}));
