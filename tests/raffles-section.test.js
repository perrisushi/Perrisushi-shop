import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {renderLiveShop,renderLiveRaffles,setPageData} from '../src/services/live-ui.js';
import {normalizeRoute} from '../src/routes.js';
import {serveSite} from '../backend/site.mjs';
test('Tienda conserva Random Key; Sorteos tiene los boletos y la compra existentes',()=>{
 setPageData('shop',{status:'ready',randomKey:{inventoryRandomKey:2,tickets:{items:[{status:'active',expires_at:'2026-12-01'}]},claims:{items:[{game:'Juego',key:'OWN-KEY'}]},operationsEnabled:true}});
 setPageData('raffles',{status:'ready',raffles:{tickets:{boleto_sorteo1:0,boleto_sorteo2:2,mini_sorteo:1},policy:{price:3500,max:3},operationsEnabled:true}});
 const shop=renderLiveShop(),raffles=renderLiveRaffles();
 assert.match(shop,/Random Key/);assert.match(shop,/OWN-KEY/);assert.match(shop,/data-economy="redeem"/);assert.doesNotMatch(shop,/Comprar boleto|data-economy="buy"|Sorteos/);
 assert.match(raffles,/data-economy="buy"/);assert.match(raffles,/3500/);assert.match(raffles,/Máximo 3/);assert.match(raffles,/Boleto de Sorteo 2/);assert.doesNotMatch(raffles,/OWN-KEY|data-economy="redeem"|Boleto de Sorteo 1/);
 assert.equal(normalizeRoute('#raffles'),'raffles');
 setPageData('raffles',{status:'ready',raffles:{tickets:{boleto_sorteo2:2},operationsEnabled:false}});assert.doesNotMatch(renderLiveRaffles(),/data-economy="buy"/);assert.match(renderLiveRaffles(),/No hay venta de boletos disponible/);
});
test('Sorteo: PNG original sin modificaciones y servido como imagen',async()=>{
 const png=await readFile('public/assets/boton-sorteo.png');
 assert.equal(createHash('sha256').update(png).digest('hex'),'0cb90c67883b2e0d107da3ec63c9ca47c94b947a561d4beac2b164a2efeafbcd');
 const serve=serveSite({root:process.cwd()});let status,headers;await serve({url:'/public/assets/boton-sorteo.png',method:'GET',headers:{}},{writeHead:(s,h)=>{status=s;headers=h},end:()=>{}});assert.equal(status,200);assert.equal(headers['Content-Type'],'image/png');
});
test('Menú conserva los cinco accesos y añade Sorteo sin modificar la API económica',async()=>{
 const source=await readFile('src/main.js','utf8'),menu=source.slice(source.indexOf('function homeView'),source.indexOf('function shellView'));
 for(const route of ['profile','users','inventory','games','shop','raffles'])assert.match(menu,new RegExp("imageButton\\([^\\n]+,'"+route+"'"));
 assert.match(source,/buyRaffleTicket\(\{raffleId:'boletoSorteo2',idempotencyKey:operation.id\}\)/);
 assert.match(source,/loadCurrentRoute\(kind==='redeem'\?'shop':'raffles'\)/);
});
