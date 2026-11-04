/* Dibujo Canvas: comparte con los impactos exactamente la pose y los anclajes. */
(function(root){'use strict';
function line(c,a,b,color='#192324',width=6){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke()}
function draw(c,p,v,zones=false){if(!v.visible)return;c.save();
 // Dos brazos, una sola pasada. Sus extremos son las sujeciones del objeto.
 line(c,{x:p.x-p.dir*22,y:p.y-3},v.hands[0]);line(c,{x:p.x+p.dir*22,y:p.y-3},v.hands[1]);
 const s=v.shape;
 if(v.item==='sword'){
  line(c,s.hand,s.base,'#725035',7);line(c,s.base,s.tip,'#263841',9);line(c,s.base,s.tip,'#d0dbe1',5);
  const g={x:s.hand.x+s.axis.x*5,y:s.hand.y+s.axis.y*5};line(c,{x:g.x-s.axis.y*10,y:g.y+s.axis.x*10},{x:g.x+s.axis.y*10,y:g.y-s.axis.x*10},'#96713c',5);
 }else if(v.item==='shield'){
  c.fillStyle='#8a6345';c.strokeStyle='#354e5c';c.lineWidth=4;c.beginPath();c.moveTo(s.x-10,s.y-27);c.lineTo(s.x+10,s.y-27);c.lineTo(s.x+10,s.y+13);c.lineTo(s.x,s.y+29);c.lineTo(s.x-10,s.y+13);c.closePath();c.fill();c.stroke();line(c,{x:s.x,y:s.y-21},{x:s.x,y:s.y+15},'#b7c1c3',3);
 }else if(v.item==='pistol'){
  line(c,s.back,s.front,'#263640',11);line(c,{x:s.grip.x,y:s.back.y+4},s.grip,'#79553f',9);line(c,{x:s.front.x,y:s.front.y-4},{x:s.front.x,y:s.front.y+4},'#9bafb7',3);
 }else if(v.item==='spear'){
  line(c,s.back,s.shaftEnd,'#78563c',5);c.fillStyle='#d4dfe2';c.strokeStyle='#314651';c.lineWidth=2;c.beginPath();c.moveTo(s.tip.x,s.tip.y);c.lineTo(s.shaftEnd.x,s.shaftEnd.y-6);c.lineTo(s.shaftEnd.x,s.shaftEnd.y+6);c.closePath();c.fill();c.stroke();
 }
 // Manos pequeñas y legibles: coinciden con los extremos de los brazos.
 for(const h of v.hands.slice(0,v.item==='sword'?1:2)){c.fillStyle='#192324';c.beginPath();c.arc(h.x,h.y,3.5,0,Math.PI*2);c.fill()}
 if(zones&&v.hit){const z=v.hit;c.strokeStyle='#aa4b16';c.lineWidth=1.5;c.setLineDash([3,3]);if(z.kind==='blade'){line(c,z.a,z.b,'#aa4b16',z.r*2)}else if(z.kind==='tip'){c.beginPath();c.arc(z.center.x,z.center.y,z.r,0,Math.PI*2);c.stroke()}else if(z.kind==='shield')c.strokeRect(z.x,z.y,z.w,z.h)}c.restore();
}
function projectiles(c,system){c.save();for(const b of system.projectiles){c.fillStyle='#42382b';c.beginPath();c.arc(b.x,b.y,b.r,0,Math.PI*2);c.fill();if(system.showZones){c.strokeStyle='#aa4b16';c.lineWidth=1.5;c.stroke();}}c.restore()}
const api={draw,projectiles};root.SalaWeaponView=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
