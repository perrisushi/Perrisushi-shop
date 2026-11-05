// Botón real contra HTTP/SQL locales; sin credenciales ni servicios de producción.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {WebSocket} from 'ws';
import {once} from 'node:events';
import {perrilandServer} from '../tools/perriland-test-server.mjs';
const source=await readFile('games/perriland/access-control.js','utf8');
function elements(){return {button:{addEventListener(){},hidden:false,disabled:false,textContent:''},label:{textContent:'',hidden:false}};}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}

test('PERRILAND: abrir/cerrar desde Minijuegos reutiliza permisos, control y auditoría existentes',async t=>{
 const s=await perrilandServer({autoTick:false}),sockets=[];
 const login=async nick=>{const r=await fetch(s.base+'/api/auth/login',{method:'POST',headers:{Origin:s.base,'Content-Type':'application/json'},body:JSON.stringify({nick,password:'perriland-local-test'})});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.headers.get('x-csrf-token')};};
 const request=(auth,path,options={})=>fetch(s.base+path,{...options,headers:{Origin:s.base,Cookie:auth.cookie,...options.headers}});
 const row=async()=>(await s.db.query("SELECT * FROM pw2_community_controls WHERE scope='PerriLand'")).rows[0];
 const auditCount=async()=>(await s.db.query("SELECT count(*)::int AS n FROM shop_operations WHERE action='admin:control'")).rows[0].n;
 const payload=async(active,extra={})=>({action:'control',scope:'PerriLand',active,message:active?'Cerrado en prueba':'',expectedVersion:(await row()).version,operationId:randomUUID(),reason:'Prueba local de acceso',confirmed:true,...extra});
 const post=(auth,body,headers={})=>request(auth,'/api/admin/execute',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':auth.csrf,...headers},body:JSON.stringify(body)});
 function ui(auth,override){const context=vm.createContext({crypto:{randomUUID}});vm.runInContext(source,context);const dom=elements(),errors=[],changes=[];
 const control=new context.PerrilandAccessControl({...dom,fetcher:override??((path,options)=>request(auth,path,options)),getCsrf:()=>auth.csrf,onError:message=>errors.push(message),onChange:change=>changes.push(change)});return {control,errors,changes,...dom};}
 async function connect(auth){const r=await request(auth,'/api/perriland/join',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':auth.csrf},body:'{}'});assert.equal(r.status,200);const body=await r.json(),ws=new WebSocket(s.base.replace('http','ws')+'/perriland/socket','pw2-perriland.'+body.ticket,{headers:{Cookie:auth.cookie,Origin:s.base}});sockets.push(ws);await once(ws,'open');return ws;}
 try{
  const admin=await login('Perrisushi'),user=await login('Alpha'),other=await login('Beta');
  const controller=ui(admin);controller.control.sync(await (await request(admin,'/api/perriland/context')).json());
  await t.test('cerrada: Perrisushi puede entrar y ve Abrir; el usuario normal no tiene botón',async()=>{
   assert.equal(controller.button.hidden,false);assert.equal(controller.button.textContent,'Abrir PERRILAND');assert.equal(controller.label.textContent,'Cerrada al público');
   const ordinary=ui(user);ordinary.control.sync(await (await request(user,'/api/perriland/context')).json());assert.equal(ordinary.button.hidden,true);await ordinary.control.toggle();assert.equal(await auditCount(),0);
   const r=await request(user,'/api/perriland/join',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':user.csrf},body:'{}'});assert.equal(r.status,503);
  });
  await t.test('servidor bloquea usuario normal, otro admin, CSRF incorrecto y origen ajeno',async()=>{
   const body=await payload(false);assert.equal((await post(user,body)).status,403);
   await s.db.exec("UPDATE shop_access SET is_admin=true WHERE nick='Beta'");assert.equal((await post(other,body)).status,403);
   assert.equal((await post(admin,body,{'X-CSRF-Token':'incorrecto'})).status,403);assert.equal((await post(admin,body,{Origin:'https://other.invalid'})).status,403);
   assert.equal((await row()).active,true);assert.equal(await auditCount(),0);
  });
  await t.test('botón abre, actualiza etiqueta y registra actor/antes/después sin tocar saldos',async()=>{
   const balances=(await s.db.query('SELECT * FROM shop_inventories ORDER BY nick')).rows;
   await controller.control.toggle();assert.equal(controller.errors.length,0);assert.equal((await row()).active,false);assert.equal((await row()).message,'');
   assert.equal(controller.button.textContent,'Cerrar PERRILAND');assert.equal(controller.label.textContent,'Abierta al público');assert.equal(await auditCount(),1);
   const audit=(await s.db.query("SELECT nick,response->'audit' AS audit FROM shop_operations WHERE action='admin:control'")).rows[0];assert.equal(audit.nick,'Perrisushi');assert.equal(audit.audit.scope,'PerriLand');assert.equal(audit.audit.before.active,true);assert.equal(audit.audit.after.active,false);
   assert.deepEqual((await s.db.query('SELECT * FROM shop_inventories ORDER BY nick')).rows,balances);
  });
  await t.test('cerrar bloquea entradas y conexiones normales; Perrisushi sigue dentro y puede reabrir',async()=>{
   const a=await connect(user),d=await connect(admin);const closed=once(a,'close');
   await controller.control.toggle();assert.equal((await row()).active,true);assert.equal(controller.button.textContent,'Abrir PERRILAND');
   for(const c of s.perriland.room.connections)c.lastCheck=0;await s.perriland.room.advance();await closed;
   assert.equal(d.readyState,WebSocket.OPEN);const r=await request(user,'/api/perriland/join',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':user.csrf},body:'{}'});assert.equal(r.status,503);
  });
  await t.test('permisos revocados no pueden cambiar la disponibilidad',async()=>{
   const body=await payload(false);await s.db.exec("UPDATE shop_access SET is_admin=false WHERE nick='Perrisushi'");
   assert.equal((await post(admin,body)).status,403);assert.equal((await row()).active,true);await s.db.exec("UPDATE shop_access SET is_admin=true WHERE nick='Perrisushi'");
  });
  await t.test('cambio concurrente devuelve conflicto y conserva el control de la otra operación',async()=>{
   let injected=false;const conflict=ui(admin,async(path,options)=>{if(path==='/api/admin/execute'&&!injected){injected=true;await s.db.exec("UPDATE pw2_community_controls SET version=version+1,message='Otro ajuste' WHERE scope='PerriLand'");}return request(admin,path,options);});
   conflict.control.sync({isAdmin:true,available:false});await conflict.control.toggle();assert.equal(conflict.errors.length,1);assert.match(conflict.errors[0],/estado ha cambiado/);assert.equal((await row()).message,'Otro ajuste');assert.equal((await row()).active,true);
  });
  await t.test('fallo de auditoría revierte el cambio y la interfaz conserva el estado confirmado',async()=>{
   const before=await row();await s.db.exec("CREATE FUNCTION fail_control() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected_failure'; END $$;CREATE TRIGGER fail_control BEFORE INSERT ON shop_operations FOR EACH ROW WHEN(NEW.action='admin:control') EXECUTE FUNCTION fail_control()");
   try{controller.control.sync({isAdmin:true,available:false});await controller.control.toggle();assert.deepEqual(await row(),before);assert.ok(controller.errors.length);assert.equal(controller.button.textContent,'Abrir PERRILAND');}finally{await s.db.exec('DROP TRIGGER fail_control ON shop_operations');}
  });
  await t.test('doble pulsación mantiene un solo POST y una sola auditoría',async()=>{
   const gate=deferred();let posts=0;const double=ui(admin,async(path,options)=>{if(path==='/api/admin/controls')await gate.promise;if(path==='/api/admin/execute')posts++;return request(admin,path,options);});
   double.control.sync({isAdmin:true,available:false});const before=await auditCount(),one=double.control.toggle();try{await double.control.toggle();assert.equal(double.button.disabled,true);}finally{gate.resolve();}
   await one;assert.equal(posts,1);assert.equal(await auditCount(),before+1);assert.equal(double.button.textContent,'Cerrar PERRILAND');
  });
  await t.test('respuesta perdida tras COMMIT consulta el estado real antes de permitir otra acción',async()=>{
   await s.enable(false);let lost=false;const ambiguous=ui(admin,async(path,options)=>{const response=await request(admin,path,options);if(path==='/api/admin/execute'&&!lost){lost=true;assert.equal(response.status,200);throw TypeError('Respuesta perdida simulada');}return response;});
   ambiguous.control.sync({isAdmin:true,available:false});const before=await auditCount();await ambiguous.control.toggle();assert.equal((await row()).active,false);assert.equal(ambiguous.button.textContent,'Cerrar PERRILAND');assert.equal(ambiguous.button.disabled,false);assert.equal(await auditCount(),before+1);
  });
 }finally{for(const socket of sockets)socket.terminate();await s.close();}
});
