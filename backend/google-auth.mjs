import {createHash} from 'node:crypto';
import {BackendError} from './repository.mjs';
import {newToken,digest,sessionKey,csrfFor,equalText} from './security.mjs';

const fail=(status,code)=>{throw new BackendError(status,code)};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function oauthToken(cookie=''){
 const values=cookie.split(';').map(s=>s.trim()).filter(s=>s.startsWith('pw2_oauth='));
 if(values.length!==1)return null;
 const token=values[0].slice(10);return /^[\w-]{43}$/.test(token)?token:null;
}
export function validNewNick(value){
 return typeof value==='string'&&value===value.trim()&&/^[\p{L}\p{N}][\p{L}\p{N}_-]{2,29}$/u.test(value);
}
// Auth HTTP es independiente de la clave service_role usada por el repositorio.
// Solo se necesitan las credenciales públicas del proyecto; ningún secreto Google.
export function createGoogleProvider({url,key,origin,fetchImpl=globalThis.fetch}){
 const base=new URL(url);if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash||base.username||base.password||!key)throw Error('Invalid Google Auth configuration');
 const callback=origin+'/api/auth/google/callback';
 async function request(path,options){
  let response;try{response=await fetchImpl(new URL(path,base),{...options,headers:{apikey:key,'Content-Type':'application/json',...options.headers},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)})}catch{fail(503,'google_unavailable')}
  if(!response.ok)fail(response.status>=500?503:400,response.status>=500?'google_unavailable':'google_failed');
  try{return await response.json()}catch{fail(503,'google_unavailable')}
 }
 return {
  authorize(verifier){
   const target=new URL('/auth/v1/authorize',base);
   target.search=new URLSearchParams({provider:'google',redirect_to:callback,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'s256',scopes:'openid email profile',prompt:'select_account'}).toString();
   return target.href;
  },
  async exchange(code,verifier){
   const data=await request('/auth/v1/token?grant_type=pkce',{method:'POST',body:JSON.stringify({auth_code:code,code_verifier:verifier})});
   if(typeof data.access_token!=='string'||!data.access_token)fail(400,'google_failed');
   // Consultar Auth, no confiar en user_metadata ni decodificar un JWT sin verificar.
   const user=await request('/auth/v1/user',{method:'GET',headers:{Authorization:'Bearer '+data.access_token}});
   if(!uuid.test(user.id??'')||user.is_anonymous||user.deleted_at||Date.parse(user.banned_until)>Date.now()||!user.email_confirmed_at||!user.identities?.some(i=>i.provider==='google'))fail(400,'google_failed');
   // Los tokens OAuth/refresh no se persisten, ni se envían al navegador.
   return user.id;
  }
 };
}
export function createGoogleAuth({pool,provider,origin,secret,termsVersion,sessionTtlMs=8*3600_000,onDiagnostic=()=>{}}){
 const secure=origin.startsWith('https:');
 const cookie=(token='',clear=false)=>'pw2_oauth='+token+'; Path=/; HttpOnly; SameSite=Lax'+(secure?'; Secure':'')+'; Max-Age='+(clear?0:600);
 const csrf=token=>csrfFor('google:'+token,secret);
 async function tx(work){
  let client;try{
   client=await pool.connect();await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
   const result=await work(client);await client.query('COMMIT');return result;
  }catch(error){try{await client?.query('ROLLBACK')}catch{}
   if(error instanceof BackendError)throw error;
   const reason=['23505','23503','42501','42P01','42703'].includes(error?.code)?error.code:'database_unavailable';
   try{onDiagnostic({event:'google_auth',reason})}catch{}
   if(error?.code==='23505')fail(409,'google_conflict');
   fail(503,'google_unavailable');
  }finally{client?.release()}
 }
 async function account(client,nick){
  const row=(await client.query('SELECT a.nick,a.active AS access_active,p.active AS player_active FROM public.shop_access a JOIN public.shop_players p ON p.nick=a.nick WHERE a.nick=$1 FOR SHARE OF a,p',[nick])).rows[0];
  if(!row||row.access_active===false||row.player_active===false)fail(403,'account_inactive');
  return row.nick;
 }
 async function issue(client,nick){
  await account(client,nick);
  const token=newToken();
  await client.query("INSERT INTO public.shop_sessions(token,nick,expires_at) VALUES($1,$2,now()+($3::text||' milliseconds')::interval)",[sessionKey(token),nick,sessionTtlMs]);
  return {nick,token};
 }
 async function flow(client,token,status){
  if(!token)fail(400,'google_expired');
  const row=(await client.query('SELECT * FROM public.pw2_oauth_flows WHERE token_hash=$1 AND expires_at>now() AND status=$2 FOR UPDATE',[digest(token),status])).rows[0];
  if(!row)fail(400,'google_expired');return row;
 }
 async function link(client,id,nick){
  await account(client,nick);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('pw2:google-links',0))");
  const rows=(await client.query('SELECT auth_user_id,nick FROM public.pw2_google_links WHERE auth_user_id=$1 OR nick=$2',[id,nick])).rows;
  if(rows.length){if(rows.length!==1||rows[0].auth_user_id!==id||rows[0].nick!==nick)fail(409,'google_conflict');return}
  await client.query('INSERT INTO public.pw2_google_links(auth_user_id,nick) VALUES($1,$2)',[id,nick]);
 }
 return {
  cookie,csrf,
  async start({mode='login',user}={}){
   const token=newToken(),verifier=newToken();
   await tx(async client=>{
    await client.query('DELETE FROM public.pw2_oauth_flows WHERE expires_at<=now()');
    if(mode==='link'){if(!user)fail(401,'session_expired');await account(client,user.nick)}
    else if(mode!=='login')fail(400,'invalid_request');
    await client.query("INSERT INTO public.pw2_oauth_flows(token_hash,verifier,mode,nick,source_session,status,expires_at) VALUES($1,$2,$3,$4,$5,'started',now()+interval '10 minutes')",[digest(token),verifier,mode,user?.nick??null,user?sessionKey(user.token):null]);
   });
   return {url:provider.authorize(verifier),cookie:cookie(token)};
  },
  async cancel(token){if(token)await tx(client=>client.query('DELETE FROM public.pw2_oauth_flows WHERE token_hash=$1',[digest(token)]))},
  async callback(token,code){
   if(typeof code!=='string'||!code||code.length>4096)fail(400,'google_failed');
   const started=await tx(async client=>{
    const row=await flow(client,token,'started');
    await client.query("UPDATE public.pw2_oauth_flows SET status='exchanging',verifier=NULL WHERE token_hash=$1",[digest(token)]);return row;
   });
   const id=await provider.exchange(code,started.verifier);
   return tx(async client=>{
    const row=await flow(client,token,'exchanging');
    if(row.mode==='link'){
     const valid=(await client.query('SELECT nick FROM public.shop_sessions WHERE token=$1 AND nick=$2 AND expires_at>now() FOR SHARE',[row.source_session,row.nick])).rows[0];
     if(!valid)fail(401,'session_expired');
     await link(client,id,row.nick);
     // La cookie Strict no llega al callback externo: rotar la sesión solo tras
     // validar en la BD la sesión original y la prueba de propiedad.
     await client.query('DELETE FROM public.shop_sessions WHERE token=$1',[row.source_session]);
     const session=await issue(client,row.nick);
     await client.query('DELETE FROM public.pw2_oauth_flows WHERE token_hash=$1',[digest(token)]);
     return {...session,outcome:'linked'};
    }
    const linked=(await client.query('SELECT nick FROM public.pw2_google_links WHERE auth_user_id=$1',[id])).rows[0];
    if(linked){
     const session=await issue(client,linked.nick);
     await client.query('DELETE FROM public.pw2_oauth_flows WHERE token_hash=$1',[digest(token)]);
     return {...session,outcome:'login'};
    }
    // Auth puede crear auth.users. No se crea ningún jugador ni inventario aquí.
    await client.query("UPDATE public.pw2_oauth_flows SET auth_user_id=$2,status='pending',expires_at=now()+interval '10 minutes' WHERE token_hash=$1",[digest(token),id]);
    return {outcome:'register'};
   });
  },
  async pending(token){
   if(!token)return {pending:false};
   return tx(async client=>{
    const row=(await client.query("SELECT 1 FROM public.pw2_oauth_flows WHERE token_hash=$1 AND status='pending' AND expires_at>now()",[digest(token)])).rows[0];
    return row?{pending:true,csrf:csrf(token)}:{pending:false};
   });
  },
  async register(token,csrfToken,nick){
   if(!token||!equalText(csrf(token),csrfToken))fail(403,'csrf_invalid');
   if(!termsVersion)fail(503,'registration_unavailable');
   if(!validNewNick(nick))fail(400,'nick_invalid');
   return tx(async client=>{
    const row=await flow(client,token,'pending');
    // Serializa elección de nick y vínculo entre todas las instancias.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('pw2:google-links',0))");
    if((await client.query('SELECT 1 FROM public.pw2_google_links WHERE auth_user_id=$1',[row.auth_user_id])).rows.length)fail(409,'google_conflict');
    const exists=(await client.query('SELECT 1 FROM public.shop_players WHERE lower(btrim(nick))=lower($1) UNION ALL SELECT 1 FROM public.shop_access WHERE lower(btrim(nick))=lower($1) LIMIT 1',[nick])).rows.length;
    if(exists)fail(409,'nick_unavailable');
    // INSERT exclusivamente: jamás UPSERT sobre jugadores o inventarios.
    await client.query('INSERT INTO public.shop_players(nick,active) VALUES($1,true)',[nick]);
    await client.query('INSERT INTO public.shop_access(nick,code_hash,active) VALUES($1,NULL,true)',[nick]);
    await client.query('INSERT INTO public.shop_inventories(nick) VALUES($1)',[nick]);
    // Valores iniciales del sistema original (defaultProfile).
    await client.query("INSERT INTO public.shop_profiles(nick,selected_logo_id,owned_logo_ids) VALUES($1,'logo-pelusa-1','[\"logo-pelusa-1\"]'::jsonb)",[nick]);
    const inv=(await client.query('SELECT pc FROM public.shop_inventories WHERE nick=$1',[nick])).rows[0];
    await client.query("INSERT INTO public.shop_public_users(nick,pc,logo_id) VALUES($1,$2,'logo-pelusa-1')",[nick,inv.pc]);
    await client.query('INSERT INTO public.pw2_google_links(auth_user_id,nick,terms_version,terms_accepted_at) VALUES($1,$2,$3,now())',[row.auth_user_id,nick,termsVersion]);
    const session=await issue(client,nick);
    await client.query('DELETE FROM public.pw2_oauth_flows WHERE token_hash=$1',[digest(token)]);
    return session;
   });
  },
  async status(nick){return tx(async client=>({linked:(await client.query('SELECT 1 FROM public.pw2_google_links WHERE nick=$1',[nick])).rows.length===1}))}
 };
}
