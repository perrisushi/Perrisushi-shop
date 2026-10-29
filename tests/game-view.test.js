import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gameHtml,publicPattern} from '../backend/public-paths.mjs';
import {mobileGameView,createGameWindow} from '../src/game-window.js';

test('presentación se integra una sola vez en cada juego, sin duplicar transporte ni montaje',async()=>{
 for(const file of ['games/original/perriduelos-app/index.html','games/original/perripet-app/index.html','games/original/index-production.html','games/original/perrirpg.html']){
  const original=await readFile(file,'utf8'),casillas=file.endsWith('index-production.html'),rendered=gameHtml(original,casillas);
  assert.equal(gameHtml(rendered,casillas),rendered);assert.equal(rendered.match(/src="\/src\/game-bridge.js"/g).length,1);assert.equal(rendered.match(/href="\/src\/game-presentation.css"/g).length,1);assert.equal(rendered.match(/src="\/src\/game-presentation.js"/g).length,1);
  assert.match(rendered,/<html data-pw2-game/);assert.ok(rendered.includes('fullscreen')||rendered.includes('game-bridge'));
 }
 for(const path of ['/src/game-window.js','/src/game-window.css','/src/game-presentation.js','/src/game-presentation.css'])assert.equal(publicPattern.test(path),true);
 assert.equal(publicPattern.test('/backend/game-window.js'),false);
});

test('un PC con ventana estrecha no solicita inmersión móvil solo por su anchura',()=>{
 const win=(coarse,mobile=false)=>({matchMedia:()=>({matches:coarse}),navigator:{userAgentData:{mobile},userAgent:'Desktop browser'}});
 assert.equal(mobileGameView(win(false)),false);assert.equal(mobileGameView(win(true)),true);assert.equal(mobileGameView(win(false,true)),true);
});

test('orientación concedida se desbloquea después de salir de fullscreen y el portal se restaura al cerrar y reabrir',async()=>{
 const events=[],classes=new Set();let portalled=false;const button={setAttribute(k,v){this[k]=v}};
 const doc=new EventTarget();doc.fullscreenElement=null;doc.fullscreenEnabled=true;doc.body={classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},append:()=>{portalled=true}};
 doc.createComment=()=>({replaceWith:()=>{portalled=false}});doc.exitFullscreen=async()=>{events.push('exit');doc.fullscreenElement=null;doc.dispatchEvent(new Event('fullscreenchange'))};
 const card={querySelector:()=>button,requestFullscreen:async()=>{events.push('enter');doc.fullscreenElement=card;doc.dispatchEvent(new Event('fullscreenchange'))}};
 const win={performance:{now:()=>1},screen:{orientation:{lock:async value=>events.push('lock:'+value),unlock:()=>events.push('unlock')}}};
 const viewer=createGameWindow({overlay:{before(){}},doc,win});viewer.open(card,{immersive:true});await Promise.resolve();await Promise.resolve();assert.equal(portalled,true);assert.equal(button['aria-pressed'],'true');assert.ok(events.includes('lock:landscape'));
 await viewer.close();assert.equal(doc.fullscreenElement,null);assert.equal(portalled,false);assert.equal(classes.size,0);assert.ok(events.lastIndexOf('unlock')>events.lastIndexOf('exit'));
 viewer.open(card,{immersive:true});await Promise.resolve();await viewer.close();assert.equal(portalled,false);assert.equal(classes.size,0);
});
