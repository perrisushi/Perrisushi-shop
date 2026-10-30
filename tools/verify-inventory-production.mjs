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
const output=process.env.PW2_QA_DIR??(process.env.TEMP+'/perriweb-inventory-production'),timings=[];
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
 // Elegir un roll válido de las reglas originales para cubrir siempre el premio de Perrilogo adicional.
 let firstRoll=true;
 const testLegacy={...legacy,async handleShopAction(payload){if(payload.action!=='publicShopOpenInventoryChest'||!firstRoll)return legacy.handleShopAction(payload);firstRoll=false;const random=Math.random;Math.random=()=>0;try{return await legacy.handleShopAction(payload)}finally{Math.random=random}}};
 const games=createGames({pool,legacy:testLegacy,enabled:true,onError:e=>console.log('LOCAL GAME:',e.message)});
 const freshBackend=()=>createBackend({repository:repo,economy,games,publicOrigin:'http://127.0.0.1:4192',sessionStore:'supabase',allowSessionWrites:true});
 const handler=freshBackend();
 api=http.createServer(handler);
 web=createFrontendServer({apiTarget:'http://127.0.0.1:4193',authenticate:handler.authenticate});
 await new Promise(r=>api.listen(4193,'127.0.0.1',r));await new Promise(r=>web.listen(4192,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});await mkdir(output,{recursive:true});
 const results=[];
 async function login(context,nick='LocalA'){
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4192/#inventory');await page.getByLabel('Usuario',{exact:true}).fill(nick);await page.getByLabel('Contraseña',{exact:true}).fill('local-e2e');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.access==='ready');await page.goto('http://127.0.0.1:4192/#inventory');await page.locator('[data-live-item="perri_cofres"]').waitFor();return page;
 }
 async function inventoryRow(nick='LocalA'){return (await db.query('select * from shop_inventories where nick=$1',[nick])).rows[0]}
 async function checkLayout(page,mobile){
  const measure=()=>{
   const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();
   return {header:rect('.content-header'),balances:rect('.pw04-inventory-balances'),grid:rect('.pw04-inventory-grid'),outer:[document.documentElement,document.body,document.querySelector('.content-scroll'),document.querySelector('.pw04-inventory'),document.querySelector('.pw04-inventory-main')].map(e=>({height:e.clientHeight,scrollHeight:e.scrollHeight,top:e.scrollTop})),w:innerWidth,h:innerHeight};
  };
  const before=await page.evaluate(measure),grid=page.locator('.pw04-inventory-grid');
  assert.ok(before.grid.y>=before.balances.bottom&&before.grid.bottom<=before.h+1,JSON.stringify(before));
  assert.ok(before.outer.every(e=>e.scrollHeight<=e.height+1&&e.top===0),JSON.stringify(before.outer));
  assert.ok(await grid.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  const rowFit=await grid.evaluate(e=>{const s=getComputedStyle(e),first=e.querySelector('.pw04-inventory-slot').getBoundingClientRect(),gap=parseFloat(s.rowGap)||0,area=e.clientHeight-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom);return (area+gap)/(first.height+gap)});assert.ok(Math.abs(rowFit-Math.round(rowFit))<.025,'Filas completas: '+rowFit);
  const first=await page.locator('.pw04-inventory-slot').first().boundingBox();assert.ok(Math.abs(first.width-first.height)<1);assert.ok(first.height<=before.grid.height-10);
  if(mobile){
   const c=await page.context().newCDPSession(page),x=before.grid.x+before.grid.width/2,y=before.grid.bottom-15,end=before.grid.y+15;
   await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=10;i++){await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(end-y)*i/10}]});await page.waitForTimeout(16)}await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();
  }else{await page.mouse.move(before.grid.x+before.grid.width/2,before.grid.y+before.grid.height/2);await page.mouse.wheel(0,600)}
  await page.waitForTimeout(220);assert.ok(await grid.evaluate(e=>e.scrollTop>0),'La cuadrícula debe responder al desplazamiento');
  const after=await page.evaluate(measure);assert.deepEqual(after.header,before.header);assert.deepEqual(after.balances,before.balances);assert.ok(after.outer.every(e=>e.top===0));
  await grid.evaluate(e=>new Promise(resolve=>{let last=e.scrollTop,stable=0;const check=()=>{const value=e.scrollTop;stable=value===last?stable+1:0;last=value;if(stable>=12)resolve();else requestAnimationFrame(check)};check()}));
  const insideScroll=await grid.evaluate(e=>e.scrollTop);await page.mouse.move(before.balances.x+20,before.balances.y+10);await page.mouse.wheel(0,400);await page.waitForTimeout(150);assert.equal(await grid.evaluate(e=>e.scrollTop),insideScroll);
  await page.locator('.content-scroll').evaluate(e=>e.scrollTop=10000);assert.equal(await page.locator('.content-scroll').evaluate(e=>e.scrollTop),0);
  await grid.evaluate(e=>e.scrollTop=e.scrollHeight);const last=await page.locator('.pw04-inventory-slot').last().boundingBox();assert.ok(last.y>=before.grid.y&&last.y+last.height<=before.grid.bottom-3,'La última casilla debe verse completa');assert.ok(Math.abs(last.width-last.height)<1);
  const imageFit=await page.locator('.pw04-inventory-slot img').evaluateAll(images=>images.every(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return r.width<=p.width&&r.height<=p.height}));assert.ok(imageFit);
  await grid.evaluate(e=>e.scrollTop=0);await page.locator('[data-live-item="polvo_gema"]').click();await page.locator('.item-detail').waitFor();await page.keyboard.press('Escape');assert.deepEqual((await page.evaluate(measure)).balances,before.balances);
  return {grid:before.grid,cell:first,oneScroll:true,squareCells:true,lastRowAccessible:true};
 }
 const integerColumns=(await db.query("select column_name from information_schema.columns where table_name='shop_inventories' and table_schema='public' and data_type='integer'")).rows.map(r=>r.column_name).filter(k=>!['pc','monedas','polvo_gema'].includes(k));
 assert.ok(integerColumns.every(k=>/^[a-z_0-9]+$/.test(k)));
 let firstConfirmedId;
 const sizes=[[1920,1080,false],[1440,900,false],[1024,768,false],[800,900,false],[1100,620,false],[1000,550,false],[1200,400,false],[900,280,false],[320,568,true],[390,844,true],[430,932,true],[667,375,true],[844,390,true]];
 for(const [width,height,mobile] of sizes){
  api.removeAllListeners('request');api.on('request',freshBackend());
  await db.query('update shop_inventories set '+integerColumns.map(k=>'"'+k+'"='+(k==='perri_cofres'?21:1)).join(',')+" where nick='LocalA'");
  await db.query("insert into shop_inventory_chests(chest_id,nick,chest_type,expires_at) values(gen_random_uuid(),'LocalA','perriCofres',now()+interval '1 day'),(gen_random_uuid(),'LocalA','perriCofresMinijuego',now()+interval '1 day')");
  const context=await browser.newContext({viewport:{width,height},hasTouch:mobile,isMobile:mobile}),page=await login(context);let posts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/inventory/open')){posts++;if(!firstConfirmedId&&r.postDataJSON().itemId==='perri_cofres')firstConfirmedId=r.postDataJSON().idempotencyKey}});
  const fit=await checkLayout(page,mobile);await page.screenshot({path:output+'/'+width+'x'+height+'-inventory.png'});
  const before=await inventoryRow();await page.locator('[data-live-item="perri_cofres"]').click();await page.locator('[data-open-container]').waitFor();
  await page.locator('[data-open-container]').evaluate(e=>{e.click();e.click()});await page.locator('.container-rewards li').first().waitFor();assert.equal((await inventoryRow()).perri_cofres,before.perri_cofres-1);assert.equal(posts,1);
  await page.locator('[data-next-container]').click();await page.waitForFunction(()=>document.querySelector('.container-rewards')&&!document.querySelector('[aria-busy="true"]'));assert.equal((await inventoryRow()).perri_cofres,before.perri_cofres-2);assert.equal(posts,2);
  await page.evaluate(()=>Promise.all([...document.querySelectorAll('.modal-card img')].map(i=>i.decode())));
  const modal=await page.locator('.modal-card').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom,right:r.right,h:innerHeight,w:innerWidth,sw:e.scrollWidth,cw:e.clientWidth}});assert.ok(modal.y>=0&&modal.bottom<=modal.h+1&&modal.sw<=modal.cw+1,JSON.stringify(modal));
  await page.screenshot({path:output+'/'+width+'x'+height+'-rewards.png'});await page.locator('.modal-close').click();
  for(const item of ['perri_cofres_minijuego','bolsa_gemas','bolsa_chatarra','bolsa_especial','cajita_armas']){
   const previous=await inventoryRow();await page.locator('[data-live-item="'+item+'"]').click();await page.locator('[data-open-container]').click();await page.locator('.container-rewards li').first().waitFor();assert.equal((await inventoryRow())[item],previous[item]-1);await page.locator('.modal-close').click();
  }
  if(width===320||width===667){
   const beforeReceipt=await inventoryRow(),beforePosts=posts;
   await page.evaluate(id=>sessionStorage.setItem('pw2:container:LocalA:perri_cofres',id),firstConfirmedId);await page.reload();await page.locator('[data-live-item="perri_cofres"]').click();await page.locator('[data-open-container]').click();await page.locator('.container-rewards li').first().waitFor();
   assert.equal(await page.locator('.container-rewards li').count(),3);assert.equal(posts,beforePosts);assert.deepEqual(await inventoryRow(),beforeReceipt);
   const complete=await page.locator('.modal-card').evaluate(e=>{const r=e.getBoundingClientRect(),list=e.querySelector('.container-rewards').getBoundingClientRect(),button=e.querySelector('[data-next-container]').getBoundingClientRect(),hero=e.querySelector('.container-detail>img').getBoundingClientRect(),head=e.querySelector('.modal-head').getBoundingClientRect();return list.bottom<=r.bottom-4&&button.bottom<=r.bottom-4&&hero.top>=head.bottom});assert.ok(complete,'Tres premios y Abrir otro completos');
   await page.screenshot({path:output+'/'+width+'x'+height+'-three-rewards.png'});await page.locator('.modal-close').click();
  }
  // COMMIT correcto; se pierde POST y también la primera consulta: pendiente real recuperable tras recarga.
  await db.query("update shop_inventories set bolsa_gemas=1 where nick='LocalA'");await page.reload();await page.locator('[data-live-item="bolsa_gemas"]').waitFor();let lost=false;
  await page.route('**/api/inventory/open',async route=>{if(lost){await route.continue();return}lost=true;const r=await route.fetch();assert.equal(r.status(),200);await route.abort('failed')});
  await page.route('**/api/inventory/open/status?**',route=>route.abort('failed'));
  await page.locator('[data-live-item="bolsa_gemas"]').click();await page.locator('[data-open-container]').click();await page.locator('[data-open-container]').filter({hasText:'Consultar apertura'}).waitFor();await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
  const afterLoss=await inventoryRow(),postCount=posts;await page.unroute('**/api/inventory/open/status?**');await page.reload();await page.locator('.inventory-recovery button').click();await page.locator('[data-open-container]').click();await page.locator('.container-rewards li').first().waitFor();assert.equal(posts,postCount);assert.deepEqual(await inventoryRow(),afterLoss);await page.locator('.modal-close').click();
  results.push({width,height,mobile,fit,realLocalBackend:true,doubleClickOneConsumption:true,openAnother:true,sixContainers:true,pendingRecoveredByGet:true});await context.close();
 }
 // Rechazo definitivo: no crea un estado pendiente ni cambia Abrir por Consultar.
 api.removeAllListeners('request');api.on('request',freshBackend());await db.query("update shop_inventories set perri_cofres=1 where nick='LocalB'");await db.query("insert into shop_inventory_chests(chest_id,nick,chest_type,expires_at) values(gen_random_uuid(),'LocalB','perriCofres',now()-interval '1 day')");
 const rejectedContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),rejected=await login(rejectedContext,'LocalB');const beforeRejected=await inventoryRow('LocalB');
 await rejected.locator('[data-live-item="perri_cofres"]').click();await rejected.locator('[data-open-container]').click();await rejected.locator('.container-status').filter({hasText:'vigentes'}).waitFor();assert.equal(await rejected.locator('[data-open-container]').textContent(),'Abrir');assert.equal(await rejected.evaluate(()=>sessionStorage.getItem('pw2:container:LocalB:perri_cofres')),null);assert.deepEqual(await inventoryRow('LocalB'),beforeRejected);await rejected.locator('.modal-close').click();
 // Recuperar un identificador dejado por la versión anterior tras un rechazo ya confirmado.
 const oldId='12345678-1234-4234-8234-123456789abc';await rejected.evaluate(id=>sessionStorage.setItem('pw2:container:LocalB:perri_cofres',id),oldId);await rejected.reload();await rejected.locator('[data-live-item="perri_cofres"]').click();await rejected.locator('[data-open-container]').click();await rejected.locator('.container-status').filter({hasText:'intentarlo de nuevo'}).waitFor();assert.equal(await rejected.locator('[data-open-container]').textContent(),'Abrir');assert.deepEqual(await inventoryRow('LocalB'),beforeRejected);await rejectedContext.close();results.push({mode:'rejected-and-old-pending',noConsumption:true,buttonRestored:true});
 // Una petición que nunca llegó al servidor consulta primero y reutiliza el MISMO UUID al reintentar.
 api.removeAllListeners('request');api.on('request',freshBackend());await db.query("update shop_inventories set bolsa_gemas=1 where nick='LocalA'");const retryContext=await browser.newContext({viewport:{width:1024,height:768}}),retry=await login(retryContext);let firstId,secondId,abort=true;
 await retry.route('**/api/inventory/open',async route=>{const body=route.request().postDataJSON();if(abort){firstId=body.idempotencyKey;abort=false;await route.abort('failed')}else{secondId=body.idempotencyKey;await route.continue()}});
 await retry.locator('[data-live-item="bolsa_gemas"]').click();await retry.locator('[data-open-container]').click();await retry.locator('.container-status').filter({hasText:'intentarlo de nuevo'}).waitFor();assert.equal(await retry.locator('[data-open-container]').textContent(),'Abrir');await retry.locator('[data-open-container]').click();await retry.locator('.container-rewards li').first().waitFor();assert.equal(secondId,firstId);assert.equal((await inventoryRow()).bolsa_gemas,0);await retryContext.close();results.push({mode:'not-found-retry',sameUuid:true,consumedOnce:true});
 assert.deepEqual(errors,[]);await writeFile(output+'/results.json',JSON.stringify({localOnly:true,physicalMobile:false,results,errors},null,2));console.log(JSON.stringify({output,cases:results.length,errors}));

}finally{await browser?.close();web?.closeAllConnections();api?.closeAllConnections();if(web)await new Promise(r=>web.close(r));if(api)await new Promise(r=>api.close(r));await db.close()}
