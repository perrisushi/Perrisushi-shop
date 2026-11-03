import {timed,measuredClient} from './metrics.mjs';
import {cosmeticState,equipCosmetic,normalizedComposition,saleCosmetics} from './cosmetics.mjs';
import {verifiedRaffleEntries} from './raffle-integrity.mjs';
import {createHash} from 'node:crypto';import {sessionKey} from './security.mjs';import {BackendError} from './repository.mjs';import {fail} from './moderation.mjs';
const integer=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>2147483647)fail(409,'invalid_balance');return n};
export function createCommunity({pool,moderation,resources=[],cosmeticsEnabled=false}={}){
 const enabled=moderation?.enabled===true;
 async function tx(user,write,scope,work){
  if(!enabled)fail(403,'operation_disabled');let c;
  try{c=measuredClient(await timed('poolMs',()=>pool.connect()));await c.query(write?'BEGIN':'BEGIN READ ONLY');await c.query("SELECT set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)");if(write)await c.query("SELECT pg_advisory_xact_lock(hashtextextended('pw2:shared-games-economy',0))");
   const rls=(await c.query("SELECT bool_or(row_security_active(t::regclass)) AS filtered FROM unnest(ARRAY['public.pw2_store_products','public.pw2_store_purchases','public.pw2_raffles','public.pw2_raffle_entries','public.pw2_raffle_ticket_reservations','public.pw2_community_controls','public.pw2_account_sanctions','public.shop_inventories','public.shop_profiles','public.shop_operations']) t")).rows[0];if(rls?.filtered)fail(503,'community_unavailable');
   if(!(await c.query('SELECT 1 FROM public.shop_sessions s JOIN public.shop_access a ON a.nick=s.nick JOIN public.shop_players p ON p.nick=s.nick WHERE s.token=$1 AND s.nick=$2 AND s.expires_at>now() AND a.active IS DISTINCT FROM FALSE AND p.active IS DISTINCT FROM FALSE',[sessionKey(user.token),user.nick])).rows.length)fail(401,'session_expired');
   await moderation.enforceWithClient(c,user.nick);if(write&&scope)await moderation.serviceWithClient(c,scope);
   const result=await work(c);await c.query('COMMIT');return result;
  }catch(e){try{await c?.query('ROLLBACK')}catch{}if(e instanceof BackendError)throw e;fail(503,'community_unavailable')}finally{c?.release()}
 }
 async function read(user,kind){return tx(user,false,null,async c=>{
  if(kind==='cosmetics'){if(!cosmeticsEnabled)fail(403,'operation_disabled');return cosmeticState(c,user.nick)}
  if(kind==='community')return {announcement:(await c.query("SELECT message FROM public.pw2_community_controls WHERE scope='announcement' AND active=true")).rows[0]?.message??null,maintenance:(await c.query("SELECT scope,message FROM public.pw2_community_controls WHERE scope<>'announcement' AND active=true")).rows};
  const control=(await c.query('SELECT active,message FROM public.pw2_community_controls WHERE scope=$1',[kind==='store'?'shop':'raffles'])).rows[0];
  if(kind==='store')return {maintenance:control?.active===true,message:control?.message??'',items:(await c.query('SELECT id,name,category,reward_type,reward_id,quantity,currency,price,stock,enabled,version FROM public.pw2_store_products WHERE hidden=false ORDER BY created_at,id')).rows};
  return {maintenance:control?.active===true,message:control?.message??'',events:(await c.query("SELECT id,name,season,ticket_field,opens_at,closes_at,state,version,winner,drawn_at FROM public.pw2_raffles WHERE state<>'draft' ORDER BY created_at DESC,id")).rows,entries:(await c.query('SELECT raffle_id,tickets FROM public.pw2_raffle_entries WHERE nick=$1',[user.nick])).rows};
 })}
 async function execute(user,kind,body){
  const keys=kind==='store-buy'?['id','expectedVersion','idempotencyKey']:['id','quantity','idempotencyKey'];
  if(!body||Object.keys(body).some(k=>!keys.includes(k))||typeof body.id!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.id)||typeof body.idempotencyKey!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.idempotencyKey))fail(400,'invalid_request');
  if(kind==='store-buy'&&(!Number.isInteger(body.expectedVersion)||body.expectedVersion<1||body.expectedVersion>2147483647)||kind==='raffle-register'&&(!Number.isInteger(body.quantity)||body.quantity<1||body.quantity>4))fail(400,'invalid_request');
  const fingerprint=createHash('sha256').update(JSON.stringify(Object.fromEntries(keys.map(k=>[k,body[k]])))).digest('hex'),operation='pw2:'+kind+':'+body.idempotencyKey.toLowerCase();
  return tx(user,true,kind==='store-buy'?'shop':'raffles',async c=>{
   const existing=(await c.query('SELECT nick,action,response FROM public.shop_operations WHERE operation_id=$1',[operation])).rows[0];if(existing){if(existing.nick!==user.nick||existing.action!==kind||existing.response.fingerprint!==fingerprint)fail(409,'operation_conflict');return existing.response.result}
   const inv=(await c.query('SELECT * FROM public.shop_inventories WHERE nick=$1 FOR UPDATE',[user.nick])).rows[0];if(!inv)fail(409,'inventory_missing');let result,reservation=null;
   if(kind==='store-buy'){
    const p=(await c.query('SELECT * FROM public.pw2_store_products WHERE id=$1 FOR UPDATE',[body.id])).rows[0];if(!p||p.hidden||!p.enabled||p.stock===0)fail(409,'product_unavailable');if(p.version!==body.expectedVersion)fail(409,'product_changed');
    const cosmetic=['background','frame'].includes(p.reward_type);if(cosmeticsEnabled&&(p.reward_type==='logo'||cosmetic&&!saleCosmetics.some(i=>i.id===p.reward_id&&i.layer===p.reward_type)))fail(409,'product_unavailable');
    const updates={[p.currency]:integer(inv[p.currency])-p.price};if(updates[p.currency]<0)fail(409,'insufficient_balance');
    if(cosmetic){
     if(!cosmeticsEnabled||p.currency!=='pc'||p.quantity!==1)fail(409,'product_unavailable');
     const profile=(await c.query('SELECT cosmetics FROM public.shop_profiles WHERE nick=$1 FOR UPDATE',[user.nick])).rows[0],key=p.reward_type==='background'?'ownedBackgroundIds':'ownedFrameIds';
     if(!Array.isArray(profile?.cosmetics?.[key]))fail(409,'inventory_missing');if(profile.cosmetics[key].includes(p.reward_id))fail(409,'already_owned');
     await c.query('UPDATE public.shop_profiles SET cosmetics=jsonb_set(cosmetics,$1::text[],$2::jsonb),updated_at=now() WHERE nick=$3',[[key],JSON.stringify([...profile.cosmetics[key],p.reward_id]),user.nick]);
    }else if(p.reward_type==='logo'){
     const cat=(await c.query('SELECT enabled FROM public.shop_logo_catalog WHERE logo_id=$1',[p.reward_id])).rows[0];if(!cat?.enabled)fail(409,'product_unavailable');
     const profile=(await c.query('SELECT owned_logo_ids FROM public.shop_profiles WHERE nick=$1 FOR UPDATE',[user.nick])).rows[0];if(!Array.isArray(profile?.owned_logo_ids))fail(409,'inventory_missing');if(profile.owned_logo_ids.includes(p.reward_id))fail(409,'already_owned');
     await c.query('UPDATE public.shop_profiles SET owned_logo_ids=$1,updated_at=now() WHERE nick=$2',[JSON.stringify([...profile.owned_logo_ids,p.reward_id]),user.nick]);
    }else{if(!resources.includes(p.reward_id))fail(409,'product_unavailable');updates[p.reward_id]=integer((updates[p.reward_id]??integer(inv[p.reward_id]))+p.quantity)}
    const fields=Object.keys(updates);if(fields.some(k=>!resources.includes(k)))fail(409,'product_unavailable');await c.query('UPDATE public.shop_inventories SET '+fields.map((k,i)=>'"'+k+'"=$'+(i+1)).join(',')+',updated_at=now() WHERE nick=$'+(fields.length+1),[...fields.map(k=>updates[k]),user.nick]);
    if(Object.hasOwn(updates,'pc'))await c.query('UPDATE public.shop_public_users SET pc=$1,updated_at=now() WHERE nick=$2',[updates.pc,user.nick]);
    if(p.stock!==null)await c.query('UPDATE public.pw2_store_products SET stock=stock-1,version=version+1,updated_at=now() WHERE id=$1',[p.id]);
    const snapshot={name:p.name,category:p.category,rewardType:p.reward_type,rewardId:p.reward_id,quantity:p.quantity,currency:p.currency,price:p.price,version:p.version};await c.query('INSERT INTO public.pw2_store_purchases(id,product_id,nick,snapshot) VALUES($1,$2,$3,$4)',[body.idempotencyKey,p.id,user.nick,JSON.stringify(snapshot)]);await c.query('INSERT INTO public.shop_activity(nick,game,result,details) VALUES($1,$2,$3,$4)',[user.nick,'PerriTienda','Compra '+p.name,p.quantity+' · '+p.price+' '+(p.currency==='pc'?'PC':'Gemas')]);result={ok:true,operationId:body.idempotencyKey,productId:p.id,purchase:snapshot,...(cosmetic?{balances:{pc:updates.pc},acquired:p.reward_id}:{})};
   }else{
    const raffle=(await c.query('SELECT *,now()>=opens_at AND now()<closes_at AS dates_valid FROM public.pw2_raffles WHERE id=$1 FOR UPDATE',[body.id])).rows[0];if(!raffle||raffle.state!=='open'||!raffle.dates_valid)fail(409,'raffle_closed');
    await verifiedRaffleEntries(c,body.id);
    const old=(await c.query('SELECT tickets FROM public.pw2_raffle_entries WHERE raffle_id=$1 AND nick=$2 FOR UPDATE',[body.id,user.nick])).rows[0]?.tickets??0;if(old+body.quantity>4)fail(409,'ticket_limit');
    const pending=(await c.query("SELECT coalesce(sum(e.tickets),0)::int AS tickets FROM public.pw2_raffle_entries e JOIN public.pw2_raffles r ON r.id=e.raffle_id WHERE e.nick=$1 AND r.ticket_field=$2 AND r.state IN ('draft','open','closed')",[user.nick,raffle.ticket_field])).rows[0].tickets;if(pending+body.quantity>4)fail(409,'ticket_limit');
    if(!['boleto_sorteo2','mini_sorteo'].includes(raffle.ticket_field))fail(409,'invalid_request');const remaining=integer(inv[raffle.ticket_field])-body.quantity;if(remaining<0)fail(409,'insufficient_tickets');
    await c.query('UPDATE public.shop_inventories SET "'+raffle.ticket_field+'"=$1,updated_at=now() WHERE nick=$2',[remaining,user.nick]);
    await c.query('INSERT INTO public.pw2_raffle_entries(raffle_id,nick,tickets) VALUES($1,$2,$3) ON CONFLICT(raffle_id,nick) DO UPDATE SET tickets=pw2_raffle_entries.tickets+$3,updated_at=now()',[body.id,user.nick,body.quantity]);
    await c.query('INSERT INTO public.shop_activity(nick,game,result,details) VALUES($1,$2,$3,$4)',[user.nick,'Sorteos','Inscripción '+raffle.name,body.quantity+' boleto(s)']);reservation={quantity:body.quantity,ticketField:raffle.ticket_field,availableBefore:integer(inv[raffle.ticket_field]),availableAfter:remaining};result={ok:true,operationId:body.idempotencyKey,raffleId:body.id,tickets:old+body.quantity,reservation};
   }
   await c.query('INSERT INTO public.shop_operations(operation_id,nick,action,response) VALUES($1,$2,$3,$4)',[operation,user.nick,kind,JSON.stringify({fingerprint,result})]);
   if(reservation)await c.query('INSERT INTO public.pw2_raffle_ticket_reservations(operation_id,raffle_id,nick,ticket_field,quantity,available_before,available_after) VALUES($1,$2,$3,$4,$5,$6,$7)',[operation,body.id,user.nick,reservation.ticketField,reservation.quantity,reservation.availableBefore,reservation.availableAfter]);return result;
  });
 }
 return {enabled,cosmeticsEnabled,read,execute,equip:(user,body)=>{if(!cosmeticsEnabled)fail(403,'operation_disabled');return tx(user,true,null,c=>equipCosmetic(c,user.nick,body))},compositions:(user,nicks)=>tx(user,false,null,async c=>{
  if(!cosmeticsEnabled)return {};const rows=(await c.query('SELECT p.nick,p.selected_logo_id,p.owned_logo_ids,p.cosmetics,a.is_admin FROM public.shop_profiles p JOIN public.shop_access a ON a.nick=p.nick WHERE p.nick=ANY($1::text[])',[nicks])).rows;return Object.fromEntries(rows.map(p=>[p.nick,normalizedComposition(p,p.is_admin)]));
 })};
}
