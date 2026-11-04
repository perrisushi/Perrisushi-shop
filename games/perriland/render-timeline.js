/* Reloj exclusivamente visual: interpola snapshots; nunca avanza la simulación. */
(function(root){'use strict';
const lerp=(a,b,t)=>a+(b-a)*t;
function geometry(a,b,t){if(typeof a==='number'&&Number.isFinite(a)&&Number.isFinite(b))return lerp(a,b,t);if(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length)return a.map((v,i)=>geometry(v,b[i],t));if(a&&b&&typeof a==='object'&&typeof b==='object')return Object.fromEntries(Object.entries(a).map(([k,v])=>[k,geometry(v,b[k],t)]));return a;}
function entity(a,b,t){
 if(!b||a.active!==b.active||Math.hypot(a.x-b.x,a.y-b.y)>150)return a;
 const p={...a,x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)};
 for(const key of ['vx','vy','phase'])if(Number.isFinite(a[key])&&Number.isFinite(b[key]))p[key]=lerp(a[key],b[key],t);
 if(a.pose?.visible&&b.pose?.visible&&a.pose.item===b.pose.item){p.pose={...a.pose,hands:geometry(a.pose.hands,b.pose.hands,t),shape:geometry(a.pose.shape,b.pose.shape,t)};}
 return p;
}
function list(a=[],b=[],t){const byId=new Map(b.map(p=>[p.id,p]));return a.map(p=>entity(p,byId.get(p.id),t));}
function interpolate(a,b,t,time){if(t>=1||a===b)return {...b,time};return {...a,time,players:list(a.players,b.players,t),slimes:list(a.slimes,b.slimes,t),bombs:{...a.bombs,items:list(a.bombs?.items,b.bombs?.items,t)},jetpacks:{...a.jetpacks,items:list(a.jetpacks?.items,b.jetpacks?.items,t)},coin:a.coin&&b.coin?entity(a.coin,b.coin,t):a.coin,specialCoin:a.specialCoin&&b.specialCoin?entity(a.specialCoin,b.specialCoin,t):a.specialCoin};}
class Timeline{
 constructor({delayMs=100}={}){this.delayMs=delayMs;this.clear();}
 clear(){this.frames=[];this.offset=0;this.targetOffset=0;this.lastNow=null;this.lastTime=null;this.paused=false;}
 push(state,now){
  const last=this.frames.at(-1),reset=!last||state.time<last.state.time-1e-6||now-last.at>500||state.paused!==this.paused;
  if(reset||state.paused){this.frames=[{state,at:now}];this.offset=this.targetOffset=now-state.time*1000;this.lastNow=null;this.lastTime=null;this.paused=state.paused;return;}
  if(Math.abs(state.time-last.state.time)<1e-9){last.state=state;return;}
  this.targetOffset=lerp(this.targetOffset,now-state.time*1000,.05);
  this.frames.push({state,at:now});if(this.frames.length>32)this.frames.shift();
 }
 sample(now){
  if(!this.frames.length)return {state:null};const first=this.frames[0],last=this.frames.at(-1);
  if(this.paused){this.lastNow=now;this.lastTime=last.state.time;return {state:last.state,time:last.state.time,alpha:1,buffering:false};}
  const elapsed=this.lastNow===null?0:Math.max(0,now-this.lastNow);this.lastNow=now;
  // Corrige la deriva suavemente (máximo 2 %), sin saltar al llegar un paquete.
  const correction=elapsed*.02;this.offset+=Math.max(-correction,Math.min(correction,this.targetOffset-this.offset));
  const desired=(now-this.offset-this.delayMs)/1000;
  const time=Math.min(last.state.time,Math.max(first.state.time,this.lastTime??first.state.time,desired));this.lastTime=time;
  let i=0;while(i<this.frames.length-1&&this.frames[i+1].state.time<time)i++;
  const a=this.frames[i].state,b=this.frames[Math.min(i+1,this.frames.length-1)].state;
  const t=b.time>a.time?Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time))):1;
  return {state:interpolate(a,b,t,time),time,alpha:t,buffering:time>=last.state.time&&last.state.time-first.state.time>.1};
 }
}
const api={Timeline,interpolate};root.OverlayTimeline=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
