import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createBackend} from '../backend/app.mjs';
import {createRepository,BackendError} from '../backend/repository.mjs';
import {digest,sessionKey} from '../backend/security.mjs';
const accounts={Alpha:{nick:'Alpha',active:true,code_hash:digest('local-test-only')},Beta:{nick:'Beta',active:true,code_hash:digest('beta-only')},Disabled:{nick:'Disabled',active:false,code_hash:digest('local-test-only')}};
function fixture(){
 const calls=[];return {calls,configured:true,access:async nick=>{calls.push(['access',nick]);return accounts[nick]??null},player:async nick=>{calls.push(['player',nick]);return accounts[nick]?{nick,active:true}:null},profile:async nick=>({nick,selected_logo_id:'buho-1',owned_logo_ids:['buho-1'],karma:'neutral',achievements:[],selected_title_id:null}),logos:async()=>[{logo_id:'buho-1',name:'Búho',asset_path:'https://bad.invalid/private',enabled:true}],inventory:async nick=>{calls.push(['inventory',nick]);return {nick,pc:8,monedas:2,random_key:1,boleto_sorteo1:0,boleto_sorteo2:3,mini_sorteo:0}},page:async(kind,nick,opts)=>{calls.push([kind,nick,opts]);return Array.from({length:opts.limit+1},(_,i)=>kind==='users'?{nick:'Public'+i,pc:i,logo_id:'buho-1',achievements:[]}:kind==='claims'?{id:String(i+1),game:'Test',key:'owned-by-'+nick,claimed_at:null}:{id:String(i+1),title:'own-'+nick,created_at:null})},createSession:async()=>{throw Error('Unexpected write')},deleteSession:async()=>{throw Error('Unexpected write')}};
}
async function use(fn,options={}){
 const repository=options.repository??fixture();const server=http.createServer(createBackend({repository,...options}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,{method='GET',cookie,body,csrf,origin='http://127.0.0.1:4173'}={})=>{const response=await fetch(base+'/api'+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],csrf:response.headers.get('x-csrf-token'),headers:response.headers}};
 const login=async(nick='Alpha',password='local-test-only')=>request('/auth/login',{method:'POST',body:{nick,password}});
 try{await fn({request,login,repository})}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
}
test('login compatible, cookie privada, sesión propia y cero escrituras remotas con memoria',()=>use(async({login,request})=>{
 const a=await login();assert.equal(a.status,200);assert.match(a.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.ok(!JSON.stringify(a.data).includes('token'));assert.equal(a.data.nick,'Alpha');
 const state=await request('/session',{cookie:a.cookie});assert.equal(state.data.nick,'Alpha');assert.ok(state.csrf);assert.equal(state.headers.get('cache-control'),'no-store');
 assert.equal((await request('/session',{cookie:'pw2_session=legacy-token'})).data.authenticated,false);
}));
test('usuario desconocido, desactivado y contraseña incorrecta tienen el mismo error',()=>use(async({login})=>{
 const states=await Promise.all([login('Unknown'),login('Disabled'),login('Alpha','wrong')]);assert.deepEqual(states.map(r=>[r.status,r.data]),Array(3).fill([401,{error:'invalid_credentials'}]));
}));
test('conserva compatibilidad con hashes heredados que contienen espacios de almacenamiento',()=>use(async({login,repository})=>{
 repository.access=async()=>({...accounts.Alpha,code_hash:' '+accounts.Alpha.code_hash+'\n'});
 assert.equal((await login()).status,200);
}));
test('aislamiento A/B en todas las lecturas privadas y rechazo de identidades inyectadas',()=>use(async({login,request,repository})=>{
 const a=await login(),b=await login('Beta','beta-only');
 for(const route of ['/profile','/history','/inventory','/notifications','/shop/random-key']){
  const r=await request(route,{cookie:a.cookie});assert.equal(r.status,200);assert.ok(!JSON.stringify(r.data).includes('Beta'));
  assert.equal((await request(route+'?nick=Beta',{cookie:a.cookie})).status,400);
  assert.equal((await request(route)).status,401);
 }
 assert.equal((await request('/inventory',{cookie:b.cookie})).status,200);
 assert.ok(repository.calls.some(c=>c[0]==='claims'&&c[1]==='Alpha'));
 assert.ok(!JSON.stringify((await request('/profile',{cookie:a.cookie})).data).includes('bad.invalid'));
}));
test('Origin y CSRF protegen logout, y solo revoca la propia sesión',()=>use(async({login,request})=>{
 const a=await login(),b=await login('Beta','beta-only');
 assert.equal((await request('/auth/logout',{method:'POST',body:{},cookie:a.cookie,origin:'https://other.invalid',csrf:a.csrf})).status,403);
 assert.equal((await request('/auth/logout',{method:'POST',body:{},cookie:a.cookie})).status,403);
 assert.equal((await request('/auth/logout',{method:'POST',body:{},cookie:a.cookie,csrf:a.csrf})).status,200);
 assert.equal((await request('/profile',{cookie:a.cookie})).status,401);assert.equal((await request('/profile',{cookie:b.cookie})).status,200);
}));
test('expiración y desactivación de cuenta no reutilizan sesiones',async()=>{
 let clock=Date.now();await use(async({login,request})=>{const a=await login();clock+=2000;assert.equal((await request('/session',{cookie:a.cookie})).data.authenticated,false)}, {now:()=>clock,sessionTtlMs:1000});
 const repository=fixture();await use(async({login,request})=>{const a=await login();repository.access=async()=>({...accounts.Alpha,active:false});assert.equal((await request('/inventory',{cookie:a.cookie})).status,401)},{repository});
});
test('cookie Secure en origen HTTPS, login cross-origin rechazado y tamaño acotado',()=>use(async({request})=>{
 assert.equal((await request('/auth/login',{method:'POST',body:{nick:'Alpha',password:'local-test-only'}})).status,403);
 const r=await request('/auth/login',{method:'POST',origin:'https://site.example',body:{nick:'Alpha',password:'local-test-only'}});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/; Secure;/);
 assert.equal((await request('/auth/login',{method:'POST',origin:'https://site.example',body:{nick:'Alpha',password:'x'.repeat(1025)}})).status,400);
 assert.equal((await request('/auth/login',{method:'POST',origin:'https://site.example',body:{nick:'Alpha',password:'x'.repeat(5000)}})).status,413);
},{publicOrigin:'https://site.example'}));
test('paginación limitada, estados ausentes sin upsert y operaciones económicas bloqueadas',()=>use(async({login,request,repository})=>{
 const a=await login();const users=await request('/users?limit=100',{cookie:a.cookie});assert.equal(users.data.items.length,50);assert.ok(users.data.nextCursor);
 assert.equal((await request('/history?cursor=bad',{cookie:a.cookie})).status,400);
 repository.inventory=async()=>null;assert.deepEqual((await request('/inventory',{cookie:a.cookie})).data,{inventory:null});
 assert.equal((await request('/shop/raffles',{cookie:a.cookie})).data.available,false);
 for(const path of ['/shop/random-key/redeem','/shop/raffles/buy'])assert.equal((await request(path,{method:'POST',body:{},cookie:a.cookie,csrf:a.csrf})).data.error,'operation_disabled');
}));
test('configuración ausente es explícita, login limitado y errores no filtran secretos',async()=>{
 await use(async({request})=>assert.equal((await request('/session')).data.error,'backend_not_configured'),{repository:createRepository()});
 await use(async({login})=>{for(let i=0;i<8;i++)assert.equal((await login('Unknown')).status,401);assert.equal((await login('Unknown')).status,429)});
 await use(async({login})=>assert.deepEqual((await login()).data,{error:'request_failed'}),{repository:{configured:true,access:async()=>{throw Error('secret')},player:async()=>null}});
});
test('PostgREST usa columnas explícitas, filtros por propietario y nunca pool/minijuegos',async()=>{
 const calls=[];const repo=createRepository({url:'https://example.supabase.co',key:'not-a-real-key',fetchImpl:async(url,opts)=>{calls.push([new URL(url),opts]);return {ok:true,json:async()=>[]}}});
 await repo.access('A,"B');await repo.inventory('Alpha');await repo.profile('Alpha');await repo.logos();
 for(const kind of ['users','history','notifications','claims','tickets'])await repo.page(kind,'Alpha',{limit:20});
 for(const [url,opts]of calls){assert.equal(opts.method,'GET');assert.ok(url.searchParams.get('select'));assert.ok(!url.searchParams.get('select').includes('*'));assert.doesNotMatch(url.pathname,/pool|rpg|perripet/)}
 const publicCall=calls.find(([url])=>url.pathname.endsWith('/shop_public_users'));assert.ok(publicCall);assert.doesNotMatch(publicCall[0].searchParams.get('select'),/shop_access|shop_players/);
 await assert.rejects(repo.createSession({token:sessionKey('x'),nick:'Alpha'}),e=>e instanceof BackendError&&e.code==='session_writes_disabled');
 assert.equal(calls.length,9);
});
test('persistencia v2 debe aprobarse, nunca elimina tokens legados',async()=>{
 const calls=[];const repo=createRepository({url:'https://example.supabase.co',key:'test-only',allowSessionWrites:true,fetchImpl:async(url,opts)=>{calls.push([String(url),opts]);return {ok:true}}});
 const token=sessionKey('local-only');await repo.createSession({token,nick:'Alpha',expires_at:new Date().toISOString()});await repo.deleteSession(token);
 assert.deepEqual(calls.map(c=>c[1].method),['POST','DELETE']);assert.match(calls[1][0],/token=eq/);assert.ok(decodeURIComponent(calls[1][0]).includes(token));
 assert.throws(()=>repo.deleteSession('old-legacy-token'));
});

test('métricas reales del adaptador en lecturas usan solo GET y no incluyen identidad ni secretos',async()=>{
 const outbound=[],metrics=[];
 const repository=createRepository({url:'https://example.supabase.co',key:'FAKE-NOT-A-CREDENTIAL',fetchImpl:async(url,options)=>{
  const target=new URL(url);outbound.push({table:target.pathname.split('/').pop(),method:options.method});
  const data=target.pathname.endsWith('shop_access')?[accounts.Alpha]:target.pathname.endsWith('shop_players')?[{nick:'Alpha',active:true}]:[];
  return {ok:true,json:async()=>data};
 }});
 await use(async({login,request})=>{
  const auth=await login();assert.equal(auth.status,200);
  for(const route of ['/session','/profile','/inventory','/history','/users','/notifications','/shop/random-key','/shop/raffles'])assert.equal((await request(route,{cookie:auth.cookie})).status,200);
 },{repository,onMetric:m=>metrics.push(m)});
 assert.ok(outbound.every(c=>c.method==='GET'));
 assert.deepEqual(metrics.map(m=>[m.route,m.queries]),[['/api/auth/login',2],['/api/session',2],['/api/profile',5],['/api/inventory',3],['/api/history',3],['/api/users',3],['/api/notifications',3],['/api/shop/random-key',5],['/api/shop/raffles',3]]);
 assert.ok(!JSON.stringify(metrics).includes('Alpha'));assert.deepEqual(Object.keys(metrics[0]),['route','method','status','durationMs','queries']);
});
test('avatar adquirido y notificación propia: CSRF, UUID e identidad, sin cambios económicos',()=>use(async({login,request,repository})=>{
 const writes=[];let selected='buho-1';
 repository.profile=async()=>({selected_logo_id:selected,owned_logo_ids:['buho-1']});
 repository.setAvatar=async(nick,id)=>{writes.push(['avatar',nick,id]);selected=id};
 repository.readNotification=async(nick,id)=>writes.push(['notification',nick,id]);
 const a=await login();const post=(path,body,csrf=a.csrf)=>request(path,{method:'POST',body,cookie:a.cookie,csrf});
 assert.equal((await post('/profile/avatar',{avatarId:'buho-1'},'wrong')).status,403);
 assert.equal((await post('/profile/avatar',{avatarId:'panda-1'})).status,403);
 assert.equal((await post('/profile/avatar',{avatarId:'buho-1',nick:'Beta'})).status,400);
 assert.equal((await post('/profile/avatar',{avatarId:'buho-1'})).status,200);
 assert.equal((await post('/notifications/read',{id:'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'})).status,400);
 const id='12345678-1234-4234-8234-123456789abc';
 assert.equal((await post('/notifications/read',{id,nick:'Beta'})).status,400);
 assert.equal((await post('/notifications/read',{id})).status,200);
 assert.deepEqual(writes,[['avatar','Alpha','buho-1'],['notification','Alpha',id]]);
}));
test('PATCH atómico de avatar restringe propietario y propiedad; notificaciones solo UUID propio no leído',async()=>{
 const calls=[];const repo=createRepository({url:'https://example.supabase.co',key:'test-only',fetchImpl:async(url,opts)=>{calls.push([new URL(url),opts]);return {ok:true}}});
 await repo.setAvatar('Alpha','logo-buho-1');await repo.readNotification('Alpha','12345678-1234-4234-8234-123456789abc');
 assert.deepEqual(calls.map(c=>c[1].method),['PATCH','PATCH']);
 assert.equal(calls[0][0].searchParams.get('owned_logo_ids'),'cs.["logo-buho-1"]');
 for(const [url]of calls)assert.equal(url.searchParams.get('nick'),'eq."Alpha"');
 assert.deepEqual(JSON.parse(calls[0][1].body),{selected_logo_id:'logo-buho-1'});
 assert.equal(calls[1][0].searchParams.get('read_at'),'is.null');
 assert.deepEqual(Object.keys(JSON.parse(calls[1][1].body)),['read_at']);
});
test('nick canónico: consulta literal acotada, sin comodines ni ambigüedad',async()=>{
 const calls=[];let candidates=[{nick:'Alpha',active:true,code_hash:'private'}];
 const repo=createRepository({url:'https://example.supabase.co',key:'test-only',fetchImpl:async(url)=>{const u=new URL(url);calls.push(u);return {ok:true,json:async()=>u.searchParams.get('nick').startsWith('eq.')?[]:candidates}}});
 assert.equal((await repo.canonicalAccess('alpha')).nick,'Alpha');
 assert.equal(calls[1].searchParams.get('limit'),'2');
 candidates=[{nick:'Alpha'},{nick:'ALPHA'}];assert.equal(await repo.canonicalAccess('alpha'),null);
 candidates=[{nick:'Other'}];assert.equal(await repo.canonicalAccess('%_*'),null);
 assert.ok(calls.at(-1).searchParams.get('nick').includes('\\\\%'));
});
test('login usa nick canónico y normalización de contraseña heredada sin inicializar cuentas',()=>use(async({login,repository})=>{
 repository.canonicalAccess=async nick=>nick==='alpha'?accounts.Alpha:null;
 const r=await login(' alpha ',' local-test-only ');assert.equal(r.status,200);assert.equal(r.data.nick,'Alpha');
 assert.ok(repository.calls.some(c=>c[0]==='player'&&c[1]==='Alpha'));
}));
test('proxy exige secreto antes de aceptar IP reenviada',()=>use(async({login})=>{
 assert.equal((await login()).status,403);
},{proxySecret:'s'.repeat(40)}));
test('recuperar recibo propio no permite leer operaciones de otra cuenta',()=>use(async({login,request,repository})=>{
 const id='12345678-1234-4234-8234-123456789abc';
 repository.operationReceipt=async nick=>nick==='Alpha'?{action:'raffle-buy',response:{result:{ok:true,operationId:id,kind:'raffle-buy',tickets:1,pc:6500}}}:null;
 const a=await login(),b=await login('Beta','beta-only');
 assert.equal((await request('/shop/receipt?id='+id,{cookie:a.cookie})).data.pc,6500);
 assert.equal((await request('/shop/receipt?id='+id,{cookie:b.cookie})).status,404);
 assert.equal((await request('/shop/receipt?id='+id+'&nick=Alpha',{cookie:b.cookie})).status,400);
 assert.equal((await request('/shop/receipt?id=bad',{cookie:a.cookie})).status,400);
}));
test('Railway sin proxy autenticado no bloquea a todos los usuarios por compartir IP',async()=>{
 const repository=fixture();repository.access=async nick=>({nick,active:true,code_hash:digest('own-test')});repository.player=async nick=>({nick,active:true});repository.createSession=async()=>{};
 await use(async({request})=>{
  for(let i=0;i<25;i++)assert.equal((await request('/auth/login',{method:'POST',origin:'https://site.example',body:{nick:'Local'+i,password:'own-test'}})).status,200);
  for(let i=0;i<8;i++)assert.equal((await request('/auth/login',{method:'POST',origin:'https://site.example',body:{nick:'Limited',password:'wrong'}})).status,401);
  assert.equal((await request('/auth/login',{method:'POST',origin:'https://site.example',body:{nick:'Limited',password:'wrong'}})).status,429);
 },{repository,production:true,sessionStore:'supabase',allowSessionWrites:true,csrfSecret:'s'.repeat(40),publicOrigin:'https://site.example'});
});
