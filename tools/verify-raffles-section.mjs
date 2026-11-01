// QA local de navegación y compra: respuestas controladas; ninguna operación remota.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFrontendServer} from '../dev-server.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=process.env.TEMP+'/perriweb-sorteos';await mkdir(out,{recursive:true});const server=createFrontendServer({authenticate:async()=>true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[],results=[];
try{
 for(const [width,height]of [[1440,900],[1000,550],[800,600],[390,844],[373,734],[320,568],[667,375]]){
  let tickets=2,enabled=true;const requests=[];
  const context=await browser.newContext({viewport:{width,height},isMobile:width<701,hasTouch:width<701});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;requests.push({path,method:request.method(),body:request.postDataJSON()});
   let json={};
   if(path==='/api/session')json={authenticated:true,nick:'Perrisushi'};
   else if(path==='/api/profile')json={profile:{selectedLogoId:'perriweb1'},balances:{pc:9000,gemas:40}};
   else if(path==='/api/auth/google/config')json={enabled:false};
   else if(path==='/api/notifications')json={items:[],nextCursor:null};
   else if(path==='/api/shop/random-key')json={inventoryRandomKey:1,tickets:{items:[],nextCursor:null},claims:{items:[{id:'1',game:'Juego adquirido',key:'CLAVE-PROPIA'}],nextCursor:null},operationsEnabled:false};
   else if(path==='/api/shop/raffles')json={tickets:{boleto_sorteo1:0,boleto_sorteo2:tickets,mini_sorteo:1},policy:enabled?{price:3500,max:3}:null,operationsEnabled:enabled};
   else if(path==='/api/shop/raffles/buy'){const body=request.postDataJSON();assert.equal(body.raffleId,'boletoSorteo2');assert.match(body.idempotencyKey,/^[a-f0-9-]{36}$/);tickets++;json={tickets,pc:5500,operationId:body.idempotencyKey,kind:'raffle-buy'};}
   await route.fulfill({json,headers:{'X-CSRF-Token':'q'.repeat(43)}});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/#home');await page.waitForSelector('body[data-access=ready]');
  await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
  const boxes=await page.locator('.home-links .art-menu-button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,route:el.dataset.route}}));
  assert.deepEqual(boxes.map(b=>b.route),['profile','users','inventory','games','shop','raffles']);
  const board=await page.locator('.home-menu').boundingBox();
  for(const b of boxes){assert.ok(b.x>=board.x-1&&b.y>=board.y-1&&b.x+b.w<=board.x+board.width+1&&b.y+b.h<=board.y+board.height+1);assert.ok(b.y+b.h<=height+1);assert.ok(Math.abs(b.w-boxes[0].w)<1&&Math.abs(b.h-boxes[0].h)<1,JSON.stringify(boxes));}
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.w<=b.x+1||b.x+b.w<=a.x+1||a.y+a.h<=b.y+1||b.y+b.h<=a.y+1,'Botones superpuestos: '+JSON.stringify({width,height,a,b}));}

  assert.equal(await page.locator('.footer-social').isVisible(),true);
  await page.screenshot({path:out+`/${width}x${height}-menu.png`});
  await page.getByRole('button',{name:'Sorteo',exact:true}).click();await page.getByRole('heading',{name:'Comprar boletos',exact:true}).waitFor();assert.match(page.url(),/#raffles$/);
  assert.equal(await page.locator('[data-economy=buy]').count(),1);assert.equal(await page.locator('[data-economy=redeem]').count(),0);
  await page.screenshot({path:out+`/${width}x${height}-sorteos.png`});
  assert.equal(await page.locator('.footer-social').isVisible(),false);
  const initialBoard=await page.locator('.raffle-board').boundingBox();
  await page.getByRole('tab',{name:'SALA SORTEO',exact:true}).click();
  assert.equal(await page.locator('#raffle-room-panel').isVisible(),true);
  assert.equal(await page.locator('.footer-social').isVisible(),false);
  assert.equal(await page.locator('[data-economy=buy]').isVisible(),false);
  assert.equal((await page.locator('#raffle-room-panel').innerText()).trim(),'');
  assert.deepEqual(await page.locator('.raffle-board').boundingBox(),initialBoard);
  await page.screenshot({path:out+`/${width}x${height}-sala.png`});
  await page.getByRole('tab',{name:'SALA SORTEO',exact:true}).focus();await page.keyboard.press('ArrowLeft');
  assert.equal(await page.getByRole('tab',{name:'COMPRAR',exact:true}).getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[data-economy=buy]').isVisible(),true);

  await page.locator('[data-economy=buy]').click();await page.getByRole('heading',{name:'Operación completada',exact:true}).waitFor();await page.locator('.modal-close').click();assert.match(page.url(),/#raffles$/);
  assert.equal(requests.filter(r=>r.path==='/api/shop/raffles/buy').length,1);assert.match(await page.locator('.raffles-tickets').innerText(),/3/);
  await page.getByRole('button',{name:'Volver al inicio'}).click();await page.getByRole('button',{name:'Tienda',exact:true}).click();await page.getByText('CLAVE-PROPIA',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-economy=buy]').count(),0);assert.equal(await page.getByRole('heading',{name:'Tus participaciones'}).count(),0);await page.screenshot({path:out+`/${width}x${height}-tienda.png`});
  enabled=false;await page.goto('http://127.0.0.1:'+server.address().port+'/#raffles');await page.reload();await page.getByText('No hay venta de boletos disponible.',{exact:true}).waitFor();assert.equal(await page.locator('[data-economy=buy]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1),false);
  results.push({width,height,buttons:boxes,board});console.log(`${width}x${height}: seis botones, navegación, compra protegida y tienda separada: OK`);await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/geometry.json',JSON.stringify(results,null,2));console.log('Capturas: '+out);
}finally{await browser.close();await new Promise(r=>server.close(r))}
