import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createBackend} from '../backend/app.mjs';
import {notificationFixture,notificationId} from './fixtures/notification-fixture.mjs';
import {createNotificationCenter,notificationDate,mergeNotifications} from '../src/services/notifications.js';
import {createApiClient} from '../src/services/api-client.js';

test('notificaciones: PostgreSQL conserva propiedad, estados, lectura idempotente y paginación por fecha con microsegundos',async()=>{
 const f=await notificationFixture();const server=http.createServer(createBackend({repository:f.repository}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 async function call(path,{auth,body}={}){const r=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Origin:'http://127.0.0.1:4173',...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],csrf:r.headers.get('x-csrf-token')}}
 const login=nick=>call('/auth/login',{body:{nick,password:'local-only'}});
 try{
  const a=await login('Alpha'),b=await login('Beta');assert.equal(a.status,200);
  assert.equal((await call('/notifications')).status,401);
  assert.deepEqual((await call('/notifications',{auth:a})).data.items,[]);
  await f.add({id:1});await f.add({id:2});await f.add({id:3,created:'2026-08-13T21:22:09.236423+00:00'});await f.add({id:4,read:'2026-08-14T00:00:00Z'});await f.add({id:5,nick:'Beta'});
  const first=await call('/notifications?limit=2',{auth:a});assert.deepEqual(first.data.items.map(n=>n.id),[notificationId(3),notificationId(2)]);
  const cursor=first.data.nextCursor;assert.ok(cursor);assert.equal(JSON.parse(Buffer.from(cursor,'base64url')).created_at,'2026-08-13T21:22:09.236422+00:00');
  const read=await call('/notifications/read',{auth:a,body:{id:notificationId(2)}});assert.equal(read.status,200);
  const readAt=(await f.db.query('SELECT read_at FROM shop_notifications WHERE id=$1',[notificationId(2)])).rows[0].read_at;
  await call('/notifications/read',{auth:a,body:{id:notificationId(2)}});
  assert.deepEqual((await f.db.query('SELECT read_at FROM shop_notifications WHERE id=$1',[notificationId(2)])).rows[0].read_at,readAt);
  const second=await call('/notifications?limit=2&cursor='+cursor,{auth:a});assert.deepEqual(second.data.items.map(n=>n.id),[notificationId(1)]);
  await call('/notifications/read',{auth:a,body:{id:notificationId(5)}});assert.equal((await call('/notifications',{auth:b})).data.items.length,1);
  assert.equal((await call('/notifications/read',{auth:a,body:{id:notificationId(1),nick:'Beta'}})).status,400);
  assert.equal((await call('/notifications/read',{body:{id:notificationId(1)}})).status,401);
  assert.equal((await call('/notifications/read',{auth:{cookie:a.cookie,csrf:'wrong'},body:{id:notificationId(1)}})).status,403);
  const history=await call('/notifications?state=read',{auth:a});assert.deepEqual(history.data.items.map(n=>n.id),[notificationId(4),notificationId(2)]);
  assert.equal(history.data.items[1].message,'Contenido original');assert.equal(history.data.items[1].title,'Notificación 2');
  await call('/auth/logout',{auth:a,body:{}});const again=await login('Alpha');assert.equal((await call('/notifications?state=read',{auth:again})).data.items.length,2);
  await f.add({id:6,created:'2026-09-01T00:00:00Z'});assert.equal((await call('/notifications',{auth:again})).data.items[0].id,notificationId(6));
  for(const invalid of ['all','invalid'])assert.equal((await call('/notifications?state='+invalid,{auth:again})).status,400);
  for(const data of [{id:notificationId(1),created_at:'bad'},{id:'bad',created_at:'2026-01-01T00:00:00Z'},'legacy', {id:notificationId(1),created_at:'2026-01-01T00:00:00Z',nick:'Beta'}])assert.equal((await call('/notifications?cursor='+Buffer.from(JSON.stringify(data)).toString('base64url'),{auth:again})).status,400);
  assert.equal(Number((await f.db.query('SELECT count(*) FROM shop_notifications')).rows[0].count),6);
  assert.ok(f.requests.every(r=>['GET','PATCH'].includes(r.method)&&r.params.nick.startsWith('eq.')));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await f.db.close()}
});

test('campana: nuevas sin relogin, sin lecturas ocultas, errores recuperables, sin duplicación y sin respuestas de sesión anterior',async()=>{
 let unread=[{id:'A'}],writes=[],pending=[],active=true,fail=false,seen=[];
 const center=createNotificationCenter({api:{getNotifications:async()=>({items:unread}),markNotificationRead:async id=>{if(fail)throw Error();writes.push(id);unread=unread.filter(n=>n.id!==id)}},onPending:b=>pending.push(b),onViewed:id=>seen.push(id),isActive:()=>active,intervalMs:10});
 try{
  center.start();await center.refresh();assert.equal(pending.at(-1),true);
  assert.equal(await center.markViewed('A',()=>false),false);assert.deepEqual(writes,[]);
  fail=true;assert.equal(await center.markViewed('A'),false);assert.deepEqual(writes,[]);
  fail=false;await Promise.all([center.markViewed('A'),center.markViewed('A')]);await center.refresh();assert.deepEqual(writes,['A']);assert.equal(pending.at(-1),false);
  unread=[{id:'B'}];await new Promise(r=>setTimeout(r,25));assert.equal(pending.at(-1),true);
  active=false;assert.equal(await center.markViewed('B'),false);active=true;
  await center.markViewed('B');assert.deepEqual(seen,['A','B']);center.stop();assert.equal(pending.at(-1),false);
 }finally{center.stop()}
 let resolve;const stale=[];const second=createNotificationCenter({api:{getNotifications:()=>new Promise(r=>resolve=r)},onPending:b=>stale.push(b)});second.start();await Promise.resolve();second.stop();resolve({items:[{id:'old'}]});await new Promise(r=>setTimeout(r,0));assert.equal(stale.at(-1),false);
});

test('fechas españolas, contenido íntegro y paginación sin duplicar identificadores',()=>{
 assert.match(notificationDate('2026-08-13T21:22:09.236422+00:00'),/13 de agosto de 2026/);assert.doesNotMatch(notificationDate('2026-08-13T21:22:09Z'),/T|\+00/);assert.equal(notificationDate('bad'),'');
 assert.deepEqual(mergeNotifications([{id:'a',created_at:'2026-01-01T00:00:00Z'}],[{id:'b',created_at:'2026-02-01T00:00:00Z'},{id:'a',created_at:'2026-01-01T00:00:00Z',message:'íntegro'}]).map(n=>n.id),['b','a']);
});

test('cliente consulta nuevas y revisadas sin caché de 30 segundos',async()=>{
 const urls=[];const api=createApiClient({fetchImpl:async url=>{urls.push(url);return Response.json({items:[],nextCursor:null})}});
 await api.getNotifications();await api.getNotifications();await api.getNotifications({state:'read'});
 assert.equal(urls.length,3);assert.equal(new URL(urls[0],'https://local.invalid').searchParams.get('state'),'unread');assert.equal(new URL(urls[2],'https://local.invalid').searchParams.get('state'),'read');
});
