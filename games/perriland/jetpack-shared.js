(function(root){'use strict';
const config={duration:30,radius:24,maxItems:8,flightSpeed:420,acceleration:1800,pushMultiplier:1.75,src:'/games/perriland/assets/objetos/objeto-propulsor.png'};
function place(x,y,terrain){const r=config.radius;if(!Number.isFinite(x)||!Number.isFinite(y)||x<r||x>1920-r||y<r||y>1080-r)return {valid:false,message:'Posición fuera del escenario'};const surface=terrain.find(q=>x>=q.x&&x<=q.x+q.w&&y>=q.y&&y<=q.y+q.h);if(surface)y=surface.y-r;for(const q of terrain){const dx=x-Math.max(q.x,Math.min(x,q.x+q.w)),dy=y-Math.max(q.y,Math.min(y,q.y+q.h));if(dx*dx+dy*dy<r*r-.01)return {valid:false,x,y,message:'El objeto invade el terreno'};}return {valid:true,x,y};}
const api={config,place};root.JetpackShared=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
