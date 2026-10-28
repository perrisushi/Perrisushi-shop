import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {checkLive} from '../scripts/check-live.mjs';
import {createBackend} from '../backend/app.mjs';
import {digest} from '../backend/security.mjs';

async function invoke(handle,path,body){
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
 Object.assign(req,{url:path,method:body===undefined?'GET':'POST',socket:{remoteAddress:'127.0.0.1'},headers:{origin:'http://127.0.0.1:4173','content-type':'application/json'}});
 let status,data;await handle(req,{writeHead:s=>{status=s},end:text=>{data=JSON.parse(text)}});return {status,data};
}
test('compras y canjes repetidos/concurrentes en dos instancias no producen cobros ni premios',async()=>{
 let calls=0;const repository=new Proxy({configured:true},{get:(target,key)=>key in target?target[key]:()=>{calls++;throw Error('No debe tocar la BD')}});
 const previous=process.env.PW2_ENABLE_LEGACY_ECONOMY;process.env.PW2_ENABLE_LEGACY_ECONOMY='true';
 try{
  const instances=[createBackend({repository}),createBackend({repository})];
  const results=await Promise.all(Array.from({length:128},(_,i)=>invoke(instances[i%2],i%4<2?'/api/shop/random-key/redeem':'/api/shop/raffles/buy',{idempotencyKey:'12345678-1234-4234-8234-123456789abc',raffleId:'boletoSorteo2',nick:'Other',price:0,reward:999})));
  assert.ok(results.every(r=>r.status===403&&r.data.error==='operation_disabled'));assert.equal(calls,0);
 }finally{if(previous===undefined)delete process.env.PW2_ENABLE_LEGACY_ECONOMY;else process.env.PW2_ENABLE_LEGACY_ECONOMY=previous}
});
test('dispatcher y acciones administrativas antiguas no se exponen',async()=>{
 const handler=createBackend({repository:{configured:true}});
 for(const path of ['/shop-api','/api/shop-api','/api/adminGetInventory','/api/adminConsumeCoin','/api/adminSetInventory'])assert.equal((await invoke(handler,path,{})).status,404);
});

function transport(){
 const calls=[];const fixtures={shop_access:[{nick:'OwnAccount',active:true,code_hash:digest('only-local')}],shop_players:[{nick:'OwnAccount',active:true}],shop_profiles:[{nick:'OwnAccount',selected_logo_id:'logo-buho-1',owned_logo_ids:['logo-buho-1'],achievements:[],karma:'Neutral'}],shop_logo_catalog:[{logo_id:'logo-buho-1',enabled:true}],shop_inventories:[{nick:'OwnAccount',pc:100,polvo_gema:5,monedas:0,random_key:2,boleto_sorteo1:1,boleto_sorteo2:0,mini_sorteo:0}]};
 return {calls,fixtures,fetchImpl:async(url,options)=>{const target=new URL(url);calls.push([target,options]);return {ok:true,json:async()=>fixtures[target.pathname.split('/').at(-1)]??[]}}};
}
test('verificador de cuenta usa el backend actual en memoria y solo GET a Supabase',async()=>{
 const t=transport();const result=await checkLive({url:'https://example.supabase.co',key:'fake-private-value',nick:'OwnAccount',password:'only-local',fetchImpl:t.fetchImpl});
 assert.equal(result.supabaseWrites,0);assert.equal(result.personalWritesVerified,false);assert.equal(result.economyEnabled,false);
 assert.ok(t.calls.every(([,options])=>options.method==='GET'));assert.ok(!t.calls.some(([url])=>/shop_sessions|pool|operations/.test(url.pathname)));
 assert.ok(!JSON.stringify(result).includes('OwnAccount'));assert.ok(!JSON.stringify(result).includes('fake-private-value'));assert.ok(result.checks.includes('cantidades originales sin normalización'));
});
test('verificador no disimula un Perrilogo antiguo perdido ni modifica para repararlo',async()=>{
 const t=transport();t.fixtures.shop_profiles[0].selected_logo_id='logo-not-owned';
 await assert.rejects(checkLive({url:'https://example.supabase.co',key:'fake',nick:'OwnAccount',password:'only-local',fetchImpl:t.fetchImpl}),/sin sustitución/);
 assert.ok(t.calls.every(([,options])=>options.method==='GET'));
});
test('sin configuración o cuenta autorizada el verificador se detiene antes de consultar',async()=>{
 await assert.rejects(checkLive(),/Faltan SUPABASE/);
 await assert.rejects(checkLive({url:'https://example.supabase.co',key:'fake'}),/cuenta propia autorizada/);
});
