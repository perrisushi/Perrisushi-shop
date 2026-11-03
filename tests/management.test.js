import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {adminFixture} from './helpers/admin-fixture.mjs';import {createCommunity} from '../backend/community.mjs';import {EDITABLE_RESOURCES} from '../backend/administration.mjs';
const failure=code=>e=>e.code===code;
const product=(overrides={})=>({action:'product',operationId:randomUUID(),id:randomUUID(),expectedVersion:null,confirmed:true,reason:'Catálogo local',name:'Gemas de prueba local',category:'utility',rewardType:'resource',rewardId:'chatarra',quantity:2,price:5,stock:3,enabled:true,hidden:false,...overrides});
const raffle=(overrides={})=>({action:'raffle',operationId:randomUUID(),id:randomUUID(),expectedVersion:null,confirmed:true,reason:'Evento local',mode:'save',name:'Evento local',season:'Temporada local',ticketField:'mini_sorteo',opensAt:new Date(Date.now()-60000).toISOString(),closesAt:new Date(Date.now()+3600000).toISOString(),...overrides});
async function use(task){const f=await adminFixture({extended:true});f.community=createCommunity({pool:f.pool,moderation:f.moderation,resources:EDITABLE_RESOURCES});try{await task(f)}finally{await f.db.close()}}
const execute=(f,body)=>f.administration.execute(f.admin,body);
test('tienda: un único catálogo real, coste y recompensa atómicos, stock e idempotencia',()=>use(async f=>{
 const p=product();const created=await execute(f,p);assert.equal(created.product.version,1);const listing=await f.community.read(f.user,'store');assert.equal(listing.items[0].id,p.id);
 const buy={id:p.id,expectedVersion:1,idempotencyKey:randomUUID()};await Promise.all([f.community.execute(f.user,'store-buy',buy),f.community.execute(f.user,'store-buy',buy)]);
 const inv=await f.repository.inventory('Usuario');assert.equal(inv.polvo_gema,20);assert.equal(inv.chatarra,2);assert.equal((await f.db.query('SELECT stock FROM pw2_store_products')).rows[0].stock,2);assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_store_purchases')).rows[0].n,1);
 await execute(f,{...p,operationId:randomUUID(),expectedVersion:2,price:8,enabled:false,hidden:true});assert.equal((await f.community.read(f.user,'store')).items.length,0);await assert.rejects(f.community.execute(f.user,'store-buy',{...buy,idempotencyKey:randomUUID()}),failure('product_unavailable'));
 assert.equal((await f.db.query('SELECT snapshot FROM pw2_store_purchases')).rows[0].snapshot.price,5);
}));
test('tienda: rechaza objetos inexistentes, categorías sin entrega y cambios de precio sin consentimiento',()=>use(async f=>{
 await assert.rejects(execute(f,product({rewardId:'inventado'})),failure('invalid_reward'));await assert.rejects(execute(f,product({category:'frames'})),failure('unsupported_product'));
 const p=product();await execute(f,p);await execute(f,{...p,operationId:randomUUID(),expectedVersion:1,price:10});await assert.rejects(f.community.execute(f.user,'store-buy',{id:p.id,expectedVersion:1,idempotencyKey:randomUUID()}),failure('product_changed'));assert.equal((await f.repository.inventory('Usuario')).polvo_gema,25);
}));
test('tienda y recursos: Perrilogos reales, propiedad única y retirada sin identificadores nuevos',()=>use(async f=>{
 const p=product({category:'logos',rewardType:'logo',rewardId:'logo-buho-1',quantity:1,price:10});await execute(f,p);await f.community.execute(f.user,'store-buy',{id:p.id,expectedVersion:1,idempotencyKey:randomUUID()});
 assert.equal((await f.repository.inventory('Usuario')).pc,90);await assert.rejects(f.community.execute(f.user,'store-buy',{id:p.id,expectedVersion:2,idempotencyKey:randomUUID()}),failure('already_owned'));
 await execute(f,{action:'logo',operationId:randomUUID(),target:'Usuario',logoId:'logo-buho-1',grant:false,expectedOwned:true,reason:'Retirada comprobada',confirmed:true});assert.ok(!(await f.repository.profile('Usuario')).owned_logo_ids.includes('logo-buho-1'));
 await assert.rejects(execute(f,{action:'logo',operationId:randomUUID(),target:'Usuario',logoId:'logo-inventado',grant:true,expectedOwned:false,reason:'Inválido',confirmed:true}),failure('invalid_request'));
}));
test('tienda: saldo insuficiente y fallo del recibo revierten entrega, stock y gasto',()=>use(async f=>{
 const p=product({price:100});await execute(f,p);await assert.rejects(f.community.execute(f.user,'store-buy',{id:p.id,expectedVersion:1,idempotencyKey:randomUUID()}),failure('insufficient_balance'));
 await execute(f,{...p,operationId:randomUUID(),expectedVersion:1,price:5});await f.db.exec("ALTER TABLE shop_operations ADD CONSTRAINT reject_sale CHECK(action<>'store-buy')");await assert.rejects(f.community.execute(f.user,'store-buy',{id:p.id,expectedVersion:2,idempotencyKey:randomUUID()}),failure('community_unavailable'));assert.equal((await f.repository.inventory('Usuario')).polvo_gema,25);assert.equal((await f.repository.inventory('Usuario')).chatarra,0);assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_store_purchases')).rows[0].n,0);
}));
test('sorteos: inscripción consume/reserva boletos, límite cuatro y sorteo ponderado guardado una sola vez',()=>use(async f=>{
 const r=raffle();await execute(f,r);await execute(f,{action:'raffle',mode:'open',id:r.id,expectedVersion:1,operationId:randomUUID(),reason:'Abrir evento',confirmed:true});await f.db.query("UPDATE shop_inventories SET mini_sorteo=4 WHERE nick IN ('Usuario','Perrisushi')");
 const entry={id:r.id,quantity:3,idempotencyKey:randomUUID()};await Promise.all([f.community.execute(f.user,'raffle-register',entry),f.community.execute(f.user,'raffle-register',entry)]);assert.equal((await f.repository.inventory('Usuario')).mini_sorteo,1);await assert.rejects(f.community.execute(f.user,'raffle-register',{...entry,quantity:2,idempotencyKey:randomUUID()}),failure('ticket_limit'));
 await f.community.execute(f.admin,'raffle-register',{id:r.id,quantity:1,idempotencyKey:randomUUID()});await execute(f,{action:'raffle',mode:'close',id:r.id,expectedVersion:2,operationId:randomUUID(),reason:'Cerrar evento',confirmed:true});
 const draw={action:'raffle',mode:'draw',id:r.id,expectedVersion:3,operationId:randomUUID(),reason:'Sorteo con boletos válidos',confirmed:true};const result=await execute(f,draw);const same=await execute(f,draw);assert.equal(result.raffle.winner,same.raffle.winner);assert.equal(result.raffle.total_tickets,4);assert.equal(result.raffle.winner,result.raffle.winning_ticket<=1?'Perrisushi':'Usuario');
 await assert.rejects(execute(f,{...draw,operationId:randomUUID(),expectedVersion:4}),failure('raffle_state'));
 const archived=await execute(f,{...draw,operationId:randomUUID(),mode:'archive',expectedVersion:4});assert.equal(archived.raffle.winner,result.raffle.winner);assert.equal(archived.raffle.state,'archived');
}));
test('sorteos: sin participantes no hay ganador; no se edita un evento abierto',()=>use(async f=>{
 const r=raffle();await execute(f,r);await execute(f,{action:'raffle',mode:'open',id:r.id,expectedVersion:1,operationId:randomUUID(),reason:'Abrir',confirmed:true});await assert.rejects(execute(f,{...r,expectedVersion:2,operationId:randomUUID()}),failure('raffle_state'));await execute(f,{action:'raffle',mode:'close',id:r.id,expectedVersion:2,operationId:randomUUID(),reason:'Cerrar',confirmed:true});await assert.rejects(execute(f,{action:'raffle',mode:'draw',id:r.id,expectedVersion:3,operationId:randomUUID(),reason:'Elegir',confirmed:true}),failure('no_participants'));
}));
test('avisos y mantenimiento: controles reales, lecturas disponibles y escrituras bloqueadas',()=>use(async f=>{
 const p=product();await execute(f,p);await execute(f,{action:'control',operationId:randomUUID(),scope:'announcement',active:true,message:'Aviso real local',expectedVersion:null,reason:'Comunicación',confirmed:true});assert.equal((await f.community.read(f.user,'community')).announcement,'Aviso real local');
 await execute(f,{action:'control',operationId:randomUUID(),scope:'shop',active:true,message:'Mantenimiento local',expectedVersion:null,reason:'Pausa',confirmed:true});assert.equal((await f.community.read(f.user,'store')).items.length,1);await assert.rejects(f.community.execute(f.user,'store-buy',{id:p.id,expectedVersion:1,idempotencyKey:randomUUID()}),failure('service_maintenance'));
 await execute(f,{action:'control',operationId:randomUUID(),scope:'shop',active:false,message:'',expectedVersion:1,reason:'Reabrir',confirmed:true});assert.equal((await f.community.execute(f.user,'store-buy',{id:p.id,expectedVersion:1,idempotencyKey:randomUUID()})).ok,true);
}));
test('migración: RPC económica con guardas internas, límite cuatro y mantenimiento',()=>use(async f=>{
 await f.db.exec(await readFile('sql/001-economia-atomica.sql','utf8'));await f.db.exec(await readFile('sql/004-administracion-ampliada.sql','utf8'));await execute(f,{action:'control',operationId:randomUUID(),scope:'raffles',active:true,message:'Pausa',expectedVersion:null,reason:'Prueba',confirmed:true});await assert.rejects(f.db.query("SELECT pw2_economy_operation('Usuario',$1,'raffle-buy',1,4)",[randomUUID()]),e=>e.message==='service_maintenance');
 await execute(f,{action:'control',operationId:randomUUID(),scope:'raffles',active:false,message:'',expectedVersion:1,reason:'Reabrir',confirmed:true});await assert.rejects(f.db.query("SELECT pw2_economy_operation('Usuario',$1,'raffle-buy',1,5)",[randomUUID()]),e=>e.message==='ticket_limit');
}));

test('recursos: entregar y retirar cantidades conserva saldo no negativo y motivo auditado',()=>use(async f=>{
 await execute(f,{action:'resource',operationId:randomUUID(),target:'Usuario',field:'pc',mode:'add',expected:100,value:20,reason:'Entrega comprobada',confirmed:true});assert.equal((await f.repository.inventory('Usuario')).pc,120);
 await execute(f,{action:'resource',operationId:randomUUID(),target:'Usuario',field:'pc',mode:'remove',expected:120,value:10,reason:'Retirada comprobada',confirmed:true});assert.equal((await f.repository.inventory('Usuario')).pc,110);
 await assert.rejects(execute(f,{action:'resource',operationId:randomUUID(),target:'Usuario',field:'pc',mode:'remove',expected:110,value:111,reason:'Inválido',confirmed:true}),failure('invalid_balance'));assert.equal((await f.repository.inventory('Usuario')).pc,110);
}));
