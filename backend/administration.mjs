import {validateManagement,managementOperation,managementRead} from './management.mjs';
import {moderationOperation,moderationHistory} from './moderation.mjs';
import {createHash} from 'node:crypto';
import {BackendError} from './repository.mjs';
import {sessionKey} from './security.mjs';
export const ADMIN_ROUTES=['/api/admin/context','/api/admin/users','/api/admin/controls','/api/admin/sanctions','/api/admin/account','/api/admin/records','/api/admin/store','/api/admin/raffles','/api/admin/execute'];
// Solo contadores conocidos. Cofres/boletos/Random Key tienen registros auxiliares:
// no se corrigen cambiando únicamente su contador.
export const EDITABLE_RESOURCES=['pc','polvo_gema','monedas','llaves','duelo','perricita','espada','espada_lv2','espada_lv3','escudo','cuchillo','collar','espada_legendaria','escudo_madera','escudo_metal','escudo_legendario','casco_sushi','guantes_sushi','pechera_sushi','pantalones_sushi','botas_sushi','pinza_real','chatarra','agua_divina','espada_sagrada','gema_experiencia','incubadora_mejorada','pocion_divina','reloj_cronotiempo','saco_chatarra','fragmento_key','bolsa_gemas','bolsa_chatarra','cajita_armas','bolsa_especial','revivir_pet'];
const error=(status,code)=>{throw new BackendError(status,code)};
const nick=value=>{if(typeof value!=='string'||!value.length||value.length>100||/[\x00-\x1f]/.test(value))error(400,'invalid_request');return value};
const quantity=value=>{if(!Number.isInteger(value)||value<0||value>2147483647)error(400,'invalid_request');return value};
const text=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))error(400,'invalid_request');return value.trim()};
export function validateAdminOperation(body){
 const management=validateManagement(body);if(management)return management;
 if(!body||typeof body!=='object'||Array.isArray(body))error(400,'invalid_request');
 const allowed={resource:['target','field','expected','value','mode','confirmed'],access:['target','expectedAccess','expectedPlayer','active'],notice:['target','audience','title','message'],moderation:['target','mode','kind','durationSeconds','until','expectedSanctionId','confirmed'],logo:['target','logoId','grant','expectedOwned','confirmed']};
 if(!Object.hasOwn(allowed,body.action??'')||Object.keys(body).some(k=>!['action','operationId','reason',...allowed[body.action]].includes(k)))error(400,'invalid_request');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.operationId??''))error(400,'invalid_request');
 const op={action:body.action,operationId:body.operationId.toLowerCase(),reason:text(body.reason,300)};
 if(body.action==='resource'){
  if(body.confirmed!==true)error(400,'invalid_request');op.confirmed=true;
  const mode=body.mode??'set';if(!['set','add','remove'].includes(mode)||mode!=='set'&&body.value===0)error(400,'invalid_request');op.mode=mode;
  if(!EDITABLE_RESOURCES.includes(body.field))error(400,'invalid_request');
  Object.assign(op,{target:nick(body.target),field:body.field,expected:quantity(body.expected),value:quantity(body.value)});
 }else if(body.action==='access'){
  if([body.active,body.expectedAccess,body.expectedPlayer].some(v=>typeof v!=='boolean'))error(400,'invalid_request');
  Object.assign(op,{target:nick(body.target),expectedAccess:body.expectedAccess,expectedPlayer:body.expectedPlayer,active:body.active});
 }else if(body.action==='moderation'){
  if(body.confirmed!==true||!['kick','temporary','permanent','lift','change'].includes(body.mode))error(400,'invalid_request');
  Object.assign(op,{target:nick(body.target),mode:body.mode,confirmed:true,expectedSanctionId:body.expectedSanctionId??null});
  if(op.expectedSanctionId!==null&&!/^[a-f0-9-]{36}$/i.test(op.expectedSanctionId))error(400,'invalid_request');
  const kind=body.mode==='change'?body.kind:body.mode;
  if(body.mode==='change'&&!['temporary','permanent'].includes(kind))error(400,'invalid_request');
  if(body.mode==='change')op.kind=kind;
  if(kind==='temporary'){if(body.durationSeconds!==undefined){if(![900,3600,21600,86400,259200,604800,2592000].includes(body.durationSeconds)||body.until!==undefined)error(400,'invalid_sanction_date');op.durationSeconds=body.durationSeconds}else{if(typeof body.until!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.until)||!Number.isFinite(Date.parse(body.until)))error(400,'invalid_sanction_date');op.until=body.until}}else if(body.durationSeconds!==undefined||body.until!==undefined)error(400,'invalid_request');
 }else if(body.action==='logo'){
  if(body.confirmed!==true||typeof body.grant!=='boolean'||typeof body.expectedOwned!=='boolean')error(400,'invalid_request');
  Object.assign(op,{target:nick(body.target),logoId:text(body.logoId,100),grant:body.grant,expectedOwned:body.expectedOwned,confirmed:true});
 }else{
  if(!['individual','all'].includes(body.audience)||body.audience==='all'&&body.target!==undefined)error(400,'invalid_request');
  Object.assign(op,{audience:body.audience,title:text(body.title,100),message:text(body.message,1200),...(body.audience==='individual'?{target:nick(body.target)}:{})});
 }
 return op;
}
export function createAdministration({pool,sourceCompatible=true,moderation,onDiagnostic=()=>{}}={}){
 const configured=Boolean(pool&&sourceCompatible);
 async function transaction(user,write,task){
  if(!configured)error(503,'admin_unavailable');let client;
  try{
   client=await pool.connect();await client.query(write?'BEGIN':'BEGIN READ ONLY');
   await client.query("SELECT set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)");
   const rls=(await client.query("SELECT bool_or(row_security_active(t::regclass)) AS filtered FROM unnest(ARRAY['public.shop_access','public.shop_players','public.shop_sessions','public.shop_operations','public.shop_inventories','public.shop_notifications','public.shop_logo_catalog']) t")).rows[0];
   if(rls?.filtered)error(503,'admin_unavailable');
   if(write)await client.query("SELECT pg_advisory_xact_lock(hashtextextended('pw2:shared-games-economy',0))");
   // Se exige la sesión real también dentro de la transacción. Nunca un rol del cliente.
   const auth=(await client.query(`SELECT a.nick,a.is_admin,a.active AS access_active,p.active AS player_active FROM public.shop_sessions s JOIN public.shop_access a ON a.nick=s.nick JOIN public.shop_players p ON p.nick=s.nick WHERE s.token=$1 AND s.nick=$2 AND s.expires_at>now()${write?' FOR SHARE OF s,a,p':''}`,[sessionKey(user.token),user.nick])).rows[0];
   if(!auth||auth.access_active===false||auth.player_active===false)error(401,'session_expired');
   if(auth.is_admin!==true)error(403,'admin_required');
   await moderation?.enforceWithClient(client,user.nick);
   const result=await task(client);await client.query('COMMIT');return result;
  }catch(e){try{await client?.query('ROLLBACK')}catch{}if(e instanceof BackendError)throw e;try{onDiagnostic({event:'admin_operation_failed',failure:['42501','42703','42P01','23514','23505','40001','40P01','55P03','57014'].includes(e?.code)?e.code:'database_unavailable'})}catch{}error(503,'admin_unavailable')}
  finally{client?.release()}
 }
 async function read(user,kind,params){
  const allowed={users:['after','search'],account:['target'],sanctions:['target','after'],controls:[],records:['after'],store:[],raffles:[]};
  if(!Object.hasOwn(allowed,kind)||[...params.keys()].some(k=>!allowed[kind].includes(k)||params.getAll(k).length!==1))error(400,'invalid_request');
  return transaction(user,false,async c=>{
   if(moderation?.enabled&&['store','raffles','controls'].includes(kind))return managementRead(c,kind,EDITABLE_RESOURCES);
   if(kind==='controls')error(403,'operation_disabled');
   if(kind==='users'){
    const after=params.get('after')??'',search=params.get('search')??'';if(after.length>100||search.length>100)error(400,'invalid_request');
    const rows=(await c.query('SELECT p.nick,p.active AS player_active,a.active AS access_active,a.is_admin,i.pc,i.polvo_gema'+(moderation?.enabled?",(SELECT kind FROM public.pw2_account_sanctions s WHERE s.nick=p.nick AND s.status='active' AND (s.expires_at IS NULL OR s.expires_at>clock_timestamp())) AS sanction_kind":'')+' FROM public.shop_players p JOIN public.shop_access a ON a.nick=p.nick LEFT JOIN public.shop_inventories i ON i.nick=p.nick WHERE p.nick>$1 AND ($2=\'\' OR strpos(lower(p.nick),lower($2))>0) ORDER BY p.nick LIMIT 26',[after,search])).rows;
    return {items:rows.slice(0,25),next:rows.length>25?rows[24].nick:null};
   }
   if(kind==='sanctions')return moderationHistory(c,nick(params.get('target')),moderation,params.get('after'));
   if(kind==='account'){
    const target=nick(params.get('target'));
    const account=(await c.query('SELECT p.nick,p.active AS player_active,a.active AS access_active,a.is_admin FROM public.shop_players p JOIN public.shop_access a ON a.nick=p.nick WHERE p.nick=$1',[target])).rows[0];if(!account)error(404,'not_found');
    const raw=(await c.query('SELECT to_jsonb(i) AS inventory FROM public.shop_inventories i WHERE nick=$1',[target])).rows[0]?.inventory??null;
    const inventory=raw?Object.fromEntries(Object.entries(raw).filter(([key,value])=>key!=='nick'&&key!=='updated_at'&&Number.isSafeInteger(value)&&value>=0)):null;
    return {account,inventory,moderation:await moderationHistory(c,target,moderation),logos:moderation?.enabled?(await c.query('SELECT logo_id,name,enabled FROM public.shop_logo_catalog ORDER BY sort_order,logo_id')).rows:[],ownedLogoIds:moderation?.enabled?(await c.query('SELECT owned_logo_ids FROM public.shop_profiles WHERE nick=$1',[target])).rows[0]?.owned_logo_ids??[]:[],editableFields:EDITABLE_RESOURCES.filter(k=>inventory&&Object.hasOwn(inventory,k))};
   }
   if(kind==='records'){
    const after=params.get('after');let date=null,id='';
    if(after){try{if(after.length>800)throw Error();const decoded=JSON.parse(Buffer.from(after,'base64url').toString());if(Object.keys(decoded).sort().join(',')!=='date,id'||typeof decoded.date!=='string'||decoded.date.length>50||!Number.isFinite(Date.parse(decoded.date))||!/^pw2:admin:[a-f0-9-]{36}$/.test(decoded.id))throw Error();date=decoded.date;id=decoded.id}catch{error(400,'invalid_request')}}
    const rows=(await c.query("SELECT operation_id,nick,action,response->'audit' AS audit,created_at::text AS created_at FROM public.shop_operations WHERE operation_id LIKE 'pw2:admin:%' AND ($1::timestamptz IS NULL OR (created_at,operation_id)<($1::timestamptz,$2)) ORDER BY shop_operations.created_at DESC,operation_id DESC LIMIT 26",[date,id])).rows;
    return {items:rows.slice(0,25),next:rows.length>25?Buffer.from(JSON.stringify({date:rows[24].created_at,id:rows[24].operation_id})).toString('base64url'):null};
   }
   if(kind==='store')return {logos:(await c.query('SELECT logo_id,name,enabled,sort_order FROM public.shop_logo_catalog ORDER BY sort_order,logo_id')).rows};
   const columns=(await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='shop_inventories' AND column_name IN ('boleto_sorteo1','boleto_sorteo2','mini_sorteo') ORDER BY column_name")).rows.map(r=>r.column_name);
   const totals=columns.length?(await c.query('SELECT '+columns.map(k=>'coalesce(sum("'+k+'"),0)::text AS "'+k+'"').join(',')+' FROM public.shop_inventories')).rows[0]:{};
   const operations=(await c.query("SELECT operation_id,nick,created_at FROM public.shop_operations WHERE action='raffle-buy' ORDER BY created_at DESC,operation_id DESC LIMIT 25")).rows;
   return {totals,operations};
  });
 }
 async function execute(user,body){
  const op=validateAdminOperation(body),fingerprint=createHash('sha256').update(JSON.stringify(op)).digest('hex'),id='pw2:admin:'+op.operationId;
  return transaction(user,true,async c=>{
   const existing=(await c.query('SELECT nick,action,response FROM public.shop_operations WHERE operation_id=$1',[id])).rows[0];
   if(existing){if(existing.nick!==user.nick||existing.action!=='admin:'+op.action||existing.response?.fingerprint!==fingerprint)error(409,'operation_conflict');return existing.response.result}
   let audit={reason:op.reason},result={ok:true,operationId:op.operationId};
   if(['product','raffle','control'].includes(op.action)){const change=await managementOperation(c,user.nick,op,{enabled:moderation?.enabled,resources:EDITABLE_RESOURCES});Object.assign(result,change.result);audit={...audit,...change.audit};
   }else if(op.action==='resource'){
    // Interpolación limitada a la lista constante anterior; valores siempre parametrizados.
    const before=(await c.query('SELECT "'+op.field+'" AS value FROM public.shop_inventories WHERE nick=$1 FOR UPDATE',[op.target])).rows[0];
    if(!before)error(404,'not_found');
    const previous=typeof before.value==='string'&&/^\d+(?:\.0+)?$/.test(before.value)?Number(before.value):before.value;
    if(!Number.isInteger(previous)||previous<0||previous>2147483647)error(409,'invalid_balance');
    if(previous!==op.expected)error(409,'admin_stale');
    const after=op.mode==='add'?previous+op.value:op.mode==='remove'?previous-op.value:op.value;if(!Number.isInteger(after)||after<0||after>2147483647)error(409,'invalid_balance');
    await c.query('UPDATE public.shop_inventories SET "'+op.field+'"=$1,updated_at=now() WHERE nick=$2',[after,op.target]);
    if(op.field==='pc')await c.query('UPDATE public.shop_public_users SET pc=$1,updated_at=now() WHERE nick=$2',[after,op.target]);
    audit={...audit,target:op.target,field:op.field,before:previous,after,mode:op.mode};
   }else if(op.action==='moderation'){const change=await moderationOperation(c,user.nick,op,moderation);Object.assign(result,change.result);audit={...audit,...change.audit};
   }else if(op.action==='logo'){
    const catalog=(await c.query('SELECT enabled FROM public.shop_logo_catalog WHERE logo_id=$1',[op.logoId])).rows[0];if(!catalog||op.grant&&!catalog.enabled)error(400,'invalid_request');
    const profile=(await c.query('SELECT owned_logo_ids,selected_logo_id FROM public.shop_profiles WHERE nick=$1 FOR UPDATE',[op.target])).rows[0];if(!profile||!Array.isArray(profile.owned_logo_ids))error(409,'inventory_missing');
    const owned=profile.owned_logo_ids.includes(op.logoId);if(owned!==op.expectedOwned)error(409,'admin_stale');if(owned===op.grant)error(409,'operation_conflict');
    const after=op.grant?[...profile.owned_logo_ids,op.logoId]:profile.owned_logo_ids.filter(v=>v!==op.logoId);const selected=after.includes(profile.selected_logo_id)?profile.selected_logo_id:after[0]??'';
    await c.query('UPDATE public.shop_profiles SET owned_logo_ids=$1,selected_logo_id=$2,updated_at=now() WHERE nick=$3',[JSON.stringify(after),selected,op.target]);await c.query('UPDATE public.shop_public_users SET logo_id=$1,updated_at=now() WHERE nick=$2',[selected,op.target]);
    audit={...audit,target:op.target,logoId:op.logoId,before:owned,after:op.grant};
   }else if(op.action==='access'){
    if(moderation?.enabled)error(403,'operation_disabled');
    const target=(await c.query('SELECT a.active AS access_active,p.active AS player_active,a.is_admin FROM public.shop_access a JOIN public.shop_players p ON p.nick=a.nick WHERE a.nick=$1 FOR UPDATE OF a,p',[op.target])).rows[0];
    if(!target)error(404,'not_found');if(target.is_admin===true||op.target===user.nick)error(403,'admin_protected');
    if(target.access_active!==op.expectedAccess||target.player_active!==op.expectedPlayer)error(409,'admin_stale');
    await c.query('UPDATE public.shop_access SET active=$1,updated_at=now() WHERE nick=$2',[op.active,op.target]);
    await c.query('UPDATE public.shop_players SET active=$1,updated_at=now() WHERE nick=$2',[op.active,op.target]);
    // También al reactivar: ninguna sesión anterior recupera acceso.
    await c.query('DELETE FROM public.shop_sessions WHERE nick=$1',[op.target]);
    audit={...audit,target:op.target,before:{access:target.access_active,player:target.player_active},after:{access:op.active,player:op.active}};
   }else{
    let recipients;
    if(op.audience==='all')recipients=(await c.query('SELECT p.nick FROM public.shop_players p JOIN public.shop_access a ON a.nick=p.nick WHERE p.active IS TRUE AND a.active IS TRUE ORDER BY p.nick LIMIT 5001')).rows;
    else{const found=(await c.query('SELECT nick FROM public.shop_players WHERE nick=$1',[op.target])).rows; if(!found.length)error(404,'not_found');recipients=found}
    if(recipients.length>5000)error(409,'admin_recipient_limit');
    const sent=await c.query("INSERT INTO public.shop_notifications(nick,kind,title,message,payload) SELECT nick,'system',$2,$3,jsonb_build_object('adminNotice',true) FROM unnest($1::text[]) AS recipients(nick) RETURNING id",[recipients.map(r=>r.nick),op.title,op.message]);
    result.count=sent.rows.length;audit={...audit,audience:op.audience,...(op.target?{target:op.target}:{}),title:op.title,message:op.message,count:result.count};
   }
   await c.query('INSERT INTO public.shop_operations(operation_id,nick,action,response,created_at) VALUES($1,$2,$3,$4,now())',[id,user.nick,'admin:'+op.action,JSON.stringify({fingerprint,result,audit})]);
   return result;
  });
 }
 return Object.freeze({configured,read,execute,moderationEnabled:moderation?.enabled===true});
}
