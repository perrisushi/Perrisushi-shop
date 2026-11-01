import assert from 'node:assert/strict';
import fs from 'node:fs';
const main=fs.readFileSync('src/main.js','utf8'),live=fs.readFileSync('src/services/live-ui.js','utf8'),ui=live;
for(const term of ['renderLiveUsers()','renderLiveInventory()','renderLiveShop()','renderLiveRaffles()'])assert.ok(main.includes(term));
assert.match(fs.readFileSync('index.html','utf8'),/preview-pages\.css/);
assert.match(fs.readFileSync('dev-server.mjs','utf8'),/serveSite/);
assert.doesNotMatch(ui+live,/DEMO_USERS|DEMO_ITEMS|CaballeroTrufa|Comprar equipamiento|supabase\.(from|rpc|auth)|localStorage|sessionStorage|[✦✧★☆✩✨]/);
const {renderLiveInventory,setPageData}=await import('../src/services/live-ui.js');
for(const count of [0,1,6,14,24,57]){
 const inventory={pc:10,monedas:2,...Object.fromEntries(Array.from({length:count},(_,i)=>['objeto_'+i,i+1]))};
 setPageData('inventory',{status:'ready',inventory});const html=renderLiveInventory();
 assert.equal((html.match(/data-live-item=/g)||[]).length,count);
 assert.doesNotMatch(html,/<span class="pw04-inventory-slot"/);
}
assert.doesNotMatch(live,/\(pendiente\)|pw04-demo-badge/);
assert.equal((live.match(/class="textured-button pw04-shop-cta" data-economy=/g)||[]).length,2);
assert.doesNotMatch(live,/data-pw04-shop-tab/);assert.match(live,/export function renderLiveRaffles/);

console.log('OK: vistas conectadas sin demos; solo casillas de objetos reales; tienda y sorteos separados; economía protegida.');
