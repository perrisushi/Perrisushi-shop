import {createHash} from 'node:crypto';
import {BackendError} from '../repository.mjs';
import {sessionKey} from '../security.mjs';
import {normalizedComposition} from '../cosmetics.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),scene=require('./vendor/src/config/scene.cjs');
const fail=(s,c)=>{throw new BackendError(s,c)};
const amounts={normal_coin:scene.coinPoints,special_coin:scene.specialCoinPoints,void:-scene.voidPenalty};
export function createPerrilandStore({pool,enabled=false,moderation}={}){
 let leader=null,revision=0,broken=false;const configured=Boolean(enabled&&pool);
 async function ready(c){const r=(await c.query("SELECT to_regclass('public.pw2_perriland_room') IS NOT NULL AND to_regclass('public.pw2_perriland_events') IS NOT NULL AS ready")).rows[0];if(!r?.ready)fail(503,'perriland_schema_missing');}
 async function identity(c,user){if(!(await c.query('SELECT 1 FROM public.shop_sessions s JOIN public.shop_access a ON a.nick=s.nick JOIN public.shop_players p ON p.nick=s.nick WHERE s.token=$1 AND s.nick=$2 AND s.expires_at>clock_timestamp() AND a.active IS DISTINCT FROM FALSE AND p.active IS DISTINCT FROM FALSE',[sessionKey(user.token),user.nick])).rows.length)fail(401,'session_expired');await moderation?.enforceWithClient(c,user.nick);}
 return {configured,
 async access(user){if(!configured)return {configured:false,available:false,isAdmin:false};const c=await pool.connect();try{await ready(c);
 // Una lectura reúne sesión, rol, disponibilidad, saldo y apariencia; no se cachean permisos.
 const info=(await c.query(`SELECT a.is_admin,i.pc,to_jsonb(pf) AS profile,ctl.active AS maintenance,ctl.message
 FROM public.shop_sessions s JOIN public.shop_access a ON a.nick=s.nick JOIN public.shop_players p ON p.nick=s.nick
 LEFT JOIN public.shop_inventories i ON i.nick=s.nick LEFT JOIN public.shop_profiles pf ON pf.nick=s.nick
 LEFT JOIN public.pw2_community_controls ctl ON ctl.scope='PerriLand'
 WHERE s.token=$1 AND s.nick=$2 AND s.expires_at>clock_timestamp() AND a.active IS DISTINCT FROM FALSE AND p.active IS DISTINCT FROM FALSE`,[sessionKey(user.token),user.nick])).rows[0];
 if(!info)fail(401,'session_expired');await moderation?.enforceWithClient(c,user.nick);
 const isAdmin=user.nick==='Perrisushi'&&info.is_admin===true;
 if(info.pc===null||info.pc===undefined||!Number.isSafeInteger(Number(info.pc))||Number(info.pc)<0)fail(409,'inventory_missing');
 return {configured:true,available:info.maintenance===false,isAdmin,message:info.message??'',pc:Number(info.pc),composition:normalizedComposition({...info.profile,nick:user.nick},isAdmin)};
 }catch(e){if(e instanceof BackendError)throw e;throw new BackendError(503,'perriland_unavailable');}finally{c.release();}},
 async open(){if(leader)return leader;const c=await pool.connect();try{await ready(c);const lock=(await c.query("SELECT pg_try_advisory_lock(hashtextextended('pw2:perriland:main',0)) AS acquired")).rows[0];if(!lock?.acquired)fail(503,'perriland_room_on_other_instance');leader=c;broken=false;c.on?.('error',()=>{broken=true;});const row=(await c.query("SELECT revision,state FROM public.pw2_perriland_room WHERE id='main'")).rows[0];if(!row)fail(503,'perriland_schema_missing');revision=Number(row.revision);return {state:row.state};}catch(e){leader=null;c.release();throw e;}},
 async save({commitId,state,events,nicks,audits=[]}){if(!leader||broken)fail(503,'perriland_unavailable');const c=leader,rejected=new Set();
 // Sin dinero ni acciones administrativas, el checkpoint es una única escritura atómica.
 // La sala serializa save y el lease de líder excluye otras instancias. La revisión evita pisar cambios ajenos.
 if(events.length===0&&audits.length===0){
 const row=(await c.query(`UPDATE public.pw2_perriland_room SET
 state=CASE WHEN commit_id=$2::uuid THEN state ELSE $1::jsonb END,
 revision=CASE WHEN commit_id=$2::uuid THEN revision ELSE revision+1 END,
 updated_at=CASE WHEN commit_id=$2::uuid THEN updated_at ELSE now() END,commit_id=$2
 WHERE id='main' AND (revision=$3 OR commit_id=$2::uuid) RETURNING revision`,[JSON.stringify(state),commitId,revision])).rows[0];
 if(!row)fail(409,'perriland_revision_conflict');const replayed=Number(row.revision)===revision;revision=Number(row.revision);return {balances:{},rejected:[],...(replayed?{replayed:true}:{})};
 }
 try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='8s'");await c.query("SELECT pg_advisory_xact_lock(hashtextextended('pw2:shared-games-economy',0))");const row=(await c.query("SELECT revision,commit_id FROM public.pw2_perriland_room WHERE id='main' FOR UPDATE")).rows[0];if(row.commit_id===commitId){await c.query('COMMIT');return {balances:{},replayed:true};}if(Number(row.revision)!==revision)fail(409,'perriland_revision_conflict');

 for(const audit of audits){await identity(c,audit.user);const role=(await c.query('SELECT is_admin FROM public.shop_access WHERE nick=$1 FOR SHARE',[audit.user.nick])).rows[0];if(audit.user.nick!=='Perrisushi'||role?.is_admin!==true)fail(403,'admin_required');await c.query('INSERT INTO public.shop_operations(operation_id,nick,action,response,created_at) VALUES($1,$2,$3,$4,now())',['pw2:perriland-admin:'+audit.id,audit.user.nick,'admin:perriland',JSON.stringify({audit:{actor:audit.user.nick,action:audit.action,details:audit.details}})]);}
 const control=(await c.query("SELECT active FROM public.pw2_community_controls WHERE scope='PerriLand'")).rows[0];
 for(const e of events){if(control?.active!==false){rejected.add(e.nick);continue;}if(!Object.hasOwn(amounts,e.kind)||!/^[-a-z0-9:]{1,120}$/.test(e.id)||!nicks.includes(e.nick))fail(400,'invalid_perriland_event');const prior=(await c.query('SELECT nick,kind FROM public.pw2_perriland_events WHERE id=$1',[e.id])).rows[0];if(prior){if(prior.nick!==e.nick||prior.kind!==e.kind)fail(409,'operation_conflict');continue;}
 // Revalidar cuenta y sesión antes de tocar un saldo, incluso con una conexión de juego antigua.
 const valid=(await c.query('SELECT 1 FROM public.shop_sessions s JOIN public.shop_access a ON a.nick=s.nick JOIN public.shop_players p ON p.nick=s.nick WHERE s.token=ANY($1::text[]) AND s.nick=$2 AND s.expires_at>clock_timestamp() AND a.active IS DISTINCT FROM FALSE AND p.active IS DISTINCT FROM FALSE',[e.sessions,e.nick])).rows.length;if(!valid){rejected.add(e.nick);continue;}
 await c.query('SAVEPOINT perriland_account');try{await moderation?.enforceWithClient(c,e.nick);}catch(error){if(['account_banned','account_suspended'].includes(error.code)){await c.query('ROLLBACK TO SAVEPOINT perriland_account');await c.query('RELEASE SAVEPOINT perriland_account');rejected.add(e.nick);continue;}throw error;}await c.query('RELEASE SAVEPOINT perriland_account');const inv=(await c.query('SELECT pc FROM public.shop_inventories WHERE nick=$1 FOR UPDATE',[e.nick])).rows[0];const before=Number(inv?.pc);if(!inv||inv.pc===null||!Number.isSafeInteger(before)||before<0)fail(409,'invalid_balance');const requested=amounts[e.kind],after=Math.max(0,before+requested);if(!Number.isSafeInteger(after)||after>2147483647)fail(409,'invalid_balance');const op='pw2:perriland:'+e.id;if((await c.query('SELECT 1 FROM public.shop_operations WHERE operation_id=$1',[op])).rows.length)fail(409,'operation_conflict');
 await c.query('UPDATE public.shop_inventories SET pc=$1,updated_at=now() WHERE nick=$2',[after,e.nick]);await c.query('UPDATE public.shop_public_users SET pc=$1,updated_at=now() WHERE nick=$2',[after,e.nick]);await c.query('INSERT INTO public.pw2_perriland_events(id,nick,kind,requested,applied,before_pc,after_pc) VALUES($1,$2,$3,$4,$5,$6,$7)',[e.id,e.nick,e.kind,requested,after-before,before,after]);await c.query('INSERT INTO public.shop_operations(operation_id,nick,action,response,created_at) VALUES($1,$2,$3,$4,now())',[op,e.nick,'perriland:'+e.kind,JSON.stringify({result:{eventId:e.id,pc:after,delta:after-before}})]);await c.query('INSERT INTO public.shop_activity(nick,game,result,details,created_at) VALUES($1,$2,$3,$4,now())',[e.nick,'PERRILAND',requested<0?'Caída al vacío':'Moneda recogida',(after-before)+' PC · '+e.id]);}
 const balances=Object.fromEntries((await c.query('SELECT nick,pc FROM public.shop_inventories WHERE nick=ANY($1::text[])',[nicks])).rows.map(r=>[r.nick,Number(r.pc)]));await c.query("UPDATE public.pw2_perriland_room SET state=$1,revision=revision+1,commit_id=$2,updated_at=now() WHERE id='main'",[JSON.stringify(state),commitId]);await c.query('COMMIT');revision++;return {balances,rejected:[...rejected]};
 }catch(e){try{await c.query('ROLLBACK')}catch{}throw e;}},
 async close(){if(leader){const c=leader;leader=null;try{await c.query("SELECT pg_advisory_unlock(hashtextextended('pw2:perriland:main',0))")}finally{c.release();}}}
 };
}
