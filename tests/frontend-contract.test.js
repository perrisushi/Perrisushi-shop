import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {escapeText,logoId,setPageData,renderLiveInventory,renderLiveUsers} from '../src/services/live-ui.js';
import {logoAsset} from '../backend/logo-assets.mjs';
test('los datos de servidor no se interpretan como HTML ni rutas de imagen arbitrarias',()=>{
 assert.equal(escapeText('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');assert.equal(logoId('../../private'),'perriweb1');
 setPageData('users',{status:'ready',items:[{nick:'<script>alert(1)</script>',logoId:'https://bad.invalid/img',achievements:['<b>logro</b>'],pc:5}]});
 const html=renderLiveUsers();assert.ok(!html.includes('<script>'));assert.ok(!html.includes('https://bad.invalid'));assert.ok(html.includes('&lt;script&gt;'));
 assert.equal(logoAsset({logo_id:'legacy-buho',asset_path:'assets/logo-buho-1.png'}),'buho-1');
 assert.equal(logoAsset({asset_path:'javascript:alert(1)'}),null);
});
test('los campos y cantidades del inventario permanecen sin normalización destructiva',()=>{
 setPageData('inventory',{status:'ready',inventory:{pc:0,monedas:0,espada:7,llaves:-2,boleto_sorteo1:4}});
 const html=renderLiveInventory();assert.ok(html.includes('data-live-item="espada"'));assert.ok(html.includes('>7</span>'));assert.ok(html.includes('>-2</span>'));assert.ok(!html.includes('cantidad de ejemplo'));
});
test('se mantienen los accesos originales de juegos y la escala PC aprobada',()=>{
 const current=fs.readFileSync('src/main.js','utf8');
 const hash=s=>createHash('sha256').update(s.replace(/\r/g,'')).digest('hex');
 const games=s=>s.slice(s.indexOf('function gamesView()'),s.indexOf('function shopView()'));
 assert.match(games(current),/data-game/);for(const name of ['PerriDuelos','PerriPet','PerriCasillas','PerriRPG'])assert.ok(games(current).includes(name));
 assert.equal(hash(fs.readFileSync('src/desktop-layout-fix.css','utf8')),'d835197da1b44d939eae6332c950739b6abb1950511bf31868991c1dbd4464d8');
});
