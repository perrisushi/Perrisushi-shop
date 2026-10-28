const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const after=process.argv.includes('--after');
const folder='docs/correccion-04/'+(after?'despues':'antes');
(async()=>{
 const server=spawn(process.execPath,['dev-server.mjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'4176'},windowsHide:true});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject)});
 let browser; const errors=[],results=[];
 try {
  browser=await chromium.launch({channel:'msedge',headless:true});await fs.mkdir(folder,{recursive:true});
  for(const [width,height] of [[1649,928],[1280,720],[390,844],[360,800]]) {
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
   if(!after){
    await page.route('http://127.0.0.1:4176/',r=>r.fulfill({contentType:'text/html',path:'.correccion-04/antes/index.html'}));
    await page.route('**/src/main.js',r=>r.fulfill({contentType:'text/javascript',path:'.correccion-04/antes/main.js'}));
   }
   page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4176/'))errors.push('External request '+r.url())});
   async function capture(name,unchanged=false){
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.loading!=='lazy').map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
    const file=`${width}x${height}-${name}.png`;await page.screenshot({path:folder+'/'+file,fullPage:true});
    if(unchanged){
     const signature=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>!['SCRIPT','LINK','STYLE'].includes(el.tagName)).map(el=>{const c=getComputedStyle(el),r=el.getBoundingClientRect();return {tag:el.tagName,cls:el.className?.baseVal??el.className,rect:[r.x,r.y,r.width,r.height],style:[c.font,c.color,c.background,c.padding,c.margin,c.border,c.display,c.boxShadow,c.filter,c.transform]}}));
     await fs.writeFile(folder+'/'+file+'.json',JSON.stringify(signature));
     if(after){assert.deepEqual(signature,JSON.parse(await fs.readFile('docs/correccion-04/antes/'+file+'.json','utf8')),'Approved layout/style changed '+file);results.push({file,approvedLayoutAndStylesIdentical:true,pngBytesIdentical:(await fs.readFile(folder+'/'+file)).equals(await fs.readFile('docs/correccion-04/antes/'+file))})}
    }
    assert.equal(await page.locator('.header-decoration').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   for(const route of ['home','profile','games','users','inventory','shop']){
    await page.goto('http://127.0.0.1:4176/#'+route);await page.locator('.home-menu,.content-board').waitFor();
    await capture(route,['home','profile','games'].includes(route));
    if(route==='profile')for(const action of ['history','album']){await page.locator(`[data-action="${action}"]`).click();await capture(action,true);await page.keyboard.press('Escape')}
    if(!after)continue;
    if(route==='users'){
     assert.equal(await page.locator('.pw04-user-row').count(),15);
     const pane=page.locator('.pw04-user-rows');await pane.focus();await page.keyboard.press('End');
     await page.waitForFunction(()=>document.querySelector('.pw04-user-rows').scrollTop>0);
     await page.locator('.pw04-user-row').nth(13).scrollIntoViewIfNeeded();await capture('users-long-name');
    }
    if(route==='inventory'){
     assert.equal(await page.locator('.pw04-inventory-slot').count(),24);
     for(const id of ['ticket-demo','coin-demo']){await page.locator(`[data-pw04-item="${id}"]`).click();assert.match(await page.locator('#pw04-item-info').textContent(),/ejemplo/)}
     await capture('inventory-detail');
    }
    if(route==='shop'){
     assert.equal(await page.getByRole('tab').count(),2);
     assert.equal(await page.locator('.pw04-shop-cta:not([disabled])').count(),0);
     await page.getByRole('tab',{name:'Random Key',exact:true}).focus();await page.keyboard.press('ArrowRight');
     assert.equal(await page.getByRole('tab',{name:'Sorteos',exact:true}).getAttribute('aria-selected'),'true');await capture('shop-sorteos');
     await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'Random Key',exact:true}).getAttribute('aria-selected'),'true');
    }
   }
   if(after)for(const resource of ['preview-pages.js','preview-pages.css']){const response=await page.request.get('http://127.0.0.1:4176/src/'+resource);assert.equal(response.status(),200);assert.match(response.headers()['content-type'],resource.endsWith('css')?/text\/css/:/javascript/)}
   results.push({width,height,approvedScreensUnchanged:after,passed:true});await page.close();
  }
  await fs.writeFile(folder+'/results.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));assert.equal(errors.length,0);
 }finally{await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
