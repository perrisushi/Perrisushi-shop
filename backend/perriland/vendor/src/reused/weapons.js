/* Equipamiento, poses e impactos sobre el único motor físico existente. */
(function(root){'use strict';
const scene=require('../config/scene.cjs');
const ITEMS=Object.freeze([
 {id:'none',name:'Sin objeto',type:'none',visual:'none',grips:0,durationKey:null,zone:'none',impulseKey:null},
 {id:'sword',name:'Espada',type:'melee',visual:'sword',grips:1,durationKey:'swordDuration',zone:'blade',impulseKey:'swordImpulse'},
 {id:'shield',name:'Escudo',type:'defense',visual:'shield',grips:2,durationKey:null,zone:'front',impulseKey:null},
 {id:'pistol',name:'Pistola',type:'projectile',visual:'pistol',grips:2,durationKey:'pistolDuration',zone:'projectile',impulseKey:'projectileImpulse'},
 {id:'spear',name:'Lanza',type:'melee',visual:'spear',grips:2,durationKey:'spearDuration',zone:'tip',impulseKey:'spearImpulse'}
].map(Object.freeze));
const DEFAULTS=Object.freeze({swordImpulse:240,spearImpulse:280,projectileImpulse:220,projectileSpeed:550,fireInterval:.5,swordDuration:.5,spearDuration:.5,pistolDuration:.16});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
const point=(p,x,y)=>({x:p.x+p.dir*x,y:p.y+y});
const distanceSegment=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/d,0,1):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)};
function segmentBox(a,b,box,pad=0){let lo=0,hi=1;for(const axis of ['x','y']){const d=b[axis]-a[axis],min=box[axis]-pad,max=box[axis]+box[axis==='x'?'w':'h']+pad;if(Math.abs(d)<1e-10){if(a[axis]<min||a[axis]>max)return null;}else{let t1=(min-a[axis])/d,t2=(max-a[axis])/d;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)return null;}}return lo;}
function segmentCircle(a,b,c,r){const x=a.x-c.x,y=a.y-c.y,dx=b.x-a.x,dy=b.y-a.y,cc=x*x+y*y-r*r;if(cc<=0)return 0;const aa=dx*dx+dy*dy;if(!aa)return null;const bb=2*(x*dx+y*dy),disc=bb*bb-4*aa*cc;if(disc<0)return null;const t=(-bb-Math.sqrt(disc))/(2*aa);return t>=0&&t<=1?t:null;}
function solids(w){const s=w.scene;return [{x:0,y:0,w:16,h:s.height},{x:s.width-16,y:0,w:16,h:s.height},{x:0,y:-20,w:s.width,h:20},{...s.floor},...w.platforms];}
function blocked(w,a,b,pad=0){return solids(w).some(q=>segmentBox(a,b,q,pad)!==null);}
function pose(p,item,attack,time){
 const visible=item!=='none'&&!['grab','climb','ladder'].includes(p.action?.type);if(!visible)return {visible:false,item,hands:[],phase:item==='none'?'sin objeto':'manos ocupadas'};
 const active=attack?.item===item,progress=active?clamp((time-attack.started)/attack.duration,0,1):0;
 let hands=[],shape={},hit=null,phase='reposo';
 if(item==='sword'){
  let angle=-.85;if(active){if(progress<.24){phase='preparación';angle=mix(-.85,-Math.PI/2,progress/.24)}else if(progress<.68){phase='golpe';angle=mix(-Math.PI/2,1.05,(progress-.24)/.44)}else{phase='recuperación';angle=mix(1.05,-.85,(progress-.68)/.32)}}
  const hand=point(p,18+Math.cos(angle)*28,-8+Math.sin(angle)*28),axis={x:p.dir*Math.cos(angle),y:Math.sin(angle)},base={x:hand.x+axis.x*7,y:hand.y+axis.y*7},tip={x:hand.x+axis.x*48,y:hand.y+axis.y*48};hands=[hand,point(p,-36,14)];shape={hand,axis,base,tip};if(phase==='golpe')hit={kind:'blade',a:base,b:tip,r:4};
 }else if(item==='shield'){
  hands=[point(p,36,-13),point(p,36,13)];shape={x:p.x+p.dir*42,y:p.y,w:20,h:56};hit={kind:'shield',x:shape.x-10,y:p.y-28,w:20,h:56};
 }else if(item==='pistol'){
  const recoil=active?Math.sin(progress*Math.PI)*5:0;hands=[point(p,28-recoil,5),point(p,43-recoil,-3)];shape={back:point(p,26-recoil,-9),front:point(p,65-recoil,-9),grip:point(p,31-recoil,5),muzzle:point(p,65-recoil,-4)};phase=active?'retroceso':'reposo';
 }else if(item==='spear'){
  let extension=0;if(active){if(progress<.24){phase='preparación';extension=mix(0,-12,progress/.24)}else if(progress<.6){phase='estocada';extension=mix(-12,34,(progress-.24)/.36)}else{phase='recuperación';extension=mix(34,0,(progress-.6)/.4)}}
  hands=[point(p,12+extension,4),point(p,42+extension,4)];shape={back:point(p,-12+extension,4),tip:point(p,112+extension,4),shaftEnd:point(p,101+extension,4)};if(phase==='estocada')hit={kind:'tip',center:shape.tip,r:6};
 }
 return {visible,item,hands,shape,hit,phase,progress};
}
class System{
 constructor(world){this.world=world;this.item='none';this.pending=null;this.attack=null;this.projectiles=[];this.nextShot=0;this.showZones=false;this.metrics={hits:0,blocks:0,shots:0};this.log=[];}
 reset(){this.attack=null;this.pending=null;this.projectiles=[];this.nextShot=0;this.metrics={hits:0,blocks:0,shots:0};this.log=[];}
 equip(item,id='you'){if(id!=='you'||!ITEMS.some(q=>q.id===item))return false;if(this.attack){this.pending=item;return true}this.item=item;this.pending=null;return true;}
 getPose(p=this.world.get('you'),time=this.world.time){const v=pose(p,p.id==='you'?this.item:'none',p.id==='you'?this.attack:null,time);if(!v.visible)return v;const s=scene.characterScale,point=q=>({x:p.x+(q.x-p.x)*s,y:p.y+(q.y-p.y)*s});v.hands=v.hands.map(point);for(const [key,q]of Object.entries(v.shape)){if(key==='axis')continue;if(q&&typeof q==='object'&&'x'in q)v.shape[key]=point(q);}if(v.hit){for(const key of ['a','b','center'])if(v.hit[key])v.hit[key]=point(v.hit[key]);if(v.hit.r)v.hit.r*=s;}return v;}
 use(id='you'){
  const w=this.world,p=w.get(id);if(w.paused||id!=='you'||!p||p.action||this.attack||['none','shield'].includes(this.item))return false;
  if(this.item==='pistol'&&w.time+1e-9<this.nextShot)return false;
  const item=ITEMS.find(q=>q.id===this.item),duration=clamp(w.config[item.durationKey],.08,2);
  this.attack={item:this.item,started:w.time,duration,until:w.time+duration,hits:new Set(),serial:++w.serial};
  if(this.item==='pistol'){
   const muzzle=this.getPose().shape.muzzle,b={id:++w.serial,owner:'you',x:muzzle.x,y:muzzle.y,dir:p.dir,r:5,speed:clamp(w.config.projectileSpeed,50,2000),travelled:0,maxRange:900};
   this.nextShot=w.time+clamp(w.config.fireInterval,.1,2);this.metrics.shots++;
   const from=point(p,28,-4);if(!this.traceBullet(b,from,muzzle))this.projectiles.push(b);
  }w.event(p.name+' usa '+item.name.toLowerCase());return true;
 }
 finishEquip(){if(this.pending!==null){this.item=this.pending;this.pending=null;}}
 frontShield(p,source){const s=this.getPose(p);return s.visible&&s.item==='shield'&&(source.x-p.x)*p.dir>0&&Math.abs(source.y-p.y)<55;}
 applyImpulse(p,vx,vy,source,serial,kind){
  if(p.kind==='slime'&&['sword','spear','projectile'].includes(kind)&&!this.world.receiveOffensiveImpact(p,{id:serial,kind,source}))return false;
  const shield=this.frontShield(p,source);if(shield&&kind!=='dash'){this.record(p,kind,true,serial);return false;}
  if(['climb','ladder'].includes(p.action?.type))this.world.release(p,'suelta el borde por el impacto');
  const factor=shield?.2:1;p.vx=clamp(p.vx+vx*factor,-850,850);p.vy=clamp(p.vy+vy*factor,-750,this.world.config.fallSpeed);this.world.react(p,serial);this.record(p,kind,shield,serial);return true;
 }
 record(p,kind,blocked,serial){if(blocked)this.metrics.blocks++;else this.metrics.hits++;this.log.push({time:this.world.time,target:p.id,kind,blocked,serial});if(this.log.length>100)this.log.shift();}
 shieldContact(a,b){
  let p,q;for(const pair of [[a,b],[b,a]]){if(this.getPose(pair[0]).item==='shield'&&this.getPose(pair[0]).visible){[p,q]=pair;break}}if(!p||!this.frontShield(p,q))return;
  const z=this.getPose(p).hit,closest={x:clamp(q.x,z.x,z.x+z.w),y:clamp(q.y,z.y,z.y+z.h)},dx=q.x-closest.x,dy=q.y-closest.y,d=Math.hypot(dx,dy);if(d>=28||d<.001)return;
  const nx=dx/d,ny=dy/d,mp=['climb','ladder'].includes(p.action?.type)?0:.2,mq=['climb','ladder'].includes(q.action?.type)?0:1,sum=mp+mq;if(!sum)return;const depth=28-d;
  p.x-=nx*depth*mp/sum;p.y-=ny*depth*mp/sum;q.x+=nx*depth*mq/sum;q.y+=ny*depth*mq/sum;
  const relative=(q.vx-p.vx)*nx+(q.vy-p.vy)*ny;if(relative<0){const j=-relative/sum;p.vx-=nx*j*mp;p.vy-=ny*j*mp;q.vx+=nx*j*mq;q.vy+=ny*j*mq;}
  // El escudo intercepta la embestida antes de que alcance el círculo del defensor.
  if(q.action?.type==='dash'&&!q.action.hits.has(p.id)){q.action.hits.add(p.id);this.applyImpulse(p,q.action.dir*this.world.config.dashImpulse,0,q,q.action.serial,'dash');this.world.metrics.dashHits++;}
 }
 traceBullet(b,from,to){
  const events=[];for(const box of solids(this.world)){const t=segmentBox(from,to,box,b.r);if(t!==null)events.push({t,kind:'solid'});}
  for(const p of this.world.players){if(p.id===b.owner)continue;
   if(this.frontShield(p,from)){const z=this.getPose(p).hit,t=segmentBox(from,to,z,b.r);if(t!==null)events.push({t,kind:'shield',p});}
   const t=segmentCircle(from,to,p,this.world.radiusOf(p)+b.r);if(t!==null)events.push({t,kind:'avatar',p});
  }events.sort((a,b)=>a.t-b.t||({solid:0,shield:1,avatar:2}[a.kind]-{solid:0,shield:1,avatar:2}[b.kind]));
  const event=events[0];if(!event)return false;
  if(event.kind==='shield')this.record(event.p,'projectile',true,b.id);
  else if(event.kind==='avatar')this.applyImpulse(event.p,b.dir*this.world.config.projectileImpulse,-this.world.config.projectileImpulse*.12,from,b.id,'projectile');
  return true;
 }
 update(dt){
  const w=this.world,p=w.get('you');if(this.attack){
   {
    const attack=this.attack,now=this.getPose();
    if(now.hit&&['blade','tip'].includes(now.hit.kind))for(const target of w.players){
     if(target===p||attack.hits.has(target.id)||(target.x-p.x)*p.dir<=0)continue;
     const samples=8;let touched=false;
     for(let i=0;i<=samples&&!touched;i++){
      const view=this.getPose(p,w.time-dt+dt*i/samples),z=view.hit;if(!z)continue;
      const contact=z.kind==='blade'?{x:(z.a.x+z.b.x)/2,y:(z.a.y+z.b.y)/2}:z.center;
      // Segmento corto o punta actual: nunca convierte todo el asta en zona de impacto.
      const hit=z.kind==='blade'?distanceSegment(target,z.a,z.b)<=this.world.radiusOf(target)+z.r:Math.hypot(target.x-z.center.x,target.y-z.center.y)<=this.world.radiusOf(target)+z.r;
      if(hit&&!blocked(w,p,contact,2)&&!blocked(w,contact,target,0))touched=true;
     }
     if(touched){attack.hits.add(target.id);const amount=w.config[ITEMS.find(q=>q.id===attack.item).impulseKey];this.applyImpulse(target,p.dir*amount,-amount*(attack.item==='sword'?.25:.1),p,attack.serial,attack.item);}
    }
    if(w.time+1e-9>=attack.until){this.attack=null;this.finishEquip();}
   }
  }
  const live=[];for(const b of this.projectiles){const distance=Math.min(b.speed*dt,b.maxRange-b.travelled),from={x:b.x,y:b.y},to={x:b.x+b.dir*distance,y:b.y};b.travelled+=distance;if(this.traceBullet(b,from,to))continue;b.x=to.x;if(b.travelled<b.maxRange-1e-8)live.push(b);}this.projectiles=live;
 }
}
const api={ITEMS,DEFAULTS,pose,System,segmentBox,segmentCircle,distanceSegment,blocked};root.SalaWeapons=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
