// QA local: PostgreSQL embebido + backend real; solo el proveedor OAuth se sustituye.
// No se accede a Google, Railway ni Supabase.
import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdir,writeFile,mkdtemp} from 'node:fs/promises';
import {createRequire} from 'node:module';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createGoogleAuth,createGoogleProvider} from '../backend/google-auth.mjs';
import {createLegalPages} from '../backend/legal-pages.mjs';
import {prepareLegalFiles,legalFields} from './prepare-google-legal.mjs';
import {createBackend} from '../backend/app.mjs';
import {createFrontendServer} from '../dev-server.mjs';
import {digest} from '../backend/security.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const privateMode=process.env.PW2_QA_PRIVATE==='true';
const rootReturn=process.env.PW2_QA_ROOT_RETURN==='true';
const legalEnabled=!privateMode&&process.env.PW2_QA_LEGALS!=='false';
const base='http://127.0.0.1:4199',output=process.env.PW2_QA_DIR??process.env.TEMP+'/perriweb-google-qa'+(privateMode?'-private':'')+(rootReturn?'-root':'')+(!legalEnabled&&!privateMode?'-no-legals':'');
const db=new PGlite(),errors=[],results=[];
let backend,frontend,browser,qaClock=Date.now();
try{
 await mkdir(output,{recursive:true});
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY)');
 await db.exec((await readFile('tests/fixtures/game-schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec('ALTER TABLE shop_access ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false');
 await db.exec(await readFile('sql/002-google-auth.sql','utf8'));
 const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
 await db.query('INSERT INTO auth.users VALUES($1),($2)',[A,B]);
 await db.query("INSERT INTO shop_players(nick) VALUES('OldNick')");
 await db.query("INSERT INTO shop_access(nick,code_hash) VALUES('OldNick',$1)",[digest('local-password')]);
 await db.exec("INSERT INTO shop_inventories(nick,pc,polvo_gema) VALUES('OldNick',987,25);INSERT INTO shop_profiles(nick) VALUES('OldNick')");
 let tail=Promise.resolve(),chosen=A;
 const pool={async connect(){const previous=tail;let release;tail=new Promise(r=>release=r);await previous;return {query:(...args)=>db.query(...args),release}}};
 const one=async(table,nick)=>(await db.query('SELECT * FROM '+table+' WHERE nick=$1',[nick])).rows[0]??null;
 const repository={configured:true,access:nick=>one('shop_access',nick),player:nick=>one('shop_players',nick),
  session:async token=>JSON.parse(JSON.stringify((await db.query('SELECT * FROM shop_sessions WHERE token=$1',[token])).rows[0]??null)),
  createSession:row=>db.query('INSERT INTO shop_sessions(token,nick,expires_at) VALUES($1,$2,$3)',[row.token,row.nick,row.expires_at]),
  deleteSession:token=>db.query('DELETE FROM shop_sessions WHERE token=$1',[token]),
  profile:nick=>one('shop_profiles',nick),inventory:nick=>one('shop_inventories',nick),logos:async()=>(await db.query('SELECT * FROM shop_logo_catalog')).rows,
  page:async()=>[]};
 const legalDirectory=await mkdtemp(output+'/legal-local-');
 const legalConfig={aprobado:true,...Object.fromEntries(legalFields.map(([key])=>[key,key==='email'?'qa@example.invalid':'Texto local de verificación para '+key+' '+('contenido '.repeat(12))]))};
 await prepareLegalFiles(legalConfig,{output:legalDirectory});
 const legal=createLegalPages({enabled:legalEnabled,directory:legalDirectory});
 const provider=createGoogleProvider({url:'https://qa-google.invalid',key:'qa-public',origin:base,testOnly:privateMode,testEmail:'qa-owner@example.test',fetchImpl:async url=>{
  if(String(url).includes('/token?'))return Response.json({access_token:'QA_PRIVATE_TOKEN'});
  const email=chosen===A?'qa-owner@example.test':'qa-other@example.test';
  return Response.json({id:chosen,email,email_confirmed_at:'2026-10-31',identities:[{provider:'google',identity_data:{email,email_verified:true}}]});
 }});
 const google=createGoogleAuth({pool,provider,origin:base,secret:'s'.repeat(40),termsVersion:legal.version,registrationEnabled:!privateMode});
 const handler=createBackend({repository,google,legalPublished:legal.enabled,now:()=>qaClock,publicOrigin:base,sessionStore:'supabase',allowSessionWrites:true,csrfSecret:'s'.repeat(40)});
 backend=http.createServer((req,res)=>legal.matches(req.url)?legal.handle(req,res):handler(req,res));
 await new Promise(r=>backend.listen(0,'127.0.0.1',r));
 frontend=createFrontendServer({apiTarget:'http://127.0.0.1:'+backend.address().port,authenticate:async()=>true});
 await new Promise(r=>frontend.listen(4199,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const size of [{width:1440,height:900},{width:1000,height:550},{width:320,height:568},{width:390,height:844},{width:667,height:375}]){
  qaClock+=16*60_000;
  const context=await browser.newContext({viewport:size,isMobile:size.width<701,hasTouch:size.width<701});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://qa-google.invalid/**',route=>route.fulfill({status:302,headers:{location:base+(rootReturn?'/?code=local-code':'/api/auth/google/callback?code=local-code')},body:''}));
  async function shot(name){
   const data=await page.evaluate(()=>{
    const card=document.querySelector('.modal-card'),b=card.getBoundingClientRect();
    return {x:b.x,y:b.y,width:b.width,height:b.height,vw:innerWidth,vh:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1};
   });
   assert.ok(data.x>=-1&&data.y>=-1&&data.x+data.width<=data.vw+1&&data.y+data.height<=data.vh+1,JSON.stringify(data));
   assert.equal(data.overflow,false);
   await page.screenshot({path:output+'/'+size.width+'x'+size.height+'-'+name+'.png'});
   results.push({size,state:name,geometry:data});
  }
  let statusFailure=true;
  await context.route('**/api/auth/google/status',route=>{
   if(statusFailure){statusFailure=false;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"google_unavailable"}'})}
   return route.continue();
  });
  await page.goto(base);await page.locator('[data-action="google-login"]').waitFor();
  await shot('login');
  // Traditional account -> reauthentication -> real callback -> linked session.
  await page.locator('#traditional-login [name=nick]').fill('OldNick');
  await page.locator('#traditional-login [name=password]').fill('local-password');
  await page.locator('#traditional-login button').click();await page.locator('body[data-access=ready]').waitFor();
  await page.getByRole('button',{name:'Mi perfil',exact:true}).first().click();
  await page.locator('.profile-grid').waitFor();
  await page.locator('[data-action=google-status]').waitFor();
  if(size.width<701)await page.locator('[data-action=google-status]').tap();else await page.locator('[data-action=google-status]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-action=google-status]'));
  if(await page.locator('[data-action=link-google]').count()){
   await page.locator('[data-action=link-google]').click();await page.locator('#google-link').waitFor();
   await shot('link');
   chosen=A;await page.locator('#google-link [name=password]').fill('local-password');
   await page.locator('#google-link button').click();await page.locator('.google-profile').filter({hasText:'Google vinculado'}).waitFor();
   assert.equal((await one('shop_inventories','OldNick')).pc,987);
  }else{
   // Linked state from preceding size: inspect the same modal on a fresh old account.
   await db.query("DELETE FROM pw2_google_links WHERE nick='OldNick'");
   await page.reload();await page.locator('[data-action=link-google]').waitFor();
   await page.locator('[data-action=link-google]').click();await shot('link');
   chosen=A;await page.locator('#google-link [name=password]').fill('local-password');await page.locator('#google-link button').click();
   await page.locator('.google-profile').filter({hasText:'Google vinculado'}).waitFor();
  }
  await page.locator('[data-action=menu]').click();await page.locator('[data-action=logout]').click();
  await page.locator('#traditional-login').waitFor();
  chosen=A;await (size.width<701?page.locator('[data-action=google-login]').tap():page.locator('[data-action=google-login]').click());await page.locator('body[data-access=ready]').waitFor();
  assert.equal(await page.locator('.identity-chip strong').innerText(),'OldNick');
  await page.reload();await page.locator('body[data-access=ready]').waitFor();
  await context.close();
 }
 // Fresh Google identity -> explicit signup -> conflict handling -> create -> persistence/logout.
 for(const size of (privateMode?[]:[{width:1440,height:900},{width:320,height:568},{width:390,height:844},{width:667,height:375}])){
  await db.query('DELETE FROM pw2_google_links WHERE auth_user_id=$1',[B]);
  qaClock+=16*60_000;
  const context=await browser.newContext({viewport:size,isMobile:size.width<701,hasTouch:size.width<701});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://qa-google.invalid/**',route=>route.fulfill({status:302,headers:{location:base+(rootReturn?'/?code=local-code':'/api/auth/google/callback?code=local-code')},body:''}));
  chosen=B;await page.goto(base);await (size.width<701?page.locator('[data-action=google-login]').tap():page.locator('[data-action=google-login]').click());await page.locator('#google-register').waitFor();
  assert.equal((await db.query("SELECT 1 FROM shop_players WHERE nick=$1",['Nuevo'+size.width])).rows.length,0);
  await page.screenshot({path:output+'/'+size.width+'x'+size.height+'-register.png'});
  const geometry=await page.locator('.modal-card').boundingBox();assert.ok(geometry.y>=0&&geometry.y+geometry.height<=size.height+1);
  if(size.width===390){
   await page.locator('[name=nick]').focus();await page.setViewportSize({width:390,height:500});
   await page.waitForTimeout(80);
   for(const action of ['#google-register button','[data-action=google-cancel]']){
    const box=await page.locator(action).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=500);
   }
   await page.screenshot({path:output+'/390x500-register-reduced-height.png'});
   results.push({size:{width:390,height:500},state:'register-reduced-height'});
   await page.setViewportSize(size);
  }

  await page.locator('[name=nick]').fill('OldNick');if(legalEnabled)await page.locator('[name=acceptedTerms]').check();else assert.equal(await page.locator('[name=acceptedTerms]').count(),0);
  await page.locator('#google-register button').click();await page.getByRole('status').filter({hasText:'Ese nick ya está ocupado'}).waitFor();
  await page.locator('[name=nick]').fill('Nuevo'+size.width);await page.locator('#google-register button').click();
  await page.locator('body[data-access=ready]').waitFor();
  assert.equal(await page.locator('.identity-chip strong').innerText(),'Nuevo'+size.width);
  await page.reload();await page.locator('body[data-access=ready]').waitFor();
  const inventory=await one('shop_inventories','Nuevo'+size.width);assert.equal(inventory.pc,0);
  if(!legalEnabled){const consent=(await db.query('SELECT terms_version,terms_accepted_at FROM pw2_google_links WHERE auth_user_id=$1',[B])).rows[0];assert.equal(consent.terms_version,null);assert.equal(consent.terms_accepted_at,null);assert.equal((await page.request.get(base+'/api/legal/privacy')).status(),404);assert.equal((await page.request.get(base+'/api/legal/terms')).status(),404)}
  results.push({size,state:'register-and-persist',geometry});
  await context.close();
 }
 for(const size of (!legalEnabled?[]:[{width:1440,height:900},{width:390,height:844}])){
  const context=await browser.newContext({viewport:size,isMobile:size.width<701,hasTouch:size.width<701});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const route of ['privacy','terms']){
   const response=await page.goto(base+'/api/legal/'+route);
   assert.equal(response.status(),200);assert.ok(response.headers()['content-security-policy'].includes("default-src 'none'"));
   assert.ok(await page.locator('h1').isVisible());
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.screenshot({path:output+'/'+size.width+'x'+size.height+'-legal-'+route+'.png',fullPage:true});
   results.push({size,state:'legal-'+route,public:true});
  }
  await context.close();
 }
 if(privateMode)for(const size of [{width:1440,height:900},{width:390,height:844}]){
  qaClock+=16*60_000;
  const context=await browser.newContext({viewport:size,isMobile:size.width<701,hasTouch:size.width<701});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://qa-google.invalid/**',route=>route.fulfill({status:302,headers:{location:base+(rootReturn?'/?code=local-code':'/api/auth/google/callback?code=local-code')},body:''}));
  const inventoryBefore=await one('shop_inventories','OldNick');
  chosen=B;await page.goto(base);await page.locator('[data-action=google-login]').click();
  await page.getByRole('status').filter({hasText:'Esta cuenta de Google no tiene el acceso habilitado.'}).waitFor();
  assert.equal(await page.locator('#google-register').count(),0);
  assert.equal(await page.locator('a[href="/api/legal/privacy"]').count(),0);
  const config=await (await page.request.get(base+'/api/auth/google/config')).json();
  assert.equal(config.registrationEnabled,false);assert.equal(config.legalPublished,false);assert.equal(config.legalVersion,null);
  const denied=await page.request.post(base+'/api/auth/google/register',{headers:{origin:base},data:{nick:'NeverCreated',acceptedTerms:true}});
  assert.equal(denied.status(),503);
  assert.equal((await page.request.get(base+'/api/legal/privacy')).status(),404);
  assert.equal((await page.request.get(base+'/api/legal/terms')).status(),404);
  assert.equal((await db.query('SELECT count(*)::integer AS total FROM shop_players')).rows[0].total,1);
  assert.deepEqual(await one('shop_inventories','OldNick'),inventoryBefore);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const box=await page.locator('.modal-card').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=size.height+1);
  await page.screenshot({path:output+'/'+size.width+'x'+size.height+'-private-rejection.png'});
  results.push({size,state:'private-rejection-no-registration-no-public-legals'});
  await context.close();
 }
 if(privateMode){
  qaClock+=16*60_000;
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://qa-google.invalid/**',route=>route.fulfill({status:302,headers:{location:base+(rootReturn?'/?code=local-code':'/api/auth/google/callback?code=local-code')},body:''}));
  await context.route('**/api/session',route=>route.fulfill({status:200,contentType:'application/json',body:'{"authenticated":false}'}));
  chosen=A;await page.goto(base);await page.locator('[data-action=google-login]').tap();
  await page.getByRole('status').filter({hasText:'Google ha respondido, pero no se pudo recuperar la sesión.'}).waitFor();
  assert.equal(await page.locator('#traditional-login').count(),1);
  assert.equal(new URL(page.url()).searchParams.has('code'),false);
  await page.screenshot({path:output+'/390x844-session-missing-visible.png'});
  results.push({size:{width:390,height:844},state:'missing-session-displays-error'});
  await context.unroute('**/api/session');await page.reload();await page.locator('body[data-access=ready]').waitFor();
  await page.goto(base+'/?google=google_not_allowed#profile');
  await page.getByRole('heading',{name:'Acceso con Google',exact:true}).waitFor();
  await page.getByRole('status').filter({hasText:'Esta cuenta de Google no tiene el acceso habilitado.'}).waitFor();
  assert.equal(await page.locator('.identity-chip strong').innerText(),'OldNick');
  results.push({size:{width:390,height:844},state:'link-error-visible-with-existing-session'});
  await context.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(output+'/results.json',JSON.stringify({results,javascriptErrors:errors,provider:'substituted locally; real OAuth not verified'},null,2));
 console.log(JSON.stringify({cases:results.length,javascriptErrors:errors,output}));
}finally{
 await browser?.close();
 for(const server of [frontend,backend])if(server){server.closeAllConnections();await new Promise(r=>server.close(r))}
 await db.close();
}
