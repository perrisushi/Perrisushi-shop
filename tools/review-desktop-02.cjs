const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const after=process.argv.includes('--after');
const folder='docs/correccion-02/'+(after?'despues':'antes');
(async()=>{
  const server=spawn(process.execPath,['dev-server.mjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'4175'},windowsHide:true});
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject)});
  let browser;
  const results=[],errors=[];
  try {
    browser=await chromium.launch({channel:'msedge',headless:true});
    await fs.mkdir(folder,{recursive:true});
    for(const [width,height] of [[1649,928],[1920,1080],[1536,960],[1280,720],[1068,900],[1024,600],[390,844],[360,800],[844,390]]) {
      const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
      page.on('pageerror',e=>errors.push(String(e)));
      page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
      await page.goto('http://127.0.0.1:4175/#home');
      await page.locator('.home-menu').waitFor();
      await page.evaluate(()=>document.fonts.ready);
      await page.screenshot({path:`${folder}/${width}x${height}-home.png`,fullPage:true});
      results.push(await page.evaluate(()=>{
        const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();
        const style=s=>{const c=getComputedStyle(document.querySelector(s));return Object.fromEntries(['width','height','padding','position','top','bottom','aspectRatio','gridTemplateColumns','gridTemplateRows','rowGap','columnGap','maxWidth','display','backgroundImage'].map(k=>[k,c[k]]))};
        return {viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,zoomVisualViewport:visualViewport?.scale,mobile:matchMedia('(max-width:700px)').matches,scene:rect('.scene'),menu:rect('.home-menu'),buttons:[...document.querySelectorAll('.art-menu-button')].map(el=>el.getBoundingClientRect().toJSON()),footer:rect('.scene-footer'),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,styles:Object.fromEntries(['.app-frame','.scene','.home-menu','.home-links','.art-menu-button','.scene-footer'].map(s=>[s,style(s)]))};
      }));
      if(after){
        const response=await page.request.get('http://127.0.0.1:4175/src/desktop-layout-fix.css');
        if(response.status()!==200 || !response.headers()['content-type'].includes('text/css'))errors.push('CSS response '+response.status());
        for(const internal of ['/package.json','/.git/config','/src/other.css']) if((await page.request.get('http://127.0.0.1:4175'+internal)).status()!==404)errors.push('Exposed '+internal);
      }
      if(width<=700 || height<=500) {
        await page.locator('[data-route="profile"]').click();
        await page.screenshot({path:`${folder}/${width}x${height}-profile.png`,fullPage:true});
        if(after)for(const route of (width<=700?['home','profile']:['home'])) {
          const filename=`${width}x${height}-${route}.png`;
          if(!Buffer.from(await fs.readFile(folder+'/'+filename)).equals(await fs.readFile('docs/correccion-02/antes/'+filename))) errors.push('Mobile screenshot changed '+filename);
        }
      }
      await page.close();
    }
    await fs.writeFile(folder+'/mediciones.json',JSON.stringify({results,errors},null,2));
    console.log(JSON.stringify({sizes:results.map(r=>({viewport:r.viewport,scene:[r.scene.width,r.scene.height],overflow:r.horizontalOverflow})),errors},null,2));
    if(errors.length || results.some(r=>r.horizontalOverflow))process.exitCode=1;
  } finally {await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
