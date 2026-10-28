import test from 'node:test';
import assert from 'node:assert/strict';
import {createEconomy} from '../backend/economy.mjs';
import {createRepository} from '../backend/repository.mjs';
const id='12345678-1234-4234-8234-123456789abc';
test('economía exige flag, RPC verificada y política configurada antes de cobrar',async()=>{
 let requests=0;const fetchImpl=async()=>{requests++;return Response.json({version:1,transactional:true})};
 const disabled=createEconomy({url:'https://example.invalid',key:'fake',fetchImpl});assert.equal((await disabled.status()).enabled,false);assert.equal(requests,0);
 const incomplete=createEconomy({url:'https://example.invalid',key:'fake',enabled:true,fetchImpl});assert.equal((await incomplete.status()).raffleEnabled,false);
 await assert.rejects(incomplete.execute('A','raffle-buy',{idempotencyKey:id,raffleId:'boletoSorteo2'}),e=>e.code==='operation_disabled');
 const missing=createEconomy({url:'https://example.invalid',key:'fake',enabled:true,fetchImpl:async()=>Response.json({},{status:404})});assert.equal((await missing.status()).enabled,false);
});
test('precio, identidad y acción del RPC provienen del servidor; IDs ajenos se rechazan',async()=>{
 const calls=[];const api=createEconomy({url:'https://example.invalid',key:'private-fake',enabled:true,rafflePrice:3500,raffleMax:3,fetchImpl:async(url,opts)=>{calls.push([url,opts]);return Response.json(opts.method==='GET'?{version:1,transactional:true}:{ok:true,operationId:id,kind:'raffle-buy',pc:6500,tickets:1})}});
 await assert.rejects(api.execute('A','raffle-buy',{idempotencyKey:id,raffleId:'boletoSorteo2',price:0,nick:'B'}),e=>e.status===400);
 await api.execute('A','raffle-buy',{idempotencyKey:id,raffleId:'boletoSorteo2'});assert.deepEqual(JSON.parse(calls.at(-1)[1].body),{p_nick:'A',p_operation:id,p_action:'raffle-buy',p_price:3500,p_max:3});
});
test('errores SQL se reducen a códigos públicos y respuestas ambiguas no confirman compras',async()=>{
 const api=createEconomy({url:'https://example.invalid',key:'fake',enabled:true,fetchImpl:async(_url,opts)=>Response.json(opts.method==='GET'?{version:1,transactional:true}:{message:'SECRET CONNECTION DETAILS'},{status:opts.method==='GET'?200:500})});
 await assert.rejects(api.execute('A','random-redeem',{idempotencyKey:id}),e=>e.code==='economy_unavailable'&&!e.message.includes('SECRET'));
});
test('columnas antiguas opcionales: omite solo las ausentes, sin perder cantidades existentes',async()=>{
 const calls=[];const repo=createRepository({url:'https://example.invalid',key:'fake',fetchImpl:async(url)=>{const columns=new URL(url).searchParams.get('select');calls.push(columns);return columns.includes('saco_chatarra')?Response.json({code:'42703',message:'column saco_chatarra does not exist'},{status:400}):Response.json([{nick:'A',boleto_sorteo1:7,monedas:0,llaves:-2}])}});
 const row=await repo.inventory('A');assert.equal(row.boleto_sorteo1,7);assert.equal(row.llaves,-2);assert.ok(calls.at(-1).includes('boleto_sorteo1'));assert.ok(!calls.at(-1).includes('saco_chatarra'));
 await repo.inventory('A');assert.equal(calls.length,3);
});
