// Compara la geometría exterior contra el menú de notificaciones aprobado en Git.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFrontendServer} from '../dev-server.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const before=execFileSync('git',['show','445eda4:src/main.js'],{encoding:'utf8'}),current=await readFile('src/main.js','utf8');
const out=process.env.TEMP+'/perriweb-reward-cards';await mkdir(out,{recursive:true});
const server=createFrontendServer({authenticate:async()=>true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
const items=['perri_cofres','perri_cofres_minijuego','cajita_armas','bolsa_especial','bolsa_chatarra','bolsa_gemas','monedas'];const titles=['PerriCofres','PerriCofre de minijuego','Cajita de armas','Bolsa especial','Bolsa de chatarra','Bolsa de gemas','Monedas'];const errors=[],results=[];
try{
 for(const [width,height]of [[1440,900],[1000,550],[390,844],[320,568],[667,375]]){
  for(const count of [1,7,20]){
   let baseline;
   for(const original of [true,false]){
    const context=await browser.newContext({viewport:{width,height},isMobile:width<701,hasTouch:width<701});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const notices=Array.from({length:count},(_,i)=>({id:'12345678-1234-4234-8234-'+String(i).padStart(12,'0'),kind:items[i%7],title:titles[i%7],message:'Has recibido 2 '+['PerriCofres','PerriCofres de minijuego','cajitas de armas','bolsas especiales','bolsas de chatarra','bolsas de gemas','monedas'][i%7]+'.',payload:{category:'reward',itemId:items[i%7],amount:2},created_at:'2026-10-31T14:10:00+00:00',read_at:null}));
    await context.route('**/src/main.js',r=>r.fulfill({contentType:'text/javascript',body:original?before:current}));
    await context.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({json:p==='/api/session'?{authenticated:true,nick:'Perrisushi'}:p==='/api/profile'?{profile:{},balances:{pc:10}}:p==='/api/notifications'?{items:notices,nextCursor:null}:p==='/api/notifications/read'?{ok:true}:{enabled:false}})});
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('body[data-access=ready]');await page.locator('.notification-trigger').click();await page.locator('.notification-entry').first().waitFor();
    if(!original)await page.locator('.notification-cards-ready').waitFor();await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
    const geometry=await page.getByRole('dialog').boundingBox();if(original)baseline=geometry;else{
     for(const k of ['x','y','width','height'])assert.ok(Math.abs(geometry[k]-baseline[k])<.1,JSON.stringify({width,height,count,k,baseline,geometry}));
     assert.equal(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
     assert.ok(await page.locator('.notification-graphic img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
     results.push({width,height,count,baseline,current:geometry});
     if(count===7)await page.screenshot({path:out+`/${width}x${height}-tarjetas.png`});
     await page.locator('.modal-close').click();await page.locator('[data-route=profile]').first().click();await page.locator('[data-action=notification-history]').click();await page.locator('.notification-cards-ready').waitFor();
     assert.equal(await page.locator('.notification-graphic img').count(),count);
     if(count===7)await page.screenshot({path:out+`/${width}x${height}-historial.png`});
    }
    await context.close();
   }
  }
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/geometry.json',JSON.stringify(results,null,2));console.log('15 comparaciones exactas del panel exterior: anchura, altura y posición intactas. Iconos originales, tarjetas e historial sin desbordamientos ni errores JS. '+out);
}finally{await browser.close();await new Promise(r=>server.close(r))}
