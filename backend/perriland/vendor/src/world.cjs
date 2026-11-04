'use strict';
const E=require('./reused/engine.cjs'),X=require('./reused/extras.cjs'),scene=require('./config/scene.cjs'),participants=require('./config/participants.cjs');
const {SlimeSystem}=require('./slimes.cjs');
const {BombSystem}=require('./bombs.cjs');
const {JetpackSystem}=require('./jetpacks.cjs');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
class Coins extends X.System{
 lanes(radius=scene.coinRadius){const r=radius+8,spans=this.world.scene.terrain.map(q=>[q.x+r,q.x+q.w-r]).sort((a,b)=>a[0]-b[0]),merged=[];for(const span of spans){const last=merged.at(-1);if(last&&span[0]<=last[1])last[1]=Math.max(last[1],span[1]);else merged.push([...span]);}let ranges=merged;for(const q of this.world.scene.platforms)for(const edge of [q.x,q.x+q.w]){const next=[];for(const [a,b] of ranges){if(edge-r>a)next.push([a,Math.min(b,edge-r)]);if(edge+r<b)next.push([Math.max(a,edge+r),b]);}ranges=next.filter(([a,b])=>b-a>1);}return ranges;}
 land(c,previousY){for(const q of [...this.world.scene.terrain].sort((a,b)=>a.y-b.y)){if(c.x+c.r<=q.x||c.x-c.r>=q.x+q.w)continue;if(previousY+c.r<=q.y+.01&&c.y+c.r>=q.y){c.y=q.y-c.r;c.vy=0;c.grounded=true;c.surface=q.id;break;}}}
}
class OverlayWorld extends E.World{
 constructor(options={}){super({config:scene.physics,...options});this.spawnRng=options.spawnRng||Math.random;this.template={...this.players[0]};this.participants=options.participants||participants;this._ready=true;this.reset();this.extras=new Coins(this,{rng:options.coinRng||Math.random}).attach();this.enemies=new SlimeSystem(this);this.bombs=new BombSystem(this);this.jetpacks=new JetpackSystem(this);}
 reset(){if(!this._ready)return super.reset();this.time=0;this.enemies?.reset();this.bombs?.reset();this.jetpacks?.reset();this.platforms=scene.terrain.map(q=>({...q}));this.time=0;this.serial=0;this.paused=false;this.contacts=new Set();this.events=[];this.lastEvent='Partida nueva';this.players=this.participants.map((c,i)=>({...this.template,id:c.id,name:c.nick,perrilogo:{...c.perrilogo},x:scene.respawnCenterX+(i-(this.participants.length-1)/2)*(E.RADIUS*2+8*scene.characterScale),y:scene.floor.y-E.RADIUS-E.LEG,vx:0,vy:0,dir:1,intent:0,flightIntent:0,grounded:true,supportId:'floor',action:null,grabbedBy:null,phase:0,cooldownUntil:0,nextThink:1+i*.4,ladderIntent:0,ladderPass:false,active:true,respawnAt:null,slimePushUntil:0}));this.equipment.reset();}
 get(id){return typeof id==='string'?(super.get(id)||this.enemies?.get(id)):id;}
 bodies(){return [...this.players.filter(p=>p.kind!=='slime'),...(this.enemies?.list()||[])].filter(p=>p.active!==false);}
 propulsion(p,dt){return this.jetpacks?.control(p,dt)||false;}
 bodyContactMultipliers(a,b,nx,ny){return this.jetpacks?.multipliers(a,b,nx,ny);}
 horizontalContactScale(a,b){return this.enemies.contactScale(a,b);}
 receiveOffensiveImpact(p,hit){return this.enemies.damage(p,hit);}
 bounds(){} // Bordes abiertos: ningún suelo infinito ni paredes de contención.
 ladder(){return false;}ladderCorridor(){return false;}
 freeAt(x,y,avatars=false,self=null){if(!Number.isFinite(x+y))return false;if(this.platforms.some(q=>this.terrainOverlap(x,y,q,self)))return false;return !avatars||!this.bodies().some(q=>q!==self&&Math.hypot(q.x-x,q.y-y)<this.radiusOf(self)+this.radiusOf(q)+.1*scene.characterScale);}

 think(p){if(p.kind==='slime'){this.enemies.think(p);return;}if(!this.botsEnabled||!p.active)return;const support=this.platforms.find(q=>q.id===p.supportId);if(p.grounded&&support&&((p.intent<0&&p.x<support.x+40*scene.characterScale)||(p.intent>0&&p.x>support.x+support.w-40*scene.characterScale))&&this.rng()<.985){p.intent=p.x<support.x+support.w/2?1:-1;p.nextThink=this.time+.35;return;}
  super.think(p);const c=this.extras?.coin;if(c&&this.rng()<.002&&p.grounded&&Math.abs(c.y-p.y)<90){p.intent=Math.sign(c.x-p.x);p.nextThink=this.time+.8;}
 }
 knockout(p,reason=null){if(p.kind==='slime')return this.enemies.kill(p);if(!p.active)return;if(reason==='void')this.extras.penalize(p);this.jetpacks?.remove(p);for(const q of this.players)if(q.action?.target===p.id)this.release(q);this.release(p);p.active=false;p.respawnAt=this.time+scene.respawnDelay;p.intent=0;p.grabbedBy=null;p.grounded=false;p.supportId=null;if(p.id==='you'){this.extras.flag=null;this.equipment.attack=null;this.equipment.pending=null;}this.extras.popups=this.extras.popups.filter(q=>q.id!==p.id||q.loss);}
 respawn(p){const y=scene.floor.y-E.RADIUS-E.LEG,spacing=E.RADIUS*2+8*scene.characterScale;const slots=Math.floor(2*scene.respawnVariation/spacing)+1,offsets=Array.from({length:slots},(_,i)=>(i-(slots-1)/2)*spacing).sort((a,b)=>Math.abs(a)-Math.abs(b));for(const dx of offsets){const x=scene.respawnCenterX+clamp(dx,-scene.respawnVariation,scene.respawnVariation);if(!this.freeAt(x,y,true,p))continue;Object.assign(p,{x,y,vx:0,vy:0,dir:1,intent:0,flightIntent:0,grounded:true,supportId:'floor',active:true,respawnAt:null,action:null,grabbedBy:null,reactionUntil:0,pushUntil:0,cooldownUntil:0,phase:0,slimePushUntil:0,nextThink:this.time+1});return true;}return false;}
 step(dt=E.STEP){if(this.paused)return;const participants=this.players.filter(p=>p.kind!=='slime'),all=this.bodies();for(const p of all)if(![p.x,p.y,p.vx,p.vy].every(Number.isFinite)||(p.kind==='slime'&&p.y-p.radius>scene.killY))this.knockout(p);this.players=all.filter(p=>p.active);this.platforms=[...scene.terrain];try{super.step(dt);}finally{this.players=participants;}for(const p of participants){if(p.active&&p.y-E.RADIUS>scene.killY)this.knockout(p,'void');else if(!p.active&&this.time+1e-9>=p.respawnAt)this.respawn(p);}for(const e of this.enemies.list())if(e.y-e.radius>scene.killY)this.enemies.kill(e);this.enemies.afterStep();this.enemies.updateAuto();this.bombs.step(Math.max(0,Math.min(dt,E.STEP)));this.jetpacks.step(Math.max(0,Math.min(dt,E.STEP)));}

 jump(id='you'){const p=this.get(id);if(this.jetpacks.active(p))return false;return p?.active===false?false:super.jump(id);}
 grab(id='you'){const p=this.get(id);if(p?.active===false||p?.kind==='slime')return false;const all=this.players;this.players=this.bodies();try{return super.grab(id);}finally{this.players=all;}}
 dash(id='you'){return this.get(id)?.active===false?false:super.dash(id);}
 climb(id='you'){return this.get(id)?.active===false?false:super.climb(id);}
 snapshot(){return {jetpacks:this.jetpacks.snapshot(),bombs:this.bombs.snapshot(),spawns:{auto:this.enemies.autoEnabled,slimeIn:Math.max(0,this.enemies.nextAuto-this.time),normalIn:this.extras.coin?null:Math.max(0,(this.extras.nextSpawn??this.time)-this.time),specialIn:Math.max(0,this.extras.nextSpecial-this.time)},specialCoin:this.extras.specialCoin?{...this.extras.specialCoin}:null,slimes:this.enemies.snapshot(),enemyAI:this.enemies.aiEnabled,time:this.time,paused:this.paused,bots:this.botsEnabled,players:this.players.map(p=>({...p,action:p.action?{type:p.action.type,edge:p.action.edge,y:p.action.y,target:p.action.target}:null,pose:p.active?this.equipment.getPose(p):{visible:false},pc:this.extras.scores[p.id]||0,respawnIn:p.active?0:Math.max(0,p.respawnAt-this.time)})),coin:this.extras.coin?{...this.extras.coin}:null,particles:this.extras.particles,popups:this.extras.popups,equipped:this.equipment.item,pending:this.equipment.pending,event:this.lastEvent};}
}
module.exports={OverlayWorld,Coins,scene,E};
