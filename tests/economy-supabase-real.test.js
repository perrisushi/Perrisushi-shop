import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';import http from 'node:http';
import {adminFixture} from './helpers/admin-fixture.mjs';import {createCommunity} from '../backend/community.mjs';import {createEconomy} from '../backend/economy.mjs';import {createBackend} from '../backend/app.mjs';import {EDITABLE_RESOURCES} from '../backend/administration.mjs';
const migration=await readFile('sql/004-administracion-ampliada.sql','utf8');
const canonical=await readFile('sql/001-economia-atomica.sql','utf8');
const exported=await readFile('tests/fixtures/economy-supabase-real.sql','utf8');
const norm=s=>s.replaceAll('\r','').trim();
const source=exported.split('AS $function$')[1].split('$function$')[0];
const run=(f,{id=randomUUID(),nick='Usuario',price=1,max=4,action='raffle-buy'}={})=>f.db.query('SELECT pw2_economy_operation($1,$2,$3,$4,$5) AS result',[nick,id,action,price,max]).then(r=>r.rows[0].result);
const inventory=async f=>(await f.repository.inventory('Usuario'));
async function use(work,extended=true){const f=await adminFixture({extended});try{await work(f)}finally{await f.db.close()}}
const tokens=s=>(s.match(/--[^\n]*|'(?:''|[^'])*'|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|[^\s]/g)??[]).filter(t=>!t.startsWith('--'));

test('exportación real: hash exacto 2aa000 y lógica equivalente a 001, solo formato y comentarios',()=>{
 assert.equal(createHash('md5').update(norm(source)).digest('hex'),'2aa000dbbb080f04b029e2fd687f39eb');
 const original='DECLARE'+canonical.split('AS $$\nDECLARE')[1].split('$$;')[0];assert.deepEqual(tokens(norm(source)),tokens(norm(original)));
});

test('función real -> 004: firma, parámetros, configuración, OID, propietario y ACL preservados',()=>use(async f=>{
 const metadata=async()=>(await f.db.query("SELECT oid,proowner::regrole::text owner,proargnames,proargtypes::text,proacl,proconfig,prosecdef,pg_get_function_arguments(oid) args FROM pg_proc WHERE oid='pw2_economy_operation(text,uuid,text,integer,integer)'::regprocedure")).rows[0];
 const before=await metadata();assert.equal(before.owner,'postgres');assert.equal(before.prosecdef,false);
 const hash=(await f.db.query("SELECT md5(btrim(translate(prosrc,chr(13),''),E' \\n\\t')) hash FROM pg_proc WHERE oid='pw2_economy_operation(text,uuid,text,integer,integer)'::regprocedure")).rows[0].hash;assert.equal(hash,'2aa000dbbb080f04b029e2fd687f39eb');
 await f.db.exec(migration);assert.deepEqual(await metadata(),before);
},false));

test('004 rechaza cambios inesperados de propietario antes de crear tablas',()=>use(async f=>{
 await f.db.exec('ALTER FUNCTION pw2_economy_operation(text,uuid,text,integer,integer) OWNER TO service_role');
 await assert.rejects(f.db.exec(migration),/desconocida/);await f.db.exec('ROLLBACK');assert.equal((await f.db.query("SELECT to_regclass('pw2_account_sanctions') t")).rows[0].t,null);
},false));

test('recibo real anterior: antes eludía active=false; tras 004 no elude active de acceso ni de jugador',()=>use(async f=>{
 const id=randomUUID(),receipt=await run(f,{id,price:10,max:100});
 await f.db.exec("UPDATE shop_access SET active=false WHERE nick='Usuario'");assert.deepEqual(await run(f,{id,price:10,max:100}),receipt);
 await f.db.exec(migration);await assert.rejects(run(f,{id,price:10,max:100}),/account_inactive/);
 await f.db.exec("UPDATE shop_access SET active=true WHERE nick='Usuario';UPDATE shop_players SET active=false WHERE nick='Usuario'");await assert.rejects(run(f,{id,price:10,max:100}),/account_inactive/);
 await f.db.exec("UPDATE shop_players SET active=true WHERE nick='Usuario'");assert.deepEqual(await run(f,{id,price:10,max:100}),receipt);
 assert.equal((await inventory(f)).pc,90);assert.equal((await inventory(f)).boleto_sorteo2,1);
},false));

test('recibo anterior no elude suspensión o baneo; suspensión vencida permite recuperar el mismo recibo',()=>use(async f=>{
 const id=randomUUID(),receipt=await run(f,{id,price:10});await f.db.exec(migration);
 for(const [kind,expires,error] of [['temporary',new Date(Date.now()+3600000).toISOString(),/account_suspended/],['permanent',null,/account_banned/]]){
  const sanction=randomUUID();await f.db.query("INSERT INTO pw2_account_sanctions(id,nick,kind,expires_at,actor,reason) VALUES($1,'Usuario',$2,$3,'Perrisushi','Local')",[sanction,kind,expires]);
  await assert.rejects(run(f,{id,price:10}),error);await assert.rejects(run(f),error);
  await f.db.query("UPDATE pw2_account_sanctions SET status='revoked',closed_at=now() WHERE id=$1",[sanction]);
 }
 await f.db.query("INSERT INTO pw2_account_sanctions(id,nick,kind,starts_at,expires_at,actor,reason) VALUES($1,'Usuario','temporary',now()-interval '2 days',now()-interval '1 day','Perrisushi','Local')",[randomUUID()]);
 assert.deepEqual(await run(f,{id,price:10}),receipt);assert.equal((await inventory(f)).pc,90);assert.equal((await f.db.query("SELECT count(*)::int n FROM shop_operations WHERE action='raffle-buy'")).rows[0].n,1);
},false));

test('compras reales migradas: cuatro máximo, política manipulada, saldo y reintentos simultáneos',()=>use(async f=>{
 const id=randomUUID();const repeated=await Promise.all(Array.from({length:8},()=>run(f,{id,price:10})));assert.ok(repeated.every(r=>r.tickets===1&&r.pc===90));
 await assert.rejects(run(f,{id,price:11}),/operation_conflict/);await assert.rejects(run(f,{id,nick:'Perrisushi',price:10}),/operation_conflict/);
 await assert.rejects(run(f,{price:1000}),/insufficient_balance/);await assert.rejects(run(f,{max:100}),/ticket_limit/);
 const outcomes=await Promise.allSettled(Array.from({length:8},()=>run(f,{price:10})));assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,3);assert.ok(outcomes.filter(r=>r.status==='rejected').every(r=>r.reason.message==='ticket_limit'));
 assert.equal((await inventory(f)).boleto_sorteo2,4);assert.equal((await inventory(f)).pc,60);
 assert.equal((await f.db.query("SELECT pc FROM shop_public_users WHERE nick='Usuario'")).rows[0].pc,60);assert.equal((await f.db.query("SELECT count(*)::int n FROM shop_activity WHERE result='Compra Boleto de Sorteo 2'")).rows[0].n,4);
}));

test('históricos reales: 004 no borra canjes, claves, stock, actividad, balances ni operaciones',()=>use(async f=>{
 await f.db.exec("UPDATE shop_inventories SET random_key=2 WHERE nick='Usuario';INSERT INTO shop_random_key_tickets(id,nick,status,obtained_at,expires_at) VALUES(gen_random_uuid(),'Usuario','Activa',now(),now()+interval '1 day');INSERT INTO shop_random_key_pool(game,key,status) VALUES('Local','LOCAL-HISTORY','Disponible')");
 const old=await run(f,{action:'random-redeem',price:null,max:null});
 const snapshot=async()=>{const out={};for(const t of ['shop_inventories','shop_random_key_tickets','shop_random_key_pool','shop_random_key_claims','shop_operations','shop_activity'])out[t]=(await f.db.query('SELECT to_jsonb(t) row FROM '+t+' t ORDER BY to_jsonb(t)::text')).rows;return out};
 const before=await snapshot();await f.db.exec(migration);
 await assert.rejects(run(f,{action:'random-redeem',price:null,max:null}),/operation_disabled/);await assert.rejects(run(f,{id:old.operationId,action:'random-redeem',price:null,max:null}),/operation_disabled/);
 assert.deepEqual(await snapshot(),before);
},false));

test('reservar boletos no libera cupo de compra; los históricos resueltos no bloquean el siguiente ciclo',()=>use(async f=>{
 for(let n=0;n<4;n++)await run(f);
 const id=randomUUID();await f.db.query("INSERT INTO pw2_raffles(id,name,season,ticket_field,opens_at,closes_at,state) VALUES($1,'Local','Local','boleto_sorteo2',now()-interval '1 minute',now()+interval '1 day','open')",[id]);
 const community=createCommunity({pool:f.pool,moderation:f.moderation,resources:EDITABLE_RESOURCES});await community.execute(f.user,'raffle-register',{id,quantity:3,idempotencyKey:randomUUID()});assert.equal((await inventory(f)).boleto_sorteo2,1);
 await assert.rejects(run(f),/ticket_limit/);
 const op=(mode,version)=>f.administration.execute(f.admin,{action:'raffle',mode,id,expectedVersion:version,operationId:randomUUID(),reason:'Local',confirmed:true});
 await op('close',1);await assert.rejects(run(f),/ticket_limit/);const result=await op('draw',2);assert.equal(result.raffle.total_tickets,3);
 await run(f);assert.equal((await inventory(f)).boleto_sorteo2,2);assert.equal((await f.db.query('SELECT tickets FROM pw2_raffle_entries')).rows[0].tickets,3);
}));

test('máximo de inscripciones del mismo tipo entre eventos pendientes, sin modificar anteriores',()=>use(async f=>{
 await f.db.exec("UPDATE shop_inventories SET boleto_sorteo2=8 WHERE nick='Usuario'");
 const community=createCommunity({pool:f.pool,moderation:f.moderation,resources:EDITABLE_RESOURCES});
 const add=async()=>{const id=randomUUID();await f.db.query("INSERT INTO pw2_raffles(id,name,season,ticket_field,opens_at,closes_at,state) VALUES($1,'Local','Local','boleto_sorteo2',now()-interval '1 minute',now()+interval '1 day','open')",[id]);return id};
 const first=await add();await community.execute(f.user,'raffle-register',{id:first,quantity:3,idempotencyKey:randomUUID()});await f.db.query("UPDATE pw2_raffles SET state='closed' WHERE id=$1",[first]);
 const second=await add();await assert.rejects(community.execute(f.user,'raffle-register',{id:second,quantity:2,idempotencyKey:randomUUID()}),e=>e.code==='ticket_limit');
 assert.equal((await inventory(f)).boleto_sorteo2,5);assert.equal((await f.db.query('SELECT tickets FROM pw2_raffle_entries')).rows[0].tickets,3);
}));

test('mantenimiento: tienda no bloquea boleto; Sorteos bloquea operación nueva y repetida sin cobro',()=>use(async f=>{
 await f.db.exec("INSERT INTO pw2_community_controls(scope,active,message) VALUES('shop',true,'Local')");const id=randomUUID(),receipt=await run(f,{id});assert.equal(receipt.tickets,1);
 await f.db.exec("INSERT INTO pw2_community_controls(scope,active,message) VALUES('raffles',true,'Local')");await assert.rejects(run(f),/service_maintenance/);await assert.rejects(run(f,{id}),/service_maintenance/);assert.equal((await inventory(f)).boleto_sorteo2,1);
}));

test('adaptador: Random Key no llama ninguna RPC; configuración no puede elevar máximo a 100',async()=>{
 let calls=0;const economy=createEconomy({url:'https://local.invalid',key:'local-test',enabled:true,rafflePrice:1,raffleMax:100,fetchImpl:async()=>{calls++;return Response.json({version:1,transactional:true})}});
 await assert.rejects(economy.execute('Usuario','random-redeem',{idempotencyKey:randomUUID()}),e=>e.code==='operation_disabled');assert.equal(calls,0);
 assert.equal((await economy.status()).raffleEnabled,false);await assert.rejects(economy.execute('Usuario','raffle-buy',{idempotencyKey:randomUUID(),raffleId:'boletoSorteo2'}),e=>e.code==='operation_disabled');assert.equal(calls,1);
});

test('HTTP: endpoint de canje retirado incluso con economía activa; historial y recibos propios se conservan',()=>use(async f=>{
 let calls=0;const id=randomUUID();const historic={ok:true,operationId:id,kind:'random-redeem',redeemed:{game:'Local',key:'HISTORIC-OWN'}};
 f.repository.operationReceipt=async(nick,key)=>nick==='Usuario'&&key===id?{action:'random-redeem',response:{result:historic}}:null;
 const server=http.createServer(createBackend({repository:f.repository,moderation:f.moderation,economy:{status:async()=>({enabled:true,raffleEnabled:true}),execute:async()=>{calls++;return {ok:true}}},sessionStore:'supabase'}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;const headers={Origin:'http://127.0.0.1:4173',Cookie:'pw2_session='+f.user.token};
 try{
  const session=await fetch(base+'/api/session',{headers});const csrf=session.headers.get('x-csrf-token');assert.equal(session.status,200);
  const response=await fetch(base+'/api/shop/random-key/redeem',{method:'POST',headers:{...headers,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:randomUUID()})});assert.equal(response.status,403);assert.equal((await response.json()).error,'operation_disabled');assert.equal(calls,0);
  const history=await fetch(base+'/api/shop/random-key',{headers});assert.equal(history.status,200);assert.equal((await history.json()).operationsEnabled,false);
  const receipt=await fetch(base+'/api/shop/receipt?id='+id,{headers});assert.equal(receipt.status,200);assert.deepEqual(await receipt.json(),historic);
  const other=await fetch(base+'/api/shop/receipt?id='+id,{headers:{...headers,Cookie:'pw2_session='+f.admin.token}});assert.equal(other.status,404);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
}));
