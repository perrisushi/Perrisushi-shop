// QA integral local: frontend, API protegida, PostgreSQL efímero y navegador.
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {notificationFixture,notificationId} from '../tests/fixtures/notification-fixture.mjs';
import {createBackend} from '../backend/app.mjs';
import {createFrontendServer} from '../dev-server.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=process.env.TEMP+'/perriweb-notifications';await mkdir(out,{recursive:true});
let qaClock=Date.now();const f=await notificationFixture();const backend=http.createServer(createBackend({repository:f.repository,publicOrigin:'http://127.0.0.1:4198',now:()=>qaClock}));await new Promise(r=>backend.listen(0,'127.0.0.1',r));
const frontend=createFrontendServer({apiTarget:'http://127.0.0.1:'+backend.address().port,authenticate:async()=>true});await new Promise(r=>frontend.listen(4198,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];const base='http://127.0.0.1:'+frontend.address().port;
const wait=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,30))}throw Error('No se alcanzó el estado esperado')};
try {
 for(const [width,height] of (process.argv.includes('--small')?[[320,568]]:[[1440,900],[1000,550],[390,844],[320,568]])) {
  qaClock+=16*60_000; // Cada resolución es un escenario independiente, con sus cuotas intactas.
  await f.db.exec('TRUNCATE shop_notifications');
  await f.add({id:99,title:'Aviso ya revisado',read:'2026-09-01T00:00:00Z'});
  const context=await browser.newContext({viewport:{width,height},isMobile:width<701,hasTouch:width<701});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const login=async()=>{await page.locator('[name=nick]').fill('Alpha');await page.locator('[name=password]').fill('local-only');await page.locator('#traditional-login button[type=submit]').click();await page.waitForSelector('body[data-access="ready"]')};
  await page.goto(base);await login();assert.equal(await page.locator('.has-unread').count(),0);
  await f.add({id:1,title:'Nueva recompensa',message:'Contenido auténtico de la notificación local.'});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForSelector('.notification-trigger.has-unread');
  await page.screenshot({path:out+`/${width}x${height}-campana.png`});await page.locator('.notification-trigger').click();await page.getByRole('heading',{name:'Nueva recompensa',exact:true}).waitFor();
  assert.equal(await page.getByText('Aviso ya revisado',{exact:true}).count(),0);
  await wait(async()=>Boolean((await f.db.query('SELECT read_at FROM shop_notifications WHERE id=$1',[notificationId(1)])).rows[0].read_at));
  await wait(async()=>await page.locator('.has-unread').count()===0);
  assert.match(await page.locator('.notification-entry time').innerText(),/13 de agosto de 2026/);
  await page.screenshot({path:out+`/${width}x${height}-nuevas.png`});
  await page.locator('.modal-close').click();await page.locator('.notification-trigger').click();await page.getByText('No tienes notificaciones nuevas.',{exact:true}).waitFor();await page.locator('.modal-close').click();
  await page.locator('[data-route=profile]').first().click();await page.locator('[data-action=notification-history]').waitFor();
  const button=await page.locator('[data-action=notification-history]').boundingBox(),existing=await page.locator('[data-action=history]').boundingBox();assert.equal(button.width,existing.width);assert.equal(button.height,existing.height);
  await page.screenshot({path:out+`/${width}x${height}-perfil.png`});await page.locator('[data-action=notification-history]').click();await page.getByText('Aviso ya revisado',{exact:true}).waitFor();assert.equal(await page.locator('.notification-entry').count(),2);
  const rect=await page.getByRole('dialog').boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width+1&&rect.y+rect.height<=height+1);
  assert.equal(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.screenshot({path:out+`/${width}x${height}-historial.png`});await page.locator('.modal-close').click();
  await page.reload();await page.waitForSelector('body[data-access="ready"]');assert.equal(await page.locator('.has-unread').count(),0);
  await page.locator('.nav-toggle').click();await page.locator('[data-action=logout]').click();await page.waitForSelector('#traditional-login');await login();
  await page.locator('.notification-trigger').click();await page.getByText('No tienes notificaciones nuevas.',{exact:true}).waitFor();await page.locator('.modal-close').click();
  for(let i=2;i<=24;i++)await f.add({id:i,title:'Aviso '+i,message:'Mensaje conservado '+i+'. '+('Detalle de la notificación. '.repeat(8)),created:'2026-10-01T00:00:00Z'});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForSelector('.has-unread');
  await page.locator('.notification-trigger').click();await page.locator('.notification-entry').first().waitFor();
  const titles=await page.locator('.notification-entry h3').allTextContents();assert.equal(titles[0],'Aviso 24');assert.equal(titles.at(-1),'Aviso 5');
  await page.waitForTimeout(250);
  const hidden=(await f.db.query('SELECT read_at FROM shop_notifications WHERE id=$1',[notificationId(5)])).rows[0];assert.equal(hidden.read_at,null,'No marcar entradas fuera de pantalla');
  // Desplazamiento del panel: solo se marcan las tarjetas que llegan a verse.
  for(let i=0;i<200;i++) {const bottom=await page.getByRole('dialog').evaluate(el=>{el.scrollTop+=Math.max(24,(el.clientHeight-el.querySelector('.modal-head').clientHeight)*.65);return el.scrollTop+el.clientHeight>=el.scrollHeight-1});await page.waitForTimeout(180);if(bottom)break}
  await wait(async()=>Boolean((await f.db.query('SELECT read_at FROM shop_notifications WHERE id=$1',[notificationId(5)])).rows[0].read_at));
  await page.getByRole('button',{name:'Cargar más'}).click();
  await page.getByRole('heading',{name:'Aviso 2',exact:true}).waitFor();assert.equal(await page.locator('.notification-entry').count(),23);
  for(let i=0;i<100;i++){const bottom=await page.getByRole('dialog').evaluate(el=>{el.scrollTop+=Math.max(24,(el.clientHeight-el.querySelector('.modal-head').clientHeight)*.65);return el.scrollTop+el.clientHeight>=el.scrollHeight-1});await page.waitForTimeout(180);if(bottom)break}
  await wait(async()=>Number((await f.db.query('SELECT count(*) FROM shop_notifications WHERE read_at IS NULL')).rows[0].count)===0);
  assert.equal(await page.locator('.notification-entry').evaluateAll(els=>new Set(els.map(e=>e.querySelector('h3').textContent)).size),23);
  await page.locator('.modal-close').click();await wait(async()=>await page.locator('.has-unread').count()===0);
  // Si se cierra antes de mostrar una respuesta lenta, no se guarda lectura.
  await f.add({id:30,title:'Aviso sin visualizar',created:'2026-10-02T00:00:00Z'});
  await page.route('**/api/notifications?*',async route=>{if(new URL(route.request().url()).searchParams.get('limit')==='20')await new Promise(r=>setTimeout(r,250));await route.continue()});
  await page.locator('.notification-trigger').click();await page.locator('.modal-close').click();await page.waitForTimeout(400);
  assert.equal((await f.db.query('SELECT read_at FROM shop_notifications WHERE id=$1',[notificationId(30)])).rows[0].read_at,null);
  console.log(`${width}x${height}: OK`);await context.close();
 }
 assert.deepEqual(errors,[]);console.log('Resoluciones verificadas: bandeja, historial, campana, fechas, varias páginas, lectura visible, recarga, nuevo login, llegada posterior y cierre antes de carga: OK. '+out);
}finally{await browser.close();frontend.closeAllConnections();backend.closeAllConnections();await new Promise(r=>frontend.close(r));await new Promise(r=>backend.close(r));await f.db.close()}
