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
 const games=createGames({pool,legacy,enabled:true,onError:e=>console.log('LOCAL GAME:',e.message)});
 const freshBackend=()=>createBackend({repository:repo,economy,games,publicOrigin:'http://127.0.0.1:4192',sessionStore:'supabase',allowSessionWrites:true});
 const handler=freshBackend();
 api=http.createServer(handler);
 web=createFrontendServer({apiTarget:'http://127.0.0.1:4193',authenticate:handler.authenticate});
 await new Promise(r=>api.listen(4193,'127.0.0.1',r));await new Promise(r=>web.listen(4192,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});await mkdir(output,{recursive:true});
 const results=[];
 // Regresión real: cuenta antigua con cantidades y sin filas en la tabla auxiliar.
 await db.query("update shop_inventories set perri_cofres=7,perri_cofres_minijuego=3,bolsa_gemas=2,bolsa_chatarra=2,bolsa_especial=2,cajita_armas=2 where nick='LocalB'");
 const legacyContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),legacyPage=await legacyContext.newPage();legacyPage.on('pageerror',e=>errors.push(e.message));
 await legacyPage.goto('http://127.0.0.1:4192/#inventory');await legacyPage.getByLabel('Usuario',{exact:true}).fill('LocalB');await legacyPage.getByLabel('Contraseña',{exact:true}).fill('local-e2e');await legacyPage.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await legacyPage.waitForFunction(()=>document.body.dataset.access==='ready');await legacyPage.goto('http://127.0.0.1:4192/#inventory');
 for(const id of ['perri_cofres','perri_cofres_minijuego','bolsa_gemas','bolsa_chatarra','bolsa_especial','cajita_armas'])await legacyPage.locator('[data-live-item="'+id+'"]').waitFor();
 await legacyPage.evaluate(()=>Promise.all([...document.querySelectorAll('.pw04-inventory-grid img')].map(i=>i.decode())));
 await legacyPage.screenshot({path:output+'/legacy-inventory.png'});
 for(const id of ['bolsa_gemas','perri_cofres']){
  await legacyPage.locator('[data-live-item="'+id+'"]').click();await legacyPage.locator('[data-open-container]').click();await legacyPage.locator('.container-rewards li').first().waitFor();await legacyPage.locator('.modal-close').click();
  const row=(await db.query("select perri_cofres,perri_cofres_minijuego from shop_inventories where nick='LocalB'")).rows[0];assert.deepEqual(row,{perri_cofres:id==='bolsa_gemas'?7:6,perri_cofres_minijuego:3});
 }
 results.push({mode:'legacy-counters',mobile:true,sixContainersVisible:true,bagPreservedChests:true,chestConsumedOnce:true});
 // Una lectura de disponibilidad negativa no debe eliminar la acción real de apertura.
 const bagBeforeFalse=(await db.query("select bolsa_chatarra from shop_inventories where nick='LocalB'")).rows[0].bolsa_chatarra;
 await legacyPage.route('**/api/inventory',async route=>{const response=await route.fetch(),data=await response.json();await route.fulfill({response,json:{...data,canOpenContainers:false,containerOpeningReason:'unavailable'}})});
 await legacyPage.reload();await legacyPage.locator('[data-live-item="bolsa_chatarra"]').waitFor();await legacyPage.locator('[data-live-item="bolsa_chatarra"]').click();await legacyPage.locator('[data-open-container]').waitFor();
 await legacyPage.screenshot({path:output+'/opening-button-unavailable-flag.png'});
 await legacyPage.locator('[data-open-container]').click();await legacyPage.locator('.container-rewards li').first().waitFor();await legacyPage.locator('.modal-close').click();
 assert.equal((await db.query("select bolsa_chatarra from shop_inventories where nick='LocalB'")).rows[0].bolsa_chatarra,bagBeforeFalse-1);
 results.push({mode:'unavailable-flag',buttonVisible:true,realOpening:true});
 await legacyPage.unroute('**/api/inventory');
 await db.query("insert into shop_inventory_chests(chest_id,nick,chest_type,expires_at) values(gen_random_uuid(),'LocalB','perriCofres',now()-interval '1 day')");
 await legacyPage.reload();await legacyPage.locator('[data-live-item="perri_cofres"]').waitFor();
 const deniedState=await legacyPage.evaluate(()=>fetch('/api/inventory').then(r=>r.json()));assert.equal(deniedState.canOpenContainers,false);assert.equal(deniedState.containerOpeningReason,'inventory_mismatch');
 const beforeDenied=(await db.query("select * from shop_inventories where nick='LocalB'")).rows;
 await legacyPage.locator('[data-live-item="perri_cofres"]').click();await legacyPage.locator('[data-open-container]').waitFor();
 const deniedResponse=legacyPage.waitForResponse(r=>r.url().endsWith('/api/inventory/open'));await legacyPage.locator('[data-open-container]').click();assert.equal((await deniedResponse).status(),409);await legacyPage.locator('.container-status').filter({hasText:'Tus objetos se han conservado'}).waitFor();
 assert.equal(await legacyPage.locator('.container-rewards').count(),0);assert.deepEqual((await db.query("select * from shop_inventories where nick='LocalB'")).rows,beforeDenied);
 await legacyPage.screenshot({path:output+'/opening-rejected-with-message.png'});results.push({mode:'blocked-opening',buttonVisible:true,serverRejected:true,inventoryUnchanged:true,errorVisible:true});await legacyContext.close();
 const items=['perri_cofres','perri_cofres_minijuego','bolsa_gemas','bolsa_chatarra','bolsa_especial','cajita_armas'];
 for(const [width,height,mobile] of [[1440,1000,false],[1024,768,false],[320,568,true],[390,844,true],[430,932,true],[844,390,true]]){
  // Cada escenario tiene su instancia aislada: conserva las cuotas reales sin acumular toda la batería en una sola cuenta/minuto.
  api.removeAllListeners('request');api.on('request',freshBackend());
  await db.query("update shop_inventories set bolsa_gemas=1,bolsa_chatarra=1,bolsa_especial=1,cajita_armas=1 where nick='LocalA'");
  await db.query("insert into shop_inventory_chests(chest_id,nick,chest_type,expires_at) values(gen_random_uuid(),'LocalA','perriCofres',now()+interval '1 day'),(gen_random_uuid(),'LocalA','perriCofresMinijuego',now()+interval '1 day')");
  await db.query("update shop_inventories set perri_cofres=1,perri_cofres_minijuego=1 where nick='LocalA'");
  const context=await browser.newContext({viewport:{width,height},hasTouch:mobile,isMobile:mobile}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4192/#inventory');await page.getByLabel('Usuario',{exact:true}).fill('LocalA');await page.getByLabel('Contraseña',{exact:true}).fill('local-e2e');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.access==='ready');await page.goto('http://127.0.0.1:4192/#inventory');await page.locator('[data-live-item="perri_cofres"]').waitFor();
  await page.screenshot({path:output+'/'+width+'x'+height+'-inventory.png'});
  for(const item of items){
   const button=page.locator('[data-live-item="'+item+'"]');await button.click();await page.locator('[data-open-container]').waitFor();await page.screenshot({path:output+'/'+width+'x'+height+'-'+item+'-confirm.png'});
   const response=page.waitForResponse(r=>r.url().endsWith('/api/inventory/open')&&r.request().method()==='POST');await page.locator('[data-open-container]').click();const result=await response;assert.equal(result.status(),200,await result.text());const data=await result.json();assert.ok(data.rewards.length>0);
   await page.locator('.container-rewards li').first().waitFor();assert.equal(await page.locator('.container-rewards li').count(),data.rewards.length);assert.equal(await page.locator('[data-open-container]').count(),0);
   await page.evaluate(()=>Promise.all([...document.querySelectorAll('.modal-card img')].map(i=>i.decode())));
   const fit=await page.locator('.modal-card').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,rect:el.getBoundingClientRect().toJSON(),h:innerHeight}));assert.ok(fit.scrollWidth<=fit.width+1&&fit.rect.y>=0&&fit.rect.bottom<=fit.h+1,JSON.stringify(fit));
   if(mobile){const visible=await page.locator('.container-rewards').evaluate(el=>{const c=el.closest('.modal-card').getBoundingClientRect(),r=el.getBoundingClientRect(),hero=el.parentElement.querySelector('img').getBoundingClientRect(),head=el.closest('.modal-card').querySelector('.modal-head').getBoundingClientRect();return {bottom:r.bottom,limit:c.bottom-4,heroTop:hero.top,headerBottom:head.bottom}});assert.ok(visible.bottom<=visible.limit+1&&visible.heroTop>=visible.headerBottom-1,JSON.stringify(visible))}
   await page.screenshot({path:output+'/'+width+'x'+height+'-'+item+'-rewards.png'});await page.locator('.modal-close').click();
   const inventory=await page.evaluate(()=>fetch('/api/inventory').then(r=>r.json()));assert.ok(inventory.inventory[item]>=0);
  }
  // Perder la respuesta después del COMMIT, recargar y recuperar el mismo recibo.
  await db.query("update shop_inventories set bolsa_gemas=1 where nick='LocalA'");await page.reload();await page.locator('[data-live-item="bolsa_gemas"]').waitFor();
  let lost=false;await page.route('**/api/inventory/open',async route=>{if(lost){await route.continue();return}lost=true;const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed')});
  await page.locator('[data-live-item="bolsa_gemas"]').click();await page.locator('[data-open-container]').click();await page.locator('.container-status').filter({hasText:'No se pudo'}).waitFor();
  const afterLoss=(await db.query("select polvo_gema from shop_inventories where nick='LocalA'")).rows[0].polvo_gema;
  await page.reload();await page.locator('.inventory-recovery button').waitFor();await page.locator('.inventory-recovery button').click();await page.locator('[data-open-container]').click();await page.locator('.container-rewards li').waitFor();
  assert.equal((await db.query("select polvo_gema from shop_inventories where nick='LocalA'")).rows[0].polvo_gema,afterLoss);
  await page.locator('.modal-close').click();assert.equal(await page.locator('.inventory-recovery button').count(),0);
  results.push({width,height,mobile,containers:6,realLocalBackend:true,lostResponseRecovered:true});await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(output+'/results.json',JSON.stringify({localOnly:true,physicalMobile:false,results,errors},null,2));console.log(JSON.stringify({output,cases:results.length,errors}));
}finally{await browser?.close();web?.closeAllConnections();api?.closeAllConnections();if(web)await new Promise(r=>web.close(r));if(api)await new Promise(r=>api.close(r));await db.close()}
