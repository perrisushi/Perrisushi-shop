import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
// Solo PostgreSQL local PGlite: sin credenciales ni servicios externos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {perrilandFixture} from '../tools/perriland-fixture.mjs';
import {createPerrilandStore} from '../backend/perriland/store.mjs';
import {sessionKey} from '../backend/security.mjs';

test('PERRILAND: menos viajes a PostgreSQL sin perder seguridad ni atomicidad', async t => {
 const f=await perrilandFixture(),queries=[];
 const pool={async connect(){const c=await f.pool.connect();return {async query(sql,args){queries.push(sql);return c.query(sql,args)},release(){c.release()}}}};
 const store=createPerrilandStore({pool,enabled:true,moderation:f.moderation});
 const user={nick:'Alpha',token:randomUUID()},admin={nick:'Perrisushi',token:randomUUID()};
 try {
  for(const u of [user,admin])await f.db.query("INSERT INTO shop_sessions(token,nick,expires_at) VALUES($1,$2,now()+interval '1 day')",[sessionKey(u.token),u.nick]);
  await f.enable();
  await t.test('acceso completo en tres consultas, con apariencia y saldo reales',async()=>{
   queries.length=0;const access=await store.access(user);
   assert.equal(access.available,true);assert.equal(access.pc,100);assert.equal(access.composition.logo,'logo-pelusa-1');assert.equal(access.isAdmin,false);
   assert.ok(queries.length<=3,'No deben crecer los viajes por cada refresco de conexión');
  });
  await t.test('roles, mantenimiento y sanciones se revalidan sin caché',async()=>{
   assert.equal((await store.access(admin)).isAdmin,true);
   await f.db.exec("UPDATE shop_access SET is_admin=false WHERE nick='Perrisushi'");
   assert.equal((await store.access(admin)).isAdmin,false);
   await f.enable(false);assert.equal((await store.access(user)).available,false);await f.enable();
   await f.db.exec("INSERT INTO test_bans VALUES('Alpha')");
   await assert.rejects(store.access(user),e=>e.code==='account_banned');await f.db.exec('DELETE FROM test_bans');
   await f.db.exec("UPDATE shop_access SET active=false WHERE nick='Alpha'");
   await assert.rejects(store.access(user),e=>e.code==='session_expired');
   await f.db.exec("UPDATE shop_access SET active=true WHERE nick='Alpha'");
  });
  await store.open();
  const payload={commitId:randomUUID(),state:{local:'checkpoint'},events:[],nicks:['Alpha']};
  await t.test('checkpoint sin economía usa un solo viaje y conserva inventarios e historial',async()=>{
   queries.length=0;const result=await store.save(payload);
   assert.equal(queries.length,1);assert.deepEqual(result.balances,{});
   const row=(await f.db.query('SELECT revision,state,commit_id FROM pw2_perriland_room')).rows[0];
   assert.equal(Number(row.revision),1);assert.deepEqual(row.state,payload.state);assert.equal(row.commit_id,payload.commitId);
   assert.equal((await f.repository.inventory('Alpha')).pc,100);
   assert.equal((await f.db.query('SELECT count(*)::int AS n FROM shop_operations')).rows[0].n,0);
   assert.equal((await f.db.query('SELECT count(*)::int AS n FROM pw2_perriland_events')).rows[0].n,0);
  });
  await t.test('repetir commit no incrementa revisión ni sustituye checkpoint',async()=>{
   const before=(await f.db.query('SELECT * FROM pw2_perriland_room')).rows;
   assert.equal((await store.save({...payload,state:{incorrecto:true}})).replayed,true);
   assert.deepEqual((await f.db.query('SELECT * FROM pw2_perriland_room')).rows,before);
  });
  await t.test('monedas siguen usando transacción y contabilización real',async()=>{
   queries.length=0;
   await store.save({commitId:randomUUID(),state:{local:'moneda'},nicks:['Alpha'],events:[{id:randomUUID(),nick:'Alpha',kind:'normal_coin',sessions:[sessionKey(user.token)]}]});
   assert.ok(queries.includes('BEGIN'));assert.ok(queries.includes('COMMIT'));
   assert.equal((await f.repository.inventory('Alpha')).pc,105);
   assert.equal((await f.db.query('SELECT count(*)::int AS n FROM pw2_perriland_events')).rows[0].n,1);
  });
  await t.test('revisión ajena cancela checkpoint sin sobrescribir datos',async()=>{
   await f.db.exec('UPDATE pw2_perriland_room SET revision=revision+1');
   const before=(await f.db.query('SELECT * FROM pw2_perriland_room')).rows;
   await assert.rejects(store.save({...payload,commitId:randomUUID()}),e=>e.code==='perriland_revision_conflict');
   assert.deepEqual((await f.db.query('SELECT * FROM pw2_perriland_room')).rows,before);
  });
  await t.test('sesión revocada se rechaza en el siguiente refresco',async()=>{
   await f.db.query('DELETE FROM shop_sessions WHERE token=$1',[sessionKey(user.token)]);
   await assert.rejects(store.access(user),e=>e.code==='session_expired');
  });
 } finally {await store.close();await f.close();}
});


test('PERRILAND: espera visual de 50 ms, sin avanzar más allá de los estados recibidos',async()=>{
 const context=vm.createContext({});vm.runInContext(await readFile(new URL('../games/perriland/render-timeline.js',import.meta.url),'utf8'),context);
 const Timeline=context.OverlayTimeline.Timeline;
 const old=new Timeline(),current=new Timeline({delayMs:50});
 for(const timeline of [old,current])for(const time of [0,1/30,2/30,.1])timeline.push({time,paused:false,players:[{id:'local',active:true,x:time*340,y:0}]},time*1000);
 assert.ok(Math.abs(current.sample(100).time-old.sample(100).time-.05)<1e-9);
 let previous=0;
 for(let now=101;now<250;now+=7){const sample=current.sample(now);assert.ok(sample.time>=previous);assert.ok(sample.time<=.1);previous=sample.time;}
 current.push({time:.2,paused:true,players:[]},260);assert.equal(current.sample(280).time,.2);
 current.push({time:0,paused:false,players:[]},300);assert.equal(current.sample(301).time,0);
 const overlay=await readFile(new URL('../games/perriland/overlay.js',import.meta.url),'utf8');assert.match(overlay,/Timeline\(\{delayMs:50\}\)/);
});
