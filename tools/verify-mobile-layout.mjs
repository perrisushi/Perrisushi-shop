// QA visual aislada: respuestas locales para probar distribución, sin servicios reales.
import {createFrontendServer} from '../dev-server.mjs';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const output=process.env.PW2_QA_DIR??process.env.TEMP+'/perriweb-mobile-layout';
const server=createFrontendServer({authenticate:async()=>true});
let browser;const errors=[],results=[];
const css=await readFile('src/styles.css','utf8');
const notes=Array.from({length:40},(_,i)=>({id:String(i),title:'Aviso '+i,message:'Contenido largo para comprobar el desplazamiento interior.',created_at:'2026-10-29'}));
const fixtures={session:{authenticated:true,nick:'Local'},profile:{profile:{selectedLogoId:'buho-1',achievements:['Aventurero']},balances:{pc:123,gemas:45}},users:{items:Array.from({length:40},(_,i)=>({nick:'Usuario '+i,pc:1000-i,achievements:['Aventurero']}))},inventory:{inventory:{pc:123,monedas:4,polvo_gema:45,espada:1}},history:{items:notes},notifications:{items:notes},'shop/random-key':{inventoryRandomKey:1,tickets:{items:notes.map(n=>({status:'Activo',expires_at:n.created_at}))},claims:{items:[]}},'shop/raffles':{tickets:{boleto_sorteo1:2},operationsEnabled:false}};
async function setup(page){
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',route=>{const key=new URL(route.request().url()).pathname.slice(5);assert.ok(Object.hasOwn(fixtures,key),'API inesperada: '+key);return route.fulfill({json:fixtures[key]})});
 await page.goto('http://127.0.0.1:4196/#home');await page.waitForFunction(()=>document.body.dataset.access==='ready');await page.locator('.home-menu img').first().waitFor();await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
}
async function geometry(page){return page.evaluate(()=>{
 const selectors=['.scene','.topbar','.profile-badge','.home-menu','.art-menu-button','.scene-footer','.social-preview'];
 return selectors.flatMap(selector=>[...document.querySelectorAll(selector)].map(el=>{const r=el.getBoundingClientRect();return {selector,x:r.x,y:r.y,width:r.width,height:r.height}}));
})}
async function stable(page,before){assert.deepEqual(await geometry(page),before);assert.equal(await page.locator('.social-preview:visible').count(),2);}
async function fixed(page){const r=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,y:scrollY}));assert.ok(r.sw<=r.w+1&&r.sh<=r.h+1&&r.y===0,JSON.stringify(r));}
try{
 await new Promise(r=>server.listen(4196,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true});await mkdir(output,{recursive:true});
 for(const [width,height] of [[320,568],[360,640],[373,734],[390,844],[430,932],[667,375],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1});const page=await context.newPage();await setup(page);const before=await geometry(page);
  for(const box of before.filter(r=>['.social-preview','.home-menu','.art-menu-button'].includes(r.selector)))assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,JSON.stringify(box));
  const social=await page.locator('.social-preview').first().boundingBox(),home=await page.locator('.home-menu').boundingBox();assert.ok(home.y+home.height<=social.y+1);
  await page.screenshot({path:output+`/${width}x${height}-home.png`});
  for(let repeat=0;repeat<2;repeat++){
   await page.locator('.nav-toggle').tap();await stable(page,before);await page.screenshot({path:output+`/${width}x${height}-menu.png`});await page.keyboard.press('Escape');await stable(page,before);
   await page.locator('.notification-trigger').tap();await page.locator('.modal-card .info-strip').first().waitFor();await stable(page,before);
   const card=await page.locator('.modal-card').boundingBox();assert.ok(card.y+card.height<=social.y+1,'La ventana tapa las redes');
   await page.locator('.modal-card').evaluate(el=>el.scrollTop=el.scrollHeight);await fixed(page);await stable(page,before);await page.screenshot({path:output+`/${width}x${height}-notifications.png`});await page.keyboard.press('Escape');await stable(page,before);
  }
  await page.locator('.nav-toggle').tap();await page.locator('[data-action="assistance"]').tap();await stable(page,before);await page.keyboard.press('Escape');
  for(const route of ['profile','users','inventory','shop','games']){
   await page.locator(`[data-route="${route}"]`).first().tap();await page.waitForTimeout(100);await fixed(page);assert.equal(await page.locator('.social-preview:visible').count(),0);
   const board=await page.locator('.content-board').boundingBox();assert.ok(board.y>=0&&board.y+board.height<=height+1);const title=await page.locator('.content-header').boundingBox();
      const sectionBefore=await geometry(page);
   await page.locator('.nav-toggle').tap();assert.deepEqual(await geometry(page),sectionBefore);await page.keyboard.press('Escape');
   await page.locator('.notification-trigger').tap();await page.locator('.modal-card .info-strip').first().waitFor();assert.deepEqual(await geometry(page),sectionBefore);await page.locator('.modal-close').tap();assert.deepEqual(await geometry(page),sectionBefore);
   await page.locator('.content-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);assert.deepEqual(await page.locator('.content-header').boundingBox(),title);await fixed(page);
   await page.screenshot({path:output+`/${width}x${height}-${route}.png`});await page.locator('.back-button').tap();await page.locator('.home-menu').waitFor();await stable(page,before);
  }
  await page.setViewportSize({width:height,height:width});await fixed(page);await page.setViewportSize({width,height});await stable(page,before);await context.close();results.push({width,height,menusStable:true,socialFit:true,sections:5});
 }
 // Comparación de toda la geometría y estilos calculados de PC con el CSS anterior.
 for(const [width,height] of [[1440,1000],[1024,768],[1440,450]]){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();await setup(page);await page.waitForTimeout(300);const desktopState=()=>[...document.querySelectorAll('body *')].map(el=>({rect:el.getBoundingClientRect().toJSON(),styles:[null,'::before','::after'].map(p=>{const s=getComputedStyle(el,p);return Object.fromEntries([...s].map(k=>[k,s.getPropertyValue(k)]))})}));const after=await page.evaluate(desktopState);await page.screenshot({path:output+'/pc-'+width+'-after.png'});
  await page.route('**/src/styles.css?baseline=1',r=>r.fulfill({contentType:'text/css',body:css.split('/* La geometría móvil')[0].replace('.scene:has(.show-home) .footer-social {display:flex}', '.scene:has(.show-home):has(#session-options[hidden]):has(#overlay-layer[hidden]) .footer-social {display:flex}')}));
  await page.evaluate(()=>new Promise(resolve=>{const link=document.querySelector('link[href="./src/styles.css"]');link.onload=resolve;link.href='/src/styles.css?baseline=1'}));await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));await page.waitForTimeout(300);assert.deepEqual(await page.evaluate(desktopState),after,'PC debe conservar geometría y estilos');await page.screenshot({path:output+'/pc-'+width+'-before.png'});results.push({width,height,desktopGeometryAndStylesUnchanged:true});await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(output+'/results.json',JSON.stringify({localFixtures:true,physicalMobileTested:false,results,errors},null,2));console.log(JSON.stringify({output,cases:results.length,errors}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
