const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/borja/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(runtime);
(async () => {
  const server = spawn(process.execPath, ['dev-server.mjs'], { cwd:path.resolve(__dirname,'..'), env:{...process.env,PORT:'4174'}, windowsHide:true });
  await new Promise((resolve,reject) => { server.stdout.once('data',resolve); server.once('error',reject); });
  let browser;
  const errors = [], results = [];
  try {
    browser = await chromium.launch({channel:'msedge',headless:true});
    await fs.mkdir('docs/capturas-correccion-01',{recursive:true});
    for (const [width,height] of [[1649,928],[1280,720],[373,734],[390,844],[360,640],[844,390]]) {
      const page = await browser.newPage({viewport:{width,height},hasTouch:width<900});
      page.on('pageerror',e=>errors.push(String(e)));
      page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
      for (const route of ['home','profile','users','inventory','games','shop']) {
        await page.goto('http://127.0.0.1:4174/#'+route);
        await page.locator('.home-menu,.content-board').waitFor();
        await page.screenshot({path:`docs/capturas-correccion-01/${width}x${height}-${route}.png`,fullPage:true});
        results.push({width,height,route,...await page.evaluate(()=>({horizontalOverflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length}))});
      }
      for (const modal of ['auth','notifications']) {
        await page.locator(`[data-action="${modal}"]`).first().click();
        await page.screenshot({path:`docs/capturas-correccion-01/${width}x${height}-${modal}.png`,fullPage:true});
        await page.keyboard.press('Tab');
        if(!await page.locator('#overlay-layer').evaluate(el=>el.contains(document.activeElement))) errors.push('Focus escaped modal');
        await page.keyboard.press('Escape');
        if(!await page.locator('#overlay-layer').isHidden()) errors.push('Escape failed');
        await page.locator(`[data-action="${modal}"]`).first().click();
        await page.locator('.modal-close').click();
        if(!await page.locator('#overlay-layer').isHidden()) errors.push('Close button failed');
        await page.locator(`[data-action="${modal}"]`).first().click();
        await page.locator('.modal-backdrop').click({position:{x:25,y:25}});
        if(!await page.locator('#overlay-layer').isHidden()) errors.push('Backdrop failed');
      }
      await page.goto('http://127.0.0.1:4174/#home');
      await page.locator('.home-links [data-route="profile"]').click();
      await page.locator('[data-action="history"]').click();
      await page.screenshot({path:`docs/capturas-correccion-01/${width}x${height}-history.png`,fullPage:true});
      if(!await page.locator('#modal-title').getByText('Historial',{exact:true}).isVisible()) errors.push('History did not open');
      await page.keyboard.press('Escape');
      await page.locator('[data-action="album"]').click();
      await page.locator('[data-avatar="buho-1"]').click();
      if(!await page.locator('.avatar-image').getAttribute('src').then(src=>src.includes('logo-buho-1.webp'))) errors.push('Header avatar mismatch');
      await page.screenshot({path:`docs/capturas-correccion-01/${width}x${height}-album.png`,fullPage:true});
      await page.locator('[data-album-tab="found"]').click();
      if(!await page.locator('#album-pending').isVisible()) errors.push('Collection notice missing');
      await page.keyboard.press('Shift+Tab');
      if(!await page.locator('#overlay-layer').evaluate(el=>el.contains(document.activeElement))) errors.push('Album focus escaped');
      await page.keyboard.press('Escape');
      if(!await page.locator('.profile-portrait .perrilogo-icon').getAttribute('src').then(src=>src.includes('logo-buho-1.webp'))) errors.push('Profile avatar mismatch');
      if(width<=700 && height>=640 && await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)) errors.push('Profile needs scroll '+width+'x'+height);
      await page.locator('.back-button').click();
      for (const route of ['profile','users','inventory','games','shop']) {
        const button = page.locator(`.home-links [data-route="${route}"]`);
        if(width<900) await button.tap(); else await button.click();
        await page.waitForURL('**/#'+route);
        await page.locator('.back-button').click();
        await page.waitForURL('**/#home');
      }
      await page.locator('.nav-toggle').click();
      await page.keyboard.press('Escape');
      if(!await page.locator('.nav-toggle').evaluate(el=>el===document.activeElement)) errors.push('Menu focus restore failed');
      const scene = await page.locator('.scene').boundingBox();
      results.push({width,height,scene});
      if(await page.locator('audio').evaluate(el=>!el.paused || el.preload!=='none')) errors.push('Unexpected initial music');
      for(const active of [true,false]) {
        await page.locator('.nav-toggle').click();
        await page.locator('[data-action="music"]').click();
        await page.waitForFunction(expected=>document.querySelector('[data-action="music"]').getAttribute('aria-pressed')===String(expected),active);
        if(await page.locator('audio').evaluate(el=>el.paused)===active) errors.push('Music state mismatch');
      }
      for(const action of ['assistance','logout']) {
        await page.locator('.nav-toggle').click();
        await page.locator(`[data-action="${action}"]`).click();
        await page.screenshot({path:`docs/capturas-correccion-01/${width}x${height}-${action}.png`,fullPage:true});
        await page.keyboard.press('Tab');
        if(!await page.locator('#overlay-layer').evaluate(el=>el.contains(document.activeElement))) errors.push('Focus escaped '+action);
        await page.keyboard.press('Escape');
      }
      const audioResponse = await page.request.get('http://127.0.0.1:4174/public/assets/musica-web.mp3');
      if(audioResponse.status()!==200 || !audioResponse.headers()['content-type'].includes('audio/mpeg')) errors.push('MP3 not served');
      for(const link of await page.locator('.footer-social a').all()) {
        if(!await link.isVisible()) continue;
        const expected = await link.getAttribute('href');
        await page.context().route(expected,route=>route.fulfill({status:200,contentType:'text/html',body:'Canal externo: destino comprobado'}));
        const popupPromise = page.waitForEvent('popup');
        await link.click();
        const popup=await popupPromise;
        await popup.waitForURL(expected);
        await popup.close();
      }
      await page.close();
    }
    await fs.writeFile('docs/capturas-correccion-01/results.json',JSON.stringify({results,errors},null,2));
    console.log(JSON.stringify({results,errors},null,2));
    if(errors.length || results.some(r=>r.horizontalOverflow||r.brokenImages)) process.exitCode=1;
  } finally { await browser?.close(); server.kill(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
