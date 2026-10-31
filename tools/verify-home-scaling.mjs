// Comprobación local de geometría; las respuestas de cuenta son fixtures de QA.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFrontendServer} from '../dev-server.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=process.env.TEMP+'/perriweb-board-scaling';
const server=createFrontendServer({authenticate:async()=>true});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const results=[],errors=[];
try {
 await mkdir(output,{recursive:true});
 browser=await chromium.launch({channel:'msedge',headless:true});
 const sizes=[[1920,1080],[1440,900],[1024,768],[1000,550],[800,600],[1000,450],[700,700],[600,500],[390,844],[373,734],[320,568],[667,375]];
 let reference;
 for(const touch of [false,true]) {
  const context=await browser.newContext({viewport:{width:1920,height:1080},isMobile:touch,hasTouch:touch});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   const json=path==='/api/session'?{authenticated:true,nick:'Perrisushi'}:path==='/api/profile'?{profile:{selectedLogoId:'perriweb1'},balances:{pc:100,gemas:20}}:path==='/api/auth/google/config'?{enabled:false}:{};
   return route.fulfill({json});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/#home');
  await page.waitForSelector('body[data-access="ready"] .home-menu');
  for(const [width,height] of sizes.filter(([w])=>!touch||w<=700)) {
   await page.setViewportSize({width,height});
   await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
   const geometry=await page.evaluate(()=>{
    const board=document.querySelector('.home-menu').getBoundingClientRect();
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
    return {board:rect(document.querySelector('.home-menu')),buttons:[...document.querySelectorAll('.art-menu-button')].map(el=>{const r=el.getBoundingClientRect();return {x:(r.x-board.x)/board.width,y:(r.y-board.y)/board.height,w:r.width/board.width,h:r.height/board.height}}),social:[...document.querySelectorAll('.social-preview')].map(rect),overflow:document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1};
   });
   assert.equal(geometry.buttons.length,5);
   assert.ok(Math.abs(geometry.board.w/geometry.board.h-4/3)<.002);
   const b=geometry.board;assert.ok(b.x>=-1&&b.y>=-1&&b.x+b.w<=width+1&&b.y+b.h<=height+1,JSON.stringify({width,height,...geometry}));
   assert.equal(geometry.overflow,false,JSON.stringify({width,height,...geometry}));
   reference??=geometry.buttons;
   geometry.buttons.forEach((button,i)=>{for(const key of ['x','y','w','h'])assert.ok(Math.abs(button[key]-reference[i][key])<.003,JSON.stringify({width,height,touch,i,key,button,reference:reference[i]}))});
   for(const s of geometry.social) assert.ok(s.y>=0&&s.y+s.h<=height+1,JSON.stringify({width,height,s}));
   await page.screenshot({path:output+`/${width}x${height}${touch?'-touch':''}.png`});
   results.push({width,height,touch,...geometry});
  }
  // Los menús flotantes tampoco deben cambiar el tablero.
  const before=await page.locator('.home-menu').boundingBox();
  const socials=await page.locator('.footer-social').boundingBox();
  await page.locator('.nav-toggle').click();
  assert.deepEqual(await page.locator('.home-menu').boundingBox(),before);
  assert.deepEqual(await page.locator('.footer-social').boundingBox(),socials);
  await page.locator('.nav-toggle').click();
  await page.locator('.notification-trigger').click();
  assert.deepEqual(await page.locator('.home-menu').boundingBox(),before);
  assert.deepEqual(await page.locator('.footer-social').boundingBox(),socials);
  await context.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(output+'/geometry.json',JSON.stringify(results,null,2));
 console.log(`${results.length} tamaños/contextos comprobados sin cambios de composición ni desbordamientos. Capturas: ${output}`);
} finally {await browser?.close();await new Promise(r=>server.close(r))}
