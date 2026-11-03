import {ADMIN_ECONOMY_BODY_MD5} from './economy-definition.mjs';
import {BackendError} from './repository.mjs';
export const fail=(status,code,publicDetails)=>{const e=new BackendError(status,code);if(publicDetails)e.publicDetails=publicDetails;throw e};
export const iso=value=>value==null?null:new Date(value).toISOString();
export function createModeration({pool,enabled=false,maxDays=365}={}){
 if(!Number.isInteger(maxDays)||maxDays<1||maxDays>3650)throw Error('PW2_MODERATION_MAX_DAYS inválido');
 if(enabled&&!pool)throw Error('Moderación requiere PostgreSQL');
 async function stateWithClient(c,nick){
  if(!enabled)return null;
  if((await c.query("SELECT row_security_active('public.pw2_account_sanctions'::regclass) AS filtered")).rows[0]?.filtered)fail(503,'moderation_unavailable');
  const r=(await c.query("SELECT id,kind,starts_at,expires_at FROM public.pw2_account_sanctions WHERE nick=$1 AND status='active' AND (expires_at IS NULL OR expires_at>clock_timestamp())",[nick])).rows[0];
  return r?{id:r.id,kind:r.kind,startsAt:iso(r.starts_at),expiresAt:iso(r.expires_at)}:null;
 }
 async function enforceWithClient(c,nick){const state=await stateWithClient(c,nick);if(state)fail(403,state.kind==='temporary'?'account_suspended':'account_banned',{...(state.expiresAt?{expiresAt:state.expiresAt}:{})})}
 async function check(nick){if(!enabled)return;let c;try{c=await pool.connect();await enforceWithClient(c,nick)}catch(e){if(e instanceof BackendError)throw e;fail(503,'moderation_unavailable')}finally{c?.release()}}
 async function serviceWithClient(c,scope){if(!enabled)return;if((await c.query("SELECT row_security_active('public.pw2_community_controls'::regclass) AS filtered")).rows[0]?.filtered)fail(503,'moderation_unavailable');const row=(await c.query('SELECT active FROM public.pw2_community_controls WHERE scope=$1',[scope])).rows[0];if(row?.active)fail(503,'service_maintenance')}
 async function service(scope){if(!enabled)return;let c;try{c=await pool.connect();await serviceWithClient(c,scope)}catch(e){if(e instanceof BackendError)throw e;fail(503,'moderation_unavailable')}finally{c?.release()}}
 return {enabled,maxDays,check,stateWithClient,enforceWithClient,serviceWithClient,service};
}
export async function moderationOperation(c,actor,op,moderation){
 if(!moderation?.enabled)fail(503,'operation_disabled');
 const row=(await c.query('SELECT a.is_admin FROM public.shop_access a JOIN public.shop_players p ON p.nick=a.nick WHERE a.nick=$1 FOR UPDATE OF a,p',[op.target])).rows[0];
 if(!row)fail(404,'not_found');if(row.is_admin===true||op.target===actor)fail(403,'admin_protected');
 const now=(await c.query('SELECT clock_timestamp() AS instant')).rows[0].instant,current=await moderation.stateWithClient(c,op.target);
 if(op.mode!=='kick'&&(current?.id??null)!==op.expectedSanctionId)fail(409,'admin_stale');
 let after=null;
 if(['lift','change'].includes(op.mode)&&!current)fail(409,'sanction_not_active');
 if(op.mode!=='kick'){
  const kind=op.mode==='permanent'?'permanent':op.mode==='temporary'?'temporary':op.kind;
  let until=null;
  if(op.mode!=='lift'&&kind==='temporary'){
   until=op.durationSeconds?new Date(new Date(now).getTime()+op.durationSeconds*1000):new Date(op.until);
   const delta=until-new Date(now);if(!Number.isFinite(delta)||delta<=0||delta>moderation.maxDays*86400000)fail(400,'invalid_sanction_date');
  }
  // Cerrar la versión anterior conserva íntegros su tipo, motivo y vencimiento.
  await c.query("UPDATE public.pw2_account_sanctions SET status=CASE WHEN expires_at<= $2 THEN 'expired' ELSE $3 END,closed_at=$2,closed_by=$4,close_reason=$5 WHERE nick=$1 AND status='active'",[op.target,now,op.mode==='lift'?'revoked':'replaced',actor,op.reason]);
  if(op.mode!=='lift'){
   after=(await c.query("INSERT INTO public.pw2_account_sanctions(id,nick,kind,starts_at,expires_at,reason,actor,supersedes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,kind,starts_at,expires_at",[op.operationId,op.target,kind,now,until,op.reason,actor,current?.id??null])).rows[0];
  }
 }
 await c.query('DELETE FROM public.shop_sessions WHERE nick=$1',[op.target]);
 // También cancela pruebas OAuth de vinculación iniciadas por una sesión revocada.
 if((await c.query("SELECT to_regclass('public.pw2_oauth_flows') AS table_name")).rows[0].table_name)await c.query('DELETE FROM public.pw2_oauth_flows WHERE nick=$1',[op.target]);
 return {result:{sanctionId:after?.id??null},audit:{target:op.target,mode:op.mode,before:current,after:after?{id:after.id,kind:after.kind,startsAt:iso(after.starts_at),expiresAt:iso(after.expires_at)}:null}};
}
export async function moderationHistory(c,nick,moderation,after=null){
 if(!moderation?.enabled)return {enabled:false,current:null,items:[]};
 if(after!==null&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(after))fail(400,'invalid_request');
 const rows=(await c.query("SELECT id,kind,starts_at,expires_at,CASE WHEN status='active' AND expires_at<=clock_timestamp() THEN 'expired' ELSE status END AS status,reason,actor,closed_at,closed_by,close_reason,supersedes FROM public.pw2_account_sanctions WHERE nick=$1 AND ($2::uuid IS NULL OR (starts_at,id)<(SELECT starts_at,id FROM public.pw2_account_sanctions WHERE id=$2 AND nick=$1)) ORDER BY starts_at DESC,id DESC LIMIT 51",[nick,after])).rows;
 return {enabled:true,maxDays:moderation.maxDays,current:await moderation.stateWithClient(c,nick),items:rows.slice(0,50),next:rows.length>50?rows[49].id:null};
}
export async function installedAdminSchema(pool){
 if(!pool)return false;let c;
 try{c=await pool.connect();const row=(await c.query("SELECT to_regclass('public.pw2_account_sanctions') IS NOT NULL AS sanctions,to_regclass('public.pw2_store_products') IS NOT NULL AS products,to_regclass('public.pw2_store_purchases') IS NOT NULL AS purchases,to_regclass('public.pw2_raffles') IS NOT NULL AS raffles,to_regclass('public.pw2_raffle_entries') IS NOT NULL AS entries,to_regclass('public.pw2_community_controls') IS NOT NULL AS controls,to_regclass('public.pw2_raffle_ticket_reservations') IS NOT NULL AS reservations")).rows[0];const values=Object.values(row);if(values.some(Boolean)&&!values.every(Boolean))throw Error();if(values.every(Boolean)){const owned=(await c.query("SELECT bool_and(obj_description(('public.'||t)::regclass,'pg_class')='pw2_admin_expansion_v1') AS valid FROM unnest(ARRAY['pw2_account_sanctions','pw2_store_products','pw2_store_purchases','pw2_raffles','pw2_raffle_entries','pw2_community_controls','pw2_raffle_ticket_reservations']) t")).rows[0];if(owned?.valid!==true)throw Error();const guard=(await c.query("SELECT coalesce((SELECT md5(btrim(translate(prosrc,chr(13),''),E' \\n\\t'))=$1 AND NOT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.pw2_economy_operation(text,uuid,text,integer,integer)')),false) AS safe",[ADMIN_ECONOMY_BODY_MD5])).rows[0];if(!guard?.safe)throw Error()}return values.every(Boolean)}catch{throw Error('No se pudo verificar el esquema administrativo completo; inicio cancelado para evitar omitir sanciones.')}finally{c?.release()}
}
