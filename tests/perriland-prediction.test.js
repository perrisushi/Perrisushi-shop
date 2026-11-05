import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pack} from '../backend/perriland/codec.mjs';
const require=createRequire(import.meta.url),{OverlayWorld,scene,E}=require('../backend/perriland/vendor/src/world.cjs');
const physics=await readFile('games/perriland/prediction-physics.js','utf8');
const prediction=await readFile('games/perriland/prediction.js','utf8');
function client(){const context=vm.createContext({});vm.runInContext(physics,context);vm.runInContext(prediction,context);return context;}
function server(){const w=new OverlayWorld({participants:[]});w.setBots(false);w.enemies.setAuto(false);w.extras.coin=null;w.extras.nextSpawn=Infinity;w.extras.nextSpecial=Infinity;
 const p={...w.template,id:'local',name:'Alpha',x:500,y:scene.floor.y-scene.radius-scene.leg,vx:0,vy:0,intent:0,flightIntent:0,dir:1,grounded:true,supportId:'floor',active:true,respawnAt:null,action:null,grabbedBy:null,phase:0,cooldownUntil:0,reactionUntil:0,pushUntil:0,slimePushUntil:0};w.players=[p];return {w,p};}
function snapshot(w,p,ack=0,extra={}){return JSON.parse(JSON.stringify({...w.snapshot(),you:p.id,inputAck:ack,controller:true,prediction:{player:pack(p)},...extra,players:w.snapshot().players.map(p=>({...p,pc:100}))}));}

test('predicción comparte física real: andar, parar, salto, choque y vuelo',()=>{
 for(const mode of ['walk','stop','jump','dash','jetpack']){
  const {w,p}=server(),ctx=client(),local=new ctx.PerrilandPrediction.LocalWorld();
  if(mode==='stop')p.vx=340;else p.intent=1;
  if(mode==='jetpack')p.jetpack={id:'test',expiresAt:100};
  local.time=w.time;local.players=[JSON.parse(JSON.stringify(p))];
  if(mode==='jump'){w.jump(p.id);local.jump(p.id);}
  if(mode==='dash'){w.dash(p.id);local.dash(p.id);}
  for(let i=0;i<45;i++){w.step();local.step();const q=local.get(p.id);for(const key of ['x','y','vx','vy'])assert.ok(Math.abs(p[key]-q[key])<1e-7,mode+' '+key);}
 }
});

test('con RTT de 172 ms el personaje responde en el siguiente frame, antes de confirmación',()=>{
 const {w,p}=server(),ctx=client(),predictor=new ctx.PerrilandPrediction.Predictor();predictor.setRtt(172);
 const state=snapshot(w,p);predictor.push(state,0);predictor.record({type:'input',x:1,y:0,seq:1},1);
 const first=predictor.view(state,18);assert.ok(first.players[0].x>state.players[0].x);
 const beforeAck=predictor.view(state,100);assert.ok(beforeAck.players[0].x>first.players[0].x);
 assert.equal(beforeAck.players[0].pc,100);assert.equal(p.x,500,'El dibujo no altera el servidor');
 assert.equal(predictor.pending.length,1);
 // La confirmación descarta la orden aplicada, no la vuelve a ejecutar.
 p.intent=1;for(let i=0;i<5;i++)w.step();const confirmed=snapshot(w,p,1);predictor.push(confirmed,172);
 assert.equal(predictor.pending.length,0);assert.equal(predictor.ackMs,171);
});

test('el servidor vuelve a corregir colisiones/teletransportes y no se predicen PC ni otros jugadores',()=>{
 const {w,p}=server(),ctx=client(),predictor=new ctx.PerrilandPrediction.Predictor();
 let state=snapshot(w,p);const remote={id:'remote',x:900,y:879,active:true,pc:900};state.players.push(remote);
 predictor.push(state,0);predictor.record({type:'input',x:1,y:0,seq:1},1);let view=predictor.view(state,40);
 assert.equal(view.players[1],remote);assert.equal(view.players[0].pc,100);assert.equal(state.players[0].x,500);
 p.x=1000;state=snapshot(w,p,1);predictor.push(state,60);view=predictor.view(state,60);
 assert.equal(view.players[0].x,1000);assert.equal(view.players[0].pc,100);
});

test('otro controlador, pausa, muerte, reconexión y falta de snapshots desactivan la predicción',()=>{
 for(const mode of ['controller','pause','dead','grabbed','disconnect']){
  const {w,p}=server(),ctx=client(),predictor=new ctx.PerrilandPrediction.Predictor();const state=snapshot(w,p);
  predictor.push(state,0);predictor.record({type:'input',x:1,y:0,seq:1},1);
  if(mode==='disconnect'){assert.equal(predictor.view(state,600),state);predictor.clear();assert.equal(predictor.pending.length,0);continue;}
  const next=snapshot(w,p);if(mode==='controller')next.controller=false;if(mode==='pause')next.paused=true;if(mode==='dead')next.prediction.player.active=false;if(mode==='grabbed')next.prediction.player.grabbedBy='remote';
  predictor.push(next,50);assert.equal(predictor.enabled,false);assert.equal(predictor.pending.length,0);assert.equal(predictor.view(next,60),next);
 }
});

test('keyup y salto responden localmente; comandos arbitrarios y coords falsas no se predicen',()=>{
 const {w,p}=server(),ctx=client(),predictor=new ctx.PerrilandPrediction.Predictor();predictor.push(snapshot(w,p),0);
 predictor.record({type:'input',x:1,y:0,seq:1},1);predictor.view(snapshot(w,p),40);
 predictor.record({type:'input',x:0,y:0,seq:2},41);assert.equal(predictor.world.get(p.id).intent,0);
 predictor.record({type:'action',action:'jump',seq:3},42);assert.ok(predictor.world.get(p.id).vy<0);
 const count=predictor.pending.length;
 predictor.record({type:'reward',amount:99999,seq:4},43);predictor.record({type:'input',x:999,y:0,seq:5},43);
 assert.equal(predictor.pending.length,count);assert.equal(p.x,500);
});

test('ventana acotada: órdenes sin confirmar no crecen indefinidamente',()=>{
 const {w,p}=server(),ctx=client(),predictor=new ctx.PerrilandPrediction.Predictor();predictor.push(snapshot(w,p),0);
 for(let seq=1;seq<70;seq++)predictor.record({type:'input',x:1,y:0,seq},seq);
 assert.equal(predictor.enabled,false);assert.equal(predictor.pending.length,0);
});

test('el reloj visual no acumula segundos de retraso aunque derive su reloj',async()=>{
 const ctx=client();vm.runInContext(await readFile('games/perriland/render-timeline.js','utf8'),ctx);
 const timeline=new ctx.OverlayTimeline.Timeline({delayMs:50});
 for(let i=0;i<=90;i++)timeline.push({time:i/30,paused:false,players:[]},i*1000/30);
 timeline.offset=2000;timeline.targetOffset=2000;
 const frame=timeline.sample(3000);assert.ok(frame.time>=2.85);assert.ok(frame.time<=3);
});

test('bundle público solo contiene física; no contiene economía, sesiones ni transporte',()=>{
 assert.doesNotMatch(physics,/shop_sessions|shop_inventories|service_role|DATABASE_URL|process\.env|WebSocket|fetch\(/);
 assert.ok(physics.length<160000);assert.ok(prediction.includes('pc, identidad'));
});


test('mide confirmaciones que tardan segundos aunque la predicción ya haya caducado',()=>{
 const {w,p}=server(),ctx=client(),predictor=new ctx.PerrilandPrediction.Predictor();
 predictor.push(snapshot(w,p),0);predictor.record({type:'input',x:1,y:0,seq:1},1);
 for(let now=200;now<2000;now+=200)predictor.push(snapshot(w,p),now);
 assert.equal(predictor.pending.length,0);predictor.push(snapshot(w,p,1),2000);
 assert.equal(predictor.ackMs,1999);assert.equal(predictor.sent.size,0);
});
