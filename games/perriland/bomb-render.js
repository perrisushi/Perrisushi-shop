(function(root){'use strict';
const B=BombShared,variants={},size=500,steps=240;
function prepare(img,jump){
 const original=document.createElement('canvas');original.width=original.height=size;const c=original.getContext('2d',{willReadFrequently:true});
 // El sprite de salto se alinea con las coordenadas de la mecha original.
 if(jump)c.drawImage(img,4,32,500,500);else c.drawImage(img,0,0);
 const pixels=c.getImageData(0,0,size,size),fuse=[],frames=[];
 for(let y=60;y<147;y++)for(let x=225;x<340;x++)if(B.inFuse(x+.5,y+.5))fuse.push({offset:(y*size+x)*4+3,at:B.burnAt(x+.5,y+.5),flame:x>=299&&y<107});
 const body=c.getImageData(0,0,size,size);for(const p of fuse){body.data[p.offset]=0;const pixel=(p.offset-3)/4,y=Math.floor(pixel/size),x=pixel%size;if(y>=128){const sample=(y*size+Math.round(274+(x-249)*.12))*4;for(let k=0;k<4;k++)body.data[p.offset-3+k]=pixels.data[sample+k];}}
 const base=document.createElement('canvas');base.width=base.height=size;base.getContext('2d').putImageData(body,0,0);
 for(let step=0;step<=steps;step++){const layer=document.createElement('canvas');layer.width=115;layer.height=87;const lc=layer.getContext('2d'),data=lc.createImageData(115,87);for(const p of fuse){if(p.flame||step===steps||p.at<step/steps)continue;const source=p.offset-3,pixel=source/4,x=pixel%size,y=Math.floor(pixel/size),dest=((y-60)*115+x-225)*4;for(let k=0;k<4;k++)data.data[dest+k]=pixels.data[source+k];}lc.putImageData(data,0,0);frames.push(layer);}
 return {original,body:base,frames,anchorX:jump?249:B.anchorX,anchorY:jump?460:B.anchorY,scale:B.scale*(jump?1.25:1)};
}
const ready=Promise.all(['normal','jump'].map(key=>new Promise(resolve=>{const img=new Image();img.onload=()=>{variants[key]=prepare(img,key==='jump');if(key==='normal')root.BombRenderer.body=variants[key].body;resolve(true);};img.onerror=()=>{console.warn('No se puede cargar el sprite bomba: '+key);resolve(false);};img.src='/games/perriland/assets/slime/'+(key==='jump'?'slime-bomba-salto.png':'slime-bomba.png');}))).then(results=>results.every(Boolean));
function dot(ctx,x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
// El tiempo recibido es el de la simulación compartida, nunca el reloj del navegador.
function fuseProgress(b,time){const value=Number.isFinite(time)&&Number.isFinite(b.startedAt)&&Number.isFinite(b.duration)&&b.duration>0?(time-b.startedAt)/b.duration:(b.progress??0);return Math.max(0,Math.min(1,value));}
function draw(ctx,b,time,alpha=1){const variant=variants[b.sprite==='jump'?'jump':'normal']||variants.normal;if(!variant)return;const progress=fuseProgress(b,time),tip=B.tip(progress),scale=variant.scale;ctx.save();ctx.globalAlpha*=alpha;ctx.translate(b.x,b.y+(b.radius??40));ctx.scale((b.dir===-1?-1:1)*scale,scale);ctx.translate(-variant.anchorX,-variant.anchorY);if(progress===0)ctx.drawImage(variant.original,0,0);else{ctx.drawImage(variant.body,0,0);ctx.drawImage(variant.frames[Math.min(steps,Math.floor(progress*steps))],225,60);}
 if(progress<1){const phase=time*30;for(let i=0;i<6;i++){const age=((phase+i*.73)%6)/6,angle=i*2.399;dot(ctx,tip.x+Math.cos(angle)*age*27,tip.y-age*34+Math.sin(angle)*age*11,1.3*(1-age)+.5,'rgba(255,125,20,'+(1-age)+')');}if(progress>0){const glow=ctx.createRadialGradient(tip.x,tip.y,0,tip.x,tip.y,13);glow.addColorStop(0,'#fff2a0');glow.addColorStop(.25,'#ffb82d');glow.addColorStop(.6,'#ff7011aa');glow.addColorStop(1,'#ff6a0000');dot(ctx,tip.x,tip.y,13,glow);dot(ctx,tip.x,tip.y,3.2,'#ffd15a');}}ctx.restore();
}

// Todo se deriva de la edad e ID del evento: pausa, recarga y OBS comparten el efecto.
function noise(n){const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);}
function cloud(ctx,x,y,r,colors,alpha=1){if(r<=0||alpha<=0)return;ctx.save();ctx.globalAlpha*=alpha;const g=ctx.createRadialGradient(x-r*.18,y-r*.23,r*.05,x,y,r);for(const [stop,color]of colors)g.addColorStop(stop,color);dot(ctx,x,y,r,g);ctx.restore();}
function explosion(ctx,e,time){const t=time-e.at,duration=e.duration??1.6;if(t<0||t>=duration)return;const seed=Number(e.id.split('-').at(-1))||1,burst=1-Math.exp(-t*24);
 ctx.save();ctx.translate(e.x,e.y);
 // Doble de superficie visual: escala lineal de raíz de dos en ambos ejes.
 ctx.scale(Math.SQRT2,Math.SQRT2);
 // Humo volumétrico: asciende y se abre detrás de las llamas, sin fondo opaco.
 const smokeAlpha=Math.min(1,t*4)*Math.min(1,(duration-t)*2.5);
 for(let i=0;i<14;i++){const n=noise(seed*17+i),a=i*2.399+seed,rise=t*(35+n*38),spread=burst*(18+n*38)+t*17,x=Math.cos(a)*spread,y=Math.sin(a)*spread*.5-rise,r=(15+n*20)*(1+t*.7);cloud(ctx,x,y,r,[[0,'#726c68d0'],[.45,'#48454ac0'],[.8,'#302e3570'],[1,'#25232900']],smokeAlpha*.64);}
 // Onda de presión corta, con un halo cálido que se desvanece rápidamente.
 if(t<.42){const p=t/.42;ctx.save();ctx.globalAlpha=(1-p)*.55;ctx.strokeStyle='#ffd9a1';ctx.lineWidth=5*(1-p)+.5;ctx.beginPath();ctx.ellipse(0,12,15+p*127,6+p*47,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
 const fireLife=Math.max(0,1-t/.85),radius=(16+burst*68)*Math.pow(fireLife,.42),lift=-t*52;
 if(fireLife>0){
  ctx.save();ctx.globalCompositeOperation='lighter';cloud(ctx,0,lift,radius*1.7,[[0,'#ffab4350'],[.4,'#ff710b30'],[1,'#ff450000']],fireLife);ctx.restore();
  // Lenguas de llama que se estiran hacia arriba con la expansión.
  for(let i=0;i<9;i++){const n=noise(seed*53+i),x=(n-.5)*radius*1.5,y=lift+radius*.25,w=radius*(.1+n*.07),h=radius*(.9+n*.65),sway=Math.sin(t*18+i)*w;const g=ctx.createLinearGradient(x,y,x+sway,y-h);g.addColorStop(0,'#ffb519c0');g.addColorStop(.45,'#ff6d09dc');g.addColorStop(1,'#ff330000');ctx.fillStyle=g;ctx.globalAlpha=Math.min(1,fireLife*1.5);ctx.beginPath();ctx.moveTo(x-w,y);ctx.bezierCurveTo(x-w*2,y-h*.35,x+sway-w*.4,y-h*.7,x+sway,y-h);ctx.bezierCurveTo(x+sway+w*.5,y-h*.6,x+w*2,y-h*.25,x+w,y);ctx.closePath();ctx.fill();}
  ctx.globalAlpha=1;
  // Lóbulos de fuego con bordes rojos y núcleos amarillos; tamaño y giro propios.
  for(let i=0;i<19;i++){const n=noise(seed*31+i),a=i*2.399+n*.5,spread=radius*(.22+n*.42),x=Math.cos(a)*spread,y=lift+Math.sin(a)*spread*.7-t*(i%4)*14,r=radius*(.3+n*.25),flicker=1+Math.sin(t*32+i*2.3)*.07;cloud(ctx,x,y,r*flicker,[[0,'#fff2a4ff'],[.22,'#ffd13bff'],[.5,'#ff8c10f0'],[.77,'#f13907bb'],[1,'#9c170000']],Math.min(1,fireLife*2));}
  ctx.globalAlpha=1;cloud(ctx,0,lift,radius*.55,[[0,'#fffbe9ff'],[.3,'#ffe580fa'],[.7,'#ffb321bb'],[1,'#ff790000']],Math.max(0,1-t/.4));
 }
 // Destello inicial localizado; nada de parpadeo sobre toda la pantalla.
 if(t<.15){ctx.save();ctx.globalCompositeOperation='lighter';cloud(ctx,0,-4,25+burst*70,[[0,'#fffef4ff'],[.18,'#fff5c7e0'],[.5,'#ffd76e60'],[1,'#ffb52b00']],(1-t/.15)*.9);ctx.restore();}
 // Brasas balísticas: trazos cortos redondeados y puntos, nunca estrellas.
 ctx.lineCap='round';for(let i=0;i<36;i++){const n=noise(seed*71+i),a=i*2.399,velocity=95+n*175,life=.5+n*.8;if(t>=life)continue;const drag=(1-Math.exp(-t*2))/2,x=Math.cos(a)*velocity*drag,y=Math.sin(a)*velocity*drag-t*24+t*t*65,tail=.018*(1-t/life),old=Math.max(0,t-tail),oldDrag=(1-Math.exp(-old*2))/2;ctx.globalAlpha=Math.pow(1-t/life,.8);ctx.strokeStyle=i%3?'#ff941f':'#ffe8a4';ctx.lineWidth=1+n*1.5;ctx.beginPath();ctx.moveTo(Math.cos(a)*velocity*oldDrag,Math.sin(a)*velocity*oldDrag-old*24+old*old*65);ctx.lineTo(x,y);ctx.stroke();dot(ctx,x,y,1+n,'#ffbb4c');}
 ctx.restore();
}
function drawState(ctx,state,time){for(const b of state?.items||[])draw(ctx,b,time);for(const e of state?.effects||[])explosion(ctx,e,time);}

root.BombRenderer={ready,draw,drawState};
})(window);
