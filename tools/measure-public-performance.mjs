// Solo recursos públicos y sesión anónima. Nunca lee cookies/credenciales.
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const origin='https://www.perrisushi.com';
const paths=['/','/api/session','/src/main.js','/public/assets/fondo-menu-web-pc.webp','/api/games/context'];
const samples=[];
for(const path of paths)for(let sample=0;sample<5;sample++){
 const start=performance.now();
 try{
  const response=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(20000)}),headersAt=performance.now(),body=await response.arrayBuffer();
  samples.push({path,sample,status:response.status,ttfbMs:+(headersAt-start).toFixed(2),totalMs:+(performance.now()-start).toFixed(2),decodedBytes:body.byteLength,encodedBytes:response.headers.get('content-length'),encoding:response.headers.get('content-encoding'),cache:response.headers.get('cache-control'),serverTiming:response.headers.get('server-timing')});
 }catch{samples.push({path,sample,error:'network_or_timeout'})}
}
const result={mode:'PRODUCTION PUBLIC ONLY; NO AUTHENTICATED SESSION',at:new Date().toISOString(),origin,samples};
const output=process.env.PW2_PERF_OUTPUT??join(tmpdir(),'perriweb-public-performance.json');await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
