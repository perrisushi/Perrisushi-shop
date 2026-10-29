// Comparación aislada del API: datos locales idénticos y 20 ms sintéticos por REST.
import {performance} from 'node:perf_hooks';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {Readable} from 'node:stream';
const base=process.env.PW2_BENCH_BASE??process.cwd(),load=file=>import(pathToFileURL(resolve(base,file)).href);
const {createRepository}=await load('backend/repository.mjs'),{createBackend}=await load('backend/app.mjs'),{digest,sessionKey}=await load('backend/security.mjs');
const latency=20,pause=()=>new Promise(resolve=>setTimeout(resolve,latency));
let calls=0;const nick='LocalPerf',token='x'.repeat(43),sessions=new Map([[sessionKey(token),{nick,token:sessionKey(token),expires_at:new Date(Date.now()+3600000).toISOString()}]]);
const rows={shop_access:[{nick,code_hash:digest('local-only'),active:true}],shop_players:[{nick,active:true}],shop_profiles:[{nick,owned_logo_ids:[],achievements:[]}],shop_inventories:[{nick,pc:100,polvo_gema:20,monedas:2}],shop_logo_catalog:[],shop_public_users:[],shop_notifications:[],shop_activity:[],shop_random_key_tickets:[],shop_random_key_claims:[]};
const fetchImpl=async(input,options)=>{
 calls++;await pause();const u=new URL(input),table=u.pathname.split('/').pop();
 if(table==='shop_sessions'){
  if(options.method==='POST'){const row=JSON.parse(options.body);sessions.set(row.token,row);return Response.json([])}
  const row=sessions.get(u.searchParams.get('token')?.slice(3));return Response.json(row?[u.searchParams.get('select').includes('!inner')?{...row,shop_players:{active:true,shop_access:{active:true}}}:row]:[]);
 }
 return Response.json(rows[table]??[]);
};
const repo=createRepository({url:'https://local.invalid',key:'LOCAL-ONLY',fetchImpl,allowSessionWrites:true});
const handler=createBackend({repository:repo,sessionStore:'supabase',allowSessionWrites:true,games:{availability:async()=>{await pause();return {available:true}}}});
const results=[];
for(const path of ['/auth/login','/session','/profile','/users','/inventory','/shop/random-key','/shop/raffles','/games/context'])for(let sample=0;sample<4;sample++){
 const login=path==='/auth/login',req=Readable.from(login?[JSON.stringify({nick,password:'local-only'})]:[]);Object.assign(req,{method:login?'POST':'GET',url:'/api'+path,headers:{cookie:'pw2_session='+token,...(login?{origin:'http://127.0.0.1:4173','content-type':'application/json'}:{})},socket:{remoteAddress:'127.0.0.1'}});
 let status;const count=calls,start=performance.now();await handler(req,{setHeader(){},writeHead(s){status=s},end(){}});if(status!==200)throw Error(path+': '+status);results.push({path,sample,ms:+(performance.now()-start).toFixed(2),rest:calls-count});
}
const report={mode:'LOCAL API; SAME FIXTURES; SYNTHETIC 20 MS PER REST REQUEST',latencyMs:latency,results};await writeFile(process.env.PW2_BENCH_OUTPUT??join(tmpdir(),'perriweb-api-performance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
