import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createBackend} from '../backend/app.mjs';
import {createRepository} from '../backend/repository.mjs';
import {digest} from '../backend/security.mjs';
import {publicOrigin,canonicalSiteRedirect} from '../backend/request-security.mjs';

// Navegador HTTPS -> proxy -> Node HTTP. Únicamente sockets loopback;
// las respuestas REST son fixtures y nunca se envían peticiones a Supabase.
async function lab(worker,{proxySecret,upstreamStatus=200}={}){
 const calls=[],sessions=new Map();
 const repository=createRepository({url:'https://fixture.invalid',key:'LOCAL-NOT-A-KEY',allowSessionWrites:true,fetchImpl:async(url,options)=>{
  const target=new URL(url),table=target.pathname.split('/').pop();calls.push({table,method:options.method});
  if(upstreamStatus!==200)return {ok:false,status:upstreamStatus,json:async()=>({code:'42501',message:'LOCAL FIXTURE ONLY'})};
  if(table==='shop_sessions'&&options.method==='POST'){const row=JSON.parse(options.body);sessions.set(row.token,row);return {ok:true}}
  if(table==='shop_sessions'&&options.method==='DELETE'){sessions.clear();return {ok:true}}
  const rows=table==='shop_access'?[{nick:'OldUser',active:true,code_hash:digest('old-password')}]:table==='shop_players'?[{nick:'OldUser',active:true}]:table==='shop_sessions'?[...sessions.values()]:[];
  return {ok:true,json:async()=>rows};
 }});
 const handler=createBackend({repository,publicOrigin:'https://perrisushi.com',production:true,sessionStore:'supabase',allowSessionWrites:true,csrfSecret:'s'.repeat(40),proxySecret});
 const received=[];
 const backend=http.createServer((req,res)=>{received.push({host:req.headers.host,proto:req.headers['x-forwarded-proto']});return handler(req,res)});
 await new Promise(r=>backend.listen(0,'127.0.0.1',r));
 const proxy=http.createServer((req,res)=>{
  const canonical=canonicalSiteRedirect(req,'https://perrisushi.com');
  if(canonical){res.writeHead(307,{Location:canonical});res.end();return}
  const upstream=http.request({hostname:'127.0.0.1',port:backend.address().port,path:req.url,method:req.method,headers:{...req.headers,host:'railway.internal:8080','x-forwarded-proto':'https'}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res)});
  upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream);
 });
 await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 const request=(path='/api/auth/login',{method='POST',headers={},body={nick:'OldUser',password:'old-password'}}={})=>new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:proxy.address().port,path,method,headers:{host:'perrisushi.com',origin:'https://perrisushi.com','content-type':'application/json','sec-fetch-site':'same-origin',...headers}},response=>{let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,data:text?JSON.parse(text):null}))});
  req.on('error',reject);req.end(method==='POST'?JSON.stringify(body):undefined);
 });
 try{await worker({request,calls,received,sessions})}finally{for(const server of [proxy,backend]){server.closeAllConnections();await new Promise(r=>server.close(r))}}
}

test('Railway: login tradicional válido por proxy HTTP interno devuelve 200, cookie Secure y sesión persistente',()=>lab(async({request,received,calls})=>{
 const result=await request();assert.equal(result.status,200);assert.equal(result.data.authenticated,true);assert.equal(result.data.nick,'OldUser');
 assert.deepEqual(received[0],{host:'railway.internal:8080',proto:'https'});
 assert.match(result.headers['set-cookie'][0],/HttpOnly; SameSite=Strict; Secure/);
 const cookie=result.headers['set-cookie'][0].split(';')[0];
 assert.equal((await request('/api/session',{method:'GET',headers:{cookie}})).data.authenticated,true);
 const csrf=result.headers['x-csrf-token'];
 assert.equal((await request('/api/auth/logout',{headers:{cookie,'x-csrf-token':csrf},body:{}})).status,200);
 assert.ok(calls.some(c=>c.table==='shop_sessions'&&c.method==='POST'));
}));

test('Railway: reproduce www frente al origen configurado y lo redirige antes de presentar login',()=>lab(async({request,calls})=>{
 const refused=await request(undefined,{headers:{origin:'https://www.perrisushi.com'}});
 assert.deepEqual([refused.status,refused.data],[403,{error:'origin_mismatch'}]);assert.equal(calls.length,0);
 const redirected=await request('/',{method:'GET',headers:{host:'www.perrisushi.com'}});
 assert.equal(redirected.status,307);assert.equal(redirected.headers.location,'https://perrisushi.com/');
 assert.equal((await request()).status,200);
}));

test('Railway: Origin ajeno, nulo o ausente y metadatos cross-site siguen rechazados antes de leer cuentas',()=>lab(async({request,calls})=>{
 for(const origin of ['https://evil.example','null',''])assert.equal((await request(undefined,{headers:{origin,'x-forwarded-host':'perrisushi.com'}})).data.error,'origin_mismatch');
 const cross=await request(undefined,{headers:{'sec-fetch-site':'cross-site'}});assert.deepEqual([cross.status,cross.data.error],[403,'cross_site_request']);
 const format=await request(undefined,{headers:{'content-type':'text/plain'}});assert.equal(format.status,415);assert.equal(format.data.error,'unsupported_media_type');
 assert.equal(calls.length,0);
}));

test('Railway: la autenticación del proxy se conserva y su fallo se distingue del de contraseña',()=>lab(async({request,calls})=>{
 const missing=await request();assert.deepEqual([missing.status,missing.data],[403,{error:'proxy_auth_required'}]);assert.equal(calls.length,0);
 const headers={'x-perriweb-proxy-secret':'p'.repeat(40)};
 assert.equal((await request(undefined,{headers})).status,200);
 const wrong=await request(undefined,{headers,body:{nick:'OldUser',password:'wrong'}});assert.deepEqual([wrong.status,wrong.data],[401,{error:'invalid_credentials'}]);
},{proxySecret:'p'.repeat(40)}));

test('Railway: las operaciones autenticadas siguen necesitando el CSRF de esa sesión',()=>lab(async({request})=>{
 const result=await request(),cookie=result.headers['set-cookie'][0].split(';')[0];
 for(const token of ['', 'forged']){
  const response=await request('/api/auth/logout',{headers:{cookie,'x-csrf-token':token},body:{}});
  assert.deepEqual([response.status,response.data],[403,{error:'csrf_invalid'}]);
 }
 assert.equal((await request('/api/auth/logout',{headers:{cookie,'x-csrf-token':result.headers['x-csrf-token']},body:{}})).status,200);
}));

test('un rechazo 403 de Supabase se distingue del 403 de Origin y no crea una sesión',()=>lab(async({request,calls,sessions})=>{
 const response=await request();assert.deepEqual([response.status,response.data],[503,{error:'backend_unavailable'}]);
 assert.equal(calls.length,1);assert.equal(calls[0].table,'shop_access');assert.equal(sessions.size,0);
},{upstreamStatus:403}));

test('PUBLIC_ORIGIN es explícito y los encabezados reenviados no autorizan dominios ni redirecciones',()=>{
 assert.equal(publicOrigin('https://perrisushi.com/'),'https://perrisushi.com');
 for(const value of ['https://user:secret@perrisushi.com','https://perrisushi.com/path','https://perrisushi.com?x=1','ftp://perrisushi.com'])assert.throws(()=>publicOrigin(value));
 const request={method:'GET',url:'/?x=1',headers:{host:'evil.example','x-forwarded-host':'www.perrisushi.com','x-forwarded-proto':'https'}};
 assert.equal(canonicalSiteRedirect(request,'https://perrisushi.com'),null);
 assert.equal(canonicalSiteRedirect({...request,headers:{host:'perrisushi.com'}},'https://www.perrisushi.com'),'https://www.perrisushi.com/?x=1');
 assert.equal(canonicalSiteRedirect({...request,method:'POST',headers:{host:'www.perrisushi.com'}},'https://perrisushi.com'),null);
});
