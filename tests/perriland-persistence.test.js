// PostgreSQL local aislado. Nunca lee .env ni abre conexiones remotas.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import {perrilandFixture} from '../tools/perriland-fixture.mjs';
import {createPerrilandStore} from '../backend/perriland/store.mjs';
import {PerrilandRoom} from '../backend/perriland/room.mjs';
import {sessionKey} from '../backend/security.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};};
class Socket extends EventEmitter {
 readyState=1;bufferedAmount=0;messages=[];
 send(raw){this.messages.push(JSON.parse(raw));}
 close(code,reason){this.code=code;this.reason=reason;this.readyState=3;this.emit('close');}
}
async function fixture(work,{autoTick=false}={}){
 const f=await perrilandFixture(),hooks={save:async()=>{},access:async()=>{}};
 const actual=createPerrilandStore({pool:f.pool,enabled:true,moderation:f.moderation});
 let inFlight=0,maxInFlight=0;
 const store={...actual,async save(payload){inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);try{await hooks.save(payload);return await actual.save(payload);}finally{inFlight--;}},async access(user){await hooks.access(user);return actual.access(user);}};
 const room=new PerrilandRoom({store,autoTick});
 const user={nick:'Alpha',token:randomUUID()},admin={nick:'Perrisushi',token:randomUUID()};
 try{
  await f.enable();
  for(const u of [user,admin])await f.db.query("INSERT INTO shop_sessions(token,nick,expires_at) VALUES($1,$2,now()+interval '1 day')",[sessionKey(u.token),u.nick]);
  await room.join(user,await store.access(user));
  room.world.enemies.setAuto(false);room.world.extras.coin=null;room.world.extras.nextSpawn=Infinity;room.world.extras.nextSpecial=Infinity;
  const socket=new Socket(),c=await room.connect(user,socket,{},async()=>user);c.lastCheck=Infinity;
  const p=room.world.get(c.actor.id);
  await work({f,room,store,actual,hooks,user,admin,c,p,socket,maxInFlight:()=>maxInFlight});
 }finally{hooks.save=async()=>{};hooks.access=async()=>{};await room.close();await f.close();}
}
const promptly=promise=>Promise.race([promise,delay(300).then(()=>{throw Error('La orden esperó al guardado de PostgreSQL');})]);
const balance=async f=>(await f.repository.inventory('Alpha')).pc;

test('moneda con guardado de tres segundos: física, órdenes y snapshots siguen en tiempo real',()=>fixture(async({f,room,hooks,c,p,socket})=>{
 const started=deferred();let delayed=false;
 hooks.save=async payload=>{if(payload.events.length&&!delayed){delayed=true;started.resolve();await delay(3000);}};
 const before=await balance(f);
 // Colocar una moneda válida encima del personaje provoca el evento real del motor.
 room.world.extras.coin={x:p.x,y:p.y,r:27.3,vx:0,vy:0,grounded:true,surface:'floor'};
 await Promise.race([started.promise,delay(1000).then(()=>{throw Error('No empezó el guardado de moneda');})]);
 const saving=room.saving,startX=p.x,startTime=room.world.time,frames=socket.messages.length;
 const at=performance.now();await promptly(room.command(c,{type:'input',x:1,y:0,seq:1}));
 assert.ok(performance.now()-at<300);
 await delay(220);await promptly(room.command(c,{type:'input',x:0,y:0,seq:2}));
 assert.ok(p.x>startX+10,'Debe moverse antes de que termine el guardado');
 assert.ok(room.world.time>startTime+.1);assert.ok(socket.messages.length>frames+1);
 assert.equal(await balance(f),before);
 assert.equal(room.snapshot().players.find(q=>q.id===p.id).pc,before);
 assert.equal(room.snapshot().economyPending,true);
 assert.ok(!room.snapshot().popups.some(q=>q.id===p.id));
 await saving;assert.equal(await balance(f),before+5);
 assert.equal(room.snapshot().players.find(q=>q.id===p.id).pc,before+5);
 assert.equal(room.snapshot().economyPending,false);
 assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_perriland_events')).rows[0].n,1);
},{autoTick:true}));

test('eventos nuevos durante un guardado forman otro lote, sin solapar transacciones ni duplicar PC',()=>fixture(async({f,room,hooks,c,p,maxInFlight})=>{
 const gate=deferred();let first=true;
 hooks.save=async payload=>{if(payload.events.length&&first){first=false;await gate.promise;}};
 const event=kind=>room.economicEvent(p.id,kind);
 try{
  event('normal_coin');await room.advance({waitForPersistence:false});const saving=room.saving;
  event('special_coin');event('void');
  for(let i=0;i<15;i++)await promptly(room.advance({waitForPersistence:false}));
  assert.equal(room.pending.length,2);assert.equal(await balance(f),100);
  await promptly(room.command(c,{type:'input',x:-1,y:0,seq:1}));assert.equal(p.intent,-1);
  gate.resolve();await saving;
  assert.equal(await balance(f),105);assert.equal(room.snapshot().economyPending,true);
  await room.flush();assert.equal(await balance(f),123);assert.equal(room.snapshot().economyPending,false);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_perriland_events')).rows[0].n,3);
  await room.flush();assert.equal(await balance(f),123);assert.equal(maxInFlight(),1);
 }finally{gate.resolve();}
}));

test('guardado periódico y entrada de otra cuenta no retienen órdenes de movimiento',()=>fixture(async({room,store,hooks,c,p,admin})=>{
 const gate=deferred();hooks.save=()=>gate.promise;
 try{
  const saving=room.flush();
  const joining=room.join(admin,await store.access(admin));
  await promptly(room.command(c,{type:'input',x:1,y:0,seq:1}));assert.equal(p.intent,1);
  await promptly(room.advance({waitForPersistence:false}));
  gate.resolve();await saving;await joining;
 }finally{gate.resolve();}
}));

test('lectura lenta de permisos admin no bloquea a otros jugadores',()=>fixture(async({room,hooks,c,p,admin})=>{
 const gate=deferred();hooks.access=()=>gate.promise;
 const a={user:admin,actor:{},rateAt:Date.now(),rate:0};
 try{
  const command=room.command(a,{type:'pause',value:true});
  await promptly(room.command(c,{type:'input',x:1,y:0,seq:1}));assert.equal(p.intent,1);
  gate.resolve();await command;assert.equal(room.world.paused,true);
 }finally{gate.resolve();}
}));

test('revocación mientras la moneda espera impide acreditarla y no muestra premio confirmado',()=>fixture(async({f,room,hooks,user,p})=>{
 const gate=deferred();hooks.save=()=>gate.promise;
 try{
  room.economicEvent(p.id,'normal_coin');await room.advance({waitForPersistence:false});const saving=room.saving;
  await f.db.query('DELETE FROM shop_sessions WHERE token=$1',[sessionKey(user.token)]);
  gate.resolve();await saving;assert.equal(await balance(f),100);
  assert.equal(room.snapshot().players.find(q=>q.id===p.id).pc,100);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_perriland_events')).rows[0].n,0);
 }finally{gate.resolve();}
}));

test('fallo económico revierte saldo, ledger y checkpoint; detiene sala y cierra conexiones',()=>fixture(async({f,room,hooks,c,p,socket})=>{
 const before=(await f.db.query('SELECT * FROM pw2_perriland_room')).rows;
 await f.db.exec("CREATE FUNCTION injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test_failure'; END $$; CREATE TRIGGER injected_failure BEFORE INSERT ON shop_activity FOR EACH ROW EXECUTE FUNCTION injected_failure()");
 room.economicEvent(p.id,'normal_coin');await room.advance({waitForPersistence:false});const saving=room.saving;
 await assert.rejects(saving,/test_failure/);
 assert.equal(await balance(f),100);assert.deepEqual((await f.db.query('SELECT * FROM pw2_perriland_room')).rows,before);
 assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_perriland_events')).rows[0].n,0);
 assert.equal(socket.code,1013);assert.equal(room.error,'perriland_persistence_unavailable');
 await assert.rejects(room.command(c,{type:'input',x:1,y:0,seq:1}),e=>e.code==='perriland_persistence_unavailable');
}));

test('reinicio restaura únicamente eventos confirmados y cierre espera el guardado pendiente',()=>fixture(async({f,room,actual,hooks,p,user})=>{
 const gate=deferred();hooks.save=()=>gate.promise;
 try{
  room.economicEvent(p.id,'special_coin');await room.advance({waitForPersistence:false});
  let closed=false;const close=room.close().then(()=>{closed=true;});
  await delay(10);assert.equal(closed,false);assert.equal(await balance(f),100);
  gate.resolve();await close;assert.equal(await balance(f),120);
  const nextStore=createPerrilandStore({pool:f.pool,enabled:true,moderation:f.moderation});
  const nextRoom=new PerrilandRoom({store:nextStore,autoTick:false});
  try{await nextRoom.join(user,await nextStore.access(user));assert.equal(nextRoom.snapshot().players[0].pc,120);assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_perriland_events')).rows[0].n,1);}
  finally{await nextRoom.close();}
 }finally{gate.resolve();}
}));
