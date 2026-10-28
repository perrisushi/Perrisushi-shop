import {BackendError} from './repository.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createEconomy({url,key,enabled=false,rafflePrice,raffleMax,fetchImpl=globalThis.fetch}={}){
 let origin;try{const u=new URL(url);if(u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash)origin=u.origin}catch{}
 const configured=Boolean(origin&&key&&enabled);let lastCheck=0,ready=false;
 async function rpc(name,body){
  if(!configured)throw new BackendError(403,'operation_disabled');
  try{const response=await fetchImpl(new URL('/rest/v1/rpc/'+name,origin),{method:body?'POST':'GET',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),redirect:'error',cache:'no-store'});
   const data=await response.json();if(!response.ok){const allowed=['operation_conflict','insufficient_balance','invalid_balance','ticket_limit','no_stock','no_active_ticket','account_inactive','inventory_missing','raffle_policy_missing'];throw new BackendError(409,allowed.includes(data?.message)?data.message:'economy_unavailable')}
   return data;
  }catch(error){if(error instanceof BackendError)throw error;throw new BackendError(503,'economy_unavailable')}
 }
 async function status(){if(!configured)return {enabled:false,raffleEnabled:false};
  if(Date.now()-lastCheck>30000){try{const s=await rpc('pw2_economy_status');ready=s?.version===1&&s?.transactional===true}catch{ready=false}lastCheck=Date.now()}
  const policy=Number.isSafeInteger(rafflePrice)&&rafflePrice>0&&rafflePrice<=2147483647&&Number.isSafeInteger(raffleMax)&&raffleMax>=1&&raffleMax<=100;
  return {enabled:ready,raffleEnabled:ready&&policy,...(ready&&policy?{price:rafflePrice,max:raffleMax}:{})};
 }
 return {status,async execute(nick,route,body){
  const s=await status();if(!s.enabled||route==='raffle-buy'&&!s.raffleEnabled)throw new BackendError(403,'operation_disabled');
  const keys=route==='raffle-buy'?['idempotencyKey','raffleId']:['idempotencyKey'];
  if(Object.keys(body).some(k=>!keys.includes(k))||typeof body.idempotencyKey!=='string'||!uuid.test(body.idempotencyKey)||route==='raffle-buy'&&body.raffleId!=='boletoSorteo2')throw new BackendError(400,'invalid_request');
  const result=await rpc('pw2_economy_operation',{p_nick:nick,p_operation:body.idempotencyKey,p_action:route,p_price:route==='raffle-buy'?rafflePrice:null,p_max:route==='raffle-buy'?raffleMax:null});
  if(result?.ok!==true||String(result.operationId).toLowerCase()!==body.idempotencyKey.toLowerCase()||result.kind!==route)throw new BackendError(503,'economy_unavailable');
  return result;
 }};
}
