import {execFileSync} from 'node:child_process';
// QA local de navegación y compra: respuestas controladas; ninguna operación remota.
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFrontendServer} from '../dev-server.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=process.env.TEMP+'/perriweb-paneles-v2';await mkdir(out,{recursive:true});const server=createFrontendServer({authenticate:async()=>true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[],results=[];

const baseline={};for(const file of ['src/styles.css','src/main.js'])baseline[file]=execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'});
const notes=[{id:'12345678-1234-4234-8234-123456789012',kind:'monedas',title:'Monedas',message:'Has recibido 2 monedas.',payload:{category:'reward',itemId:'monedas',amount:2},created_at:'2026-11-01T10:00:00Z',read_at:null}];
try{
 for(const [screenWidth,screenHeight] of [[1920,1080],[1366,768],[1280,720],[1024,768],[390,844]])for(const zoom of (screenWidth<701?[1]:[0.8,1,1.25])){
  const width=Math.round(screenWidth/zoom),height=Math.round(screenHeight/zoom),id=`${screenWidth}x${screenHeight}-z${zoom}`,snapshots={};
  if(process.env.QA_CASE&&!id.startsWith(process.env.QA_CASE))continue;
  for(const mode of ['before','after']){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:zoom,isMobile:screenWidth<701,hasTouch:screenWidth<701});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   if(mode==='before')for(const [file,body]of Object.entries(baseline))await context.route('**/'+file,r=>r.fulfill({body,contentType:file.endsWith('css')?'text/css':'text/javascript'}));
   await context.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const json=path==='/api/session'?{authenticated:true,nick:'Perrisushi'}:path==='/api/profile'?{profile:{selectedLogoId:'buho-1',selectedTitleId:'me_gusta_el_marisco',achievements:['me_gusta_el_marisco'],karma:'Neutral'},balances:{pc:1100,gemas:4850}}:path==='/api/auth/google/config'?{enabled:true}:path==='/api/auth/google/status'?{linked:true}:path==='/api/notifications'?{items:notes,nextCursor:null}:path==='/api/notifications/read'?{ok:true}:path==='/api/shop/random-key'?{inventoryRandomKey:1,tickets:{items:[],nextCursor:null},claims:{items:[],nextCursor:null},operationsEnabled:false}:{};
    await route.fulfill({json});
   });
   snapshots[mode]={};
   for(const route of ['home','profile','shop','games']){
    await page.goto('http://127.0.0.1:'+server.address().port+'/#'+route);await page.waitForSelector('body[data-access=ready]');await page.waitForTimeout(100);
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
    const social=await page.locator('.social-preview').evaluateAll(els=>els.map(el=>{
     const r=el.getBoundingClientRect(),style=getComputedStyle(el),img=el.querySelector('img');
     const styles=Object.fromEntries(['display','visibility','width','height','margin','padding','filter','transform','gap','opacity'].map(k=>[k,style[k]]));
     return {rect:{x:r.x,y:r.y,w:r.width,h:r.height},styles,html:el.outerHTML,src:img.src};
    }));snapshots[mode][route]=social;
    if(mode==='after')assert.deepEqual(social,snapshots.before[route],id+' '+route+' redes modificadas');
    if(route==='profile')snapshots[mode].profileMetrics=await page.locator('.content-scroll').evaluate(el=>({height:el.clientHeight,content:el.scrollHeight,children:[...el.querySelector('.profile-details').children].map(c=>({tag:c.className||c.tagName,h:c.getBoundingClientRect().height,margin:getComputedStyle(c).margin,pad:getComputedStyle(c).padding}))}));
    await page.screenshot({path:out+`/${id}-${route}-${mode}.png`});
    if(await page.locator('.footer-social').isVisible()){
     const footer=await page.locator('.footer-social').boundingBox();const buffer=await page.screenshot({clip:footer});const path=out+`/${id}-${route}-redes-${mode}.png`;await writeFile(path,buffer);
     // El recorte incluye fondo y sombras del panel; se comparan aparte geometría, estilos y recursos de los botones.
    }
    if(mode==='after'&&route!=='home'){
     const fit=await page.locator('.content-board').evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,right:r.right,h:innerHeight,w:innerWidth,horizontal:el.scrollWidth>el.clientWidth+1}});
     assert.ok(fit.top>=0&&fit.bottom<=height+1&&fit.right<=width+1&&!fit.horizontal,JSON.stringify({id,route,fit}));
     if(route==='profile'){
      if(zoom===1&&height>=720)assert.ok(snapshots.after.profileMetrics.content<=snapshots.after.profileMetrics.height+1,'Scroll innecesario '+id+' '+JSON.stringify(snapshots.after.profileMetrics));
      await page.locator('.content-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);
      assert.ok(await page.getByRole('button',{name:'Cambiar Perrilogos',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect(),c=el.closest('.content-scroll').getBoundingClientRect();return r.top>=c.top-1&&r.bottom<=c.bottom+1}),'Perfil inaccesible '+id);
     }
    }
   }
   await page.locator('.notification-trigger').click();await page.locator('.notification-list').waitFor();await page.screenshot({path:out+`/${id}-notificaciones-${mode}.png`});
   assert.equal(await page.locator('.modal-card').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
   await context.close();
  }
  results.push({screenWidth,screenHeight,zoom,width,height,social:snapshots});console.log(id+': paneles accesibles; redes idénticas en geometría, estilos, enlaces y recursos');
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/report.json',JSON.stringify(results,null,2));console.log('Capturas: '+out);
}finally{await browser.close();await new Promise(r=>server.close(r))}
