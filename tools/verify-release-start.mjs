import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert.equal(pkg.scripts.start,'node backend/server.mjs');
// Mismo ejecutable que npm start, hijo aislado y puerto de prueba, sin credenciales reales.
const child=spawn(process.execPath,['backend/server.mjs'],{env:{...process.env,PORT:'4186',NODE_ENV:'development',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',DATABASE_URL:'',PW2_GAMES_ENABLED:'false',PW2_ECONOMY_ENABLED:'false',SESSION_STORE:'memory',ALLOW_SUPABASE_SESSION_WRITES:'false',PUBLIC_ORIGIN:'http://127.0.0.1:4186',PERRIWEB_PROXY_SECRET:''},stdio:['ignore','pipe','pipe'],windowsHide:true});
let ready=false;
try{
 await Promise.race([new Promise((resolve,reject)=>{child.stdout.on('data',()=>{ready=true;resolve()});child.once('error',reject);child.once('exit',()=>{if(!ready)reject(Error('Server did not start'))})}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Start timeout')),10000);timer.unref()})]);
 const results=[];
 for(const [path,status,type]of [['/',200,'text/html'],['/src/desktop-layout-fix.css',200,'text/css'],['/src/services/api-client.js',200,'text/javascript'],['/api/session',503,'application/json'],['/healthz',503,'application/json'],['/backend/server.mjs',404],['/backend/.env',404],['/.cierre-integracion/perriweb_release_candidate/backend/legacy-shop.cjs',404],['/shop-api',404]]){
  const response=await fetch('http://127.0.0.1:4186'+path);assert.equal(response.status,status,path);if(type)assert.ok(response.headers.get('content-type').includes(type),path);results.push({path,status});await response.arrayBuffer();
 }
 await mkdir('docs/cierre-integracion',{recursive:true});await writeFile('docs/cierre-integracion/arranque.json',JSON.stringify({production:false,configured:false,supabaseRequests:0,results},null,2));console.log(JSON.stringify({startCommand:pkg.scripts.start,checks:results.length,errors:0}));
}finally{child.kill();await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)resolve();else child.once('exit',resolve)})}
