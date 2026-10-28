// Ejecuta dos funciones concretas del legado contra memoria aislada, nunca contra Supabase.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=await readFile('.cierre-integracion/perriweb_release_candidate/backend/legacy-shop.cjs','utf8');
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return source.slice(a,b)};
const idem=extract('async function runIdempotentOperation(', '\nfunction pickWeightedEntry(');
const purchase=extract('async function publicShopPurchase(', '\nasync function publicShopUpgradeEquipment(');
function load(code,name,context){return vm.runInNewContext(code+'\n'+name,context,{timeout:1000})}
let workers=0,arrivals=0,release;const barrier=new Promise(r=>{release=r});
const race=load(idem,'runIdempotentOperation',{getStoredOperation:async()=>{if(++arrivals===2)release();await barrier;return null},storeOperation:async()=>{}});
await Promise.all([race('same-id','redeem','A',async()=>++workers),race('same-id','redeem','A',async()=>++workers)]);
assert.equal(workers,2);
let rewards=0;const lostResponse=load(idem,'runIdempotentOperation',{getStoredOperation:async()=>null,storeOperation:async()=>{throw Error('simulated storage failure')}});
for(let i=0;i<2;i++)await assert.rejects(lostResponse('same-id','redeem','A',async()=>++rewards));
assert.equal(rewards,2);
const crossScope=load(idem,'runIdempotentOperation',{getStoredOperation:async()=>({owner:'B',action:'another-action'}),storeOperation:async()=>{}});
assert.equal((await crossScope('collision','redeem','A',async()=>null)).owner,'B');
let balance={pc:10000,boletoSorteo2:0};const noop=async()=>{};
const buy=load(purchase,'publicShopPurchase',{
 requireSession:async()=>({ok:true,nick:'A'}),withNickLock:async(_nick,fn)=>fn(),
 SHOP_ITEMS:{boletoSorteo2:{label:'Test',price:3500,currencyKey:'pc',maxPerUser:3}},
 getInventory:async()=>({...balance}),toNumber:n=>Math.max(0,Number(n)||0),getOwnedChainCount:()=>0,
 saveInventory:async(_nick,next)=>{balance={...next};return next},getProfile:async()=>({}),
 touchPublicUser:noop,updateRows:noop,appendActivity:noop,nowIso:()=>new Date(0).toISOString()
});
await buy('local','boletoSorteo2',1);await buy('local','boletoSorteo2',1);
assert.equal(balance.pc,3000);assert.equal(balance.boletoSorteo2,2);
const report={mode:'LEGACY FUNCTIONS WITH IN_MEMORY STUBS ONLY',supabaseRequests:0,
 repeatedPurchase:{requests:2,charges:2},concurrentSameOperation:{requests:2,workers},retryAfterOperationStorageFailure:{requests:2,rewards},
 operationScopeValidated:false,economySafeToEnable:false};
await mkdir('docs/cierre-integracion',{recursive:true});await writeFile('docs/cierre-integracion/auditoria-economia.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
