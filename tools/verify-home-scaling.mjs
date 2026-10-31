// QA local: compara móvil con ad7b06c y PC con b7a47a6, sin datos reales.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFrontendServer} from '../dev-server.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=process.env.TEMP+'/perriweb-mobile-restored';
const current=await readFile(new URL('../src/desktop-layout-fix.css',import.meta.url),'utf8');
const mobileBefore=execFileSync('git',['show','ad7b06c:src/desktop-layout-fix.css'],{encoding:'utf8'});
const desktopBefore=execFileSync('git',['show','b7a47a6:src/desktop-layout-fix.css'],{encoding:'utf8'});
const server=createFrontendServer({authenticate:async()=>true});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const results=[],errors=[];
try {
 await mkdir(output,{recursive:true});
 browser=await chromium.launch({channel:'msedge',headless:true});
 const sizes=[[1920,1080,false],[1440,900,false],[1024,768,false],[1000,550,false],[800,600,false],[1000,450,false],[701,501,false],[700,700,true],[390,844,true],[373,734,true],[320,568,true],[667,375,true],[844,390,true]];
 let desktopReference;
 for(const [width,height,touch] of sizes) {
  const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  let css=touch?mobileBefore:desktopBefore;
  await context.route('**/src/desktop-layout-fix.css',route=>route.fulfill({contentType:'text/css',body:css}));
  await context.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   const json=path==='/api/session'?{authenticated:true,nick:'Perrisushi'}:path==='/api/profile'?{profile:{selectedLogoId:'perriweb1'},balances:{pc:100,gemas:20}}:path==='/api/auth/google/config'?{enabled:false}:{};
   return route.fulfill({json});
  });
  async function capture(label) {
   await page.goto('http://127.0.0.1:'+server.address().port+'/#home');
   await page.waitForSelector('body[data-access="ready"] .home-menu');
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
   const geometry=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
    const board=document.querySelector('.home-menu');
    return {board:rect(board),buttons:[...document.querySelectorAll('.art-menu-button')].map(rect),social:[...document.querySelectorAll('.social-preview')].map(rect),scene:rect(document.querySelector('.scene')),grid:getComputedStyle(document.querySelector('.home-links')).gridTemplateColumns,background:getComputedStyle(board).backgroundImage,overflow:document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1};
   });
   const shot=await page.screenshot({path:output+`/${width}x${height}-${label}.png`,animations:'disabled'});
   return {geometry,shot};
  }
  const before=await capture('before');css=current;
  const after=await capture('after');
  assert.deepEqual(after.geometry,before.geometry,`Geometría ${touch?'móvil original':'PC aprobado'} ${width}x${height}`);
  assert.ok(after.shot.equals(before.shot),`Captura distinta: ${width}x${height}`);
  const g=after.geometry,b=g.board;
  assert.equal(g.buttons.length,5);assert.equal(g.overflow,false);
  for(const r of [b,...g.buttons,...g.social])assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.w<=width+1&&r.y+r.h<=height+1,JSON.stringify({width,height,r}));
  if(!touch) {
   assert.ok(Math.abs(b.w/b.h-4/3)<.002);
   const normalized=g.buttons.map(r=>({x:(r.x-b.x)/b.w,y:(r.y-b.y)/b.h,w:r.w/b.w,h:r.h/b.h}));
   desktopReference??=normalized;
   normalized.forEach((r,i)=>{for(const k of ['x','y','w','h'])assert.ok(Math.abs(r[k]-desktopReference[i][k])<.003)});
  }
  const fixed=await page.locator('.home-menu').boundingBox(),social=await page.locator('.footer-social').boundingBox();
  await page.locator('.nav-toggle').click();
  assert.deepEqual(await page.locator('.home-menu').boundingBox(),fixed);
  assert.deepEqual(await page.locator('.footer-social').boundingBox(),social);
  await page.locator('.nav-toggle').click();await page.locator('.notification-trigger').click();
  assert.deepEqual(await page.locator('.home-menu').boundingBox(),fixed);
  assert.deepEqual(await page.locator('.footer-social').boundingBox(),social);
  results.push({width,height,touch,identicalScreenshot:true,...g});await context.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(output+'/geometry.json',JSON.stringify(results,null,2));
 console.log(`${results.length} resoluciones: móvil idéntico al historial y PC intacto; sin desbordamientos ni errores JS. Capturas: ${output}`);
} finally {await browser?.close();await new Promise(r=>server.close(r))}
