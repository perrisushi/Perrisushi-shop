(function(root){'use strict';
// Centro de la mecha ORIGINAL, desde la llama hasta la entrada al casquillo.
// Muestreo por longitud de arco: la brasa consume cuerda a velocidad uniforme.
const points=[];let length=0;
for(let i=0;i<=160;i++){const t=i/160,u=1-t,x=u*u*u*305+3*u*u*t*275+3*u*t*t*249+t*t*t*249,y=u*u*u*85+3*u*u*t*78+3*u*t*t*101+t*t*t*140;if(i)length+=Math.hypot(x-points[i-1].x,y-points[i-1].y);points.push({x,y,length});}
for(const p of points)p.progress=p.length/length;
function tip(progress){const p=Math.max(0,Math.min(1,progress)),i=points.findIndex(q=>q.progress>=p);if(i<=0)return points[0];const a=points[i-1],b=points[i],t=(p-a.progress)/(b.progress-a.progress);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
// Límite del recurso que pertenece a la cuerda/llama; no toca el cuerpo ni el casquillo.
const region=[[227,144],[229,119],[240,96],[256,80],[278,70],[301,67],[316,60],[332,70],[338,86],[332,101],[318,107],[301,106],[285,111],[275,123],[275,144],[251,146]];
function inFuse(x,y){let inside=false;for(let i=0,j=region.length-1;i<region.length;j=i++){const a=region[i],b=region[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function burnAt(x,y){let nearest=Infinity,progress=0;for(const p of points){const d=(x-p.x)**2+(y-p.y)**2;if(d<nearest){nearest=d;progress=p.progress;}}return progress;}
const api={points,tip,inFuse,burnAt,scale:100/404,anchorX:242,anchorY:468};root.BombShared=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
