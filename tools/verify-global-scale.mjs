// QA local de navegación y compra: respuestas controladas; ninguna operación remota.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFrontendServer} from '../dev-server.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=process.env.TEMP+'/perriweb-escala-global';await mkdir(out,{recursive:true});const server=createFrontendServer({authenticate:async()=>true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[],results=[];
try{
 const reference={};
 for(const [width,height]of [[1440,1080],[720,540],[1920,1080],[1366,768],[1280,720],[1024,768]]){
  let tickets=2,enabled=true;const requests=[];
  const context=await browser.newContext({viewport:{width,height},isMobile:width<701,hasTouch:width<701});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;requests.push({path,method:request.method(),body:request.postDataJSON()});
   let json={};
   if(path==='/api/session')json={authenticated:true,nick:'Perrisushi'};
   else if(path==='/api/profile')json={profile:{selectedLogoId:'buho-1',selectedTitleId:'me_gusta_el_marisco',achievements:['me_gusta_el_marisco','Logo especial del pase diario'],karma:'Neutral'},balances:{pc:9000,gemas:40}};
   else if(path==='/api/auth/google/config')json={enabled:false};
   else if(path==='/api/users')json={items:[{nick:'Perrisushi',pc:100,logoId:'buho-1',achievements:['me_gusta_el_marisco']}],nextCursor:null};
   else if(path==='/api/inventory')json={inventory:{pc:100,monedas:5,polvo_gema:10,perri_cofres:2,bolsa_gemas:1,espada:1,escudo_madera:1,revivir_pet:1},canOpenContainers:false};
   else if(path==='/api/games/context')json={nick:'Perrisushi',available:true,games:{PerriDuelos:true,PerriPet:true,PerriCasillas:true,PerriRPG:true}};
   else if(path==='/api/notifications')json={items:[],nextCursor:null};
   else if(path==='/api/shop/random-key')json={inventoryRandomKey:1,tickets:{items:[],nextCursor:null},claims:{items:[{id:'1',game:'Juego adquirido',key:'CLAVE-PROPIA'}],nextCursor:null},operationsEnabled:false};
   else if(path==='/api/shop/raffles')json={tickets:{boleto_sorteo1:0,boleto_sorteo2:tickets,mini_sorteo:1},policy:enabled?{price:3500,max:3}:null,operationsEnabled:enabled};
   else if(path==='/api/shop/raffles/buy'){const body=request.postDataJSON();assert.equal(body.raffleId,'boletoSorteo2');assert.match(body.idempotencyKey,/^[a-f0-9-]{36}$/);tickets++;json={tickets,pc:5500,operationId:body.idempotencyKey,kind:'raffle-buy'};}
   await route.fulfill({json,headers:{'X-CSRF-Token':'q'.repeat(43)}});
  });

  for(const route of ['home','profile','users','inventory','shop','raffles','games']){
   await page.goto('http://127.0.0.1:'+server.address().port+'/#'+route);await page.waitForSelector('body[data-access=ready]');await page.waitForTimeout(80);
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
   const geometry=await page.evaluate(()=>{
    const root=document.querySelector('#design-viewport').getBoundingClientRect(),scale=Number(document.documentElement.style.getPropertyValue('--interface-scale'));
    const elements=[...document.querySelectorAll('.scene,.home-menu,.art-menu-button,.topbar,.profile-badge,.content-board,.content-header,.profile-portrait,.profile-details h2,.profile-actions,.social-preview,.raffle-tabs,.raffles-tickets,.pw04-inventory-grid,.pw04-inventory-slot')];
    return {scale,root:{x:root.x,y:root.y,w:root.width,h:root.height},items:elements.map(el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);return {selector:el.className,x:(r.x-root.x)/scale,y:(r.y-root.y)/scale,w:r.width/scale,h:r.height/scale,display:c.display,visibility:c.visibility,font:c.fontSize}})};
   });
   if(!reference[route])reference[route]=geometry;
   const base=reference[route];assert.equal(geometry.items.length,base.items.length);
   assert.ok(Math.abs(geometry.scale-Math.min(width/1440,height/1080))<1e-8);
   assert.ok(geometry.root.x>=-1&&geometry.root.y>=-1&&geometry.root.x+geometry.root.w<=width+1&&geometry.root.y+geometry.root.h<=height+1);
   for(let i=0;i<base.items.length;i++){
    for(const key of ['x','y','w','h'])assert.ok(Math.abs(geometry.items[i][key]-base.items[i][key])<0.15,JSON.stringify({width,height,route,key,base:base.items[i],actual:geometry.items[i]}));
    for(const key of ['display','visibility','font'])assert.equal(geometry.items[i][key],base.items[i][key],route+' '+key);
   }
   if(route==='profile')assert.equal(await page.locator('.content-scroll').evaluate(el=>el.scrollHeight>el.clientHeight+1),false,'Perfil desbordado en diseño base');
   await page.screenshot({path:out+`/${width}x${height}-${route}.png`});
  }
  // Solo se verifica el contenedor de juego: el documento de prueba no ejecuta mecánicas.
  await context.route(/\/(perriduelos-app|perripet-app)\/index\.html|\/perricasillas$|\/perrirpg\.html$/,r=>r.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
  for(const name of ['PerriDuelos','PerriPet','PerriCasillas','PerriRPG']){
   await page.locator(`[data-game="${name}"]`).click();await page.locator('.original-game').waitFor();
   const size=await page.locator('.game-card').evaluate(el=>({width:el.offsetWidth,height:el.offsetHeight}));
   if(!reference[name])reference[name]=size;else assert.deepEqual(size,reference[name]);
   await page.locator('.game-card .modal-close').click();
  }
  await page.locator('.notification-trigger').click();await page.locator('.notification-list').waitFor();
  assert.equal(await page.locator('.modal-card').evaluate(el=>el.scrollHeight>el.clientHeight+1),false);
  const notice=await page.locator('.modal-card').evaluate(el=>({height:el.offsetHeight,font:getComputedStyle(el).fontSize}));
  if(!reference.notice)reference.notice=notice;else assert.deepEqual(notice,reference.notice);
  await page.screenshot({path:out+`/${width}x${height}-notificaciones.png`});
  if(width===1440){
   await page.locator('.modal-close').click();await page.goto('http://127.0.0.1:'+server.address().port+'/#profile');await page.locator('.profile-grid').waitFor();await page.waitForTimeout(120);
   const logical=await page.locator('.content-board').evaluate(el=>({w:el.offsetWidth,h:el.offsetHeight}));
   for(const next of [{width:720,height:540},{width:1440,height:1080}]){
    await page.setViewportSize(next);await page.waitForTimeout(80);
    assert.deepEqual(await page.locator('.content-board').evaluate(el=>({w:el.offsetWidth,h:el.offsetHeight})),logical);
    await page.getByRole('button',{name:'Cambiar Perrilogos',exact:true}).click();await page.locator('.album-card').waitFor();await page.locator('.modal-close').click();
   }
  }
  console.log(`${width}x${height}: composición idéntica a la base; escala ${Math.min(width/1440,height/1080).toFixed(3)}`);await context.close();
 }
 assert.deepEqual(errors,[]);console.log('Capturas: '+out);
}finally{await browser.close();await new Promise(r=>server.close(r))}
