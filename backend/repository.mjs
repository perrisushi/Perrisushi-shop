import {metricsContext} from './metrics.mjs';
export class BackendError extends Error{constructor(status,code,diagnostic){super(code);this.status=status;this.code=code;this.diagnostic=diagnostic}}
const INVENTORY_FIELDS='nick,monedas,llaves,polvo_gema,duelo,perricita,pc,espada,espada_lv2,espada_lv3,escudo,cuchillo,collar,random_key,espada_legendaria,escudo_madera,escudo_metal,escudo_legendario,casco_sushi,guantes_sushi,pechera_sushi,pantalones_sushi,botas_sushi,updated_at,fragmento_key,perri_cofres,perri_cofres_minijuego,boleto_sorteo1,boleto_sorteo2,mini_sorteo,pinza_real,chatarra,agua_divina,espada_sagrada,gema_experiencia,incubadora_mejorada,pocion_divina,reloj_cronotiempo,saco_chatarra,bolsa_gemas,bolsa_chatarra,cajita_armas,bolsa_especial,revivir_pet';
const SELECT={shop_operations:'action,response',shop_access:'nick,code_hash,active',shop_players:'nick,active',shop_sessions:'token,nick,expires_at',shop_profiles:'nick,selected_logo_id,owned_logo_ids,karma,achievements,selected_title_id',shop_logo_catalog:'logo_id,name,asset_path,sort_order,enabled,is_default',shop_inventories:INVENTORY_FIELDS,shop_activity:'id,game,result,details,created_at',shop_notifications:'id,kind,title,message,read_at,created_at',shop_public_users:'nick,pc,logo_id,karma,achievements,selected_title_id',shop_random_key_tickets:'id,status,obtained_at,expires_at',shop_random_key_claims:'id,game,key,claimed_at'};
const quoted=value=>'"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
export function createRepository({url,key,fetchImpl=globalThis.fetch,allowSessionWrites=false,timeoutMs=8000}={}){
 let origin;
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error();origin=u.origin}catch{}
 const configured=Boolean(origin&&key);
 const inventoryOmissions=new Set();
 async function query(table,{nick,filters={},order,limit=1,cursor,column,method='GET',body,publicList=false,statusOnly=false,omitLegacy=false}={}){
  if(!configured)throw new BackendError(503,'backend_not_configured');
  if(!Object.hasOwn(SELECT,table))throw new BackendError(403,'operation_disabled');
  const safePatch=method==='PATCH'&&nick!==undefined&&((table==='shop_profiles'&&Object.keys(body??{}).join(',')==='selected_logo_id'&&filters.owned_logo_ids)||(table==='shop_public_users'&&Object.keys(body??{}).join(',')==='logo_id')||(table==='shop_notifications'&&Object.keys(body??{}).join(',')==='read_at'&&filters.id&&filters.read_at==='is.null'));
  if(method!=='GET'&&!safePatch&&(table!=='shop_sessions'||!allowSessionWrites||!['POST','DELETE'].includes(method)))throw new BackendError(403,'session_writes_disabled');
  const target=new URL('/rest/v1/'+table,origin);target.searchParams.set('select',publicList&&table==='shop_players'?'nick,shop_access!inner(active),shop_public_users!inner(pc,logo_id,karma,achievements,selected_title_id)':statusOnly&&table==='shop_access'?'nick,active':SELECT[table]);
  target.searchParams.set('limit',String(Math.min(51,Math.max(1,limit))));
  if(table==='shop_inventories')target.searchParams.set('select',INVENTORY_FIELDS.split(',').filter(f=>!inventoryOmissions.has(f)).join(','));
  if(nick!==undefined)target.searchParams.set('nick','eq.'+quoted(nick));
  for(const [field,value]of Object.entries(filters))target.searchParams.set(field,value);
  if(order)target.searchParams.set('order',order);
  if(cursor!==undefined)target.searchParams.set(column,'gt.'+quoted(cursor));
  try{
   const metric=metricsContext.getStore();if(metric)metric.queries++;
   const response=await fetchImpl(target,{method,headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json',Prefer:'return=minimal'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeoutMs),redirect:'error',cache:'no-store'});
   if(!response.ok){const problem=await response.json().catch(()=>null);const missing=['boleto_sorteo1','saco_chatarra'].find(field=>String(problem?.message??'').includes(field)&&!inventoryOmissions.has(field));if(problem?.code==='42703'&&table==='shop_inventories'&&missing){inventoryOmissions.add(missing);return query(table,{nick,filters,order,limit,cursor,column,method,body})}throw new BackendError(503,'backend_unavailable',{source:'supabase',table,method,httpStatus:response.status,upstreamCode:['42501','42703','42P01','23503','23505','PGRST100','PGRST116','PGRST204','PGRST301','PGRST302'].includes(problem?.code)?problem.code:'other'})}
   if(method!=='GET')return null;
   const data=await response.json();if(!Array.isArray(data))throw Error();
   if(data.some(row=>typeof row.id==='number'&&!Number.isSafeInteger(row.id)))throw Error();
   return data;
  }catch(error){if(error instanceof BackendError)throw error;throw new BackendError(503,'backend_unavailable',{source:'supabase',table,method,failure:['AbortError','TimeoutError'].includes(error?.name)?'timeout':'transport'})}
 }
 const one=async(table,options)=>(await query(table,options))[0]??null;
 return Object.freeze({configured,
  access:nick=>one('shop_access',{nick}),
  canonicalAccess:async nick=>{
   const exact=await one('shop_access',{nick});if(exact)return exact;
   const literal=nick.replace(/[\\%_*]/g,c=>'\\'+c);
   const rows=await query('shop_access',{filters:{nick:'ilike.'+quoted(literal)},limit:2});
   if(rows.length>1)throw new BackendError(503,'backend_unavailable',{source:'supabase',table:'shop_access',method:'GET',failure:'ambiguous_nick'});
   return rows.length===1&&typeof rows[0].nick==='string'&&rows[0].nick.toLowerCase()===nick.toLowerCase()?rows[0]:null;
  },
  accessStatus:nick=>one('shop_access',{nick,statusOnly:true}),player:nick=>one('shop_players',{nick}),
  session:token=>one('shop_sessions',{filters:{token:'eq.'+quoted(token)}}),
  createSession:row=>{if(!/^v2:[a-f0-9]{64}$/.test(row.token))throw new BackendError(400,'invalid_session');return query('shop_sessions',{method:'POST',body:row})},
  deleteSession:token=>{if(!/^v2:[a-f0-9]{64}$/.test(token))throw new BackendError(400,'invalid_session');return query('shop_sessions',{method:'DELETE',filters:{token:'eq.'+quoted(token)}})},
  profile:nick=>one('shop_profiles',{nick}),logos:async()=>{
   const catalog=[];let cursor;for(let page=0;page<10;page++){
    const rows=await query('shop_logo_catalog',{filters:{enabled:'eq.true'},order:'logo_id.asc',limit:51,cursor,column:'logo_id'});
    catalog.push(...rows.slice(0,50));if(rows.length<=50)return catalog;
    cursor=rows[49].logo_id;if(typeof cursor!=='string')throw new BackendError(503,'backend_unavailable');
   }throw new BackendError(503,'backend_unavailable');
  },
  inventory:nick=>one('shop_inventories',{nick}),
  setAvatar:(nick,id)=>query('shop_profiles',{nick,method:'PATCH',filters:{owned_logo_ids:'cs.'+JSON.stringify([id])},body:{selected_logo_id:id}}),
  syncPublicAvatar:(nick,id)=>query('shop_public_users',{nick,method:'PATCH',body:{logo_id:id}}),
  operationReceipt:(nick,id)=>one('shop_operations',{nick,filters:{operation_id:'eq.'+quoted('pw2:economy:'+id.toLowerCase())}}),
  readNotification:(nick,id)=>query('shop_notifications',{nick,method:'PATCH',filters:{id:'eq.'+quoted(id),read_at:'is.null'},body:{read_at:new Date().toISOString()}}),
  page:(kind,nick,{cursor,limit})=>{
   const table={history:'shop_activity',notifications:'shop_notifications',tickets:'shop_random_key_tickets',claims:'shop_random_key_claims',users:'shop_public_users'}[kind];
   if(!table)throw new BackendError(400,'invalid_page');
   if(kind==='users')return query('shop_public_users',{cursor,column:'nick',order:'nick.asc',limit:limit+1});
   return query(table,{nick,cursor,column:'id',order:'id.asc',limit:limit+1});
  }
 });
}
