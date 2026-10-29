// Todo PostgreSQL vive en memoria. No conecta con servicios ni credenciales reales.
import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRepository} from '../backend/repository.mjs';
import {createBackend} from '../backend/app.mjs';
import {createGames} from '../backend/games.mjs';
import {createEconomy} from '../backend/economy.mjs';
import {createFrontendServer} from '../dev-server.mjs';
import {digest} from '../backend/security.mjs';
import transport from '../backend/game-transport.cjs';
process.env.SUPABASE_URL='https://local-only.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='NOT-A-REAL-KEY';
const {default:legacy}=await import('../backend/games-original.cjs');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const db=new PGlite();let browser,api,web;const errors=[],failed=[],calls=[],apiErrors=[];
const output=process.env.PW2_QA_DIR??(process.env.TEMP+'/perriweb-game-view-qa'),timings=[];
let tail=Promise.resolve();const pool={async connect(){let release;const previous=tail;tail=new Promise(r=>release=r);await previous;return {query:(...args)=>db.query(...args),release}}};
try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 await db.exec((await readFile('tests/fixtures/game-schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(await readFile('tests/fixtures/game-rpg.sql','utf8'));await db.exec(await readFile('tests/fixtures/game-pet.sql','utf8'));await db.exec(await readFile('sql/001-economia-atomica.sql','utf8'));
 await db.exec("insert into shop_players(nick) values('LocalA'),('LocalB');insert into shop_inventories(nick,pc,polvo_gema,monedas,random_key,duelo) values('LocalA',10000,5000,10,1,5),('LocalB',10000,5000,10,0,5);insert into shop_profiles(nick,selected_logo_id,owned_logo_ids) values('LocalA','logo-buho-1','[\"logo-buho-1\"]');insert into shop_random_key_tickets values(gen_random_uuid(),'LocalA','Activa',now(),now()+interval '1 day',now());insert into shop_random_key_pool(game,key,status) values('Local game','LOCAL-ONLY-NO-REAL-KEY','Disponible');");
 await db.query("insert into shop_access(nick,code_hash,active) values('LocalA',$1,true),('LocalB',$1,true)",[digest('local-e2e')]);
 const fetchImpl=async(url,options)=>{calls.push({path:new URL(url).pathname,method:options.method});const client=await pool.connect();try{
  const u=new URL(url);if(u.pathname.endsWith('/shop_sessions')&&u.searchParams.get('select')?.includes('shop_players!inner'))return Response.json((await client.query("SELECT s.nick,s.expires_at,json_build_object('active',p.active,'shop_access',json_build_object('active',a.active)) shop_players FROM shop_sessions s JOIN shop_players p ON p.nick=s.nick JOIN shop_access a ON a.nick=s.nick WHERE s.token=$1",[u.searchParams.get('token').slice(3)])).rows);
  const name=new URL(url).pathname.split('/rpc/')[1];if(name?.startsWith('pw2_')){const b=options.body?JSON.parse(options.body):{};const args=[b.p_nick,b.p_operation,b.p_action,b.p_price,b.p_max];try{const rows=(await client.query(name==='pw2_economy_status'?'select pw2_economy_status() result':'select pw2_economy_operation($1,$2,$3,$4,$5) result',name==='pw2_economy_status'?[]:args)).rows;return Response.json(rows[0].result)}catch(e){return Response.json({message:e.message},{status:400})}}
  const r=await transport.withClient(client,()=>transport.fetch(url,options));return new Response(await r.text(),{status:r.status,headers:{'Content-Type':'application/json'}});
 }catch(error){return Response.json({code:error.code,message:error.message},{status:400})}finally{client.release()}};
 const repo=createRepository({url:process.env.SUPABASE_URL,key:'local',allowSessionWrites:true,fetchImpl});
 const economy=createEconomy({url:process.env.SUPABASE_URL,key:'local',enabled:true,rafflePrice:3500,raffleMax:3,fetchImpl});
 const games=createGames({pool,legacy,enabled:true,onError:e=>console.log('LOCAL GAME:',e.message)});
 const handler=createBackend({repository:repo,economy,games,publicOrigin:'http://127.0.0.1:4192',sessionStore:'supabase',allowSessionWrites:true});
 api=http.createServer(handler);
 web=createFrontendServer({apiTarget:'http://127.0.0.1:4193',authenticate:handler.authenticate});
 await new Promise(r=>api.listen(4193,'127.0.0.1',r));await new Promise(r=>web.listen(4192,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});await mkdir(output,{recursive:true});
 const results=[];
 async function login(page){
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4192/#games');await page.locator('#traditional-login').waitFor();await page.getByLabel('Usuario',{exact:true}).fill('LocalA');await page.getByLabel('Contraseña',{exact:true}).fill('local-e2e');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.access==='ready');await page.goto('http://127.0.0.1:4192/#games');await page.locator('[data-game="PerriDuelos"]').waitFor();
 }
 async function frameReady(page,name){
  await page.locator('iframe.original-game').waitFor();const frame=await (await page.locator('iframe.original-game').elementHandle()).contentFrame();await frame.waitForLoadState('load');
  await frame.waitForFunction(()=>document.documentElement.style.visibility==='visible');
  const selector={PerriDuelos:'.duel-arena',PerriPet:'.perripet-app-root--pet',PerriCasillas:'.perricasillas-cell',PerriRPG:'.rpg-app'}[name];await frame.locator(selector).first().waitFor();
  assert.equal(await frame.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),'rgb(16, 16, 16)');return frame;
 }
 async function verifyFit(frame,name){
  const fit=await frame.evaluate(name=>{
   const el=document.querySelector({PerriDuelos:'.duel-app',PerriPet:'.perripet-app-root--pet',PerriCasillas:'.perricasillas-board',PerriRPG:'.rpg-app'}[name]),r=el.getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(el).transform);
   return {width:innerWidth,height:innerHeight,rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},sx:m.a,sy:m.d,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight};
  },name);
  assert.ok(fit.rect.x>=-2&&fit.rect.y>=-2&&fit.rect.right<=fit.width+2&&fit.rect.bottom<=fit.height+2,JSON.stringify({name,fit}));
  assert.ok(fit.scrollWidth<=fit.width+1&&fit.scrollHeight<=fit.height+1,JSON.stringify({name,fit}));
  if(name==='PerriDuelos'){assert.ok(Math.abs(fit.sx-fit.sy)<.001);assert.ok(Math.abs(fit.rect.width/fit.rect.height-1920/1015)<.01)}
  if(name==='PerriPet')assert.ok(Math.abs(fit.rect.width/fit.rect.height-760/540)<.02);
  if(name==='PerriCasillas')assert.ok(Math.abs(fit.rect.width-fit.rect.height)<2,JSON.stringify(fit));
  return fit;
 }
 async function closeGame(page,frame=null){if(frame)await frame.locator('#duelExitButton').click();else await page.locator('.game-card .modal-close').click();await page.waitForFunction(()=>document.querySelector('#overlay-layer').hidden&&!document.fullscreenElement&&!document.body.classList.contains('game-immersive'));assert.equal(await page.locator('.game-card').count(),0);assert.equal(await page.locator('#overlay-layer').isVisible(),false);assert.equal(await page.locator('#overlay-layer').evaluate(el=>el.parentElement.id),'app');assert.equal(await page.locator('#app > [inert]').count(),0);await page.locator('[data-game="PerriDuelos"]').waitFor();}
 const desktop=await browser.newContext({viewport:{width:1440,height:1000}}),pc=await desktop.newPage();await login(pc);
 for(const name of ['PerriDuelos','PerriPet','PerriCasillas','PerriRPG']){
  await pc.locator(`[data-game="${name}"]`).click();const frame=await frameReady(pc,name);const before=await pc.locator('.game-card').boundingBox();const button=pc.locator('[data-action="game-fullscreen"]');assert.ok((await button.boundingBox()).width<=34);
  await pc.screenshot({path:output+'/pc-'+name+'.png'});await button.click();await pc.waitForFunction(()=>Boolean(document.fullscreenElement));assert.equal(await button.getAttribute('aria-pressed'),'true');await pc.screenshot({path:output+'/pc-full-'+name+'.png'});
  await button.click();await pc.waitForFunction(()=>!document.fullscreenElement);const restored=await pc.locator('.game-card').boundingBox();assert.ok(Math.abs(restored.width-before.width)<2&&Math.abs(restored.height-before.height)<2);
  await button.click();await pc.waitForFunction(()=>Boolean(document.fullscreenElement));await pc.keyboard.press('Escape');await pc.waitForFunction(()=>!document.fullscreenElement);assert.equal(await pc.locator('.game-card').count(),1);assert.equal(await button.getAttribute('aria-pressed'),'false');await pc.setViewportSize({width:1000,height:700});await pc.waitForTimeout(100);await verifyFit(frame,name);await pc.setViewportSize({width:1440,height:1000});await closeGame(pc);results.push({name,mode:'PC',fullscreenToggle:true,escape:true,restored:true,smallWindow:true});
 }
 await desktop.close();
 for(const mode of ['native','denied','unsupported']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await context.addInitScript(mode=>{
   window.gameViewEvents=[];const native=Element.prototype.requestFullscreen;
   if(mode==='unsupported')Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:undefined});
   else Element.prototype.requestFullscreen=function(...args){window.gameViewEvents.push({event:'fullscreen',active:navigator.userActivation.isActive});return mode==='denied'?Promise.reject(new DOMException('Denied','NotAllowedError')):native.apply(this,args)};
   const fetch=window.fetch;window.fetch=function(input,...args){if(String(input).includes('/games/context'))window.gameViewEvents.push({event:'context'});return fetch.call(this,input,...args)};
  },mode);
  const page=await context.newPage();await login(page);
  for(const name of ['PerriDuelos','PerriPet','PerriCasillas','PerriRPG']){
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.gameViewEvents=[]);await page.locator(`[data-game="${name}"]`).click();const frame=await frameReady(page,name);
   assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('game-immersive')),true);assert.equal(await page.locator('.game-card > .modal-head button:visible').count(),1);assert.equal(await page.locator('.game-rotate-hint').isVisible(),true);
   const events=await page.evaluate(()=>window.gameViewEvents);if(mode!=='unsupported'){assert.equal(events[0].event,'fullscreen');assert.equal(events[0].active,true);assert.ok(events.findIndex(e=>e.event==='context')>0)}
   if(mode!=='native')assert.equal(await page.evaluate(()=>document.fullscreenElement),null);else assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),true);
   const style=await page.locator('.game-card').evaluate(el=>{const s=getComputedStyle(el);return {border:s.borderTopWidth,shadow:s.boxShadow,background:s.backgroundColor,image:s.backgroundImage}});assert.deepEqual(style,{border:'0px',shadow:'none',background:'rgb(16, 16, 16)',image:'none'});
   await page.screenshot({path:output+'/'+mode+'-portrait-'+name+'.png'});
   await page.setViewportSize({width:844,height:390});await page.waitForFunction(()=>!matchMedia('(orientation:portrait)').matches);await frame.waitForFunction(()=>innerWidth>innerHeight);await page.waitForTimeout(150);const fit=await verifyFit(frame,name);assert.equal(await page.locator('.game-rotate-hint').isVisible(),false);await page.screenshot({path:output+'/'+mode+'-landscape-'+name+'.png'});
   if(name==='PerriRPG')assert.equal(await frame.locator('.purchase-button').evaluateAll(buttons=>{const r=document.querySelector('.rpg-detail').getBoundingClientRect();return buttons.every(b=>b.getBoundingClientRect().bottom<=r.bottom+1)}),true);
   await page.setViewportSize({width:667,height:375});await page.waitForTimeout(100);const smallFit=await verifyFit(frame,name);
   await page.setViewportSize({width:390,height:844});await page.locator('.game-rotate-hint').waitFor();await page.setViewportSize({width:844,height:390});
   if(mode==='unsupported'){await page.locator('#overlay-layer').evaluate(el=>{el.style.setProperty('--game-safe-top','10px');el.style.setProperty('--game-safe-right','24px');el.style.setProperty('--game-safe-bottom','10px');el.style.setProperty('--game-safe-left','12px')});await page.waitForTimeout(100);await verifyFit(frame,name);const close=await page.locator('.game-card .modal-close').boundingBox();assert.ok(close.x+close.width<=820.1);await page.locator('#overlay-layer').evaluate(el=>{for(const k of ['top','right','bottom','left'])el.style.removeProperty('--game-safe-'+k)})}
   await page.waitForTimeout(100);await verifyFit(frame,name);await closeGame(page,mode==='native'&&name==='PerriDuelos'?frame:null);results.push({name,mode,mobile:true,events,fit,smallFit,nativeFullscreen:mode==='native',closed:true});
  }
  if(mode==='unsupported'){
   let release;const held=new Promise(resolve=>release=resolve);await page.route('**/api/games/context',async route=>{await held;await route.continue()});await page.setViewportSize({width:390,height:844});await page.locator('[data-game="PerriPet"]').click();await page.locator('.game-opening').waitFor();await closeGame(page);release();await page.waitForTimeout(300);assert.equal(await page.locator('.game-card').count(),0);await page.unroute('**/api/games/context');results.push({mode:'close-before-response',closed:true});
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(output+'/results.json',JSON.stringify({localOnly:true,realMobile:false,results,errors},null,2));console.log(JSON.stringify({output,cases:results.length,errors}));
}finally{await browser?.close();web?.closeAllConnections();api?.closeAllConnections();if(web)await new Promise(r=>web.close(r));if(api)await new Promise(r=>api.close(r));await db.close()}
