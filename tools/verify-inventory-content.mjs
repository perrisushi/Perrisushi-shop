// Solo presentación local: no accede a servicios ni modifica inventarios reales.
import {createFrontendServer} from '../dev-server.mjs';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {itemCatalog} from '../src/services/help-content.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server=createFrontendServer({authenticate:async()=>true}),output=process.env.PW2_QA_DIR??process.env.TEMP+'/perriweb-inventory-content';
let browser;const errors=[],results=[];
const keys=['polvo_gema',...Object.keys(itemCatalog).filter(k=>!['pc','monedas','polvo_gema'].includes(k))];
while(keys.length<57)keys.push('objeto_local_'+keys.length);
let count=0;
const fixture=()=>({inventory:{pc:123,monedas:4,updated_at:'2026-10-30',sin_stock:0,...Object.fromEntries(keys.slice(0,count).map((k,i)=>[k,i+1]))},canOpenContainers:false});
async function inspect(page,n){
 await page.waitForFunction(n=>document.querySelectorAll('[data-live-item]').length===n&&(!n?document.querySelector('.pw04-inventory')?.textContent.includes('No tienes objetos'):true),n);
 await page.waitForTimeout(70);
 assert.equal(await page.locator('.pw04-inventory-slot').count(),n);
 assert.equal(await page.locator('.pw04-inventory-slot:not([data-live-item])').count(),0);
 const data=await page.evaluate(()=>{
  const board=document.querySelector('.content-board'),grid=document.querySelector('.pw04-inventory-grid'),main=document.querySelector('.pw04-inventory-main'),scroll=document.querySelector('.content-scroll');
  const rect=e=>e.getBoundingClientRect().toJSON(),style=e=>getComputedStyle(e),number=(e,k)=>parseFloat(style(e).getPropertyValue(k))||0;
  const last=main.hidden?document.querySelector('.pw04-inventory>[role="status"]'):grid;
  const panel=rect(board),content=rect(last),gap=number(grid,'row-gap'),cells=[...grid.children].map(rect);
  const allowedBottom=number(board,'border-bottom-width')+number(scroll,'padding-bottom')+(main.hidden?number(last,'margin-bottom'):number(main,'padding-bottom'));
  const visibleRows=cells.length?(grid.clientHeight-number(grid,'padding-top')-number(grid,'padding-bottom')+gap)/(cells[0].height+gap):0;
  return {panel,content,allowedBottom,visibleRows,columns:cells.length?style(grid).gridTemplateColumns.split(' ').length:0,cells,scrollHeight:grid.scrollHeight,clientHeight:grid.clientHeight,scrollWidth:grid.scrollWidth,clientWidth:grid.clientWidth,viewport:{width:innerWidth,height:innerHeight},outer:[document.documentElement,document.body,board,scroll,main].filter(e=>e.getClientRects().length).map(e=>({h:e.clientHeight,sh:e.scrollHeight,top:e.scrollTop}))};
 });
 assert.ok(data.panel.bottom<=data.viewport.height+1&&data.panel.y>=0,JSON.stringify(data));
 const frame=await page.locator('.stage-content').evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {left:r.left+parseFloat(s.paddingLeft),right:r.right-parseFloat(s.paddingRight)}});assert.ok(data.panel.x>=frame.left-1&&data.panel.right<=frame.right+1,'Márgenes laterales: '+JSON.stringify({panel:data.panel,frame}));
 if(await page.locator('.social-preview').first().isVisible()){const social=await page.locator('.social-preview').first().boundingBox();assert.ok(data.panel.bottom<=social.y-2,'El panel no puede superponer las redes sociales')}

 assert.ok(data.panel.bottom-data.content.bottom<=data.allowedBottom+2,'Hueco inferior injustificado: '+JSON.stringify(data));
 assert.ok(data.outer.every(e=>e.sh<=e.h+1&&e.top===0),JSON.stringify(data.outer));
 assert.ok(data.cells.every(c=>Math.abs(c.width-c.height)<1),'Casillas cuadradas');
 if(n){
  assert.ok(Math.abs(data.visibleRows-Math.round(data.visibleRows))<.03,'Filas cortadas: '+data.visibleRows);
  const rows=Math.ceil(n/data.columns);assert.ok(data.visibleRows<=rows+.03,'Filas sobrantes');
  assert.ok(data.scrollWidth<=data.clientWidth+1);
  if(n<=6&&rows===1)assert.ok(data.scrollHeight<=data.clientHeight+1,'Pocos objetos sin scroll');
  if(n===1)assert.ok(data.panel.width<=450,'Panel de un objeto desproporcionado');
  const pinned={title:await page.locator('.content-header').boundingBox(),balances:await page.locator('.pw04-inventory-balances').boundingBox()};
  await page.locator('.pw04-inventory-grid').evaluate(e=>e.scrollTop=e.scrollHeight);
  const grid=await page.locator('.pw04-inventory-grid').boundingBox(),last=await page.locator('.pw04-inventory-slot').last().boundingBox();assert.ok(last.y>=grid.y&&last.y+last.height<=grid.y+grid.height-3,'Última casilla completa');
  await page.locator('.content-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);assert.equal(await page.locator('.content-scroll').evaluate(e=>e.scrollTop),0);
  assert.deepEqual(await page.locator('.content-header').boundingBox(),pinned.title);assert.deepEqual(await page.locator('.pw04-inventory-balances').boundingBox(),pinned.balances);
  await page.locator('[data-live-item="polvo_gema"]').click();await page.locator('.item-detail').waitFor();await page.locator('.modal-close').click();assert.deepEqual(await page.locator('.pw04-inventory-balances').boundingBox(),pinned.balances);
  await page.locator('.pw04-inventory-grid').evaluate(e=>e.scrollTop=0);
 }
 return {objects:n,slots:n,panel:data.panel,visibleRows:data.visibleRows,columns:data.columns,scroll:data.scrollHeight>data.clientHeight+1};
}
try{
 await new Promise(r=>server.listen(4198,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true});await mkdir(output,{recursive:true});
 for(const [width,height,mobile] of [[1920,1080,false],[1440,900,false],[800,900,false],[1000,550,false],[1200,400,false],[900,280,false],[320,568,true],[390,844,true],[430,932,true],[667,375,true],[844,390,true]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:mobile,isMobile:mobile}),page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.log('JS:',e.message)});
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;assert.equal(route.request().method(),'GET','Ninguna acción de apertura en esta comprobación');
   if(path==='/api/session')return route.fulfill({json:{authenticated:true,nick:'Local'}});
   if(path==='/api/profile')return route.fulfill({json:{profile:{selectedLogoId:'buho-1',ownedLogoIds:['buho-1']},balances:{pc:123,monedas:4}}});
   assert.equal(path,'/api/inventory');return route.fulfill({json:fixture()});
  });
  for(count of [0,1,6,14,24,57]){
   await page.goto('http://127.0.0.1:4198/?objects='+count+'#inventory');await page.waitForFunction(()=>document.body.dataset.access==='ready');let result;try{result=await inspect(page,count)}catch(e){console.log(JSON.stringify({width,height,count,body:await page.locator('body').innerText(),errors}));await page.screenshot({path:output+'/failure.png'});throw e}
   if(count===1||count===14||count===57)await page.screenshot({path:output+'/'+width+'x'+height+'-'+count+'.png'});
   results.push({width,height,mobile,...result});
  }
  count=14;await page.reload();await inspect(page,count);await page.setViewportSize({width:Math.max(320,height),height:Math.max(280,width)});await inspect(page,count);await page.setViewportSize({width,height});await inspect(page,count);
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(output+'/results.json',JSON.stringify({localOnly:true,visualFixtures:true,physicalMobile:false,results,errors},null,2));console.log(JSON.stringify({output,cases:results.length,errors}));
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
