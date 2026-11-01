// QA local de navegación y compra: respuestas controladas; ninguna operación remota.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFrontendServer} from '../dev-server.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=process.env.TEMP+'/perriweb-logros';await mkdir(out,{recursive:true});const server=createFrontendServer({authenticate:async()=>true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[],results=[];
try{
 for(const [width,height]of [[1440,900],[1000,550],[800,600],[390,844],[373,734],[320,568],[667,375]]){
  let tickets=2,enabled=true;const requests=[];
  const context=await browser.newContext({viewport:{width,height},isMobile:width<701,hasTouch:width<701});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;requests.push({path,method:request.method(),body:request.postDataJSON()});
   let json={};
   if(path==='/api/session')json={authenticated:true,nick:'Perrisushi'};
   else if(path==='/api/profile')json={profile:{selectedLogoId:'buho-1',selectedTitleId:'me_gusta_el_marisco',achievements:['me_gusta_el_marisco','Logo especial del pase diario'],karma:'Neutral'},balances:{pc:9000,gemas:40}};
   else if(path==='/api/auth/google/config')json={enabled:false};
   else if(path==='/api/notifications')json={items:[],nextCursor:null};
   else if(path==='/api/shop/random-key')json={inventoryRandomKey:1,tickets:{items:[],nextCursor:null},claims:{items:[{id:'1',game:'Juego adquirido',key:'CLAVE-PROPIA'}],nextCursor:null},operationsEnabled:false};
   else if(path==='/api/shop/raffles')json={tickets:{boleto_sorteo1:0,boleto_sorteo2:tickets,mini_sorteo:1},policy:enabled?{price:3500,max:3}:null,operationsEnabled:enabled};
   else if(path==='/api/shop/raffles/buy'){const body=request.postDataJSON();assert.equal(body.raffleId,'boletoSorteo2');assert.match(body.idempotencyKey,/^[a-f0-9-]{36}$/);tickets++;json={tickets,pc:5500,operationId:body.idempotencyKey,kind:'raffle-buy'};}
   await route.fulfill({json,headers:{'X-CSRF-Token':'q'.repeat(43)}});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/#profile');await page.waitForSelector('.profile-title-plaque');
  await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
  assert.equal(await page.locator('.profile-title-plaque').innerText(),'Me gusta el marisco');
  assert.equal(await page.locator('.profile-achievement.is-selected').count(),1);
  assert.equal(await page.locator('.profile-achievement').count(),2);
  assert.doesNotMatch(await page.locator('.profile-grid').innerText(),/me_gusta_el_marisco/);
  for(const selector of ['.profile-title-plaque','.profile-achievement','.profile-details'])assert.equal(await page.locator(selector).evaluateAll(els=>els.some(el=>el.scrollWidth>el.clientWidth+1)),false,selector);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1),false);
  await page.screenshot({path:out+`/${width}x${height}-perfil.png`});
  await page.getByRole('button',{name:'Cambiar Perrilogos',exact:true}).click();await page.locator('.album-card').waitFor();
  await page.locator('.modal-close').click();assert.equal(await page.locator('.profile-title-plaque').isVisible(),true);
  console.log(`${width}x${height}: nombres públicos, placa, logros y Perrilogos: OK`);await context.close();
 }
 assert.deepEqual(errors,[]);console.log('Capturas: '+out);
}finally{await browser.close();await new Promise(r=>server.close(r))}
