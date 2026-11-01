// QA local de navegación y compra: respuestas controladas; ninguna operación remota.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFrontendServer} from '../dev-server.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=process.env.TEMP+'/perriweb-perritienda';await mkdir(out,{recursive:true});const server=createFrontendServer({authenticate:async()=>true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[],results=[];
try{
 for(const [width,height,mobile]of [[1440,1080,false],[1280,720,false],[390,844,true],[373,734,true],[320,568,true],[667,375,true]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),requests=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;requests.push({p,method:r.request().method()});return r.fulfill({json:p==='/api/session'?{authenticated:true,nick:'Perrisushi'}:p==='/api/profile'?{profile:{selectedLogoId:'buho-1'},balances:{pc:1100,gemas:4850}}:p==='/api/notifications'?{items:[],nextCursor:null}:p==='/api/shop/random-key'?{inventoryRandomKey:2,tickets:{items:[],nextCursor:null},claims:{items:[{game:'Juego propio',key:'CLAVE-PROPIA'}],nextCursor:null},operationsEnabled:false}:{enabled:false}})});
  await page.goto('http://127.0.0.1:'+server.address().port+'/#shop');await page.getByText('4850',{exact:true}).waitFor();await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
  assert.equal(await page.locator('.content-board').count(),1);assert.equal(await page.locator('.content-header h1').innerText(),'PerriTienda');
  const social=()=>page.locator('.social-preview').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,html:e.outerHTML,display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility}}));
  const beforeSocial=await social(),frame=await page.locator('.content-board').boundingBox();
  for(const category of ['logos','frames','accessory1','accessory2']){await page.locator(`[data-store-category="${category}"]`).click();assert.equal(await page.locator('[data-store-items]:visible').count(),1);assert.equal(await page.locator(`[data-store-items="${category}"]`).isVisible(),true)}
  await page.locator('[data-store-category=logos]').click();await page.screenshot({path:out+`/${width}x${height}-cosmeticos.png`});
  await page.locator('[data-store-tab=utility]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#store-panel-utility').isVisible(),true);
  assert.deepEqual(await page.locator('.content-board').boundingBox(),frame,'El marco cambia al alternar pestañas');assert.deepEqual(await social(),beforeSocial);
  await page.screenshot({path:out+`/${width}x${height}-utilidad.png`});
  await page.locator('.store-random summary').click();await page.getByText('CLAVE-PROPIA',{exact:true}).waitFor();await page.locator('.store-random summary').click();
  await page.locator('[data-store-tab=utility]').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#store-panel-cosmetics').isVisible(),true);
  for(const selector of ['.store-wallet','.store-tabs','.store-categories','.perri-store'])assert.equal(await page.locator(selector).evaluate(el=>el.scrollWidth>el.clientWidth+1),false,selector+' desbordado');
  assert.equal(await page.locator('[data-economy=buy]').count(),0);assert.ok(requests.every(r=>r.method==='GET'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1),false);
  console.log(`${width}x${height}: dos pestañas, cuatro categorías, saldos, teclado, Random Key y redes: OK`);await context.close();
 }
 assert.deepEqual(errors,[]);console.log('Capturas: '+out);
}finally{await browser.close();await new Promise(r=>server.close(r))}
