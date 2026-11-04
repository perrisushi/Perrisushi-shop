/* Extensiones locales: usan reloj fijo y terreno existentes, nunca saldos reales. */
(function(root){'use strict';
const FLAGS=Object.freeze([['flag-hi','Bandera HI','bandera-hi.png'],['flag-heart','Bandera corazón','bandera-corazon.png'],['flag-yes','Bandera SÍ','bandera-si.png'],['flag-no','Bandera NO','bandera-no.png']].map(([id,name,file])=>Object.freeze({id,name,src:'assets/extras/'+file})));
const config=require('../config/scene.cjs');
const COIN={src:'assets/extras/moneda-pc.png',radius:config.coinRadius,minDelay:config.coinMinDelay,maxDelay:config.coinMaxDelay,lifetime:config.coinLifetime};
class System{
 constructor(world,{rng=Math.random}={}){this.world=world;this.rng=rng;this.reset();}
 random(){const n=this.rng();return Number.isFinite(n)?Math.max(0,Math.min(1-Number.EPSILON,n)):0;}
 reset(startTime=this.world.time){this.scores=Object.fromEntries(this.world.players.map(p=>[p.id,0]));this.coin=null;this.specialCoin=null;this.nextSpecial=startTime+config.specialCoinInterval;this.nextSpawn=null;this.particles=[];this.popups=[];this.flag=null;this.emission=0;this.metrics={spawns:0,pickups:0,flagUses:0};this.spawn(startTime);}
 lanes(){const r=COIN.radius,w=this.world;let ranges=[[16+r,w.scene.width-16-r]];for(const p of w.platforms){const next=[];for(const [a,b] of ranges){if(p.x-r>a)next.push([a,Math.min(b,p.x-r)]);if(p.x+p.w+r<b)next.push([Math.max(a,p.x+p.w+r),b]);}ranges=next.filter(([a,b])=>b-a>1);}return ranges;}
 spawn(startTime=this.world.time,special=false){const slot=special?'specialCoin':'coin';if(this[slot])return false;const radius=COIN.radius*(special?config.specialCoinScale:1),ranges=this.lanes(radius),total=ranges.reduce((s,[a,b])=>s+b-a,0);if(!total)return false;let at=this.random()*total,x=ranges[0][0];for(const [a,b]of ranges){if(at<=b-a){x=a+at;break;}at-=b-a;}this[slot]={x,y:-radius,vy:0,r:radius,special,value:special?config.specialCoinPoints:config.coinPoints,emission:0,grounded:false,expiresAt:special?Infinity:startTime+COIN.lifetime};if(!special)this.nextSpawn=null;this.metrics.spawns++;return true;}
 penalize(p){this.scores[p.id]=Math.max(0,(this.scores[p.id]||0)-config.voidPenalty);this.popups.push({id:p.id,x:Math.max(60,Math.min(this.world.scene.width-60,p.x)),y:Math.min(this.world.scene.height-45,p.y),text:'-'+config.voidPenalty+' PC',loss:true,life:1});}

 land(c,previousY){if(c.y+c.r>=this.world.scene.floor.y){c.y=this.world.scene.floor.y-c.r;c.vy=0;c.grounded=true;}}
 scheduleNext(){this.coin=null;this.nextSpawn=this.world.time+COIN.minDelay+this.random()*(COIN.maxDelay-COIN.minDelay);}
 burst(x,y,count=8){for(let i=0;i<count&&this.particles.length<config.maxParticles;i++)this.particles.push({x,y,vx:(this.random()-.5)*65,vy:-15-this.random()*45,life:.4+this.random()*.35,maxLife:.75,size:2+Math.floor(this.random()*2),gold:this.random()>.5});}
 update(dt){const w=this.world;if(w.paused||!Number.isFinite(dt)||dt<=0)return;
  if(this.flag&&w.time+1e-9>=this.flag.until){this.flag=null;w.equipment.finishEquip();}
  this.particles=this.particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=70*dt;return p.life>0;});this.popups=this.popups.filter(p=>(p.life-=dt)>0);
  if(w.time+1e-9>=this.nextSpecial){this.nextSpecial+=(Math.floor((w.time+1e-9-this.nextSpecial)/config.specialCoinInterval)+1)*config.specialCoinInterval;this.spawn(w.time,true);}
  if(!this.coin&&this.nextSpawn!==null&&w.time+1e-9>=this.nextSpawn)this.spawn();
  for(const slot of ['coin','specialCoin']){const c=this[slot];if(!c)continue;if(w.time+1e-9>=c.expiresAt){if(slot==='coin')this.scheduleNext();else this.specialCoin=null;continue;}if(!c.grounded){c.vy=Math.min(w.config.fallSpeed,c.vy+w.config.gravity*dt);const previousY=c.y;c.y+=c.vy*dt;this.land(c,previousY);if(!c.grounded){c.emission+=dt;const interval=c.special?.045:.075;while(c.emission>=interval){c.emission-=interval;this.burst(c.x,c.y-c.r,c.special?2:1);}}}
   for(const p of w.players)if(p.active!==false&&p.canCollectCoins!==false&&Math.hypot(p.x-c.x,p.y-c.y)<=config.radius+c.r){const value=c.value??(c.special?config.specialCoinPoints:config.coinPoints);this.scores[p.id]=(this.scores[p.id]||0)+value;this.metrics.pickups++;this.burst(c.x,c.y,c.special?18:10);this.popups.push({id:p.id,life:1,text:'+'+value+' PC'});if(slot==='coin')this.scheduleNext();else this.specialCoin=null;break;}
  }
 }

 attach(){const system=this,e=this.world.equipment,equip=e.equip.bind(e),use=e.use.bind(e),pose=e.getPose.bind(e),reset=e.reset.bind(e),update=e.update.bind(e);
  e.equip=function(id,who='you'){if(who!=='you')return false;if(!FLAGS.some(f=>f.id===id)&&!root.SalaWeapons.ITEMS.some(i=>i.id===id))return false;if(system.flag||this.attack){this.pending=id;return true;}if(FLAGS.some(f=>f.id===id)){this.item=id;this.pending=null;return true;}return equip(id,who);};
  e.use=function(who='you'){if(!FLAGS.some(f=>f.id===this.item))return use(who);const w=system.world,p=w.get(who);if(who!=='you'||w.paused||!p||p.action||this.attack||system.flag)return false;system.flag={id:this.item,started:w.time,until:w.time+config.flagDuration};system.metrics.flagUses++;w.event(p.name+' muestra '+FLAGS.find(f=>f.id===this.item).name.toLowerCase());return true;};
  e.getPose=function(p=system.world.get('you'),time=system.world.time){if(p.id!=='you'||!FLAGS.some(f=>f.id===this.item))return pose(p,time);const active=system.flag&&time+1e-9<system.flag.until,visible=Boolean(active&&!['grab','climb','ladder'].includes(p.action?.type)),hand={x:Math.max(12*config.characterScale,Math.min(system.world.scene.width-92*config.characterScale,p.x+p.dir*24*config.characterScale)),y:p.y-48*config.characterScale};return {item:this.item,visible,flag:true,hands:[hand,{x:p.x-p.dir*38*config.characterScale,y:p.y+14*config.characterScale}],shape:{hand},hit:null,phase:active?'bandera elevada':'reposo'};};
  e.update=function(dt){update(dt);system.update(dt);};
  e.reset=function(){reset();system.reset(0);};return this;
 }
}
root.SalaExtras={FLAGS,COIN,System};if(typeof module!=='undefined'&&module.exports)module.exports=root.SalaExtras;
})(typeof globalThis!=='undefined'?globalThis:window);
