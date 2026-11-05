/* Predicción exclusivamente visual del personaje propio. El servidor decide posición y PC. */
(function(root){'use strict';
const {World,STEP,scene,JetpackSystem}=root.PerrilandPhysics;
function decode(v){if(Array.isArray(v))return v.map(decode);if(v&&typeof v==='object'){if(v.$set)return new Set(v.$set.map(decode));if(v.$number)return Number(v.$number);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)]));}return v;}
class LocalWorld extends World{
 constructor(){super({config:scene.physics,rng:()=>.5});this.botsEnabled=false;this.players=[];this.platforms=scene.terrain.map(p=>({...p}));this.jetpacks=new JetpackSystem(this);}
 think(){} bounds(){} ladder(){return false;} ladderCorridor(){return false;}
 bodies(){return this.players.filter(p=>p.active!==false);}
 freeAt(x,y,avatars=false,self=null){return Number.isFinite(x+y)&&!this.platforms.some(q=>this.terrainOverlap(x,y,q,self))&&(!avatars||!this.bodies().some(q=>q!==self&&Math.hypot(q.x-x,q.y-y)<this.radiusOf(self)+this.radiusOf(q)+.1*scene.characterScale));}
 propulsion(p,dt){return this.jetpacks.control(p,dt);}
 bodyContactMultipliers(a,b,nx,ny){return this.jetpacks.multipliers(a,b,nx,ny);}
 jump(id){if(this.jetpacks.active(this.get(id)))return false;return super.jump(id);}
}
function translate(value,dx,dy){if(Array.isArray(value))return value.map(v=>translate(v,dx,dy));if(value&&typeof value==='object'){if(Number.isFinite(value.x)&&Number.isFinite(value.y))return {...value,x:value.x+dx,y:value.y+dy};return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='axis'?v:translate(v,dx,dy)]));}return value;}
class Predictor{
 constructor(){this.oneWayMs=86;this.clear();}
 clear(){this.world=null;this.pending=[];this.sent=new Map();this.latest=null;this.id=null;this.enabled=false;this.receivedAt=0;this.at=0;this.correction={x:0,y:0};this.lastViewAt=0;this.ackMs=null;}
 setRtt(ms){if(Number.isFinite(ms)&&ms>=0)this.oneWayMs=Math.min(150,ms/2);}
 apply(body){const p=this.world?.get(this.id);if(!p?.active)return;if(body.type==='input'){p.intent=body.x;p.flightIntent=body.y;}else if(body.type==='action'&&['jump','dash'].includes(body.action))this.world[body.action](this.id);}
 advance(now){if(!this.enabled||!this.world)return;const target=Math.min(now,this.receivedAt+150);let steps=0;while(this.at+STEP*1000<=target+1e-6&&steps++<24){this.world.step(STEP);this.at+=STEP*1000;}const p=this.world.get(this.id);if(!p||![p.x,p.y,p.vx,p.vy].every(Number.isFinite)){this.enabled=false;this.pending=[];}}
 record(body,now){if(Number.isSafeInteger(body.seq)&&['input','action','equip'].includes(body.type)){this.sent.set(body.seq,now);for(const [seq,at]of this.sent)if(now-at>10000||this.sent.size>128)this.sent.delete(seq);}
 if(!this.enabled||now-this.receivedAt>500||!Number.isSafeInteger(body.seq))return;
 if(body.type==='input'&&(![-1,0,1].includes(body.x)||![-1,0,1].includes(body.y)))return;
 if(body.type!=='input'&&!(body.type==='action'&&['jump','dash'].includes(body.action)))return;
 if(this.pending.length>=64){this.enabled=false;this.pending=[];return;}
 this.advance(now);this.pending.push({body:{...body},at:now});this.apply(body);
 }
 push(state,now){
 const raw=state.prediction?.player,previous=this.world?.get(this.id),previousState=this.latest;
 const reset=!previousState||state.you!==this.id||state.time<previousState.time||now-this.receivedAt>500||state.paused!==previousState.paused||raw?.active!==previous?.active;
 this.advance(now);const old=previous?{x:previous.x+this.correction.x,y:previous.y+this.correction.y}:null;
 if(reset)this.pending=[];
 const acknowledged=[...this.sent].filter(([seq])=>seq<=state.inputAck);if(acknowledged.length)this.ackMs=now-acknowledged[acknowledged.length-1][1];for(const [seq]of acknowledged)this.sent.delete(seq);
 this.pending=this.pending.filter(input=>input.body.seq>state.inputAck&&now-input.at<=500);
 this.latest=state;this.id=state.you;this.receivedAt=now;
 this.enabled=!!raw&&Number.isSafeInteger(state.inputAck)&&state.controller!==false&&!state.paused&&raw.active&&!raw.grabbedBy&&!['grab','climb','ladder'].includes(raw.action?.type);
 if(!this.enabled){this.world=null;this.pending=[];this.correction={x:0,y:0};return;}
 const world=new LocalWorld();world.time=state.time;
 const opponents=[...(state.players||[]),...(state.slimes||[])].filter(p=>p.id!==this.id&&p.active!==false&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.hypot(p.x-raw.x,p.y-raw.y)<800).sort((a,b)=>Math.hypot(a.x-raw.x,a.y-raw.y)-Math.hypot(b.x-raw.x,b.y-raw.y)).slice(0,12).map(p=>({...decode(p),vx:Number.isFinite(p.vx)?p.vx:0,vy:Number.isFinite(p.vy)?p.vy:0,leg:p.kind==='slime'||(state.slimes||[]).some(s=>s.id===p.id)?0:p.leg,intent:p.intent??0,flightIntent:p.flightIntent??0,action:null,phase:p.phase??0,cooldownUntil:p.cooldownUntil??0}));
 const player=decode(raw);if(player.action?.type==='dash')player.action.hits??=new Set();
 world.players=[player,...opponents];this.world=world;
 const start=Math.max(now-250,Math.min(now-this.oneWayMs,this.pending[0]?.at??now));this.at=start;
 for(const input of this.pending){this.advance(Math.max(this.at,input.at));this.apply(input.body);}
 this.advance(now);
 const p=world.get(this.id),distance=old?Math.hypot(old.x-p.x,old.y-p.y):Infinity;
 this.correction=!reset&&distance<80?{x:old.x-p.x,y:old.y-p.y}:{x:0,y:0};this.lastViewAt=now;
 }
 view(view,now){if(!view||!this.enabled||now-this.receivedAt>500)return view;this.advance(now);if(!this.enabled)return view;
 const p=this.world.get(this.id),base=this.latest.players.find(q=>q.id===this.id);if(!p||!base)return view;
 const elapsed=Math.max(0,now-this.lastViewAt);this.lastViewAt=now;const decay=Math.exp(-elapsed/65);this.correction.x*=decay;this.correction.y*=decay;
 const x=p.x+this.correction.x,y=p.y+this.correction.y,dx=x-base.x,dy=y-base.y;
 // Lista explícita: nunca sustituir pc, identidad, cosméticos, monedas, recibos ni otros jugadores.
 const local={...base,x,y,vx:p.vx,vy:p.vy,dir:p.dir,grounded:p.grounded,supportId:p.supportId,phase:p.phase,action:p.action,pose:base.pose?translate(base.pose,dx,dy):base.pose};
 return {...view,players:view.players.map(q=>q.id===this.id?local:q)};
 }
}
root.PerrilandPrediction={Predictor,LocalWorld};root.perrilandPrediction=new Predictor();
})(globalThis);
