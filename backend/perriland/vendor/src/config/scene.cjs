'use strict';
const characterScale=1.5;
const terrain=[
 {id:'low',name:'Plataforma izquierda',x:81,y:566,w:337,h:121},
 {id:'high',name:'Plataforma derecha',x:1544,y:321,w:345,h:117},
 {id:'floor',name:'Suelo principal',x:91,y:954,w:1738,h:126}
];
module.exports={width:1920,height:1080,port:8792,host:'127.0.0.1',targetFps:60,snapshotFps:30,
 bombExplosion:{radius:220,radialSpeed:1400,liftSpeed:1200,speedLimitMultiplier:2,reactionDuration:.35},
 characterScale,radius:28*characterScale,leg:22*characterScale,terrain,floor:terrain[2],platforms:terrain.slice(0,2),ladder:{},
 respawnDelay:3,respawnCenterX:960,respawnVariation:120*characterScale,killY:1220,
 physics:{walkSpeed:340,acceleration:1600,jumpSpeed:898.47,gravity:1400,fallSpeed:900,dashSpeed:480,grabRange:75*characterScale,climbRange:88*characterScale},
 coinRadius:27.3,coinMinDelay:30,coinMaxDelay:60,coinLifetime:Infinity,coinPoints:5,specialCoinScale:2.25,specialCoinPoints:20,specialCoinInterval:150,voidPenalty:2,flagDuration:5,
 maxParticles:72,maxActiveCoins:1,inputLease:700,
 image:{width:1920,height:1080,src:'/assets/terreno/plataformas.png'}};
