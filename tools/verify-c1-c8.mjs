// Todo el ensayo usa datos en memoria y localhost. No conecta con servicios reales.
import http from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createBackend} from '../backend/app.mjs';
import {createFrontendServer} from '../dev-server.mjs';
import {digest} from '../backend/security.mjs';
import {itemCatalog} from '../src/services/help-content.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=resolve(process.env.TEMP||process.env.TMP||'.','perriweb-c1-c8-qa');
const nick='Viajero',inventory={nick,pc:1200,monedas:8,...Object.fromEntries(Object.keys(itemCatalog).map((k,i)=>[k,i+1])),boleto_sorteo1:0,boleto_sorteo2:2,mini_sorteo:0};
const users=Array.from({length:55},(_,i)=>({nick:'Usuario'+String(i).padStart(2,'0'),pc:10000-i*10,logo_id:'buho-1',achievements:['Logro']}));let gameLaunches=0;
const repository={configured:true,access:async()=>({nick,active:true,code_hash:digest('local-only')}),player:async()=>({nick,active:true}),profile:async()=>({nick,selected_logo_id:'buho-1',owned_logo_ids:['buho-1','panda-1'],achievements:['Logro'],karma:'Neutral'}),logos:async()=>[{logo_id:'buho-1',name:'Búho'},{logo_id:'panda-1',name:'Panda'},{logo_id:'gato-1',name:'Gato'}],inventory:async()=>inventory,page:async(kind,_owner,{cursor,limit})=>kind==='users'?users.filter(u=>!cursor||u.pc<cursor.pc||(u.pc===cursor.pc&&u.nick>cursor.nick)).slice(0,limit+1):kind==='tickets'?[{id:'1',status:'Activa',expires_at:'2027-01-01'}]:kind==='claims'?[{id:'1',game:'Juego obtenido',key:'SOLO-LOCAL'}]:[]};
const api=http.createServer();let web,browser;const errors=[],failed=[],shots=[];
try{
 await mkdir(out,{recursive:true});
 await new Promise(r=>api.listen(0,'127.0.0.1',r));
 web=createFrontendServer({apiTarget:'http://127.0.0.1:'+api.address().port});await new Promise(r=>web.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+web.address().port;
 api.on('request',createBackend({repository,publicOrigin:base,economy:{status:async()=>({enabled:true,raffleEnabled:true,price:3500,max:3})},games:{availableFor:async()=>{gameLaunches++;return true}}}));
 browser=await chromium.launch({channel:'msedge',headless:true});
 const viewports=[[1649,928],[1280,720],[1024,600],[390,844],[360,640],[320,568]];
 for(const [width,height]of viewports){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<=700,hasTouch:width<=700}),page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()===404)failed.push(r.url())});page.on('request',r=>assert.ok(r.url().startsWith(base+'/'),'Solo localhost'));
  const activate=locator=>width<=700?locator.tap():locator.click();
  const capture=async name=>{
   await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.doesNotMatch(await page.locator('body').innerText(),/ESTADO DE LA CUENTA|Tu perfil personal|Perrilogo de tu cuenta|SALA DE USUARIOS|MI INVENTARIO|Mis objetos|Selecciona un objeto|TIENDA DE PERRISUSHI|Se muestran el estado|Elige tu juego/);
   assert.equal(await page.locator('.content-header .eyebrow').count(),0);
   const path=resolve(out,width+'x'+height+'-'+name+'.png');await page.screenshot({path,fullPage:true});shots.push(path);
  };
  await page.goto(base+'/');await page.getByLabel('Usuario',{exact:true}).fill(nick);await page.getByLabel('Contraseña',{exact:true}).fill('local-only');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.access==='ready');
  await page.goto(base+'/#profile');await page.locator('.profile-details h2').getByText(nick,{exact:true}).waitFor();await capture('C1-perfil');
  await activate(page.locator('[data-action="album"]'));await page.locator('.album-selected .perrilogo-preview').waitFor();await page.locator('[data-live-album="unknown"]').click();assert.equal(await page.locator('[data-owned="false"]').isVisible(),true);await page.locator('[data-live-album="found"]').click();assert.ok(await page.locator('[data-avatar-id="buho-1"]').isEnabled());await capture('C2-album');await page.keyboard.press('Escape');
  await page.goto(base+'/#users');await page.locator('.pw04-user-row').first().waitFor();while(await page.locator('[data-live-next="users"]').count()){const count=await page.locator('.pw04-user-row').count();await page.locator('[data-live-next="users"]').click();await page.waitForFunction(previous=>document.querySelectorAll('.pw04-user-row').length>previous,count)}
  assert.equal(await page.locator('.pw04-user-row').count(),55);const pcs=await page.locator('.pw04-user-points').allTextContents();assert.deepEqual(pcs.map(v=>Number(v.replace('PC','').trim())),users.map(u=>u.pc));await capture('C3-usuarios');
  await page.goto(base+'/#inventory');await page.locator('[data-live-item="pechera_sushi"]').waitFor();assert.equal(await page.locator('#pw04-item-info').count(),0);await capture('C4-inventario');
  for(const button of await page.locator('[data-live-item]').all()){
   const id=await button.getAttribute('data-live-item');await activate(button);await page.locator('.item-detail').waitFor();assert.equal(await page.locator('.item-detail img').count(),1);await page.getByText('Cantidad: '+inventory[id],{exact:true}).waitFor();
   const bounds=await page.locator('.info-card').boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height+1,'Modal dentro de pantalla '+width);
   if(id==='pechera_sushi'){await capture('C5-objeto');await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab')}
   await page.keyboard.press('Escape');assert.equal(await button.evaluate(el=>document.activeElement===el),true);
  }
  await page.goto(base+'/#shop');await page.getByText('Juego obtenido',{exact:false}).waitFor();await capture('C6-random-key');await page.locator('[data-pw04-shop-tab="sorteos"]').focus();await page.keyboard.press('Enter');await page.getByText('Boleto de Sorteo 2: 2',{exact:true}).waitFor();assert.equal(await page.getByText(/Boleto de Sorteo 1:|MiniSorteo:/).count(),0);assert.ok(await page.locator('[data-economy="buy"]').isEnabled());await capture('C7-sorteos');
  await page.goto(base+'/#games');await page.locator('.game-help').first().waitFor();assert.equal(await page.locator('.game-tile').count(),4);assert.equal(await page.getByText('Jugar',{exact:true}).count(),0);await capture('C8-minijuegos');
  for(const button of await page.locator('[data-game-help]').all()){
   const before=gameLaunches;await activate(button);await page.locator('.info-card').waitFor();assert.equal(await page.locator('iframe').count(),0);assert.equal(gameLaunches,before);await capture('C8-ayuda-'+await button.getAttribute('data-game-help'));await page.locator('.modal-close').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('.modal-close').evaluate(el=>document.activeElement===el),true);await activate(page.locator('.modal-close'));assert.equal(await button.evaluate(el=>document.activeElement===el),true);
  }
  // Activar con teclado inicia el juego; el botón informativo anterior no lo hizo.
  await page.route('**/perriduelos-app/index.html',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Comprobación local</title>'}));
  const before=gameLaunches;await page.locator('[data-game="PerriDuelos"] .game-launch').focus();await page.keyboard.press('Enter');await page.locator('iframe.original-game').waitFor();assert.equal(gameLaunches,before+1);await page.keyboard.press('Escape');
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await writeFile(resolve(out,'results.json'),JSON.stringify({viewports:6,scenes:8,shots:shots.length,errors,failed},null,2));console.log(JSON.stringify({viewports:6,scenes:8,shots:shots.length,errors,failed,output:out}));
}finally{await browser?.close();web?.closeAllConnections();api.closeAllConnections();if(web)await new Promise(r=>web.close(r));await new Promise(r=>api.close(r))}
