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
