import {createHash} from 'node:crypto';
import {sessionKey} from './security.mjs';
import {BackendError} from './repository.mjs';
import transport from './game-transport.cjs';
import {gameNames,inspectGameStorage,gameFailure} from './game-readiness.mjs';
import {timed,measuredClient} from './metrics.mjs';
const actions={publicShopOpenInventoryChest:["chestType","chestOpenId"],publicShopOpenRewardContainer:["itemKey","openId"],publicShopGetNotifications:[],publicShopRefresh:[],publicShopGetProfile:[],publicShopListUsers:[],publicShopPerriPetState:[],publicShopPerriPetSave:['snapshot'],publicShopConsumeSpecialItem:['itemKey'],publicShopRpgState:[],publicShopRpgPurchase:['itemId','quantity'],publicShopRpgEquipArmor:['slot','itemId'],publicShopRpgSetLoadout:['itemId','enabled'],publicShopRpgConsume:['itemId'],publicShopRpgSaveCombat:['combat'],publicShopRpgClearCombat:[],publicShopUpgradeEquipment:['gearType','usePerricita'],publicShopGetDuelTarget:[],publicShopExpireDuelTarget:['targetToken'],publicShopPerformAttack:['targetToken'],publicShopGetPerriCasillas:[],publicShopResetPerriCasillas:[],publicShopOpenPerriCasilla:['openId','operationId','cellIndex']};
// No copiar estados completos por cada consulta/autoguardado. Pet ya valida
// serverRevision dentro de esta misma transacción: repetir una revisión no gasta dos veces.
const revisionOrRead=new Set(['publicShopGetNotifications','publicShopRefresh','publicShopGetProfile','publicShopListUsers','publicShopPerriPetState','publicShopPerriPetSave','publicShopRpgState','publicShopGetDuelTarget','publicShopExpireDuelTarget','publicShopGetPerriCasillas']);
export function createGames({pool,legacy,enabled=false,sourceCompatible=true,onError=()=>{},onDiagnostic=()=>{}}={}){
 const emptyGames=()=>Object.fromEntries(gameNames.map(name=>[name,false]));
 const emit=(reason,extra={})=>{try{onDiagnostic({event:'games_runtime',reason,...extra})}catch{}};
 let cachedSchema,pendingSchema;
 const schema=client=>pendingSchema??=(async()=>{if(cachedSchema&&cachedSchema.until>Date.now())return cachedSchema.value;const value=await inspectGameStorage(client);cachedSchema={until:Date.now()+30000,value};return value})().finally(()=>{pendingSchema=null});
 const validUser=user=>typeof user?.nick==='string'&&user.nick.length>0&&typeof user.token==='string'&&/^[\w-]{43}$/.test(user.token);
 const sharedSession=async(client,user)=>{
  if(!validUser(user))return null;
  const rows=(await client.query("SELECT row_to_json(s) AS session,row_to_json(a) AS access FROM public.shop_sessions s JOIN public.shop_access a ON a.nick=s.nick JOIN public.shop_players p ON p.nick=s.nick WHERE s.token=$1 AND s.nick=$2 AND s.expires_at>now() AND a.active IS DISTINCT FROM FALSE AND p.active IS DISTINCT FROM FALSE",[sessionKey(user.token),user.nick])).rows;
  return rows.length===1?rows[0]:null;
 };
 // Los contadores originales no se sustituyen por la ausencia de historial auxiliar.
 const chestStorage=async(client,nick)=>{
  if((await client.query("SELECT row_security_active('public.shop_inventory_chests'::regclass) AS filtered")).rows[0]?.filtered)throw new BackendError(503,'operation_disabled');
  const inventory=(await client.query('SELECT perri_cofres,perri_cofres_minijuego FROM public.shop_inventories WHERE nick=$1',[nick])).rows[0];
  const rows=(await client.query("SELECT chest_type,count(*)::int total,count(*) FILTER (WHERE status='available' AND expires_at>=now())::int quantity FROM public.shop_inventory_chests WHERE nick=$1 GROUP BY chest_type",[nick])).rows;
  const counts=Object.fromEntries(rows.filter(r=>r.quantity>0).map(r=>[r.chest_type,r.quantity]));
  const counterOnly=rows.length===0;
  const consistent=Boolean(inventory)&&(counterOnly||Number(inventory.perri_cofres??0)===(counts.perriCofres??0)&&Number(inventory.perri_cofres_minijuego??0)===(counts.perriCofresMinijuego??0));
  return {counts,counterOnly,consistent};
 };
 const runtime={configured:Boolean(enabled&&pool&&legacy&&sourceCompatible),async containerState(user){
  if(!runtime.configured)return {available:false};let client;
  try{
   client=measuredClient(await timed('poolMs',()=>pool.connect()));if(!await sharedSession(client,user))return {available:false};
   const catalog=await client.query('SELECT logo_id FROM public.shop_logo_catalog WHERE enabled=true LIMIT 1');if(!catalog.rows.length)return {available:false};
   const storage=await chestStorage(client,user.nick);
   if(!storage.consistent)emit('container_inventory_mismatch');
   return {available:storage.consistent,counts:storage.counts};
  }catch(error){emit('container_read_failed',{failure:gameFailure(error)});return {available:false}}finally{client?.release()}
 },async availability(user){
  const reject=reason=>{emit(reason);return {available:false,games:emptyGames(),reason}};
  if(!enabled)return reject('games_disabled');
  if(!pool)return reject('database_not_configured');
  if(!sourceCompatible)return reject('database_project_mismatch');
  if(typeof legacy?.handleShopAction!=='function')return reject('original_backend_missing');
  let client;
  try{
   client=measuredClient(await timed('poolMs',()=>pool.connect()));if(!await sharedSession(client,user))return reject('session_not_shared');
   const checked=await schema(client),available=Object.values(checked.games).some(Boolean);
   if(!Object.values(checked.games).every(Boolean))emit('schema_incomplete',checked);
   return {available,games:checked.games,reason:available?'ready':'schema_incomplete'};
  }catch(error){emit('database_unavailable',{failure:gameFailure(error)});return {available:false,games:emptyGames(),reason:'database_unavailable'}}finally{client?.release()}
 },async availableFor(user){
  return (await runtime.availability(user)).available;
 },async execute(user,body){
  if(!Object.hasOwn(actions,body.action??''))throw new BackendError(403,'operation_disabled');
  if(!enabled||!pool||!legacy||!sourceCompatible)throw new BackendError(503,'games_not_configured');
  const allowed=['action','idempotencyKey','sessionToken',...actions[body.action]];
  if(Object.keys(body).some(k=>!allowed.includes(k))||typeof body.idempotencyKey!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.idempotencyKey))throw new BackendError(400,'invalid_request');
  if(['publicShopPerformAttack','publicShopExpireDuelTarget'].includes(body.action)&&!legacy.validateDuelTarget?.(body.targetToken,user.nick))throw new BackendError(403,'forbidden');
  if(body.action==='publicShopOpenInventoryChest'&&!['perriCofres','perriCofresMinijuego'].includes(body.chestType))throw new BackendError(400,'invalid_request');
  if(body.action==='publicShopOpenRewardContainer'&&!['bolsaGemas','bolsaChatarra','bolsaEspecial','cajitaArmas'].includes(body.itemKey))throw new BackendError(400,'invalid_request');
  const operationId=body.idempotencyKey.toLowerCase(),recordOperation=!revisionOrRead.has(body.action);
  const payload=Object.fromEntries(actions[body.action].filter(k=>Object.hasOwn(body,k)).map(k=>[k,body[k]]));
  const fingerprint=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  let client;
  try{
   client=measuredClient(await timed('poolMs',()=>pool.connect()));
   await client.query('BEGIN');await client.query("SELECT set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)");
   await timed('lockMs',()=>client.query("SELECT pg_advisory_xact_lock(hashtextextended('pw2:shared-games-economy',0))"));
   // Revalidar también antes de devolver un recibo ya registrado, nunca solo al abrir.
   const verified=await sharedSession(client,user);if(!verified)throw new BackendError(401,'session_expired');
   const op='pw2:game:'+operationId;
   const existing=recordOperation?(await client.query('SELECT nick,action,response FROM public.shop_operations WHERE operation_id=$1',[op])).rows[0]:null;
   if(existing){if(existing.nick!==user.nick||existing.action!==body.action||existing.response.fingerprint!==fingerprint)throw new BackendError(409,'operation_conflict');await client.query('COMMIT');return existing.response.result}
   // No crear cuentas ni inventarios al abrir un juego.
   const inventory=(await client.query('SELECT nick FROM public.shop_inventories WHERE nick=$1 FOR UPDATE',[user.nick])).rows[0];
   if(!inventory)throw new BackendError(409,'inventory_missing');
   const openingContainer=['publicShopOpenInventoryChest','publicShopOpenRewardContainer'].includes(body.action);
   if(openingContainer&&!(await client.query('SELECT logo_id FROM public.shop_logo_catalog WHERE enabled=true LIMIT 1')).rows.length)throw new BackendError(503,'operation_disabled');
   const chestState=openingContainer?await chestStorage(client,user.nick):null;
   if(chestState&&!chestState.consistent)throw new BackendError(409,'inventory_mismatch');
   const scoped={...payload};for(const field of ['openId','operationId','chestOpenId'])if(Object.hasOwn(scoped,field))scoped[field]='pw2:inner:'+user.nick+':'+operationId;
   const raw=await transport.withClient(client,()=>legacy.handleShopAction({...scoped,action:body.action,sessionToken:sessionKey(user.token)}),{shop_sessions:verified.session,shop_access:verified.access,preserveCatalog:openingContainer,counterOnlyChests:chestState?.counterOnly===true});
   const gear=new Set(['espada','espadaLv2','espadaLv3','espadaLegendaria','escudo','escudoMadera','escudoMetal','escudoLegendario','cuchillo','collar','cascoSushi','guantesSushi','pecheraSushi','pantalonesSushi','botasSushi','pinzaReal']);
   const result=JSON.parse(JSON.stringify(raw,(key,value)=>['sessionToken','code_hash','password_hash','token'].includes(key)?undefined:key==='defenderInventory'&&value?Object.fromEntries(Object.entries(value).filter(([field])=>gear.has(field))):value));
   if(!result?.ok){await client.query('ROLLBACK');return result??{ok:false,error:'game_failed'}}
   if(recordOperation)await client.query('INSERT INTO public.shop_operations(operation_id,nick,action,response,created_at) VALUES($1,$2,$3,$4,now())',[op,user.nick,body.action,JSON.stringify({fingerprint,result})]);
   await client.query('COMMIT');return result;
  }catch(error){try{await client?.query('ROLLBACK')}catch{}try{onError(error)}catch{}emit('game_action_failed',{action:body.action,failure:error instanceof BackendError?error.code:gameFailure(error)});if(error instanceof BackendError)throw error;throw new BackendError(503,'games_unavailable')}
  finally{client?.release()}
 }};
 return runtime;
}
