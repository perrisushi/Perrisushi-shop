// Todo PostgreSQL vive en memoria. No conecta con servicios ni credenciales reales.
import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
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
let tail=Promise.resolve();const pool={async connect(){let release;const previous=tail;tail=new Promise(r=>release=r);await previous;return {query:(...args)=>db.query(...args),release}}};
try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 await db.exec((await readFile('tests/fixtures/game-schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(await readFile('tests/fixtures/game-rpg.sql','utf8'));await db.exec(await readFile('tests/fixtures/game-pet.sql','utf8'));await db.exec(await readFile('sql/001-economia-atomica.sql','utf8'));
 await db.exec("insert into shop_players(nick) values('LocalA'),('LocalB');insert into shop_inventories(nick,pc,polvo_gema,monedas,random_key,duelo) values('LocalA',10000,5000,10,1,5),('LocalB',10000,5000,10,0,5);insert into shop_profiles(nick,selected_logo_id,owned_logo_ids) values('LocalA','logo-buho-1','[\"logo-buho-1\"]');insert into shop_random_key_tickets values(gen_random_uuid(),'LocalA','Activa',now(),now()+interval '1 day',now());insert into shop_random_key_pool(game,key,status) values('Local game','LOCAL-ONLY-NO-REAL-KEY','Disponible');");
 await db.query("insert into shop_access(nick,code_hash,active) values('LocalA',$1,true),('LocalB',$1,true)",[digest('local-e2e')]);
 const fetchImpl=async(url,options)=>{calls.push({path:new URL(url).pathname,method:options.method});const client=await pool.connect();try{
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
 browser=await chromium.launch({channel:'msedge',headless:true});await mkdir('docs/produccion-local/capturas',{recursive:true});
 for(const [width,height]of [[1649,928],[390,844],[360,800]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.status()===404&&r.url().startsWith('http://127.0.0.1'))failed.push(r.url());if(r.status()>=400&&r.url().includes('/api/')&&!r.headers()['x-pw2-test-injected'])apiErrors.push({url:r.url(),status:r.status(),body:await r.text().catch(()=>'(response closed)')})});
  await page.goto('http://127.0.0.1:4192/#profile');await page.locator('#traditional-login').waitFor();await page.getByLabel('Usuario',{exact:true}).fill('LocalA');await page.getByLabel('Contraseña',{exact:true}).fill('local-e2e');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.profile-badge').dataset.authenticated==='true');
  await page.goto('http://127.0.0.1:4192/#games');await page.waitForFunction(()=>document.querySelector('.profile-badge').dataset.authenticated==='true');
  for(const name of ['PerriDuelos','PerriPet','PerriCasillas','PerriRPG']){
   await page.locator(`[data-game="${name}"]`).click();await page.locator('iframe.original-game').waitFor();const frame=await page.locator('iframe.original-game').elementHandle();const content=await frame.contentFrame();await content.waitForLoadState('load');
   if(name==='PerriCasillas'){await content.locator('.perricasillas-cell').first().waitFor();if(width<=390)await content.waitForFunction(()=>document.querySelector('.perricasillas-cell')?.getBoundingClientRect().width>=30)}
   if(name==='PerriCasillas'&&width<=390){const opened=await content.locator('.perricasillas-cell.is-open').count();await content.locator('.perricasillas-cell:not(.is-open):not([disabled])').first().click();await content.waitForFunction(n=>document.querySelectorAll('.perricasillas-cell.is-open').length===n+1,opened);await content.locator('#perriCasillasRewardClose').click()}
   if(name==='PerriRPG')await content.locator('body').waitFor();
   if(name==='PerriRPG'&&width===1649){
    const item=(await db.query("select item_id,price_pg from shop_rpg_catalog where kind='potion' and price_pg>0 order by price_pg,item_id limit 1")).rows[0];
    const ids=[];let attempt=0;
    await page.route('**/api/games/action',async route=>{
     const payload=route.request().postDataJSON();if(payload.action!=='publicShopRpgPurchase'){await route.continue();return}
     ids.push(payload.idempotencyKey);attempt++;
     if(attempt===1){await route.fetch();await route.abort()}
     else if(attempt===2)await route.fulfill({status:429,headers:{'Content-Type':'application/json','X-PW2-Test-Injected':'rate-limit'},body:JSON.stringify({error:'too_many_requests'})});
     else await route.continue();
    });
    const call=()=>content.evaluate(async itemId=>{try{return await (await window.fetch('/shop-api',{method:'POST',body:JSON.stringify({action:'publicShopRpgPurchase',itemId,quantity:1})})).json()}catch{return {lost:true}}},item.item_id);
    assert.equal((await call()).lost,true);assert.equal((await call()).ok,false);assert.equal((await call()).ok,true);
    assert.equal(ids.length,3);assert.ok(ids.every(id=>id===ids[0]));
    assert.equal((await db.query("select quantity from shop_rpg_inventory where nick='LocalA' and item_id=$1",[item.item_id])).rows[0].quantity,1);
    assert.equal((await db.query("select polvo_gema from shop_inventories where nick='LocalA'")).rows[0].polvo_gema,5000-item.price_pg);
    await content.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,data:{type:'perrirpg-refresh'}})));
   }
   await page.waitForTimeout(700);await page.screenshot({path:`docs/produccion-local/capturas/${width}-${name}.png`});await page.locator('#overlay-layer > section > .modal-head .modal-close').click();
  }
  if(width===1649){
   await page.goto('http://127.0.0.1:4192/#shop');await page.locator('[data-economy="redeem"]:not([disabled])').waitFor();await page.locator('[data-economy="redeem"]').click();await page.locator('#overlay-layer').getByText('LOCAL-ONLY-NO-REAL-KEY',{exact:true}).waitFor();await page.locator('.modal-close').click();
   await page.locator('[data-pw04-shop-tab="sorteos"]').click();const ids=[];let drop=true;await page.route('**/api/shop/raffles/buy',async route=>{ids.push(route.request().postDataJSON().idempotencyKey);if(drop){drop=false;await route.fetch();await route.abort()}else await route.continue()});await page.locator('[data-economy="buy"]:not([disabled])').click();await page.locator('[data-economy="buy"]').filter({hasText:'Pulsa para reintentar'}).waitFor();await page.locator('[data-economy="buy"]:not([disabled])').click();await page.getByText('Boletos: 1 · PC: 6500',{exact:true}).waitFor();assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);await page.screenshot({path:'docs/produccion-local/capturas/recibo.png'});await page.locator('.modal-close').click();
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual([...new Set(failed)],[]);assert.deepEqual(apiErrors,[]);
 await writeFile('docs/produccion-local/resultados.json',JSON.stringify({mode:'LOCAL POSTGRESQL ONLY',viewports:3,games:4,errors,failed,apiErrors,calls},null,2));console.log(JSON.stringify({viewports:3,games:4,errors,failed,calls:calls.length}));
}finally{await browser?.close();web?.closeAllConnections();api?.closeAllConnections();if(web)await new Promise(r=>web.close(r));if(api)await new Promise(r=>api.close(r));await db.close()}
