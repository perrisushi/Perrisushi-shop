// Solo servidor y PostgreSQL locales. Latencias inyectadas, no mide Supabase/Railway.
import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {adminFixture} from '../tests/helpers/admin-fixture.mjs';import {createBackend} from '../backend/app.mjs';import {createCommunity} from '../backend/community.mjs';import {serveSite} from '../backend/site.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const reference=process.env.PW2_STARTUP_BASE??'08e628888256d218a32b8e1b6b82f0cf2c66e68a';
const before=new Map(['/src/main.js','/src/services/api-client.js'].map(p=>[p,execFileSync('git',['show',reference+':'+p.slice(1)],{encoding:'utf8'})]));
const baseline=execFileSync('git',['rev-parse',reference],{encoding:'utf8'}).trim();
const delay=ms=>new Promise(r=>setTimeout(r,ms));const latencies={'/api/session':60,'/api/admin/context':180,'/api/auth/google/status':160,'/api/profile':140,'/api/community':220,'/api/notifications':280};const cosmeticsLatency=300;
const f=await adminFixture({extended:true,cosmetics:true}),original=createCommunity({pool:f.pool,moderation:f.moderation,cosmeticsEnabled:true});
const community={...original,read:async(u,k)=>{if(k==='cosmetics')await delay(cosmeticsLatency);return original.read(u,k)}};
let handler,mode='after',requests=[];const site=serveSite({root:resolve('dist'),authenticate:req=>handler.authenticate(req)});
const server=http.createServer(async(req,res)=>{const path=new URL(req.url,'http://local').pathname;
 if(mode==='before'&&before.has(path)){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(before.get(path));return}
 if(path.startsWith('/api/')){const entry={path,start:performance.now()};requests.push(entry);res.on('finish',()=>entry.duration=performance.now()-entry.start);await delay(latencies[path]??0);
  if(path==='/api/auth/google/config'||path==='/api/auth/google/pending'||path==='/api/auth/google/status'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(path.endsWith('config')?{enabled:true}:path.endsWith('pending')?{pending:false}:{linked:true}));return}
  return handler(req,res)
 }return site(req,res)
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
handler=createBackend({repository:f.repository,moderation:f.moderation,administration:f.administration,community,sessionStore:'supabase',publicOrigin:origin,csrfSecret:'s'.repeat(40)});
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[],errors=[];const output=resolve('docs/arranque-mediciones');await mkdir(output,{recursive:true});
try{
 for(mode of ['before','after'])for(const route of ['home','profile'])for(let sample=0;sample<3;sample++){
  requests=[];const context=await browser.newContext({viewport:{width:1366,height:768}});await context.addCookies([{name:'pw2_session',value:f.user.token,url:origin,httpOnly:true,sameSite:'Strict'}]);const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{window.loadTimes={};const scan=()=>{if(document.body?.dataset.access==='ready'&&!window.loadTimes.screen)window.loadTimes.screen=performance.now();if(document.querySelector('.wallet-pc-value')?.textContent==='100'&&!window.loadTimes.profile)window.loadTimes.profile=performance.now();if(document.querySelector('.profile-badge[data-authenticated="true"] [data-frame="marco-basico"]')&&!window.loadTimes.cosmetics)window.loadTimes.cosmetics=performance.now();requestAnimationFrame(scan)};requestAnimationFrame(scan)});
  await p.goto(origin+'/#'+route);await p.waitForFunction(()=>window.loadTimes.screen&&window.loadTimes.cosmetics&&(location.hash!=='#profile'||window.loadTimes.profile));
  await p.waitForFunction(()=>document.querySelector('.notification-trigger'));await delay(400);
  const times=await p.evaluate(()=>({times:window.loadTimes,resources:performance.getEntriesByType('resource').filter(e=>e.name.includes('/api/')).map(e=>({path:new URL(e.name).pathname,start:e.startTime,duration:e.duration})),measures:performance.getEntriesByType('measure').filter(e=>e.name.startsWith('pw2:')).map(e=>({name:e.name,start:e.startTime,duration:e.duration}))}));
  const counts=Object.fromEntries([...new Set(requests.map(r=>r.path))].map(path=>[path,requests.filter(r=>r.path===path).length]));
  if(mode==='after'){assert.equal(counts['/api/profile'],1);assert.equal(counts['/api/community'],1);assert.equal(counts['/api/profile/cosmetics'],1);assert.equal(counts['/api/session'],1);assert.equal(counts['/api/auth/google/status']??0,route==='home'?0:1);const base=times.resources.find(r=>r.path==='/api/profile'),cosmetic=times.resources.find(r=>r.path==='/api/profile/cosmetics');assert.ok(cosmetic.start<base.start+base.duration)}
  results.push({mode,route,sample,...times,counts});if(sample===0)await p.screenshot({path:resolve(output,mode+'-'+route+'.png')});await context.close();
 }
 const failureContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await failureContext.addCookies([{name:'pw2_session',value:f.user.token,url:origin,httpOnly:true,sameSite:'Strict'}]);const failed=await failureContext.newPage();failed.on('pageerror',e=>errors.push(e.message));
 for(const path of ['profile/cosmetics','community','admin/context','notifications'])await failed.route('**/api/'+path+'*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'backend_unavailable'})}));
 await failed.goto(origin+'/#profile');await failed.locator('.wallet-pc-value').filter({hasText:'100'}).waitFor();assert.equal(await failed.locator('.profile-badge img').count(),0);await failed.locator('[data-route=home]').first().click();await failed.locator('.home-menu').waitFor();await failureContext.close();
 // Orden inverso: cosméticos terminan antes del resumen. Equipar no puede ser sobrescrito después.
 latencies['/api/profile']=500;
 await f.db.query("UPDATE shop_profiles SET cosmetics=jsonb_set(cosmetics,'{ownedFrameIds}','[\"marco-basico\",\"marco-logo-planta\"]') WHERE nick=$1",[f.user.nick]);
 const raceContext=await browser.newContext();await raceContext.addCookies([{name:'pw2_session',value:f.user.token,url:origin,httpOnly:true,sameSite:'Strict'}]);const race=await raceContext.newPage();race.on('pageerror',e=>errors.push(e.message));
 await race.goto(origin+'/#profile');await race.locator('.wallet-pc-value').filter({hasText:'100'}).waitFor();await race.locator('[data-action=album]').click();await race.locator('[data-cosmetic-tab=frame]').click();const refreshedSummary=race.waitForResponse(r=>r.url().includes('/api/profile?'));await race.locator('[data-cosmetic-equip=marco-logo-planta]').click();await race.waitForFunction(()=>document.querySelector('.profile-badge [data-frame="marco-logo-planta"]'));
 await refreshedSummary;await race.locator('.modal-close').click();await race.goto(origin+'/#shop');await race.locator('.store-product').first().waitFor();await race.waitForFunction(()=>document.querySelector('.profile-badge [data-frame="marco-logo-planta"]'));await raceContext.close();
 latencies['/api/profile']=140;
 assert.deepEqual(errors,[]);
 const median=xs=>xs.sort((a,b)=>a-b)[Math.floor(xs.length/2)];const summary=['home','profile'].map(route=>({route,...Object.fromEntries(['before','after'].map(mode=>{const samples=results.filter(r=>r.route===route&&r.mode===mode);return [mode,{screen:median(samples.map(r=>r.times.screen)),profile:route==='profile'?median(samples.map(r=>r.times.profile)):null,cosmetics:median(samples.map(r=>r.times.cosmetics))}]}))}));
 for(const s of summary){assert.ok(s.after.screen<s.before.screen-200);if(s.route==='profile')assert.ok(s.after.profile<s.before.profile-200)}
 const report={baseline,mode:'LOCAL: Edge real + PGlite; latencias simuladas; no producción',latencies,cosmeticsLatency,secondaryFailureMobilePassed:true,invertedProfileCosmeticsOrderPassed:true,summary,results,errors};await writeFile(resolve(output,'resultados.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({summary,errors,samples:results.length}));
}finally{await browser.close();await new Promise(r=>server.close(r));await f.db.close()}
