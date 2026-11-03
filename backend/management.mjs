import {verifiedRaffleEntries} from './raffle-integrity.mjs';
import {randomInt} from 'node:crypto';import {fail,iso} from './moderation.mjs';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const text=(v,max=100)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f]/.test(v))fail(400,'invalid_request');return v.trim()};
const int=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)fail(400,'invalid_request');return v};
const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v)))fail(400,'invalid_request');return v};
export const SCOPES=['announcement','shop','raffles','PerriPet','PerriRPG','PerriCasillas','PerriDuelos'];
export function validateManagement(body){
 const allowed={product:['id','expectedVersion','name','category','rewardType','rewardId','quantity','price','stock','enabled','hidden'],raffle:['id','expectedVersion','mode','name','season','ticketField','opensAt','closesAt'],control:['scope','active','message','expectedVersion']};
 if(!Object.hasOwn(allowed,body?.action??''))return null;
 if(Object.keys(body).some(k=>!['action','operationId','reason','confirmed',...allowed[body.action]].includes(k))||body.confirmed!==true||!uuid(body.operationId))fail(400,'invalid_request');
 const op={action:body.action,operationId:body.operationId.toLowerCase(),confirmed:true,reason:text(body.reason,300)};
 if(body.action==='control'){
  if(!SCOPES.includes(body.scope)||typeof body.active!=='boolean')fail(400,'invalid_request');
  return {...op,scope:body.scope,active:body.active,message:body.message===''&&!body.active?'':text(body.message,300),expectedVersion:body.expectedVersion===null?null:int(body.expectedVersion,1,2147483646)};
 }
 if(!uuid(body.id))fail(400,'invalid_request');op.id=body.id.toLowerCase();op.expectedVersion=body.expectedVersion===null?null:int(body.expectedVersion,1,2147483646);
 if(body.action==='product'){
  if(!['logos','utility'].includes(body.category)||!['logo','resource'].includes(body.rewardType)||typeof body.enabled!=='boolean'||typeof body.hidden!=='boolean')fail(400,'unsupported_product');
  if(body.category==='logos'&&body.rewardType!=='logo'||body.category==='utility'&&body.rewardType!=='resource')fail(400,'unsupported_product');
  return {...op,name:text(body.name),category:body.category,rewardType:body.rewardType,rewardId:text(body.rewardId),quantity:body.category==='logos'?int(body.quantity,1,1):int(body.quantity,1,1000000),price:int(body.price,1,2147483647),stock:body.stock===null?null:int(body.stock,0,1000000),enabled:body.enabled,hidden:body.hidden};
 }
 if(!['save','open','close','draw','archive'].includes(body.mode))fail(400,'invalid_request');op.mode=body.mode;
 if(op.mode==='save'){
  if(!['boleto_sorteo2','mini_sorteo'].includes(body.ticketField))fail(400,'invalid_request');
  Object.assign(op,{name:text(body.name),season:text(body.season),ticketField:body.ticketField,opensAt:date(body.opensAt),closesAt:date(body.closesAt)});if(Date.parse(op.closesAt)<=Date.parse(op.opensAt))fail(400,'invalid_request');
 }else if(['name','season','ticketField','opensAt','closesAt'].some(k=>Object.hasOwn(body,k)))fail(400,'invalid_request');
 return op;
}
export async function managementOperation(c,actor,op,{enabled,resources}){
 if(!enabled)fail(403,'operation_disabled');
 if(op.action==='control'){
  const prior=(await c.query('SELECT * FROM public.pw2_community_controls WHERE scope=$1 FOR UPDATE',[op.scope])).rows[0];if((prior?.version??null)!==op.expectedVersion)fail(409,'admin_stale');
  const row=(await c.query('INSERT INTO public.pw2_community_controls(scope,active,message) VALUES($1,$2,$3) ON CONFLICT(scope) DO UPDATE SET active=$2,message=$3,version=pw2_community_controls.version+1,updated_at=now() RETURNING *',[op.scope,op.active,op.message])).rows[0];return {result:{control:row},audit:{scope:op.scope,before:prior??null,after:row}};
 }
 if(op.action==='product'){
  if(op.rewardType==='logo'){if(!(await c.query('SELECT 1 FROM public.shop_logo_catalog WHERE logo_id=$1 AND enabled=true',[op.rewardId])).rows.length)fail(400,'invalid_reward')}
  else if(!resources.includes(op.rewardId)||!(await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shop_inventories' AND column_name=$1 AND data_type IN ('smallint','integer','bigint','numeric')",[op.rewardId])).rows.length)fail(400,'invalid_reward');
  const prior=(await c.query('SELECT * FROM public.pw2_store_products WHERE id=$1 FOR UPDATE',[op.id])).rows[0];if((prior?.version??null)!==op.expectedVersion)fail(409,'admin_stale');
  const args=[op.id,op.name,op.category,op.rewardType,op.rewardId,op.quantity,op.category==='logos'?'pc':'polvo_gema',op.price,op.stock,op.enabled,op.hidden];
  const row=(await c.query('INSERT INTO public.pw2_store_products(id,name,category,reward_type,reward_id,quantity,currency,price,stock,enabled,hidden) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET name=$2,category=$3,reward_type=$4,reward_id=$5,quantity=$6,currency=$7,price=$8,stock=$9,enabled=$10,hidden=$11,version=pw2_store_products.version+1,updated_at=now() RETURNING *',args)).rows[0];
  return {result:{product:row},audit:{productId:op.id,before:prior??null,after:row}};
 }
 const prior=(await c.query('SELECT * FROM public.pw2_raffles WHERE id=$1 FOR UPDATE',[op.id])).rows[0];if((prior?.version??null)!==op.expectedVersion)fail(409,'admin_stale');
 let row;
 if(op.mode==='save'){
  if(prior&&prior.state!=='draft')fail(409,'raffle_state');
  row=(await c.query('INSERT INTO public.pw2_raffles(id,name,season,ticket_field,opens_at,closes_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=$2,season=$3,ticket_field=$4,opens_at=$5,closes_at=$6,version=pw2_raffles.version+1 RETURNING *',[op.id,op.name,op.season,op.ticketField,op.opensAt,op.closesAt])).rows[0];
 }else{
  if(!prior)fail(404,'not_found');
  if(op.mode==='draw'){
   if(prior.state!=='closed')fail(409,'raffle_state');
   const entries=await verifiedRaffleEntries(c,op.id),total=entries.reduce((a,r)=>a+r.tickets,0);if(!Number.isSafeInteger(total)||total<=0||total>1e8)fail(409,'no_participants');
   const ticket=randomInt(total)+1;let cursor=0;const winner=entries.find(r=>(cursor+=r.tickets)>=ticket).nick;
   row=(await c.query("UPDATE public.pw2_raffles SET state='drawn',winner=$2,winning_ticket=$3,total_tickets=$4,drawn_at=now(),version=version+1 WHERE id=$1 RETURNING *",[op.id,winner,ticket,total])).rows[0];
  }else{
   const transitions={open:['draft','open'],close:['open','closed'],archive:['drawn','archived']},t=transitions[op.mode];if(prior.state!==t[0])fail(409,'raffle_state');
   if(op.mode==='open'&&(await c.query("SELECT 1 FROM public.pw2_raffles WHERE ticket_field=$1 AND state='open' AND id<>$2",[prior.ticket_field,prior.id])).rows.length)fail(409,'raffle_state');
   if(op.mode==='open'&&!(await c.query('SELECT 1 FROM public.pw2_raffles WHERE id=$1 AND now()>=opens_at AND now()<closes_at',[op.id])).rows.length)fail(409,'raffle_dates');
   row=(await c.query('UPDATE public.pw2_raffles SET state=$2,version=version+1 WHERE id=$1 RETURNING *',[op.id,t[1]])).rows[0];
  }
 }
 return {result:{raffle:row},audit:{raffleId:op.id,before:prior??null,after:row}};
}
export async function managementRead(c,kind,resources){
 const availableResources=(await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='shop_inventories' AND column_name=ANY($1::text[]) AND data_type IN ('smallint','integer','bigint','numeric') ORDER BY column_name",[resources])).rows.map(r=>r.column_name);
 if(kind==='controls')return {items:(await c.query('SELECT * FROM public.pw2_community_controls ORDER BY scope')).rows,scopes:SCOPES};
 if(kind==='store')return {products:(await c.query('SELECT * FROM public.pw2_store_products ORDER BY created_at DESC,id')).rows,purchases:(await c.query('SELECT id,nick,product_id,snapshot,created_at FROM public.pw2_store_purchases ORDER BY created_at DESC,id DESC LIMIT 100')).rows,logos:(await c.query('SELECT logo_id,name,enabled FROM public.shop_logo_catalog ORDER BY sort_order,logo_id')).rows,resources:availableResources};
 return {events:(await c.query('SELECT * FROM public.pw2_raffles ORDER BY created_at DESC,id')).rows,entries:(await c.query('SELECT e.* FROM public.pw2_raffle_entries e JOIN public.pw2_raffles r ON r.id=e.raffle_id ORDER BY r.created_at DESC,e.nick')).rows};
}
