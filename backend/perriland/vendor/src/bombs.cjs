'use strict';
const {place,config:C}=require('../public/slime-shared.js');
class BombSystem {
 constructor(world){this.world=world;this.duration=8;this.serial=0;this.explosionCount=0;this.reset();}
 reset(){this.items=[];this.effects=[];}
 configure(seconds){if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<.25||seconds>120)throw Error('La mecha debe durar entre 0,25 y 120 segundos');this.duration=seconds;}
 support(b){return this.world.scene.terrain.find(q=>b.x>=q.x&&b.x<=q.x+q.w&&Math.abs(b.y+b.radius-q.y)<.05);}
 spawn(x,y){if(this.items.length>=8)throw Error('Límite de 8 bombas');const point=place(x,y,this.world.scene.terrain,[...this.world.bodies(),...this.items],this.world.scene.radius);if(!point.valid)throw Error(point.message);const item={id:'bomb-'+ ++this.serial,x:point.x,y:point.y,radius:40,leg:0,vx:0,vy:0,dir:1,grounded:false,startedAt:this.world.time,duration:this.duration,nextHop:this.world.time+.35};item.grounded=!!this.support(item);this.items.push(item);return item;}
 restart(id){const item=this.items.find(b=>b.id===id);if(!item)throw Error('Bomba no disponible');item.startedAt=this.world.time;item.duration=this.duration;}
 move(b,dt){
  const w=this.world,now=w.time;
  if(b.grounded&&now+1e-9>=b.nextHop){
   const height=C.hopSpeed*C.hopSpeed/(2*w.config.gravity),target=w.players.filter(p=>p.active&&p.y+w.radiusOf(p)+w.legOf(p)>=b.y+b.radius-height-4).sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y))[0];
   if(target&&Math.abs(target.x-b.x)>8)b.dir=Math.sign(target.x-b.x);
   const support=this.support(b),reach=C.hopHorizontal*2*C.hopSpeed/w.config.gravity;
   if(support){const min=support.x+b.radius+4,max=support.x+support.w-b.radius-4;if(b.x+b.dir*reach<min||b.x+b.dir*reach>max)b.dir=b.x<(min+max)/2?1:-1;}
   b.vx=b.dir*C.hopHorizontal;b.vy=-C.hopSpeed;b.grounded=false;b.nextHop=Infinity;
  }
  // Reutiliza la colisión con terreno; no añade contactos con jugadores.
  for(let i=0;i<4;i++){const h=dt/4,previous={x:b.x,y:b.y};b.vy=Math.min(w.config.fallSpeed,b.vy+w.config.gravity*h);b.x+=b.vx*h;b.y+=b.vy*h;w.environment(b,previous);const landed=b.vy>=0&&!!this.support(b);if(landed){if(!b.grounded)b.nextHop=now+.4;b.grounded=true;b.vx=0;b.vy=0;}else b.grounded=false;}
 }
 blast(b,event){
  const w=this.world,C=w.scene.bombExplosion,targets=[...w.bodies(),...this.items.filter(q=>q!==b&&w.time-q.startedAt+1e-9<q.duration)];
  event.radius=C.radius;event.hitIds=[];
  for(const p of targets){
   const dx=p.x-b.x,dy=p.y-b.y,distance=Math.hypot(dx,dy),edge=Math.max(0,distance-(p.radius??w.radiusOf(p)));
   if(edge>=C.radius)continue;
   // Menor fuerza al alejarse; un mínimo de elevación despega cuerpos apoyados.
   const strength=1-edge/C.radius,nx=distance>1e-6?dx/distance:0,ny=distance>1e-6?dy/distance:-1;
   if(p.active!==undefined){
    for(const holder of w.bodies())if(holder.action?.target===p.id)w.release(holder);
    w.release(p);p.grabbedBy=null;w.react(p,event.id);
    p.reactionUntil=Math.max(p.reactionUntil,w.time+C.reactionDuration);
    if(p.kind==='slime'){p.attack=null;p.nextHop=Math.max(p.nextHop,w.time+C.reactionDuration);p.nextAttack=Math.max(p.nextAttack,w.time+C.reactionDuration);}
   }
   p.blastLimits={x:850*C.speedLimitMultiplier,up:w.config.jumpSpeed*C.speedLimitMultiplier};
   p.vx=Math.max(-p.blastLimits.x,Math.min(p.blastLimits.x,p.vx+nx*C.radialSpeed*strength));
   p.vy=Math.max(-p.blastLimits.up,Math.min(w.config.fallSpeed,Math.min(p.vy,0)+(ny*C.radialSpeed-C.liftSpeed)*strength));
   p.grounded=false;p.supportId=null;
   if(p.active===undefined)p.nextHop=Infinity;
   event.hitIds.push(p.id);
  }
 }
 step(dt=1/60){const now=this.world.time;this.effects=this.effects.filter(e=>now-e.at<(e.duration??1.6));this.items=this.items.filter(b=>{if(now-b.startedAt+1e-9>=b.duration){const event={id:'explosion-'+ ++this.explosionCount,duration:1.6,bombId:b.id,x:b.x,y:b.y,at:now};this.blast(b,event);this.effects.push(event);return false;}this.move(b,dt);return b.y-b.radius<=this.world.scene.killY;});}
 snapshot(){return {duration:this.duration,items:this.items.map(b=>({...b,nextHop:Number.isFinite(b.nextHop)?b.nextHop:null,sprite:b.grounded?'normal':'jump',remaining:Math.max(0,b.duration-(this.world.time-b.startedAt)),progress:Math.min(1,Math.max(0,(this.world.time-b.startedAt)/b.duration))})),effects:this.effects.map(e=>({...e})),explosionCount:this.explosionCount};}
}
module.exports={BombSystem};
