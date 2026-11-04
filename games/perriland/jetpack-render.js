(function(root){'use strict';
const image=new Image();const ready=new Promise(resolve=>{image.onload=()=>resolve(true);image.onerror=()=>resolve(false);image.src=JetpackShared.config.src;});
function sprite(ctx,x,y,width,alpha=1){if(!image.complete||!image.naturalWidth)return;const height=width*315/375;ctx.save();ctx.globalAlpha*=alpha;ctx.drawImage(image,60,105,375,315,x-width/2,y-height/2,width,height);ctx.restore();}
function dropped(ctx,item,alpha=1){sprite(ctx,item.x,item.y,58,alpha);}
function back(ctx,p,time){if(!p.active||!p.jetpack||time+1e-9>=p.jetpack.expiresAt)return;const width=112,height=width*315/375,y=p.y+8;
 // Se dibuja antes del cuerpo: la imagen original queda realmente a su espalda.
 if(!p.grounded&&!p.grabbedBy){const pulse=1+Math.sin(time*29)*.12,len=(p.flightIntent<0?29:14)*pulse;ctx.save();for(const side of [-1,1]){const x=p.x+side*31,top=y+height/2-3;ctx.fillStyle='#ff8c18';ctx.beginPath();ctx.moveTo(x-6,top);ctx.quadraticCurveTo(x-8,top+len*.5,x,top+len);ctx.quadraticCurveTo(x+8,top+len*.5,x+6,top);ctx.fill();ctx.fillStyle='#ffe68c';ctx.beginPath();ctx.ellipse(x,top+len*.25,3,len*.32,0,0,Math.PI*2);ctx.fill();}ctx.restore();}
 sprite(ctx,p.x,y,width);
}
root.JetpackRenderer={ready,dropped,back};
})(window);
