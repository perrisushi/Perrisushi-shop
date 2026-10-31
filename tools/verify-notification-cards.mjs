// Compara la geometría exterior contra el menú de notificaciones aprobado en Git.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFrontendServer} from '../dev-server.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const before=execFileSync('git',['show','445eda4:src/main.js'],{encoding:'utf8'}),current=await readFile('src/main.js','utf8');
const out=process.env.TEMP+'/perriweb-notification-scroll';await mkdir(out,{recursive:true});
const server=createFrontendServer({authenticate:async()=>true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
const items=['perri_cofres','perri_cofres_minijuego','cajita_armas','bolsa_especial','bolsa_chatarra','bolsa_gemas','monedas'];const titles=['PerriCofres','PerriCofre de minijuego','Cajita de armas','Bolsa especial','Bolsa de chatarra','Bolsa de gemas','Monedas'];const errors=[],results=[];
try{
 for(const [width,height]of [[1440,900],[1000,550],[390,844],[320,568],[667,375]]){
  for(const {count,singleIndex} of [{count:0,singleIndex:0},...items.map((_,singleIndex)=>({count:1,singleIndex})),{count:7,singleIndex:0},{count:20,singleIndex:0}]){
   let baseline;
   for(const original of [true,false]){
    const context=await browser.newContext({viewport:{width,height},isMobile:width<701,hasTouch:width<701});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const notices=Array.from({length:count},(_,i)=>({id:'12345678-1234-4234-8234-'+String(i).padStart(12,'0'),kind:items[(i+singleIndex)%7],title:titles[(i+singleIndex)%7],message:'Has recibido 2 '+['PerriCofres','PerriCofres de minijuego','cajitas de armas','bolsas especiales','bolsas de chatarra','bolsas de gemas','monedas'][(i+singleIndex)%7]+'.',payload:{category:'reward',itemId:items[(i+singleIndex)%7],amount:2},created_at:'2026-10-31T14:10:00+00:00',read_at:null}));
    await context.route('**/src/main.js',r=>r.fulfill({contentType:'text/javascript',body:original?before:current}));
    await context.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({json:p==='/api/session'?{authenticated:true,nick:'Perrisushi'}:p==='/api/profile'?{profile:{},balances:{pc:10}}:p==='/api/notifications'?{items:notices,nextCursor:null}:p==='/api/notifications/read'?{ok:true}:{enabled:false}})});
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('body[data-access=ready]');await page.locator('.notification-trigger').click();await page.locator('.notification-list').waitFor();
    if(!original)await page.locator('.notification-cards-ready').waitFor();await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
    const geometry=await page.getByRole('dialog').boundingBox();if(original)baseline=geometry;else{
     for(const k of ['x','y','width','height'])assert.ok(Math.abs(geometry[k]-baseline[k])<.1,JSON.stringify({width,height,count,k,baseline,geometry}));
     assert.equal(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
     assert.ok(await page.locator('.notification-graphic img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
     const list=page.locator('.notification-list');
     const scroll=await list.evaluate(el=>({scrollable:el.scrollHeight>el.clientHeight+1,height:el.clientHeight,total:el.scrollHeight,overflow:getComputedStyle(el).overflowY,color:getComputedStyle(el).scrollbarColor}));
     assert.equal(scroll.overflow,'auto');assert.notEqual(scroll.color,'auto');
     assert.equal(await page.getByRole('dialog').evaluate(el=>getComputedStyle(el).overflowY),'hidden');
     assert.equal(await page.getByRole('dialog').evaluate(el=>el.scrollHeight>el.clientHeight+1),false);
     if(count<=1)assert.equal(scroll.scrollable,false,JSON.stringify({width,height,singleIndex,scroll}));
     if(count===20){
      assert.equal(scroll.scrollable,true);
      const header=await page.locator('.modal-head').boundingBox(),outer=await page.getByRole('dialog').boundingBox();
      await list.evaluate(el=>el.scrollTop=200);assert.ok(await list.evaluate(el=>el.scrollTop)>0);
      assert.deepEqual(await page.locator('.modal-head').boundingBox(),header);assert.deepEqual(await page.getByRole('dialog').boundingBox(),outer);
      await list.focus();await page.keyboard.press('End');await page.waitForTimeout(150);assert.ok(await list.evaluate(el=>el.scrollTop)>0);await list.evaluate(el=>{el.blur();el.scrollTop=0});
     }
     results.push({width,height,count,singleIndex,baseline,current:geometry,scroll});
     if(count===0)await page.screenshot({path:out+`/${width}x${height}-vacio.png`});
     if(count===1&&singleIndex===6)await page.screenshot({path:out+`/${width}x${height}-una.png`});
     if(count===20){const track=await list.boundingBox();await page.mouse.move(track.x+track.width-2,track.y+track.height*.4);await page.screenshot({path:out+`/${width}x${height}-lista.png`})}
     await page.locator('.modal-close').click();await page.locator('[data-route=profile]').first().click();await page.locator('[data-action=notification-history]').click();await page.locator('.notification-cards-ready').waitFor();
     assert.equal(await page.locator('.notification-graphic img').count(),count);
     const historic=page.locator('.notification-list');
     assert.equal(await historic.evaluate(el=>el.scrollHeight>el.clientHeight+1),count>1);
     if(count===0)await page.screenshot({path:out+`/${width}x${height}-historial-vacio.png`});
     if(count===1&&singleIndex===6)await page.screenshot({path:out+`/${width}x${height}-historial-una.png`});
     if(count===20)await page.screenshot({path:out+`/${width}x${height}-historial.png`});
    }
    await context.close();
   }
  }
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/geometry.json',JSON.stringify(results,null,2));console.log(results.length+' comparaciones del panel: medidas intactas, estados vacíos y siete tipos de aviso único sin scroll y listado interno con cabecera fija. Historial y PC/móvil: OK. '+out);
}finally{await browser.close();await new Promise(r=>server.close(r))}
