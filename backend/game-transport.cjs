const {AsyncLocalStorage}=require('node:async_hooks');
const context=new AsyncLocalStorage();
exports.withClient=(client,worker,seeds={})=>context.run({client,reads:new Map(),players:new Map(),seeds:{...seeds},preserveCatalog:seeds.preserveCatalog===true},worker);
const ident=name=>{if(!/^[a-z_][a-z0-9_]*$/.test(name))throw Error('invalid_identifier');return '"'+name+'"'};
const tables=new Set(['shop_players','shop_access','shop_sessions','shop_profiles','shop_logo_catalog','shop_inventories','shop_public_users','shop_activity','shop_notifications','shop_operations','shop_random_key_tickets','shop_random_key_pool','shop_random_key_claims','shop_perripet_states','shop_perripet_inventory','shop_inventory_chests','shop_perri_chests','shop_rpg_catalog','shop_rpg_inventory','shop_rpg_equipment','shop_rpg_loadout','shop_rpg_combat_state','shop_rpg_ledger','perri_casillas_games']);
const rpcs=new Set(['shop_rpg_ensure_starter_set','shop_rpg_purchase_items','shop_rpg_equip_armor','shop_rpg_set_loadout','shop_rpg_consume_item','shop_rpg_claim_boss_reward']);
async function request(input,opts={}){
 const state=context.getStore(),client=state?.client;if(!client)throw Error('No transactional game context');
 const u=new URL(input),parts=u.pathname.split('/rest/v1/')[1]?.split('/');if(!parts)throw Error('invalid_game_transport');
 const values=[];const param=value=>{values.push(value!==null&&typeof value==='object'?JSON.stringify(value):value);return '$'+values.length};
 const body=opts.body?JSON.parse(opts.body):null;let sql;
 if(parts[0]==='rpc'){
  if(!rpcs.has(parts[1]))throw Error('rpc_not_allowed');
  sql='SELECT public.'+ident(parts[1])+'('+Object.entries(body??{}).map(([key,value])=>ident(key)+'=>'+param(value)).join(',')+') AS result';
 }else{
  const table=parts[0];if(!tables.has(table))throw Error('table_not_allowed');
  const filters=[];
  for(const [key,filter]of u.searchParams){if(['select','order','limit','on_conflict','offset'].includes(key))continue;
   const name=ident(key),dot=filter.indexOf('.'),op=filter.slice(0,dot);let value=filter.slice(dot+1);
   if(['eq','neq','gt','gte','lt','lte','like','ilike'].includes(op))filters.push(name+' '+({eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<=',like:'LIKE',ilike:'ILIKE'}[op])+' '+param(value));
   else if(op==='is'&&['null','true','false'].includes(value))filters.push(name+' IS '+value.toUpperCase());
   else if(op==='in'&&/^\([^()]*\)$/.test(value))filters.push(name+' IN ('+value.slice(1,-1).split(',').map(param).join(',')+')');
   else throw Error('filter_not_allowed');
  }
  const where=filters.length?' WHERE '+filters.join(' AND '):'';
  const method=opts.method??'GET';
  // Reutilizar una sola vez las filas completas que el gateway acaba de
  // verificar en ESTA transacción; nunca sesiones almacenadas de otra petición.
  const seeded=state.seeds[table],field=table==='shop_sessions'?'token':table==='shop_access'?'nick':null;
  if(method==='GET'&&field&&seeded&&u.searchParams.get('select')==='*'&&u.searchParams.getAll(field).length===1&&u.searchParams.get(field)==='eq.'+seeded[field]&&(!u.searchParams.has('limit')||u.searchParams.get('limit')==='1')&&[...u.searchParams.keys()].every(k=>['select','limit',field].includes(k))){delete state.seeds[table];return {ok:true,status:200,text:async()=>JSON.stringify([seeded])}}
  // Las aperturas utilizan el catálogo existente; nunca resembrar sus nombres o propiedad.
  if(table==='shop_logo_catalog'&&method!=='GET'&&state.preserveCatalog){
   if(method!=='POST')throw Error('catalog_write_not_allowed');
   return {ok:true,status:200,text:async()=> '[]'};
  }
  // ensurePlayer del servidor antiguo hacía upsert incluso para cuentas existentes.
  // En juegos solo se permiten cuentas ya verificadas; nunca reactivar ni crearlas.
  if(table==='shop_players'&&method!=='GET'){
   if(method!=='POST')throw Error('game_account_write_not_allowed');
   const rows=Array.isArray(body)?body:[body],existing=[];
   for(const row of rows){
    if(!row||typeof row.nick!=='string')throw Error('invalid_existing_player');
    let check=state.players.get(row.nick);if(!check){check=client.query('SELECT nick,active FROM public.shop_players WHERE nick=$1 FOR SHARE',[row.nick]);state.players.set(row.nick,check)}const found=(await check).rows[0];
    if(!found||found.active===false)throw Error('existing_player_required');existing.push(found);
   }
   return {ok:true,status:200,text:async()=>JSON.stringify(existing)};
  }
  if(method==='GET'){
   const columns=(u.searchParams.get('select')??'*').split(',').map(c=>c==='*'?'*':ident(c)).join(',');
   sql='SELECT '+columns+' FROM public.'+ident(table)+where;
   const order=u.searchParams.get('order');if(order)sql+=' ORDER BY '+order.split(',').map(item=>{const [col,dir='asc']=item.split('.');if(!['asc','desc'].includes(dir))throw Error('invalid_order');return ident(col)+' '+dir}).join(',');
   const limit=u.searchParams.get('limit');if(limit){if(!/^\d+$/.test(limit))throw Error('invalid_limit');sql+=' LIMIT '+param(Math.min(10000,Number(limit)))}else sql+=' LIMIT 1000';
  }else if(method==='POST'){
   if(!body)throw Error('invalid_insert');const rows=Array.isArray(body)?body:[body];if(!rows.length)return {ok:true,status:200,text:async()=> '[]'};const keys=Object.keys(rows[0]);
   sql='INSERT INTO public.'+ident(table)+' ('+keys.map(ident).join(',')+') VALUES '+rows.map(row=>'('+keys.map(k=>param(row[k])).join(',')+')').join(',');
   const conflict=u.searchParams.get('on_conflict');if(conflict)sql+=' ON CONFLICT ('+conflict.split(',').map(ident).join(',')+') DO UPDATE SET '+keys.map(k=>ident(k)+'=EXCLUDED.'+ident(k)).join(',');
   sql+=' RETURNING *';
  }else if(method==='PATCH'||method==='DELETE'){
   if(!where)throw Error('unbounded_game_write');
   sql=method==='PATCH'?'UPDATE public.'+ident(table)+' SET '+Object.entries(body??{}).map(([key,value])=>ident(key)+'='+(table==='shop_sessions'&&key==='expires_at'?'LEAST(expires_at,'+param(value)+'::timestamptz)':param(value))).join(',')+where+' RETURNING *':'DELETE FROM public.'+ident(table)+where+' RETURNING *';
  }else throw Error('method_not_allowed');
 }
 // Errores SQL se propagan: no se captura una excepción para continuar una transacción abortada.
 if((opts.method??'GET')!=='GET'){state.reads.clear();state.players.clear();state.seeds={}}
 const data=await client.query(sql,values),result=parts[0]==='rpc'?data.rows[0]?.result:data.rows;
 return {ok:true,status:200,text:async()=>JSON.stringify(result??null)};
}
exports.fetch=(input,opts={})=>{
 const state=context.getStore();if(!state)return Promise.reject(Error('No transactional game context'));
 if((opts.method??'GET')!=='GET')return request(input,opts);
 const url=new URL(input);url.searchParams.sort();const key=url.href;
 let pending=state.reads.get(key);if(!pending){pending=request(input,opts);state.reads.set(key,pending);pending.catch(()=>{if(state.reads.get(key)===pending)state.reads.delete(key)})}return pending;
};
