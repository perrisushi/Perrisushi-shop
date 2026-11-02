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
const output=process.env.PW2_QA_DIR??(process.env.TEMP+'/perriweb-perripet-fit-qa');
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
 async function closeGame(page,frame=null){if(frame)await frame.locator('#duelExitButton').click();else await page.locator('.game-card .modal-close').click();await page.waitForFunction(()=>document.querySelector('#overlay-layer').hidden&&!document.fullscreenElement&&!document.body.classList.contains('game-immersive'));assert.equal(await page.locator('.game-card').count(),0);assert.equal(await page.locator('#overlay-layer').isVisible(),false);assert.equal(await page.locator('#overlay-layer').evaluate(el=>el.parentElement.id),'app');assert.equal(await page.locator('#app > [inert]').count(),0);await page.locator('[data-game="PerriDuelos"]').waitFor();}
 const currentCSS=await readFile('src/game-presentation.css','utf8');
 const oldCSS=currentCSS.replace(/\/\* El iframe[\s\S]*?overflow:visible\s*\}/,'html[data-pw2-game] .perripet-app-root--wide {width:min(1152px,100vw)!important;max-width:none!important;max-height:100dvh;overflow:auto}');
 const scenarios=[{id:'pc-1920',width:1920,height:1080},{id:'pc-1366',width:1366,height:768},{id:'pc-1280',width:1280,height:720},{id:'pc-80-equivalent',width:1600,height:900},{id:'pc-125-equivalent',width:1024,height:576},{id:'mobile-landscape',width:844,height:390,mobile:true},{id:'mobile-small',width:667,height:375,mobile:true},{id:'mobile-portrait',width:390,height:844,mobile:true}];
 let sessionState;
 async function openPet(page){await page.locator('[data-game="PerriPet"]').click();return await frameReady(page,'PerriPet')}
 async function seed(patch){await db.query("update shop_perripet_states set pet_state=pet_state||$1::jsonb",[JSON.stringify({...patch,updatedAt:Date.now()})])}
 // Inicializar la mascota mediante el backend auténtico; todos los datos viven solo en PGlite.
 {const c=await browser.newContext(),p=await c.newPage();await login(p);await openPet(p);await p.waitForTimeout(200);await closeGame(p);await seed({stage:'adult1',hp:207,level:10,damage:0,hasActiveCreature:true});await db.exec("update shop_inventories set agua_divina=10,gema_experiencia=10,incubadora_mejorada=1,revivir_pet=2;insert into shop_perripet_inventory(nick,item_id,quantity) select 'LocalA',item_id,10 from shop_perripet_item_catalog on conflict(nick,item_id) do update set quantity=10");sessionState=await c.storageState();await c.close()}
 async function metrics(frame){return await frame.evaluate(()=>{
  const main=document.querySelector('main'),scene=main.querySelector('section > div'),box=e=>({cw:e.clientWidth,ch:e.clientHeight,sw:e.scrollWidth,sh:e.scrollHeight,rect:e.getBoundingClientRect().toJSON()});
  const lists=Array.from(main.querySelectorAll('*')).filter(e=>/auto|scroll/.test(getComputedStyle(e).overflowY)&&e.clientHeight>0).map(e=>({...box(e),cls:e.className,children:e.children.length}));
  const controls=Array.from(main.querySelectorAll('button')).filter(e=>e.getClientRects().length).map(e=>({...box(e),name:e.getAttribute('aria-label')||e.textContent,disabled:e.disabled,insideList:(()=>{for(let p=e.parentElement;p&&p!==main;p=p.parentElement)if(/auto|scroll/.test(getComputedStyle(p).overflowY)&&p.scrollHeight>p.clientHeight)return true;return false})()}));
  return {viewport:{width:innerWidth,height:innerHeight},html:box(document.documentElement),body:box(document.body),root:box(document.querySelector('#root')),main:box(main),scene:scene?box(scene):null,lists,controls};
 })}
 async function check(frame,label,before=false){await frame.page().waitForTimeout(70);const m=await metrics(frame);results.push({label,before,...m});if(before)return m;
  for(const key of ['html','body','root','main']){const e=m[key];assert.ok(e.sw<=e.cw+1&&e.sh<=e.ch+1,`${label} ${key}: ${JSON.stringify(e)}`)}
  const r=m.main.rect;assert.ok(r.x>=-1&&r.y>=-1&&r.right<=m.viewport.width+1&&r.bottom<=m.viewport.height+1,label+' bounds');
  for(const b of m.controls.filter(b=>!b.insideList)){assert.ok(b.rect.left>=r.left-2&&b.rect.right<=r.right+2&&b.rect.top>=r.top-2&&b.rect.bottom<=r.bottom+2,`${label}: control fuera ${b.name}: ${JSON.stringify(b.rect)} main ${JSON.stringify(r)}`)}
  return m;
 }
 for(const before of [true,false])for(const config of before?[scenarios[2]]:scenarios){
  const ctx=await browser.newContext({viewport:{width:config.width,height:config.height},isMobile:!!config.mobile,hasTouch:!!config.mobile,storageState:sessionState});
  await ctx.route('**/src/game-presentation.css',route=>route.fulfill({contentType:'text/css',body:before?oldCSS:currentCSS}));
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4192/#games');await page.locator('[data-game="PerriPet"]').waitFor();let frame=await openPet(page);
  const outer=await page.locator('.game-card').boundingBox();
  for(const full of config.mobile?[false]:[false,true]){
   if(full){await page.locator('[data-action="game-fullscreen"]').click();await page.waitForFunction(()=>!!document.fullscreenElement)}
   await check(frame,config.id+'-'+full+'-home',before);
   for(const view of ['Tienda','Granja','Combate']){
    await frame.getByRole('button',{name:view,exact:true}).click();await check(frame,config.id+'-'+full+'-'+view,before);
    if(config.id==='pc-1280'&&!full)await page.screenshot({path:output+'/'+(before?'before':'after')+'-'+view+'.png'});
    if(!before&&config.mobile&&config.id==='mobile-landscape')await page.screenshot({path:output+'/mobile-'+view+'.png'});
    if(view==='Combate'){
     assert.equal(await frame.getByRole('button',{name:/Seleccionar encuentro/}).count(),5);
     if(!before){await frame.getByRole('button',{name:'Seleccionar encuentro 5',exact:true}).click();assert.equal(await frame.getByRole('button',{name:'Seleccionar encuentro 5',exact:true}).getAttribute('aria-pressed'),'true')}
    }
    if(view==='Tienda'&&!before){
     for(const tab of ['Vender','PerriCoins','Comprar','PerriRPG','Granja']){await frame.getByRole('tab',{name:tab,exact:true}).click();await check(frame,config.id+'-'+full+'-shop-'+tab)}
     // La última fila del catálogo sigue accesible por su desplazamiento propio.
     const list=frame.locator('[role="tabpanel"][data-state="active"]');
     if(await list.count())await list.last().evaluate(e=>e.scrollTop=e.scrollHeight);
    }
    await frame.getByRole('button',{name:view==='Tienda'?'Volver a la granja':'Volver a la pantalla de la mascota',exact:true}).click();

    await frame.locator('.perripet-app-root--pet').waitFor();
   }
   if(!before)for(const [button,close] of [['Estadísticas','Cerrar estadísticas'],['Cápsulas G','Cerrar'],['Alimentar','Cerrar alimentación']]){
    await frame.getByRole('button',{name:button,exact:true}).click();await check(frame,config.id+'-'+full+'-'+button);await frame.getByRole('button',{name:close,exact:true}).click();
   }
   if(full){await page.locator('[data-action="game-fullscreen"]').click();await page.waitForFunction(()=>!document.fullscreenElement)}
  }
  assert.deepEqual(await page.locator('.game-card').boundingBox(),outer,'La ventana exterior no debe cambiar');
  await closeGame(page);await ctx.close();console.log('PASS',before?'before':config.id);
 }

 for(const mobile of [false,true]){
  await db.exec(`update shop_perripet_states set farm_state=jsonb_set(farm_state,'{plots,0,planted}','false'::jsonb);`);
  const ctx=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,storageState:sessionState});const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4192/#games');await page.locator('[data-game="PerriPet"]').waitFor();
  async function scenario(id,patch,action){await seed({stage:'adult1',hasActiveCreature:true,hp:207,level:10,skills:['vigor'],energy:100,hunger:100,happiness:100,angry:false,sleepUntil:null,...patch});const frame=await openPet(page);await action(frame);await frame.locator('#'+({'sleep':'sleep-dialog-title','needs':'needs-info-title','food-info':'food-info-title','training':'training-dialog-title','evolution':'evolution-dialog-title','incubator':'incubator-dialog-title','death':'death-dialog-title','farm-help':'farm-help-title','locked-plot':'locked-plot-title','seed':'seed-picker-title','combat-stats':'combat-stats-title','skill':'skill-detail-title','battle':'combat-result-title','watering':'watering-picker-title'}[id])).waitFor();await check(frame,(mobile?'mobile':'pc')+'-dialog-'+id);await page.screenshot({path:output+'/dialog-'+(mobile?'mobile':'pc')+'-'+id+'.png'});if(mobile&&id==='watering'){await page.setViewportSize({width:667,height:375});await check(frame,'mobile-small-dialog-watering');await page.setViewportSize({width:844,height:390});await check(frame,'mobile-resized-dialog-watering')}console.log('DIALOG',id);await closeGame(page)}
  await scenario('needs',{},async f=>f.getByRole('button',{name:'Información sobre Vida, Energía, Felicidad y Alimento',exact:true}).click());
  await scenario('food-info',{},async f=>{await f.getByRole('button',{name:'Alimentar',exact:true}).click();await f.getByRole('button',{name:'Información sobre Comida',exact:true}).click()});
  await scenario('training',{stage:'young'},async f=>f.getByRole('button',{name:/Entrenar a la criatura/}).click());
  await scenario('evolution',{stage:'young',lifeTrainings:10,strengthTrainings:10,defenseTrainings:10,speedTrainings:10,resistanceTrainings:10},async f=>f.getByRole('button',{name:'Evolucionar',exact:true}).click());
  await scenario('incubator',{hasActiveCreature:false},async f=>f.getByRole('button',{name:'Abrir la incubadora de huevos',exact:true}).click());
  await scenario('death',{hp:0},async f=>f.getByRole('button',{name:'Ver opciones para la criatura muerta',exact:true}).click());
  await scenario('sleep',{energy:0,angry:false},async f=>f.locator('#sleep-dialog-title').waitFor());
  await scenario('farm-help',{},async f=>{await f.getByRole('button',{name:'Granja',exact:true}).click();await f.getByRole('button',{name:'Cómo funciona la granja',exact:true}).click()});
  await scenario('locked-plot',{},async f=>{await f.getByRole('button',{name:'Granja',exact:true}).click();await f.getByRole('button',{name:'Huerto 2 bloqueado',exact:true}).click()});
  await scenario('seed',{},async f=>{await f.getByRole('button',{name:'Granja',exact:true}).click();await f.getByRole('button',{name:'Huerto 1 vacío',exact:true}).click()});
  await scenario('combat-stats',{},async f=>{await f.getByRole('button',{name:'Combate',exact:true}).click();await f.getByRole('button',{name:'Ver información de Carnalia',exact:true}).click()});

  await scenario('skill',{},async f=>{await f.getByRole('button',{name:'Combate',exact:true}).click();await f.getByRole('button',{name:'Ver información de Carnalia',exact:true}).click();await f.getByRole('button',{name:'Ver qué hace Vigor',exact:true}).click()});
  await scenario('battle',{},async f=>{await f.getByRole('button',{name:'Combate',exact:true}).click();await f.getByRole('button',{name:'Seleccionar encuentro 1',exact:true}).click();await f.getByRole('button',{name:'Combatir',exact:true}).click();await check(f,(mobile?'mobile':'pc')+'-battle-animation');await f.locator('#combat-result-title').waitFor()});
  const farm=(await db.query('select farm_state from shop_perripet_states')).rows[0].farm_state;farm.plots[0]={...farm.plots[0],unlocked:true,planted:true,cropType:'green',water:20,growthMs:0,updatedAt:Date.now()};await db.query('update shop_perripet_states set farm_state=$1::jsonb',[JSON.stringify(farm)]);
  await scenario('watering',{},async f=>{await f.getByRole('button',{name:'Granja',exact:true}).click();await f.getByRole('button',{name:'Regar el cultivo del huerto 1',exact:true}).click()});
  for(const stage of ['egg','baby','adult2']){await seed({stage,hasActiveCreature:true,hp:207,energy:100,angry:false,sleepUntil:null,eggHatchesAt:Date.now()+3600000});const frame=await openPet(page);await check(frame,(mobile?'mobile':'pc')+'-home-'+stage);await closeGame(page)}
  await ctx.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(output+'/perripet-results.json',JSON.stringify({localOnly:true,zoom:'Viewport CSS equivalente a zoom; no se automatiza la interfaz de zoom de Edge',realMobile:false,results,errors},null,2));
 console.log(JSON.stringify({output,cases:results.length,errors}));
}finally{await browser?.close();web?.closeAllConnections();api?.closeAllConnections();if(web)await new Promise(r=>web.close(r));if(api)await new Promise(r=>api.close(r));await db.close()}
