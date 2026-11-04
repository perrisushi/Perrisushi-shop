(function(root){'use strict';
const config={radius:40,leg:0,visualHeight:88,maxActive:8,autoMinDelay:20,autoMaxDelay:45,hp:3,hopSpeed:380,hopHorizontal:145,hopIntervalMin:.85,hopIntervalMax:1.1,prepareTime:.14,targetInterval:.3,targetHysteresis:24,attackReach:22,attackPrepare:.14,attackDuration:.24,attackSpeed:220,attackPushRatio:1,attackCooldown:1.5,hurtDuration:.32,immunity:.35};
const sprites={normal:{src:'/assets/slime/slime-enemigo.png',crop:[40,105,400,308],anchorX:240},jump:{src:'/assets/slime/slime-enemigo-salto.png',crop:[36,48,413,392],anchorX:242},attack:{src:'/assets/slime/smile-enemigo-ataque.png',crop:[30,25,424,410],anchorX:242},hurt:{src:'/assets/slime/slime-enemigo-daño.png',crop:[42,72,437,357],anchorX:242}};
function place(x,y,terrain,bodies=[],playerRadius=42){const r=config.radius;if(!Number.isFinite(x)||!Number.isFinite(y)||x<r||x>1920-r||y<r||y>1080-r)return {valid:false,message:'Posición fuera del escenario'};const surface=terrain.find(q=>x>=q.x&&x<=q.x+q.w&&y>=q.y&&y<=q.y+q.h);if(surface)y=surface.y-r;
 for(const q of terrain){const dx=x-Math.max(q.x,Math.min(x,q.x+q.w)),dy=y-Math.max(q.y,Math.min(y,q.y+q.h));if(dx*dx+dy*dy<r*r-.01)return {valid:false,message:'El cuerpo invade el terreno',x,y};}
 if(bodies.some(b=>b.active!==false&&Math.hypot(b.x-x,b.y-y)<r+(b.radius??playerRadius)+1))return {valid:false,message:'Hay otro cuerpo en esa posición',x,y};return {valid:true,x,y};}
const api={config,sprites,place};root.SlimeShared=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
