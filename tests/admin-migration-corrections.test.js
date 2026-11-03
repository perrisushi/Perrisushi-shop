import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {adminFixture} from './helpers/admin-fixture.mjs';
import {createCommunity} from '../backend/community.mjs';
import {EDITABLE_RESOURCES} from '../backend/administration.mjs';
const migration=await readFile('sql/004-administracion-ampliada.sql','utf8');
const canonical=await readFile('sql/001-economia-atomica.sql','utf8');
const bad=code=>e=>e.code===code;
async function use(work,extended=true){const f=await adminFixture({extended});f.community=createCommunity({pool:f.pool,moderation:f.moderation,resources:EDITABLE_RESOURCES});try{await work(f)}finally{await f.db.close()}}
const meta=async f=>(await f.db.query("SELECT oid,proowner,proacl,proargnames,pg_get_function_arguments(oid) AS args,proconfig FROM pg_proc WHERE oid='public.pw2_economy_operation(text,uuid,text,integer,integer)'::regprocedure")).rows[0];
const inv=async f=>(await f.repository.inventory('Usuario'));
const sqlOp=(f,action='raffle-buy',price=1,max=4,id=randomUUID())=>f.db.query('SELECT pw2_economy_operation($1,$2,$3,$4,$5) AS result',['Usuario',id,action,price,max]).then(r=>r.rows[0].result);
const sanction=(overrides={})=>({action:'moderation',operationId:randomUUID(),target:'Usuario',mode:'temporary',durationSeconds:900,expectedSanctionId:null,reason:'Prueba de cierre e historial',confirmed:true,...overrides});
async function event(f,field='mini_sorteo'){
 const id=randomUUID();await f.administration.execute(f.admin,{action:'raffle',mode:'save',operationId:randomUUID(),id,expectedVersion:null,confirmed:true,reason:'Prueba de reservas',name:'Local',season:'Local',ticketField:field,opensAt:new Date(Date.now()-60000).toISOString(),closesAt:new Date(Date.now()+3600000).toISOString()});
 await transition(f,id,'open',1);return id;
}
const transition=(f,id,mode,expectedVersion)=>f.administration.execute(f.admin,{action:'raffle',mode,id,expectedVersion,confirmed:true,reason:'Verificación local',operationId:randomUUID()});
const register=(f,id,quantity,idempotencyKey=randomUUID())=>f.community.execute(f.user,'raffle-register',{id,quantity,idempotencyKey});

test('004 CHECK real: temporal NULL, infinita o anterior rechazada; permanente sin vencimiento válida',()=>use(async f=>{
 for(const expires of [null,'infinity','-infinity','2000-01-01T00:00:00Z'])await assert.rejects(f.db.query("INSERT INTO pw2_account_sanctions(id,nick,kind,expires_at,reason,actor) VALUES($1,'Usuario','temporary',$2,'Local','Perrisushi')",[randomUUID(),expires]),e=>e.code==='23514');
 assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_account_sanctions')).rows[0].n,0);
 await f.administration.execute(f.admin,sanction({mode:'permanent',durationSeconds:undefined}));await assert.rejects(f.moderation.check('Usuario'),bad('account_banned'));
}));

test('004 caducidad: permite acceso, nueva suspensión sin conflicto y conserva la fila histórica íntegra',()=>use(async f=>{
 const first=await f.administration.execute(f.admin,sanction());
 await f.db.query("UPDATE pw2_account_sanctions SET starts_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1",[first.sanctionId]);
 const old=(await f.db.query('SELECT kind,reason,actor,starts_at,expires_at FROM pw2_account_sanctions WHERE id=$1',[first.sanctionId])).rows[0];
 await f.moderation.check('Usuario');await f.db.query("SELECT pw2_assert_account_available('Usuario')");
 const second=await f.administration.execute(f.admin,sanction());assert.notEqual(first.sanctionId,second.sanctionId);
 const history=(await f.db.query('SELECT * FROM pw2_account_sanctions ORDER BY starts_at')).rows;assert.equal(history.length,2);assert.equal(history[0].status,'expired');assert.ok(history[0].closed_at);assert.equal(history[1].status,'active');
 assert.deepEqual((await f.db.query('SELECT kind,reason,actor,starts_at,expires_at FROM pw2_account_sanctions WHERE id=$1',[first.sanctionId])).rows[0],old);
 await assert.rejects(f.moderation.check('Usuario'),bad('account_suspended'));
}));

test('004 migración conserva OID, parámetros, valores por defecto, propietario y ACL; repetible',()=>use(async f=>{
 const before=await meta(f),balances=(await f.db.query('SELECT to_jsonb(i) AS row FROM shop_inventories i ORDER BY nick')).rows;
 await f.db.exec(migration);await f.db.exec(migration);assert.deepEqual(await meta(f),before);
 assert.deepEqual((await f.db.query('SELECT to_jsonb(i) AS row FROM shop_inventories i ORDER BY nick')).rows,balances);
 for(const role of ['anon','authenticated'])assert.equal((await f.db.query("SELECT has_function_privilege($1,'public.pw2_economy_operation(text,uuid,text,integer,integer)','EXECUTE') AS allowed",[role])).rows[0].allowed,false);
 assert.equal((await f.db.query("SELECT has_function_privilege('service_role','public.pw2_economy_operation(text,uuid,text,integer,integer)','EXECUTE') AS allowed")).rows[0].allowed,true);
},false));

for(const [name,prepare,pattern] of [
 ['ausente',f=>f.db.exec('DROP FUNCTION pw2_economy_operation(text,uuid,text,integer,integer)'),/ausente/],
 ['cuerpo distinto',f=>f.db.exec(canonical.replace('IF p_operation IS NULL','IF p_operation IS NULL /* revisión no verificada */')),/desconocida/],
 ['parámetros distintos',async f=>{await f.db.exec('DROP FUNCTION pw2_economy_operation(text,uuid,text,integer,integer)');await f.db.exec(canonical.replaceAll('p_nick','p_account'));},/desconocida/],
 ['sobrecarga',f=>f.db.exec("CREATE FUNCTION pw2_economy_operation(text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$"),/desconocida/],
 ['configuración distinta',f=>f.db.exec("ALTER FUNCTION pw2_economy_operation(text,uuid,text,integer,integer) SET statement_timeout='9s'"),/desconocida/],
 ['permiso público',f=>f.db.exec('GRANT EXECUTE ON FUNCTION pw2_economy_operation(text,uuid,text,integer,integer) TO PUBLIC'),/Permisos/],
 ['sin service_role',f=>f.db.exec('REVOKE EXECUTE ON FUNCTION pw2_economy_operation(text,uuid,text,integer,integer) FROM service_role'),/Permisos/]
])test('004 prevalidación cancela sin aplicar DDL: '+name,()=>use(async f=>{
 await prepare(f);const before=(await f.db.query("SELECT pg_get_functiondef(oid) AS definition,proacl FROM pg_proc WHERE proname='pw2_economy_operation' ORDER BY oid")).rows;
 await assert.rejects(f.db.exec(migration),pattern);await f.db.exec('ROLLBACK');
 assert.equal((await f.db.query("SELECT to_regclass('public.pw2_account_sanctions') AS relation")).rows[0].relation,null);
 assert.deepEqual((await f.db.query("SELECT pg_get_functiondef(oid) AS definition,proacl FROM pg_proc WHERE proname='pw2_economy_operation' ORDER BY oid")).rows,before);
 assert.equal((await inv(f)).pc,100);
},false));

test('004 mantenimiento tienda: compra de boletos operativa e idempotente; Random Key permanece retirada',()=>use(async f=>{
 await f.db.exec("INSERT INTO pw2_community_controls(scope,active,message) VALUES('shop',true,'Pausa'); UPDATE shop_inventories SET random_key=1 WHERE nick='Usuario'; INSERT INTO shop_random_key_tickets(id,nick,status,obtained_at,expires_at) VALUES(gen_random_uuid(),'Usuario','Activa',now(),now()+interval '1 day'); INSERT INTO shop_random_key_pool(game,key,status) VALUES('Local','TEST-LOCAL-KEY','Disponible')");
 const before=await inv(f);await assert.rejects(sqlOp(f,'random-redeem',null,null),/operation_disabled/);assert.deepEqual(await inv(f),before);
 const buy=randomUUID();await sqlOp(f,'raffle-buy',10,4,buy);await sqlOp(f,'raffle-buy',10,4,buy);assert.equal((await inv(f)).pc,90);assert.equal((await inv(f)).boleto_sorteo2,1);
 await f.db.exec("INSERT INTO pw2_community_controls(scope,active,message) VALUES('raffles',true,'Pausa')");
 await assert.rejects(sqlOp(f),/service_maintenance/);assert.equal((await inv(f)).pc,90);
 await f.db.exec("UPDATE pw2_community_controls SET active=false WHERE scope='raffles'");await f.administration.execute(f.admin,sanction());await assert.rejects(sqlOp(f),/account_suspended/);
}));

test('004 RPC: fallo del recibo revierte cobro, boleto e historial; canje retirado no cambia datos',()=>use(async f=>{
 await f.db.exec("UPDATE shop_inventories SET random_key=1 WHERE nick='Usuario'; INSERT INTO shop_random_key_tickets(id,nick,status,obtained_at,expires_at) VALUES(gen_random_uuid(),'Usuario','Activa',now(),now()+interval '1 day'); INSERT INTO shop_random_key_pool(game,key,status) VALUES('Local','LOCAL-KEY','Disponible'); ALTER TABLE shop_operations ADD CONSTRAINT reject_economy CHECK(operation_id NOT LIKE 'pw2:economy:%')");
 const before=await inv(f);await assert.rejects(sqlOp(f,'raffle-buy',10,4),e=>e.code==='23514');await assert.rejects(sqlOp(f,'random-redeem',null,null),/operation_disabled/);
 assert.deepEqual(await inv(f),before);assert.equal((await f.db.query('SELECT count(*)::int n FROM shop_random_key_claims')).rows[0].n,0);assert.equal((await f.db.query('SELECT count(*)::int n FROM shop_activity')).rows[0].n,0);
 assert.equal((await f.db.query('SELECT status FROM shop_random_key_pool')).rows[0].status,'Disponible');assert.equal((await f.db.query('SELECT status FROM shop_random_key_tickets')).rows[0].status,'Activa');
}));

for(const field of ['mini_sorteo','boleto_sorteo2'])test('004 reservas reales, límite, saldo disponible y repetición: '+field,()=>use(async f=>{
 const id=await event(f,field);await assert.rejects(register(f,id,1),bad('insufficient_tickets'));
 await f.db.query('UPDATE shop_inventories SET '+field+'=4 WHERE nick=$1',['Usuario']);
 const key=randomUUID(),result=await register(f,id,3,key);assert.equal(result.reservation.availableBefore,4);assert.equal(result.reservation.availableAfter,1);
 assert.deepEqual(await register(f,id,3,key),result);await assert.rejects(register(f,id,2),bad('ticket_limit'));await register(f,id,1);
 assert.equal((await inv(f))[field],0);assert.equal((await f.db.query('SELECT sum(quantity)::int n FROM pw2_raffle_ticket_reservations')).rows[0].n,4);
 await transition(f,id,'close',2);const drawn=await transition(f,id,'draw',3);assert.equal(drawn.raffle.winner,'Usuario');assert.equal(drawn.raffle.total_tickets,4);assert.ok(drawn.raffle.winning_ticket>=1&&drawn.raffle.winning_ticket<=4);
 await transition(f,id,'archive',4);await f.db.exec(migration);assert.equal((await f.db.query('SELECT winner FROM pw2_raffles')).rows[0].winner,'Usuario');assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_raffle_ticket_reservations')).rows[0].n,2);
}));

test('004 inscripción: fallo de recibo o reserva revierte contador, inscripción, actividad y recibos',()=>use(async f=>{
 const id=await event(f);await f.db.exec("UPDATE shop_inventories SET mini_sorteo=4 WHERE nick='Usuario'");
 for(const table of ['shop_operations','pw2_raffle_ticket_reservations']){
  const constraint=table==='shop_operations'?"CHECK(action<>'raffle-register')":"CHECK(quantity=4)";
  await f.db.exec('ALTER TABLE '+table+' ADD CONSTRAINT injected_failure '+constraint);
  await assert.rejects(register(f,id,1),bad('community_unavailable'));assert.equal((await inv(f)).mini_sorteo,4);
  for(const q of ["SELECT count(*)::int n FROM pw2_raffle_entries","SELECT count(*)::int n FROM pw2_raffle_ticket_reservations","SELECT count(*)::int n FROM shop_operations WHERE action='raffle-register'","SELECT count(*)::int n FROM shop_activity WHERE game='Sorteos'"])assert.equal((await f.db.query(q)).rows[0].n,0);
  await f.db.exec('ALTER TABLE '+table+' DROP CONSTRAINT injected_failure');
 }
}));

test('004 sorteo rechaza una inscripción ficticia sin recibo ni reserva y no inventa respaldo al migrar',()=>use(async f=>{
 const id=await event(f);await f.db.query("INSERT INTO pw2_raffle_entries(raffle_id,nick,tickets) VALUES($1,'Usuario',4)",[id]);await transition(f,id,'close',2);
 await assert.rejects(transition(f,id,'draw',3),bad('raffle_integrity_error'));assert.equal((await f.db.query('SELECT winner FROM pw2_raffles')).rows[0].winner,null);
 await assert.rejects(f.db.exec(migration),/sin respaldo verificable/);await f.db.exec('ROLLBACK');assert.equal((await f.db.query('SELECT tickets FROM pw2_raffle_entries')).rows[0].tickets,4);
}));

test('004 sorteo rechaza resumen alterado y recibo incompleto incluso junto a una reserva válida',()=>use(async f=>{
 const id=await event(f);await f.db.exec("UPDATE shop_inventories SET mini_sorteo=4 WHERE nick='Usuario'");await register(f,id,1);await register(f,id,1);
 await f.db.query('UPDATE pw2_raffle_entries SET tickets=4 WHERE raffle_id=$1',[id]);await assert.rejects(register(f,id,1),bad('raffle_integrity_error'));
 await f.db.query('UPDATE pw2_raffle_entries SET tickets=2 WHERE raffle_id=$1',[id]);
 await f.db.exec("UPDATE shop_operations SET response='{}'::jsonb WHERE operation_id=(SELECT operation_id FROM pw2_raffle_ticket_reservations LIMIT 1)");
 await transition(f,id,'close',2);await assert.rejects(transition(f,id,'draw',3),bad('raffle_integrity_error'));
}));

test('004 reservas: rol de servicio sin UPDATE/DELETE y navegador sin acceso',()=>use(async f=>{
 const acl=(await f.db.query("SELECT has_table_privilege('service_role','pw2_raffle_ticket_reservations','SELECT,INSERT') AS write,has_table_privilege('service_role','pw2_raffle_ticket_reservations','UPDATE') AS edit,has_table_privilege('service_role','pw2_raffle_ticket_reservations','DELETE') AS remove,has_table_privilege('authenticated','pw2_raffle_ticket_reservations','SELECT') AS expose")).rows[0];assert.deepEqual(acl,{write:true,edit:false,remove:false,expose:false});
}));


test('004 no repara ni elimina una sanción antigua inválida: cancela y conserva sus datos',()=>use(async f=>{
 await f.db.exec('ALTER TABLE pw2_account_sanctions DROP CONSTRAINT pw2_sanction_expiration_valid');
 const id=randomUUID();await f.db.query("INSERT INTO pw2_account_sanctions(id,nick,kind,expires_at,reason,actor) VALUES($1,'Usuario','temporary',NULL,'Histórico no válido','Perrisushi')",[id]);
 await assert.rejects(f.db.exec(migration),e=>e.code==='23514');await f.db.exec('ROLLBACK');
 const row=(await f.db.query('SELECT id,expires_at,reason FROM pw2_account_sanctions WHERE id=$1',[id])).rows[0];assert.equal(row.id,id);assert.equal(row.expires_at,null);assert.equal(row.reason,'Histórico no válido');
}));

test('004 registro de reserva con otro tipo de boleto no puede respaldar un ganador',()=>use(async f=>{
 const id=await event(f);await f.db.exec("UPDATE shop_inventories SET mini_sorteo=1 WHERE nick='Usuario'");const result=await register(f,id,1);
 // Simula corrupción mediante propietario SQL; el rol de servicio no puede editar reservas.
 await f.db.exec("UPDATE pw2_raffle_ticket_reservations SET ticket_field='boleto_sorteo2'");
 await f.db.query("UPDATE shop_operations SET response=jsonb_set(response,'{result,reservation,ticketField}','\"boleto_sorteo2\"') WHERE operation_id=$1",['pw2:raffle-register:'+result.operationId]);
 await transition(f,id,'close',2);await assert.rejects(transition(f,id,'draw',3),bad('raffle_integrity_error'));
}));
