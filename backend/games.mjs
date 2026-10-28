import {createHash} from 'node:crypto';
import {sessionKey} from './security.mjs';
import {BackendError} from './repository.mjs';
import transport from './game-transport.cjs';
const actions={publicShopGetNotifications:[],publicShopRefresh:[],publicShopGetProfile:[],publicShopListUsers:[],publicShopPerriPetState:[],publicShopPerriPetSave:['snapshot'],publicShopConsumeSpecialItem:['itemKey'],publicShopRpgState:[],publicShopRpgPurchase:['itemId','quantity'],publicShopRpgEquipArmor:['slot','itemId'],publicShopRpgSetLoadout:['itemId','enabled'],publicShopRpgConsume:['itemId'],publicShopRpgSaveCombat:['combat'],publicShopRpgClearCombat:[],publicShopUpgradeEquipment:['gearType','usePerricita'],publicShopGetDuelTarget:[],publicShopExpireDuelTarget:['targetToken'],publicShopPerformAttack:['targetToken'],publicShopGetPerriCasillas:[],publicShopResetPerriCasillas:[],publicShopOpenPerriCasilla:['openId','operationId','cellIndex']};
// No copiar estados completos por cada consulta/autoguardado. Pet ya valida
// serverRevision dentro de esta misma transacción: repetir una revisión no gasta dos veces.
const revisionOrRead=new Set(['publicShopGetNotifications','publicShopRefresh','publicShopGetProfile','publicShopListUsers','publicShopPerriPetState','publicShopPerriPetSave','publicShopRpgState','publicShopGetDuelTarget','publicShopExpireDuelTarget','publicShopGetPerriCasillas']);
export function createGames({pool,legacy,enabled=false,onError=()=>{}}={}){
 return {configured:Boolean(enabled&&pool&&legacy),async availableFor(user){
  if(!enabled||!pool||!legacy)return false;let client;
  try{client=await pool.connect();return (await client.query('SELECT 1 FROM public.shop_sessions WHERE token=$1 AND nick=$2 AND expires_at>now()',[sessionKey(user.token),user.nick])).rows.length===1}catch{return false}finally{client?.release()}
 },async execute(user,body){
  if(!Object.hasOwn(actions,body.action??''))throw new BackendError(403,'operation_disabled');
  if(!enabled||!pool||!legacy)throw new BackendError(503,'games_not_configured');
  const allowed=['action','idempotencyKey','sessionToken',...actions[body.action]];
  if(Object.keys(body).some(k=>!allowed.includes(k))||typeof body.idempotencyKey!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.idempotencyKey))throw new BackendError(400,'invalid_request');
  if(['publicShopPerformAttack','publicShopExpireDuelTarget'].includes(body.action)&&!legacy.validateDuelTarget?.(body.targetToken,user.nick))throw new BackendError(403,'forbidden');
  const operationId=body.idempotencyKey.toLowerCase(),recordOperation=!revisionOrRead.has(body.action);
  const payload=Object.fromEntries(actions[body.action].filter(k=>Object.hasOwn(body,k)).map(k=>[k,body[k]]));
  const fingerprint=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  let client;
  try{
   client=await pool.connect();
   await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended('pw2:shared-games-economy',0))");
   const op='pw2:game:'+operationId;
   const existing=recordOperation?(await client.query('SELECT nick,action,response FROM public.shop_operations WHERE operation_id=$1',[op])).rows[0]:null;
   if(existing){if(existing.nick!==user.nick||existing.action!==body.action||existing.response.fingerprint!==fingerprint)throw new BackendError(409,'operation_conflict');await client.query('COMMIT');return existing.response.result}
   // No crear cuentas ni inventarios al abrir un juego.
   const inventory=(await client.query('SELECT nick FROM public.shop_inventories WHERE nick=$1 FOR UPDATE',[user.nick])).rows[0];
   if(!inventory)throw new BackendError(409,'inventory_missing');
   const scoped={...payload};for(const field of ['openId','operationId'])if(Object.hasOwn(scoped,field))scoped[field]='pw2:inner:'+user.nick+':'+operationId;
   const raw=await transport.withClient(client,()=>legacy.handleShopAction({...scoped,action:body.action,sessionToken:sessionKey(user.token)}));
   const gear=new Set(['espada','espadaLv2','espadaLv3','espadaLegendaria','escudo','escudoMadera','escudoMetal','escudoLegendario','cuchillo','collar','cascoSushi','guantesSushi','pecheraSushi','pantalonesSushi','botasSushi','pinzaReal']);
   const result=JSON.parse(JSON.stringify(raw,(key,value)=>['sessionToken','code_hash','password_hash','token'].includes(key)?undefined:key==='defenderInventory'&&value?Object.fromEntries(Object.entries(value).filter(([field])=>gear.has(field))):value));
   if(!result?.ok){await client.query('ROLLBACK');return result??{ok:false,error:'game_failed'}}
   if(recordOperation)await client.query('INSERT INTO public.shop_operations(operation_id,nick,action,response,created_at) VALUES($1,$2,$3,$4,now())',[op,user.nick,body.action,JSON.stringify({fingerprint,result})]);
   await client.query('COMMIT');return result;
  }catch(error){try{await client?.query('ROLLBACK')}catch{}try{onError(error)}catch{}if(error instanceof BackendError)throw error;throw new BackendError(503,'games_unavailable')}
  finally{client?.release()}
 }};
}
