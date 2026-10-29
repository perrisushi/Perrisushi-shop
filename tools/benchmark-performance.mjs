// Laboratorio aislado. Nunca usa DATABASE_URL ni consulta cuentas reales.
import {PGlite} from '@electric-sql/pglite';
import {readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const base=process.env.PW2_BENCH_BASE??process.cwd(),load=file=>import(pathToFileURL(resolve(base,file)).href);
const {createGames}=await load('backend/games.mjs'),{createRepository}=await load('backend/repository.mjs'),{createBackend}=await load('backend/app.mjs'),{sessionKey}=await load('backend/security.mjs'),{default:transport}=await load('backend/game-transport.cjs'),{serveSite}=await load('backend/site.mjs');
process.env.SUPABASE_URL='https://local-only.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='LOCAL-ONLY';
let seed=123456789;const originalRandom=Math.random;Math.random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296};
const {default:legacy}=await load('backend/games-original.cjs');
const latency=Number(process.env.PW2_BENCH_SQL_LATENCY_MS??0);if(!Number.isFinite(latency)||latency<0||latency>100)throw Error('Invalid local latency');
const pause=()=>new Promise(resolve=>setTimeout(resolve,latency));
const db=new PGlite();let sqlCount=0,restCount=0;
try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 await db.exec((await readFile('tests/fixtures/game-schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(await readFile('tests/fixtures/game-rpg.sql','utf8'));await db.exec(await readFile('tests/fixtures/game-pet.sql','utf8'));
 const user={nick:'LocalA',token:'x'.repeat(43)};
 await db.exec("insert into shop_players(nick) values('LocalA'),('LocalB');insert into shop_access(nick,code_hash,active) values('LocalA','local',true),('LocalB','local',true);insert into shop_inventories(nick,pc,polvo_gema,monedas,duelo) values('LocalA',10000,5000,10,5),('LocalB',10000,5000,10,5)");
 await db.query("insert into shop_sessions(token,nick,expires_at) values($1,$2,now()+interval '1 day')",[sessionKey(user.token),user.nick]);
 const pool={connect:async()=>({query:async(...args)=>{sqlCount++;if(latency)await pause();return db.query(...args)},release(){}})};
 const games=createGames({pool,legacy,enabled:true});
 const results=[];
 async function measure(name,work){const before=sqlCount,requests=restCount,start=performance.now();const result=await work();if(result?.ok===false)throw Error(name+': '+result.error);results.push({name,ms:+(performance.now()-start).toFixed(2),sql:sqlCount-before,rest:restCount-requests,...(name==='Casillas:open'?{reward:result.game?.cells?.[0]?.reward?.kind}:{})});return result}
 for(const [name,action]of [['Duelos','publicShopGetDuelTarget'],['Pet','publicShopPerriPetState'],['Casillas','publicShopGetPerriCasillas'],['RPG','publicShopRpgState']]){
  for(let round=0;round<4;round++)await measure(name+(round===0?':first':':warm'+round),()=>games.execute(user,{action,idempotencyKey:randomUUID()}));
 }
 await measure('RPG:purchase',()=>games.execute(user,{action:'publicShopRpgPurchase',itemId:'potion-weak',quantity:1,idempotencyKey:randomUUID()}));
 await measure('RPG:consume',()=>games.execute(user,{action:'publicShopRpgConsume',itemId:'potion-weak',idempotencyKey:randomUUID()}));
 await measure('Casillas:open',()=>games.execute(user,{action:'publicShopOpenPerriCasilla',cellIndex:0,openId:randomUUID(),idempotencyKey:randomUUID()}));
 const pet=await games.execute(user,{action:'publicShopPerriPetState',idempotencyKey:randomUUID()}),snapshot=structuredClone(pet.snapshot);
 snapshot.syncBase={revision:pet.shared.revision,coins:pet.shared.gems,perriCoins:pet.shared.perriCoins,scrap:pet.shared.scrap,perriPetInventory:pet.shared.perriPetInventory,rpgInventory:pet.shared.rpgInventory};
 await measure('Pet:save',()=>games.execute(user,{action:'publicShopPerriPetSave',snapshot,idempotencyKey:randomUUID()}));
 const fetchImpl=async(input,opts)=>{
  restCount++;if(latency)await pause();const u=new URL(input);
  if(u.pathname.endsWith('/shop_sessions')&&u.searchParams.get('select').includes('shop_players!inner')){
   const rows=(await db.query("SELECT s.nick,s.expires_at,json_build_object('active',p.active,'shop_access',json_build_object('active',a.active)) shop_players FROM shop_sessions s JOIN shop_players p ON p.nick=s.nick JOIN shop_access a ON a.nick=s.nick WHERE s.token=$1",[u.searchParams.get('token').slice(3)])).rows;return Response.json(rows);
  }
  const r=await transport.withClient(db,()=>transport.fetch(input,opts));return Response.json(JSON.parse(await r.text()));
 };
 const repo=createRepository({url:process.env.SUPABASE_URL,key:'local',fetchImpl});const handler=createBackend({repository:repo,sessionStore:'supabase'});
 for(let i=0;i<3;i++)await measure('identity:'+i,()=>handler.authenticate({headers:{cookie:'pw2_session='+user.token}}));
 const site=serveSite({root:process.env.PW2_BENCH_ASSET_ROOT??process.cwd(),authenticate:async()=>user});const assets=[];
 for(const path of ['/src/main.js','/public/assets/fondo-menu-web-pc.webp','/perrirpg.js']){
  let prior;for(let i=0;i<2;i++){
   let status,headers,body;const start=performance.now();await site({url:path,method:'GET',headers:{'accept-encoding':'gzip',...(prior?{'if-none-match':prior}:{})}},{writeHead:(s,h)=>{status=s;headers=h},end:b=>{body=b}});prior=headers.ETag;assets.push({path,round:i,status,bytes:body?.length??0,encoding:headers['Content-Encoding']??'identity',ms:+(performance.now()-start).toFixed(2)});
  }
 }
 const report={mode:'LOCAL PGLITE; SYNTHETIC LATENCY PER SQL/REST CALL',latencyMs:latency,randomSeed:123456789,results,assets};const output=process.env.PW2_BENCH_OUTPUT??join(tmpdir(),'perriweb-performance.json');await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{Math.random=originalRandom;await db.close()}
