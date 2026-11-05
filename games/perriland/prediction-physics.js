/* Generado desde la física pura de PERRILAND. Sin red ni economía. */
(function(root){
const modules={"src/config/scene.cjs":function(module,exports,require){
'use strict';
const characterScale=1.5;
const terrain=[
 {id:'low',name:'Plataforma izquierda',x:81,y:566,w:337,h:121},
 {id:'high',name:'Plataforma derecha',x:1544,y:321,w:345,h:117},
 {id:'floor',name:'Suelo principal',x:91,y:954,w:1738,h:126}
];
module.exports={width:1920,height:1080,port:8792,host:'127.0.0.1',targetFps:60,snapshotFps:30,
 bombExplosion:{radius:220,radialSpeed:1400,liftSpeed:1200,speedLimitMultiplier:2,reactionDuration:.35},
 characterScale,radius:28*characterScale,leg:22*characterScale,terrain,floor:terrain[2],platforms:terrain.slice(0,2),ladder:{},
 respawnDelay:3,respawnCenterX:960,respawnVariation:120*characterScale,killY:1220,
 physics:{walkSpeed:340,acceleration:1600,jumpSpeed:898.47,gravity:1400,fallSpeed:900,dashSpeed:480,grabRange:75*characterScale,climbRange:88*characterScale},
 coinRadius:27.3,coinMinDelay:30,coinMaxDelay:60,coinLifetime:Infinity,coinPoints:5,specialCoinScale:2.25,specialCoinPoints:20,specialCoinInterval:150,voidPenalty:2,flagDuration:5,
 maxParticles:72,maxActiveCoins:1,inputLease:700,
 image:{width:1920,height:1080,src:'/assets/terreno/plataformas.png'}};

},
"src/reused/scene.js":function(module,exports,require){
module.exports=require('../config/scene.cjs');

},
"src/reused/weapons.js":function(module,exports,require){
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

},
"src/reused/engine.cjs":function(module,exports,require){
/* Motor local puro. Sin DOM, red ni dependencias. */
(function (root) {
'use strict';
const Weapons=root.SalaWeapons||(typeof require==='function'?require('./weapons.js'):null);
const SCENE=root.SalaScene||(typeof require==='function'?require('./scene.js'):null);
const WIDTH=SCENE.width,HEIGHT=SCENE.height,RADIUS=SCENE.radius,LEG=SCENE.leg,FLOOR=SCENE.floor.y,WALL=16,GROUND=FLOOR-RADIUS-LEG,STEP=1/60;
const SCALE=SCENE.characterScale||1,DIAMETER=RADIUS*2;
const DEFAULTS=Object.freeze({...Weapons.DEFAULTS,walkSpeed:190,acceleration:1200,gravity:1100,jumpSpeed:430,fallSpeed:650,dashSpeed:340,dashImpulse:260,dashDuration:.35,dashCooldown:.6,grabRange:75,grabDuration:2.5,reactionDuration:.45,friction:3.2,contactStrength:.9,contactStability:.8,avatarFriction:1.2,climbRange:88,climbDuration:.7,ladderSpeed:110});
const PLATFORMS=Object.freeze(SCENE.platforms.map(p=>Object.freeze({...p})));
const starts=[{id:'you',name:'Tú',color:'#41bc72',x:160,tickets:0},{id:'juan',name:'Juanito',color:'#e95b60',x:380,tickets:3},{id:'pepe',name:'Pepito',color:'#e95b60',x:452,tickets:2},{id:'maria',name:'María',color:'#e95b60',x:524,tickets:1}];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const approach=(v,target,amount)=>v<target?Math.min(target,v+amount):Math.max(target,v-amount);
function uniformIndex(total,source=root.crypto){
 if(!Number.isSafeInteger(total)||total<=0||total>4294967296)throw Error('Total de boletos inválido');
 if(!source?.getRandomValues)throw Error('El navegador no dispone de un generador aleatorio seguro.');
 const cutoff=Math.floor(4294967296/total)*total,buffer=new Uint32Array(1);let n;
 do{source.getRandomValues(buffer);n=buffer[0]}while(n>=cutoff);
 return n%total;
}
function drawTicket(users,pick=uniformIndex){
 const eligible=users.filter(p=>Number.isSafeInteger(p.tickets)&&p.tickets>0);
 const total=eligible.reduce((n,p)=>n+p.tickets,0);if(total===0)return null;
 if(!Number.isSafeInteger(total)||total>4294967296)throw Error('Demasiados boletos');
 const ticket=pick(total);if(!Number.isInteger(ticket)||ticket<0||ticket>=total)throw Error('Boleto inválido');
 let cursor=ticket;for(const p of eligible){if(cursor<p.tickets)return {id:p.id,name:p.name,ticket:ticket+1,total};cursor-=p.tickets}
 throw Error('No se pudo resolver el boleto');
}
class World {
 constructor(options={}){this.config={...DEFAULTS,...options.config};this.rng=options.rng||Math.random;this.botsEnabled=true;this.time=0;this.serial=0;this.paused=false;this.events=[];this.metrics={dashHits:0,collisions:0,chains:0,grabs:0,releases:0,recoveries:0};this.scene=SCENE;this.ladderZone={...SCENE.ladder};this.platforms=PLATFORMS.map(p=>({...p}));this.players=starts.map(p=>({...p}));this.equipment=new Weapons.System(this);this.reset();}
 reset(){this.equipment.reset();Object.assign(this.metrics,{dashHits:0,collisions:0,chains:0,grabs:0,releases:0,recoveries:0});for(let i=0;i<this.players.length;i++){const p=this.players[i];Object.assign(p,{x:starts[i].x,y:GROUND,vx:0,vy:0,dir:1,intent:0,grounded:true,supportId:null,action:null,grabbedBy:null,reactionUntil:0,reactionSource:null,pushUntil:0,cooldownUntil:0,nextThink:1+this.rng()*2,phase:0,invalidLinkTime:0,ladderIntent:0,ladderPhase:0,ladderPass:false});}this.time=0;this.events=[];this.contacts=new Set();this.lastEvent='Personajes reiniciados';}
 equip(item,id='you'){return this.equipment.equip(item,id)}
 use(id='you'){return this.equipment.use(id)}
 get(id){return typeof id==='string'?this.players.find(p=>p.id===id):id;}
 event(text){this.lastEvent=text;this.events.push({time:this.time,text});if(this.events.length>12)this.events.shift();}
 radiusOf(p){return p?.radius??RADIUS;}
 legOf(p){return p?.leg??LEG;}
 solid(p){return Boolean(p);}
 state(id='you'){const p=this.get(id);if(p.action?.type==='ladder')return 'CLIMB_LADDER';if(p.action?.type==='climb')return this.time-p.action.started<.12?'AGARRADO AL BORDE':'TREPANDO';if(p.action?.type==='grab')return 'AGARRANDO USUARIO';if(p.action?.type==='dash')return 'CHOCANDO';return p.grounded?'NORMAL':p.vy< -5?'SALTANDO':p.vy>5?'CAYENDO':'NORMAL';}
 setBots(on){this.botsEnabled=Boolean(on);if(!on)for(const p of this.players.slice(1))p.intent=0;}
 jump(id='you'){const p=this.get(id);if(p?.action?.type==='ladder'){this.release(p,'salta de la escalera');p.vy=-this.config.jumpSpeed;p.grounded=false;p.supportId=null;p.ladderIntent=0;return true;}if(!p||!p.grounded||p.action?.type==='climb')return false;p.vy=-this.config.jumpSpeed;p.grounded=false;p.supportId=null;return true;}
 dash(id='you'){const p=this.get(id);if(!p||p.action||this.time<p.cooldownUntil)return false;p.action={type:'dash',until:this.time+this.config.dashDuration,dir:p.dir,hits:new Set(),serial:++this.serial};p.vx=p.dir*this.config.dashSpeed;p.cooldownUntil=this.time+this.config.dashDuration+this.config.dashCooldown;this.event(p.name+' embiste');return true;}
 grab(id='you'){
  const p=this.get(id);if(!p||p.action)return false;
  const candidates=this.players.filter(q=>q!==p&&!q.grabbedBy&&!['climb','ladder'].includes(q.action?.type)&&Math.hypot(q.x-p.x,q.y-p.y)<=this.config.grabRange).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
  let q=candidates[0];if(!q)return false;
  // Evitar un ciclo de vínculos: no se cambian posiciones ni velocidades.
  let ancestor=p;const seen=new Set();while(ancestor?.grabbedBy){if(seen.has(ancestor.id))return false;seen.add(ancestor.id);ancestor=this.get(ancestor.grabbedBy);if(ancestor===q)return false;}
  const distance=Math.hypot(q.x-p.x,q.y-p.y);
  p.action={type:'grab',target:q.id,until:this.time+clamp(this.config.grabDuration,2,3),rest:clamp(distance,this.radiusOf(p)+this.radiusOf(q),75*SCALE),max:Math.max(84*SCALE,distance+10*SCALE),serial:++this.serial};q.grabbedBy=p.id;p.invalidLinkTime=0;this.metrics.grabs++;this.event(p.name+' agarra a '+q.name);return true;
 }
 release(p,reason='suelta el agarre'){
  if(p.action?.type==='grab'){const q=this.get(p.action.target);if(q?.grabbedBy===p.id)q.grabbedBy=null;this.metrics.releases++;this.event(p.name+' '+reason);}
  if(p.action?.type==='ladder'){p.ladderPass=true;p.ladderIntent=0;p.vx=p.vy=0;}
  p.action=null;p.invalidLinkTime=0;
 }
 bounds(p){
  if(p.x<WALL+RADIUS){p.x=WALL+RADIUS;if(p.vx<0)p.vx=0;}
  if(p.x>WIDTH-WALL-RADIUS){p.x=WIDTH-WALL-RADIUS;if(p.vx>0)p.vx=0;}
  if(p.y<RADIUS){p.y=RADIUS;if(p.vy<0)p.vy=0;}
  if(p.y>=GROUND){p.y=GROUND;if(p.vy>0)p.vy=0;p.grounded=true;}
 }
 think(p){
  if(!this.botsEnabled)return;
  if(this.time<p.nextThink)return;p.nextThink=this.time+1+this.rng()*2;
  const choice=this.rng();p.intent=choice<.3?-1:choice<.6?1:0;if(p.intent)p.dir=p.intent;
  if(this.rng()<.25)this.jump(p);
  const near=this.players.some(q=>q!==p&&Math.hypot(q.x-p.x,q.y-p.y)<120);
  if(near&&!p.action){const action=this.rng();if(action<.25)this.grab(p);else if(action<.5)this.dash(p);}
 }
 tether(p,dt,project=false){
  const a=p.action;if(a?.type!=='grab')return;const q=this.get(a.target);
  if(!q||q.grabbedBy!==p.id){this.release(p);return;}
  const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);if(!Number.isFinite(d)){this.release(p);return;}if(d<.001)return;
  const nx=dx/d,ny=dy/d,stretch=d-a.rest;
  if(!project&&stretch>0){const relative=(q.vx-p.vx)*nx+(q.vy-p.vy)*ny,force=clamp(36*stretch+8*relative,0,1800);q.vx-=nx*force*dt;q.vy-=ny*force*dt;p.vx+=nx*force*dt*.35;p.vy+=ny*force*dt*.35;}
  if(project&&d>a.max){const correction=Math.min(4,(d-a.max)*.55);p.x+=nx*correction*.3;p.y+=ny*correction*.3;q.x-=nx*correction*.7;q.y-=ny*correction*.7;this.bounds(p);this.bounds(q);}
 }
 react(p,source){p.reactionUntil=Math.max(p.reactionUntil,this.time+this.config.reactionDuration);p.reactionSource=source;p.pushUntil=this.time+.16;}
 // El cuerpo conserva su círculo; una pequeña zona superior estabiliza apoyos centrados.
 collide(a,b,next,allowImpact,dt){
  const RADIUS=Math.min(this.radiusOf(a),this.radiusOf(b)),DIAMETER=this.radiusOf(a)+this.radiusOf(b);
  this.equipment.shieldContact(a,b);
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>DIAMETER+.15*SCALE)return;
  const upper=dy>0?a:b,lower=dy>0?b:a;
  const support=Math.abs(dx)<RADIUS*clamp(this.config.contactStability,.1,1)&&Math.abs(dy)>DIAMETER*5/7;
  let nx=support?0:d>.001?dx/d:(a.id<b.id?1:-1),ny=support?Math.sign(dy):d>.001?dy/d:0;
  const depth=support?DIAMETER-Math.abs(dy):DIAMETER-d,key=[a.id,b.id].sort().join(':');next.add(key);
  if(allowImpact){for(const [p,q]of [[a,b],[b,a]])if(p.action?.type==='dash'&&!p.action.hits.has(q.id)){
   p.action.hits.add(q.id);if(q.action?.type==='climb')this.release(q,'suelta el borde por el impacto');this.equipment.applyImpulse(q,p.action.dir*this.config.dashImpulse,0,p,p.action.serial,'dash');p.pushUntil=this.time+.16;this.metrics.dashHits++;this.event(p.name+' impacta contra '+q.name);
  }}
  const ma=['climb','ladder'].includes(a.action?.type)?0:1,mb=['climb','ladder'].includes(b.action?.type)?0:1,sum=ma+mb;if(!sum)return;
  const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
  if(relative<0){const j=-relative/sum,horizontalScale=nx!==0?(this.horizontalContactScale?.(a,b)??1):1; const boost=!support?(this.bodyContactMultipliers?.(a,b,nx,ny)??{a:1,b:1}):{a:1,b:1};a.vx-=nx*j*ma*horizontalScale*boost.a;a.vy-=ny*j*ma*boost.a;b.vx+=nx*j*mb*horizontalScale*boost.b;b.vy+=ny*j*mb*boost.b;
   if(allowImpact&&relative< -20&&!this.contacts.has(key)){const source=a.action?.serial||b.action?.serial||a.reactionSource||b.reactionSource||++this.serial;this.react(a,source);this.react(b,source);this.metrics.collisions++;if(!a.action&&!b.action)this.metrics.chains++;}
  }
  if(support){const transfer=clamp(lower.vx-upper.vx,-this.config.avatarFriction*this.config.gravity*dt,this.config.avatarFriction*this.config.gravity*dt);upper.vx+=transfer;lower.vx-=transfer;}
  const correction=Math.max(0,depth-.002)*clamp(this.config.contactStrength,.2,1);a.x-=nx*correction*ma/sum;a.y-=ny*correction*ma/sum;b.x+=nx*correction*mb/sum;b.y+=ny*correction*mb/sum;
 }
 // El apoyo se decide por la proyección central de los pies, no por el ancho del cuerpo.
 terrainSupports(p,q){return p.x>=q.x&&p.x<=q.x+q.w;}
 terrainOverlap(x,y,q,body=null){const RADIUS=this.radiusOf(body),LEG=this.legOf(body);if(!this.terrainSupports({x},q)){const dx=x-clamp(x,q.x,q.x+q.w),dy=y-clamp(y,q.y,q.y+q.h);return dx*dx+dy*dy<RADIUS*RADIUS-.001;}return x+RADIUS>q.x+.001&&x-RADIUS<q.x+q.w-.001&&y+RADIUS+LEG>q.y+.001&&y-RADIUS<q.y+q.h-.001;}
 // Plataformas de volumen completo: lados, techo y superficie de apoyo de los pies.
 environment(p,previous=p){
  const RADIUS=this.radiusOf(p),LEG=this.legOf(p);
  this.bounds(p);
  for(const q of this.platforms){
   if(this.ladderCorridor(p,q))continue;
   if(!this.terrainSupports(p,q)){
    // Fuera del apoyo: las piernas no crean una repisa. El círculo puede rozar el canto y deslizarse.
    const cx=clamp(p.x,q.x,q.x+q.w),cy=clamp(p.y,q.y,q.y+q.h),dx=p.x-cx,dy=p.y-cy,d=Math.hypot(dx,dy);
    if(d>0&&d<RADIUS){const nx=dx/d,ny=dy/d,depth=RADIUS-d;p.x+=nx*depth;p.y+=ny*depth;const normalSpeed=p.vx*nx+p.vy*ny;if(normalSpeed<0){p.vx-=normalSpeed*nx;p.vy-=normalSpeed*ny;}}
    continue;
   }
   if(p.x+RADIUS<=q.x||p.x-RADIUS>=q.x+q.w||p.y+RADIUS+LEG<=q.y||p.y-RADIUS>=q.y+q.h)continue;
   if(previous.y+RADIUS+LEG<=q.y+.05){p.y=q.y-RADIUS-LEG;if(p.vy>0)p.vy=0;}
   else if(previous.y-RADIUS>=q.y+q.h-.05){p.y=q.y+q.h+RADIUS;if(p.vy<0)p.vy=0;}
   else if(previous.x+RADIUS<=q.x+.05){p.x=q.x-RADIUS;if(p.vx>0)p.vx=0;}
   else if(previous.x-RADIUS>=q.x+q.w-.05){p.x=q.x+q.w+RADIUS;if(p.vx<0)p.vx=0;}
   else {const choices=[{d:p.x+RADIUS-q.x,axis:'x',value:q.x-RADIUS},{d:q.x+q.w-p.x+RADIUS,axis:'x',value:q.x+q.w+RADIUS},{d:p.y+RADIUS+LEG-q.y,axis:'y',value:q.y-RADIUS-LEG},{d:q.y+q.h-p.y+RADIUS,axis:'y',value:q.y+q.h+RADIUS}].sort((a,b)=>a.d-b.d);const c=choices[0],outward=Math.sign(c.value-p[c.axis]),velocity=c.axis==='x'?'vx':'vy';p[c.axis]=c.value;if(p[velocity]*outward<0)p[velocity]=0;}
  }this.bounds(p);
 }
 freeAt(x,y,avatars=false,self=null){
  if(!Number.isFinite(x+y)||x<WALL+RADIUS||x>WIDTH-WALL-RADIUS||y<RADIUS||y>GROUND)return false;
  if(this.platforms.some(q=>x+RADIUS>q.x+.001&&x-RADIUS<q.x+q.w-.001&&y+RADIUS+LEG>q.y+.001&&y-RADIUS<q.y+q.h-.001))return false;
  return !avatars||!this.players.some(q=>q!==self&&Math.hypot(q.x-x,q.y-y)<DIAMETER+.1*SCALE);
 }
 climb(id='you'){
  const p=this.get(id);if(!p||p.action||p.grabbedBy||p.grounded)return false;
  const choices=[];
  for(const q of this.platforms)for(const side of [-1,1]){
   const edge=side===-1?q.x:q.x+q.w;
   if(side===-1?p.x>edge-RADIUS+.1:p.x<edge+RADIUS-.1)continue;
   const distance=Math.hypot(p.x-edge,p.y-q.y);if(distance>this.config.climbRange||p.y<q.y-RADIUS-LEG)continue;
   const outside=edge+side*(RADIUS+3*SCALE),top=q.y-RADIUS-LEG-.2;
   const points=[{x:p.x,y:p.y},{x:outside,y:q.y+30*SCALE},{x:outside,y:top},{x:edge-side*(RADIUS+8*SCALE),y:top}];
   let valid=true;
   for(let i=1;i<points.length&&valid;i++)for(let j=0;j<=32;j++){const f=j/32,x=points[i-1].x+(points[i].x-points[i-1].x)*f,y=points[i-1].y+(points[i].y-points[i-1].y)*f;if(!this.freeAt(x,y,true,p)){valid=false;break;}}
   if(valid)choices.push({distance,points,platform:q.id,edge,y:q.y});
  }
  choices.sort((a,b)=>a.distance-b.distance);const c=choices[0];if(!c)return false;
  p.action={type:'climb',started:this.time,until:this.time+clamp(this.config.climbDuration,.35,1.5),...c};p.vx=p.vy=0;p.grounded=false;p.supportId=null;this.event(p.name+' se agarra al borde');return true;
 }
 advanceClimb(p){
  const a=p.action,t=clamp((this.time-a.started)/(a.until-a.started),0,1),cuts=[0,.17,.74,1];let phase=t<cuts[1]?0:t<cuts[2]?1:2;const f=clamp((t-cuts[phase])/(cuts[phase+1]-cuts[phase]),0,1),smooth=f*f*(3-2*f),from=a.points[phase],to=a.points[phase+1],x=from.x+(to.x-from.x)*smooth,y=from.y+(to.y-from.y)*smooth;
  if(!this.freeAt(x,y)){this.release(p,'suelta un borde obstruido');return;}
  p.vx=(x-p.x)/(STEP/4);p.vy=(y-p.y)/(STEP/4);p.x=x;p.y=y;
  if(t>=1){p.vx=p.vy=0;this.release(p,'termina de subir');}
 }

 // Único corredor frontal: solo durante la escalada o el salto de salida.
 ladderCorridor(p,q){return q.id===this.ladderZone.platform&&(p.action?.type==='ladder'||p.ladderPass)&&Math.abs(p.x-(this.ladderZone.x+this.ladderZone.w/2))<=2;}
 ladder(id='you',direction=1){
  const p=this.get(id),z=this.ladderZone,q=this.platforms.find(q=>q.id===z.platform);if(!p||!q||p.grabbedBy||p.action||(p.id==='you'&&this.equipment.attack))return false;
  const center=z.x+z.w/2,top=q.y-RADIUS-LEG;
  if(Math.abs(p.x-center)>z.w/2||p.y<top-.5||p.y>GROUND+.5||direction>0&&p.y<=top+.5||direction<0&&p.y>=GROUND-.5)return false;
  p.action={type:'ladder',started:this.time,stage:'align',top,center};p.ladderIntent=Math.sign(direction);p.vx=p.vy=0;p.intent=0;p.grounded=false;p.supportId=null;p.ladderPass=false;this.event(p.name+' se sujeta a la escalera');return true;
 }
 advanceLadder(p,dt){
  const a=p.action,z=this.ladderZone,previousY=p.y;
  p.vx=p.vy=0;p.grounded=false;
  if(a.stage==='align'){p.x=approach(p.x,a.center,160*dt);if(Math.abs(p.x-a.center)<.01){p.x=a.center;a.stage='move'}return;}
  if(a.stage==='exit'){
   const t=clamp((this.time-a.exitStarted)/.22,0,1);const next=a.exitY+(a.top-a.exitY)*(t*t*(3-2*t));
   if(this.platforms.some(q=>q.id!==z.platform&&p.x+RADIUS>q.x&&p.x-RADIUS<q.x+q.w&&next+RADIUS+LEG>q.y&&next-RADIUS<q.y+q.h)){a.exitStarted+=dt;return;}p.y=next;
   if(t===1&&this.freeAt(p.x,a.top,true,p)){this.release(p,'sale arriba de la escalera');p.ladderPass=false;}
  }else{
   const next=clamp(p.y-p.ladderIntent*this.config.ladderSpeed*dt,a.top,GROUND);
   // El corredor solo exceptúa esta plataforma; cualquier otro sólido bloquea.
   if(!this.platforms.some(q=>q.id!==z.platform&&p.x+RADIUS>q.x&&p.x-RADIUS<q.x+q.w&&next+RADIUS+LEG>q.y&&next-RADIUS<q.y+q.h))p.y=next;
   if(p.ladderIntent>0&&p.y<=a.top+20){a.stage='exit';a.exitStarted=this.time;a.exitY=p.y;}
   if(p.ladderIntent<0&&p.y>=GROUND){this.release(p,'sale al suelo de la escalera');p.ladderPass=false;p.grounded=true;p.supportId='floor';}
  }
  p.ladderPhase-=(p.y-previousY)*Math.PI/(z.rung||19.5);
 }
 ladderPose(p){const wave=Math.sin(p.ladderPhase),x=p.action?.center??p.x,pose={arms:[{x:x-15,y:p.y-44-wave*10},{x:x+15,y:p.y-44+wave*10}],legs:[{x:x-12,y:p.y+36-wave*9},{x:x+12,y:p.y+36+wave*9}]};
  // La salida enlaza la sujeción con el apoyo de los pies, sin cambiar el cuerpo.
  const t=p.action?.stage==='exit'?clamp((this.time-p.action.exitStarted)/.22,0,1):0;
  if(t){const target={arms:[{x:p.x-39,y:p.y+14},{x:p.x+39,y:p.y+14}],legs:[{x:p.x-12,y:p.y+50},{x:p.x+12,y:p.y+50}]};for(const group of ['arms','legs'])pose[group]=pose[group].map((v,i)=>({x:v.x+(target[group][i].x-v.x)*t,y:v.y+(target[group][i].y-v.y)*t}));}return pose;
 }

 supports(){
  for(const p of this.players){const RADIUS=this.radiusOf(p),LEG=this.legOf(p);p.grounded=false;p.supportId=null;if(['climb','ladder'].includes(p.action?.type))continue;
   for(const q of this.platforms)if(this.terrainSupports(p,q)&&Math.abs(p.y+RADIUS+LEG-q.y)<.15&&p.vy>=-.1){p.grounded=true;p.supportId=q.id;}
  }
  const sorted=[...this.players].sort((a,b)=>b.y-a.y);
  for(const upper of sorted)for(const lower of sorted)if(lower!==upper&&lower.grounded&&!['climb','ladder'].includes(upper.action?.type)&&Math.abs(upper.x-lower.x)<Math.min(this.radiusOf(upper),this.radiusOf(lower))*clamp(this.config.contactStability,.1,1)&&Math.abs(lower.y-upper.y-this.radiusOf(upper)-this.radiusOf(lower))<.2&&upper.vy>=lower.vy-.2){upper.grounded=true;upper.supportId=lower.id;}
 }

 step(dt=STEP){
  if(this.paused)return;dt=clamp(dt,0,STEP);if(!dt)return;
  // Cuatro subpasos internos conservan el reloj fijo y evitan atravesar superficies finas.
  for(let sub=0;sub<4;sub++){
   const h=dt/4;this.time+=h;
   for(const p of this.players){
    if(p.grounded)delete p.blastLimits;
    if(![p.x,p.y,p.vx,p.vy].every(Number.isFinite)){for(const q of this.players)if(q.action?.target===p.id)this.release(q);this.release(p);p.grabbedBy=null;Object.assign(p,{x:starts.find(q=>q.id===p.id).x,y:GROUND,vx:0,vy:0});this.metrics.recoveries++;}
    if(!['climb','ladder'].includes(p.action?.type)&&p.action&&this.time+1e-9>=p.action.until)this.release(p);
    if(p.id!=='you'&&p.action?.type!=='ladder')this.think(p);
    if(p.ladderIntent&&!p.action)this.ladder(p,p.ladderIntent);
    if(['climb','ladder'].includes(p.action?.type))continue;
    if(this.propulsion?.(p,h))continue;
    if(p.action?.type==='dash')p.vx=approach(p.vx,p.action.dir*this.config.dashSpeed,this.config.acceleration*h);
    else if(p.intent&&!(p.slimePushUntil>this.time)){p.dir=p.intent;const target=p.intent*this.config.walkSpeed;if(Math.abs(p.vx)<=this.config.walkSpeed||Math.sign(p.vx)!==p.intent)p.vx=approach(p.vx,target,this.config.acceleration*h);else p.vx*=Math.exp(-1.8*h);}
    else if(!this.get(p.supportId))p.vx*=Math.exp(-(p.friction??this.config.friction)*h);
    p.vy=Math.min(this.config.fallSpeed,p.vy+this.config.gravity*h);
   }
   this.equipment.update(h);
   if(this.players.some(p=>p.active===false))this.players=this.players.filter(p=>p.active!==false);
   for(const p of this.players)this.tether(p,h);
   const previous=new Map();for(const p of this.players){previous.set(p.id,{x:p.x,y:p.y});p.grounded=false;if(p.action?.type==='climb')this.advanceClimb(p);else if(p.action?.type==='ladder')this.advanceLadder(p,h);else{p.vx=clamp(p.vx,-(p.blastLimits?.x??850),p.blastLimits?.x??850);p.vy=clamp(p.vy,-(p.blastLimits?.up??this.config.jumpSpeed),this.config.fallSpeed);p.x+=p.vx*h;p.y+=p.vy*h;p.phase+=Math.abs(p.vx)*h*.055/SCALE;}this.environment(p,previous.get(p.id));}
   const next=new Set();for(let pass=0;pass<16;pass++){
    for(let i=0;i<this.players.length;i++)for(let j=i+1;j<this.players.length;j++)this.collide(this.players[i],this.players[j],next,pass===0,h/16);
    for(const p of this.players)this.tether(p,h,true);for(const p of this.players)this.environment(p,previous.get(p.id));
   }this.contacts=next;this.supports();
   for(const p of this.players){
    if(p.action?.type==='climb'&&this.players.some(q=>q!==p&&Math.hypot(q.x-p.x,q.y-p.y)<DIAMETER-2*SCALE))this.release(p,'suelta el borde por falta de espacio');
    if(p.action?.type==='grab'){const q=this.get(p.action.target),d=q?Math.hypot(q.x-p.x,q.y-p.y):Infinity;p.invalidLinkTime=d>p.action.max+35?p.invalidLinkTime+h:0;if(p.invalidLinkTime>.3)this.release(p,'libera un vínculo inestable');}
    if(p.ladderPass&&this.freeAt(p.x,p.y))p.ladderPass=false;
    p.vx=clamp(p.vx,-(p.blastLimits?.x??850),p.blastLimits?.x??850);p.vy=clamp(p.vy,-(p.blastLimits?.up??this.config.jumpSpeed),this.config.fallSpeed);
   }
  }
 }


}
const api={SCENE,World,DEFAULTS,PLATFORMS,WIDTH,HEIGHT,RADIUS,LEG,FLOOR,WALL,GROUND,STEP,uniformIndex,drawTicket};
root.SalaEngine=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);

},
"src/jetpacks.cjs":function(module,exports,require){
'use strict';
const {config:C,place}=require('../public/jetpack-shared.js');
const approach=(value,target,amount)=>value<target?Math.min(target,value+amount):Math.max(target,value-amount);
class JetpackSystem{
 constructor(world){this.world=world;this.serial=0;this.reset();}
 reset(){this.items=[];for(const p of this.world.players){delete p.jetpack;p.flightIntent=0;}}
 active(p){return p?.active!==false&&p?.kind!=='slime'&&!!p?.jetpack&&this.world.time+1e-9<p.jetpack.expiresAt;}
 spawn(x,y){if(this.items.length>=C.maxItems)throw Error('Límite de 8 propulsores');const where=place(x,y,this.world.scene.terrain);if(!where.valid)throw Error(where.message);const item={id:'jetpack-'+ ++this.serial,x:where.x,y:where.y,radius:C.radius,leg:0,vx:0,vy:0,grounded:false};this.items.push(item);return item;}
 remove(p){delete p.jetpack;p.flightIntent=0;}
 control(p,dt){
  if(p.jetpack&&!this.active(p))this.remove(p);
  if(!this.active(p)||p.grabbedBy||['climb','ladder'].includes(p.action?.type))return false;
  if(p.intent)p.dir=p.intent;
  // Sustituye gravedad y aceleración normal en el MISMO subpaso del motor.
  p.vx=approach(p.vx,p.intent*C.flightSpeed,C.acceleration*dt);
  p.vy=approach(p.vy,(p.flightIntent||0)*C.flightSpeed,C.acceleration*dt);
  return true;
 }
 multipliers(a,b,nx,ny){
  // Solo potencia el impulso saliente del portador que se acerca al otro cuerpo.
  const towardA=a.vx*nx+a.vy*ny,towardB=-(b.vx*nx+b.vy*ny);
  return {a:this.active(b)&&towardB>0?C.pushMultiplier:1,b:this.active(a)&&towardA>0?C.pushMultiplier:1};
 }
 step(dt){const w=this.world;for(const p of w.players)if(p.jetpack&&!this.active(p))this.remove(p);
  this.items=this.items.filter(item=>{for(let i=0;i<4;i++){const h=dt/4,previous={x:item.x,y:item.y};item.vy=Math.min(w.config.fallSpeed,item.vy+w.config.gravity*h);item.y+=item.vy*h;w.environment(item,previous);item.grounded=item.vy===0;const player=w.players.find(p=>p.active&&p.kind!=='slime'&&!this.active(p)&&Math.hypot(p.x-item.x,p.y-item.y)<=w.radiusOf(p)+C.radius);if(player){for(const holder of w.bodies())if(holder.action?.target===player.id)w.release(holder);w.release(player);player.grabbedBy=null;player.jetpack={id:item.id,startedAt:w.time,expiresAt:w.time+C.duration};w.event(player.name+' recoge el propulsor (30 s)');return false;}}return item.y-C.radius<=w.scene.killY;});
 }
 snapshot(){return {items:this.items.map(p=>({...p})),duration:C.duration,pushMultiplier:C.pushMultiplier};}
}
module.exports={JetpackSystem,C};

},
"public/jetpack-shared.js":function(module,exports,require){
(function(root){'use strict';
const config={duration:30,radius:24,maxItems:8,flightSpeed:420,acceleration:1800,pushMultiplier:1.75,src:'/assets/objetos/objeto-propulsor.png'};
function place(x,y,terrain){const r=config.radius;if(!Number.isFinite(x)||!Number.isFinite(y)||x<r||x>1920-r||y<r||y>1080-r)return {valid:false,message:'Posición fuera del escenario'};const surface=terrain.find(q=>x>=q.x&&x<=q.x+q.w&&y>=q.y&&y<=q.y+q.h);if(surface)y=surface.y-r;for(const q of terrain){const dx=x-Math.max(q.x,Math.min(x,q.x+q.w)),dy=y-Math.max(q.y,Math.min(y,q.y+q.h));if(dx*dx+dy*dy<r*r-.01)return {valid:false,x,y,message:'El objeto invade el terreno'};}return {valid:true,x,y};}
const api={config,place};root.JetpackShared=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

}},links={"src/config/scene.cjs":{},"src/reused/scene.js":{"../config/scene.cjs":"src/config/scene.cjs"},"src/reused/weapons.js":{"../config/scene.cjs":"src/config/scene.cjs"},"src/reused/engine.cjs":{"./weapons.js":"src/reused/weapons.js","./scene.js":"src/reused/scene.js"},"src/jetpacks.cjs":{"../public/jetpack-shared.js":"public/jetpack-shared.js"},"public/jetpack-shared.js":{}},cache={};
function load(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](module,module.exports,name=>{const target=links[id][name];if(!target)throw Error("Dependencia no autorizada");return load(target)});return module.exports;}
const engine=load("src/reused/engine.cjs");root.PerrilandPhysics={World:engine.World,STEP:engine.STEP,scene:load("src/config/scene.cjs"),JetpackSystem:load("src/jetpacks.cjs").JetpackSystem};
})(globalThis);
