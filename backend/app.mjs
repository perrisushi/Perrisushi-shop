import {randomBytes,randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {metricsContext} from './metrics.mjs';
import {logoAsset} from './logo-assets.mjs';
import {BackendError} from './repository.mjs';
import {publicOrigin as validatePublicOrigin} from './request-security.mjs';
import {authenticateTraditional,authDiagnostic} from './traditional-auth.mjs';
import {digest,sessionKey,cookieToken,csrfFor,equalText,RateLimiter} from './security.mjs';
export function createBackend({repository,economy,games,publicOrigin='http://127.0.0.1:4173',sessionStore='memory',allowSessionWrites=false,production=false,now=Date.now,sessionTtlMs=8*3600_000,csrfSecret,proxySecret,onMetric=()=>{},onAuthDiagnostic=()=>{}}={}){
 if(proxySecret&&proxySecret.length<32)throw Error('Proxy secret too short');
 const origin=validatePublicOrigin(publicOrigin);
 if(production&&(new URL(origin).protocol!=='https:'||sessionStore!=='supabase'||!allowSessionWrites))throw Error('Production requires HTTPS and approved persistent sessions');
 if(production&&(!csrfSecret||csrfSecret.length<32))throw Error('Production requires CSRF_SECRET');
 csrfSecret??=randomBytes(32).toString('hex');
 if(!['memory','supabase'].includes(sessionStore))throw Error('Invalid session store');
 // Railway puede agrupar muchas conexiones detrás de la misma IP. La cuota
 // por cuenta sigue siendo estricta sin confiar en X-Forwarded-For del cliente.
 const sharedProxy=production&&!proxySecret;
 const sessions=new Map();const loginIp=new RateLimiter({max:sharedProxy?120:20,windowMs:sharedProxy?60000:15*60000,now}),loginNick=new RateLimiter({max:8,now}),reads=new RateLimiter({max:sharedProxy?1200:240,windowMs:60000,now}),accountReads=new RateLimiter({max:240,windowMs:60000,now});
 const secure=new URL(origin).protocol==='https:';
 const cookie=(token,clear=false)=>`pw2_session=${clear?'':token}; Path=/; HttpOnly; SameSite=Strict${secure?'; Secure':''}; Max-Age=${clear?0:Math.floor(sessionTtlMs/1000)}`;
 const sessionRead=key=>sessionStore==='memory'?Promise.resolve(sessions.get(key)??null):repository.session(key);
 async function identity(req){
  const token=cookieToken(req.headers.cookie);if(!token)return null;
  let row;try{row=await sessionRead(sessionKey(token))}catch(error){try{onAuthDiagnostic({event:'traditional_auth',requestId:randomUUID(),stage:'session_restore',outcome:'failure',reason:'session_read_failed',...authDiagnostic(error)})}catch{};throw error}if(!row||!Number.isFinite(Date.parse(row.expires_at))||Date.parse(row.expires_at)<=now())return null;
  const [access,player]=await Promise.all([(repository.accessStatus??repository.access)(row.nick),repository.player(row.nick)]);
  if(!access||!player||access.active===false||player.active===false)return null;
  return {nick:row.nick,token};
 }
 function pagination(url,cursorField='cursor'){
  const raw=url.searchParams.get('limit')??'20';if(!/^\d{1,3}$/.test(raw))throw new BackendError(400,'invalid_page');
  const limit=Math.min(50,Math.max(1,Number(raw)));let cursor;
  const value=url.searchParams.get(cursorField);if(value){try{if(value.length>800)throw Error();const parsed=JSON.parse(Buffer.from(value,'base64url').toString());if(url.pathname==='/api/users'){if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).sort().join(',')!=='nick,pc'||typeof parsed.nick!=='string'||!parsed.nick.length||parsed.nick.length>100||/[\x00-\x1f]/.test(parsed.nick)||(parsed.pc!==null&&!Number.isSafeInteger(parsed.pc)))throw Error()}else if(typeof parsed!=='string'||parsed.length>100||/[\x00-\x1f]/.test(parsed))throw Error();cursor=parsed}catch{throw new BackendError(400,'invalid_cursor')}}
  return {limit,cursor};
 }
 const pageDTO=(rows,{limit},kind)=>({items:rows.slice(0,limit),nextCursor:rows.length>limit?Buffer.from(JSON.stringify(kind==='users'?{pc:rows[limit-1].pc??null,nick:rows[limit-1].nick}:String(rows[limit-1].id))).toString('base64url'):null});
 async function jsonBody(req,max=4096){const parts=[];let size=0;for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>max)throw new BackendError(413,'body_too_large');parts.push(bytes)}try{const value=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value}catch{throw new BackendError(400,'invalid_request')}}
 const fail=(status,code)=>{throw new BackendError(status,code)};
 const handle=function handle(req,res){return metricsContext.run({queries:0},async()=>{
  const started=now();let route='unknown',status=500;
  const send=(code,data,headers={})=>{status=code;res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",...headers});res.end(JSON.stringify(data))};
  try{
   const url=new URL(req.url,'http://local');route=url.pathname;
   if(proxySecret&&!equalText(req.headers['x-perriweb-proxy-secret'],proxySecret))fail(403,'proxy_auth_required');
   const forwarded=req.headers['x-perriweb-client-ip'];const clientIP=proxySecret&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:req.socket.remoteAddress??'local';
   const known=['/api/session','/api/auth/login','/api/auth/logout','/api/profile','/api/history','/api/users','/api/inventory','/api/notifications','/api/shop/random-key','/api/shop/raffles','/api/profile/avatar','/api/notifications/read','/api/shop/random-key/redeem','/api/shop/raffles/buy','/api/games/action','/api/games/context','/api/shop/receipt'];
   if(!known.includes(route)){route='unknown';fail(404,'not_found')}
   if(!['GET','POST'].includes(req.method))fail(405,'method_not_allowed');
   if(!reads.take(clientIP))fail(429,'too_many_requests');
   if(req.method==='POST'){
    if(Number(req.headers['content-length']??0)>(route==='/api/games/action'?1048576:4096)){req.resume();fail(413,'body_too_large')}
    if(req.headers.origin!==origin)fail(403,'origin_mismatch');
    if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']??'')))fail(415,'unsupported_media_type');
    if(req.headers['sec-fetch-site']&& !['same-origin','none'].includes(req.headers['sec-fetch-site']))fail(403,'cross_site_request');
   }
   if(req.method==='POST'&&['/api/shop/random-key/redeem','/api/shop/raffles/buy'].includes(route)&&!economy)fail(403,'operation_disabled');
   if(req.method==='POST'&&route==='/api/auth/login'){
    const data=await jsonBody(req);if(typeof data.nick!=='string'||!data.nick.length||data.nick.length>80||/[\x00-\x1f]/.test(data.nick)||typeof data.password!=='string'||!data.password.length||data.password.length>1024)fail(400,'invalid_request');
    if(!loginIp.take(clientIP)||!loginNick.take(digest(data.nick.trim().toLowerCase())))fail(429,'too_many_requests');
    const requestId=randomUUID();res.setHeader?.('X-Request-ID',requestId);
    const {token,row}=await authenticateTraditional({repository,nick:data.nick,password:data.password,sessionStore,allowSessionWrites,sessionTtlMs,now,requestId,onDiagnostic:onAuthDiagnostic,createMemorySession:row=>{
     for(const [key,value]of sessions)if(Date.parse(value.expires_at)<=now())sessions.delete(key);
     if(sessions.size>=5000)fail(503,'session_capacity');sessions.set(row.token,row);
    }});
    send(200,{authenticated:true,nick:row.nick,sessionPersistence:sessionStore},{'Set-Cookie':cookie(token),'X-CSRF-Token':csrfFor(token,csrfSecret)});return;
   }
   if(req.method==='POST'&&!['/api/auth/logout','/api/profile/avatar','/api/notifications/read','/api/shop/random-key/redeem','/api/shop/raffles/buy','/api/games/action'].includes(route))fail(405,'method_not_allowed');
   if(req.method==='GET'&&route.startsWith('/api/auth/'))fail(405,'method_not_allowed');
   if(!repository.configured)fail(503,'backend_not_configured');
   const user=await identity(req);
   if(user&&!accountReads.take(user.nick))fail(429,'too_many_requests');
   if(route==='/api/session'&&req.method==='GET'){send(200,{authenticated:Boolean(user),...(user?{nick:user.nick,sessionPersistence:sessionStore}:{})},user?{'X-CSRF-Token':csrfFor(user.token,csrfSecret)}:{});return}
   if(!user)fail(401,'session_expired');
   if(route==='/api/games/context'){if(url.searchParams.size)fail(400,'invalid_request');const inventory=await repository.inventory(user.nick);send(200,{available:inventory!==null&&await games?.availableFor?.(user)===true,nick:user.nick,sessionToken:'cookie-session',inventory:Object.fromEntries(Object.entries(inventory??{}).filter(([k])=>!['nick','updated_at'].includes(k)).map(([k,v])=>[k.replace(/_([a-z0-9])/g,(_,c)=>c.toUpperCase()),v]))});return}
   // La identidad siempre deriva de la cookie; los parámetros privados ajenos se rechazan.
   for(const field of url.searchParams.keys())if(!(route==='/api/shop/receipt'?['id']:route==='/api/shop/random-key'?['limit','ticketCursor','claimCursor']:['limit','cursor']).includes(field))fail(400,'invalid_request');
   if(req.method==='POST'){
    if(!equalText(req.headers['x-csrf-token'],csrfFor(user.token,csrfSecret)))fail(403,'csrf_invalid');
    const body=await jsonBody(req,route==='/api/games/action'?1048576:4096);
    if(route==='/api/games/action'){if(!games)fail(503,'games_not_configured');send(200,await games.execute(user,body));return}
    if(route==='/api/shop/random-key/redeem'||route==='/api/shop/raffles/buy'){send(200,await economy.execute(user.nick,route.endsWith('/buy')?'raffle-buy':'random-redeem',body));return}
    if(route==='/api/profile/avatar'){
     if(Object.keys(body).join(',')!=='avatarId'||typeof body.avatarId!=='string'||body.avatarId.length>100)fail(400,'invalid_request');
     const [profile,logos]=await Promise.all([repository.profile(user.nick),repository.logos()]);
     if(!Array.isArray(profile?.owned_logo_ids)||!profile.owned_logo_ids.includes(body.avatarId)||!logos.some(l=>l.logo_id===body.avatarId&&logoAsset(l)))fail(403,'avatar_not_owned');
     // Revalida la propiedad en el mismo PATCH mediante contención JSONB; jamás concede objetos.
     await repository.setAvatar(user.nick,body.avatarId);const updated=await repository.profile(user.nick);
     if(updated?.selected_logo_id!==body.avatarId||!Array.isArray(updated.owned_logo_ids)||!updated.owned_logo_ids.includes(body.avatarId))fail(409,'avatar_not_changed');
     await repository.syncPublicAvatar?.(user.nick,body.avatarId);
     send(200,{ok:true,avatarId:body.avatarId});return;
    }
    if(route==='/api/notifications/read'){
     if(Object.keys(body).join(',')!=='id'||typeof body.id!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.id))fail(400,'invalid_request');
     await repository.readNotification(user.nick,body.id);send(200,{ok:true});return;
    }
    if(Object.keys(body).length)fail(400,'invalid_request');
    if(sessionStore==='supabase'){if(!allowSessionWrites)fail(503,'session_writes_disabled');await repository.deleteSession(sessionKey(user.token))}else sessions.delete(sessionKey(user.token));
    send(200,{authenticated:false},{'Set-Cookie':cookie('',true)});return;
   }
   if(route==='/api/shop/receipt'){
    const id=url.searchParams.get('id');if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id??''))fail(400,'invalid_request');
    const record=await repository.operationReceipt(user.nick,id);const result=record?.response?.result;
    if(!record||!['random-redeem','raffle-buy'].includes(record.action)||String(result?.operationId).toLowerCase()!==id.toLowerCase())fail(404,'not_found');send(200,result);return;
   }
   if(route==='/api/profile'){
    const [profile,logos,inventory]=await Promise.all([repository.profile(user.nick),repository.logos(),repository.inventory(user.nick)]);
    const owned=Array.isArray(profile?.owned_logo_ids)?profile.owned_logo_ids.filter(id=>typeof id==='string'):[];
    // No se concede propiedad implícita por is_default ni se confía en rutas de assets de BD.
    send(200,{nick:user.nick,balances:inventory?{pc:inventory.pc,gemas:inventory.polvo_gema,monedas:inventory.monedas}:null,profile:profile?{selectedLogoId:owned.includes(profile.selected_logo_id)?profile.selected_logo_id:null,selectedLogoAssetId:owned.includes(profile.selected_logo_id)?logoAsset(logos.find(l=>l.logo_id===profile.selected_logo_id)):null,ownedLogoIds:owned,karma:profile.karma,achievements:profile.achievements,selectedTitleId:profile.selected_title_id}:null,logos:logos.map(l=>({id:l.logo_id,name:l.name,assetId:logoAsset(l),owned:owned.includes(l.logo_id)})),collectionTruncated:false});return;
   }
   if(route==='/api/inventory'){const row=await repository.inventory(user.nick);if(row){const {nick,...values}=row;send(200,{inventory:values})}else send(200,{inventory:null});return}
   if(['/api/history','/api/users','/api/notifications'].includes(route)){
    const kind=route.split('/').pop(),options=pagination(url);const rows=await repository.page(kind,user.nick,options);
    const safe=rows.map(row=>{if(kind!=='users')return row;return {nick:row.nick,pc:row.pc,logoId:row.logo_id,karma:row.karma,achievements:row.achievements,selectedTitleId:row.selected_title_id}});
    send(200,pageDTO(safe,options,kind));return;
   }
   if(route==='/api/shop/random-key'){
    const ticketOptions=pagination(url,'ticketCursor'),claimOptions=pagination(url,'claimCursor');const [tickets,claims,inventory]=await Promise.all([repository.page('tickets',user.nick,ticketOptions),repository.page('claims',user.nick,claimOptions),repository.inventory(user.nick)]);
    send(200,{tickets:pageDTO(tickets,ticketOptions,'tickets'),claims:pageDTO(claims,claimOptions,'claims'),inventoryRandomKey:inventory?.random_key??null,operationsEnabled:(await economy?.status())?.enabled===true,statusRulesVerified:true});return;
   }
   if(route==='/api/shop/raffles'){const inventory=await repository.inventory(user.nick),policy=await economy?.status();send(200,{available:policy?.raffleEnabled===true,reason:policy?.raffleEnabled?'verified_policy':'rules_not_verified',policy:policy?.raffleEnabled?{price:policy.price,max:policy.max}:null,operationsEnabled:policy?.raffleEnabled===true,tickets:inventory?{boleto_sorteo1:inventory.boleto_sorteo1,boleto_sorteo2:inventory.boleto_sorteo2,mini_sorteo:inventory.mini_sorteo}:null});return}
   fail(405,'method_not_allowed');
  }catch(error){send(error instanceof BackendError?error.status:500,{error:error instanceof BackendError?error.code:'request_failed'})}
  finally{try{onMetric({route,method:req.method,status,durationMs:Math.max(0,now()-started),queries:metricsContext.getStore().queries})}catch{}}
 })};
 handle.authenticate=identity;
 return handle;
}
