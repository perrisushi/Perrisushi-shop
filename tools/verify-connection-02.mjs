// Prueba exclusivamente local; estos datos no se sirven en el arranque normal.
import http from 'node:http';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createBackend} from '../backend/app.mjs';
import {createFrontendServer} from '../dev-server.mjs';
import {digest} from '../backend/security.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const calls=[],metrics=[],errors=[];
const nick='ViajeroDePruebaConNombreLargo';
const repo={configured:true,
 access:async name=>name===nick?{nick,active:true,code_hash:digest('solo-local-02')}:null,
 player:async name=>name===nick?{nick,active:true}:null,
 profile:async()=>({nick,selected_logo_id:'buho-1',owned_logo_ids:['buho-1'],karma:'Neutral',achievements:['Título local'],selected_title_id:null}),
 logos:async()=>[{logo_id:'buho-1',name:'Búho'},{logo_id:'panda-1',name:'Panda'}],
 inventory:async()=>({nick,pc:123456,monedas:7,llaves:2,random_key:1,espada:3,boleto_sorteo1:2,boleto_sorteo2:0,mini_sorteo:0}),
 page:async(kind,_owner,opts)=>{calls.push({kind,limit:opts.limit});if(opts.cursor)return[];return Array.from({length:kind==='users'?21:2},(_,i)=>kind==='users'?{nick:'UsuarioLocalDePrueba'+i,pc:10000+i,logo_id:'panda-1',achievements:['Logro de laboratorio con texto largo']}:
 kind==='claims'?{id:String(i+1),game:'Canje local de prueba',key:'SOLO-TEST-NO-VALIDA',claimed_at:'2026-01-01T00:00:00Z'}:kind==='tickets'?{id:String(i+1),status:'estado_legacy_sin_confirmar',expires_at:'2027-01-01T00:00:00Z'}:kind==='history'?{id:String(i+1),game:'Actividad local',result:'Prueba',details:'Sin recompensa real',created_at:'2026-01-01T00:00:00Z'}:{id:String(i+1),title:'Aviso local',message:'Solo prueba de interfaz',created_at:'2026-01-01T00:00:00Z'});}
};
const backend=http.createServer(createBackend({repository:repo,publicOrigin:'http://127.0.0.1:4178',onMetric:m=>metrics.push(m)}));
const frontend=createFrontendServer({apiTarget:'http://127.0.0.1:4179'});
let browser;
try{
 await new Promise(r=>backend.listen(4179,'127.0.0.1',r));await new Promise(r=>frontend.listen(4178,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});await fs.mkdir('docs/conexion-02/capturas',{recursive:true});
 for(const [width,height]of [[1649,928],[1280,720],[390,844],[360,800]]){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{assert.ok(r.url().startsWith('http://127.0.0.1:4178/'),'Unexpected external request')});
  await page.goto('http://127.0.0.1:4178/#profile');await page.waitForFunction(()=>document.querySelector('.identity-chip strong').textContent==='Sin sesión');
  await page.locator('[data-action="auth"]').first().click();await page.getByLabel('Usuario',{exact:true}).fill(nick);await page.getByLabel('Contraseña',{exact:true}).fill('solo-local-02');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.profile-badge').dataset.authenticated==='true');
  async function capture(name){await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(r))});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('.header-decoration').count(),0);await page.screenshot({path:`docs/conexion-02/capturas/${width}x${height}-${name}.png`,fullPage:true})}
  for(const route of ['home','profile','users','inventory','shop']){
   await page.goto('http://127.0.0.1:4178/#'+route);await page.waitForFunction(()=>document.querySelector('.profile-badge').dataset.authenticated==='true');
   if(route==='profile')await page.waitForFunction(()=>document.querySelector('.profile-details h2').textContent.includes('Viajero'));
   if(route==='users'){await page.locator('.pw04-user-row').first().waitFor();assert.equal(await page.locator('.pw04-user-row').count(),20)}
   if(route==='inventory')await page.locator('[data-live-item="espada"]').waitFor();
   if(route==='shop'){await page.getByText('Canje local de prueba',{exact:false}).first().waitFor();assert.equal(await page.locator('.pw04-shop-cta:not([disabled])').count(),0)}
   await capture(route);
  }
  await page.goto('http://127.0.0.1:4178/#profile');await page.waitForFunction(()=>document.querySelector('.profile-badge').dataset.authenticated==='true');
  for(const action of ['history','album','notifications']){await page.locator(`[data-action="${action}"]`).first().click();if(action==='history')await page.getByText('Actividad local',{exact:true}).first().waitFor();if(action==='notifications')await page.getByText('Aviso local',{exact:true}).first().waitFor();await capture(action);await page.keyboard.press('Escape')}
  await page.locator('.nav-toggle').click();await page.locator('[data-action="logout"]').click();await page.waitForFunction(()=>document.querySelector('.profile-badge').dataset.authenticated==='false');assert.equal(await page.getByText(nick,{exact:true}).count(),0);
  for(const path of ['/backend/server.mjs','/backend/.env','/.env','/.conexion-02/ESQUEMA_Y_POLITICAS_SOLO_METADATOS.csv','/package.json'])assert.equal((await page.request.get('http://127.0.0.1:4178'+path)).status(),404);
  const r=await page.request.get('http://127.0.0.1:4178/src/services/api-client.js');assert.equal(r.status(),200);
  await context.close();
 }
 repo.configured=false;const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:4178/#profile');await page.getByText('Backend no configurado. Falta configurar la conexión del servidor.',{exact:true}).waitFor();await page.screenshot({path:'docs/conexion-02/capturas/backend-no-configurado.png',fullPage:true});
 assert.equal(errors.length,0);await fs.writeFile('docs/conexion-02/browser-results.json',JSON.stringify({mode:'OFFLINE FIXTURE ONLY',viewports:4,errors,metrics,calls},null,2));console.log(JSON.stringify({offline:true,viewports:4,errors,apiRequests:metrics.length}));
}finally{await browser?.close();frontend.closeAllConnections();backend.closeAllConnections();await Promise.all([new Promise(r=>frontend.close(r)),new Promise(r=>backend.close(r))])}
