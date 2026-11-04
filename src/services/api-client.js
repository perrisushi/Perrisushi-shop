/**
 * PerriWeb 2.0 · Cliente del backend propio; Supabase solo se consulta en servidor.
 * - Solo rutas relativas del backend propio, sin credenciales de Supabase en navegador.
 * - Usa cookie HttpOnly del mismo origen y CSRF vinculado a la sesión.
 * - Consultas deduplicadas, caché corta opcional; ninguna encuesta automática.
 * - Las acciones que cambian datos JAMÁS se reintentan automáticamente.
 * - No enviar objeto de recompensa/precio o identidad del usuario para determinar premios.
 */
import {cosmeticById} from './perrilogo-catalog.js';
import {dataDomain,mutationDomains} from './cache-policy.js';
const ENDPOINTS = Object.freeze({
  session: '/session', profile: '/profile', history: '/history',
  users: '/users', inventory: '/inventory', notifications: '/notifications',
  randomKey: '/shop/random-key', raffles: '/shop/raffles',
});

export class ApiError extends Error {
  constructor(status, code = 'request_failed') {
    super(code);
    this.name = 'ApiError'; this.status = status; this.code = code;
  }
}

/** Crea un cliente preparado para consumir un backend protegido, NO el API antiguo. */
export function createApiClient({fetchImpl = globalThis.fetch, base = '/api', now = () => Date.now(), timeoutMs = 10000,onSessionExpired=()=>{}} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch obligatorio');
  if (!/^\/[a-z0-9/_-]*$/i.test(base) || base.startsWith('//')) throw new TypeError('API debe ser una ruta local');
  if (base.includes('//')) throw new TypeError('API debe ser una ruta local');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new TypeError('Tiempo de espera incorrecto');
  base = base.replace(/\/$/, '');
  const cache = new Map(), inflight = new Map(), revisions=new Map();
  let sequence=0;
  let epoch = 0;
  let csrfToken = '';
  const sessionBus=typeof window!=='undefined'&&typeof BroadcastChannel==='function'?new BroadcastChannel('pw2-session-cache'):null;
  if(sessionBus)sessionBus.onmessage=event=>{if(event.data==='identity-changed'){csrfToken='';clearCache();onSessionExpired()}};

  function clearCache() { cache.clear(); inflight.clear(); revisions.clear();epoch++; }
  const revision=domain=>revisions.get(domain)??0;
  function invalidate(domains){
    if(domains===null){clearCache();return}
    for(const domain of new Set(domains)){
      revisions.set(domain,revision(domain)+1);
      for(const [key,entry] of cache)if(entry.domain===domain)entry.expires=0;
      for(const key of inflight.keys())if(dataDomain(new URL(key,'http://local').pathname.slice(base.length))===domain)inflight.delete(key);
    }
  }
  const keyFor=domain=>url(({inventory:'/inventory',profile:'/profile',cosmetics:'/profile/cosmetics',store:'/store'})[domain],domain==='inventory'?{deferReadiness:1}:domain==='profile'?{deferCosmetics:1}:undefined);
  function peek(domain){return cache.get(keyFor(domain))?.data}
  function store(key,data,domain,cacheMs,seq){cache.set(key,{data,domain,expires:now()+cacheMs,validUntil:now()+cacheMs,sequence:seq})}

  function patch(domain,transform,ttl){const key=keyFor(domain),entry=cache.get(key);if(entry)store(key,transform(entry.data),domain,Math.min(ttl,Math.max(0,entry.validUntil-now())),++sequence)}
  function applyPurchase(result){
    if(!result.acquired||!Number.isSafeInteger(result.balances?.pc))return;
    const item=cosmeticById(result.acquired);if(!item?.active||!['background','frame'].includes(item.layer))return;
    patch('inventory',s=>({...s,inventory:{...s.inventory,pc:result.balances.pc}}),20_000);
    patch('profile',s=>({...s,balances:{...s.balances,pc:result.balances.pc},...(s.inventorySnapshot?{inventorySnapshot:{...s.inventorySnapshot,inventory:{...s.inventorySnapshot.inventory,pc:result.balances.pc}}}:{})}),30_000);
    patch('cosmetics',s=>({...s,owned:{...s.owned,[item.layer]:[...new Set([...(s.owned?.[item.layer]??[]),item.id])]},items:[...(s.items??[]).filter(i=>i.id!==item.id),item]}),30_000);
  }
  const pageLimit = value => Number.isFinite(value) ? Math.min(50, Math.max(1, Math.trunc(value))) : 20;
  function url(path, params) {
    if (!/^\/[a-z0-9/_-]+$/i.test(path) || path.includes('//')) throw new TypeError('Ruta API incorrecta');
    const query = new URLSearchParams();
    for (const [k,v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== '') query.set(k, String(v));
    }
    const q=query.toString();return base+path+(q ? '?' + q:'');
  }
  async function request(path, {method='GET', params, body, cacheMs=0, force=false}={}) {
    if(!['GET','POST'].includes(method)) throw new TypeError('Método no permitido');
    if(method==='GET' && body!==undefined) throw new TypeError('GET sin cuerpo');
    // Toda mutación separa la caché y las lecturas pendientes del estado anterior,
    // también si login/logout falla o se pierde su respuesta.
    const affected=method==='POST'?mutationDomains(path,body):[];
    if(method==='POST')invalidate(affected);
    const target=url(path,params), generation=epoch,domain=dataDomain(path),version=revision(domain),seq=++sequence,inventoryVersion=revision('inventory');
    if(method==='GET' && cacheMs>0 && !force) {
      const cached=cache.get(target);
      if(cached && cached.expires>now()) return cached.data;
    }
    if(method==='GET' && inflight.has(target)) return inflight.get(target);
    const execute=async()=>{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),timeoutMs);
      try {
        const response=await fetchImpl(target, {
          method, credentials:'same-origin', mode:'same-origin', cache:'no-store', redirect:'error',
          headers: method==='POST' ? {'Content-Type':'application/json','Accept':'application/json',...(csrfToken?{'X-CSRF-Token':csrfToken}:{})} : {'Accept':'application/json'},
          ...(body===undefined?{}:{body:JSON.stringify(body)}), signal:controller.signal
        });
        if(generation!==epoch||method==='GET'&&version!==revision(domain)) throw new ApiError(409,'session_changed');
        if(!response.ok) {
          if(response.status===401) { csrfToken=''; clearCache();if(path!=='/auth/login')onSessionExpired(); }
          const fallback=response.status===401?'session_expired':response.status===403?'forbidden':response.status===429?'too_many_requests':'request_failed';
          let code=fallback,expiresAt;
          try{const data=await response.json();if(['exclusive_cosmetic','cosmetic_not_owned','product_changed','product_unavailable','already_owned','raffle_closed','raffle_integrity_error','insufficient_tickets','community_unavailable','unsupported_product','invalid_reward','raffle_state','raffle_dates','no_participants','account_suspended','account_banned','moderation_unavailable','service_maintenance','invalid_sanction_date','sanction_not_active','not_found','admin_required','admin_unavailable','admin_stale','admin_protected','admin_recipient_limit','origin_mismatch','proxy_auth_required','cross_site_request','csrf_invalid','unsupported_media_type','backend_not_configured','backend_unavailable','invalid_credentials','operation_disabled','session_writes_disabled','chest_unavailable','invalid_request','inventory_mismatch','item_not_owned','avatar_not_owned','avatar_not_changed','operation_conflict','insufficient_balance','invalid_balance','ticket_limit','no_stock','no_active_ticket','account_inactive','inventory_missing','economy_unavailable','games_not_configured','games_unavailable','google_unavailable','google_not_allowed','google_failed','google_expired','google_conflict','google_already_signed_in','registration_unavailable','nick_invalid','nick_unavailable','legal_changed'].includes(data?.error))code=data.error;if(typeof data?.expiresAt==='string'&&Number.isFinite(Date.parse(data.expiresAt)))expiresAt=data.expiresAt}catch{}
          const error=new ApiError(response.status,code);if(expiresAt)error.expiresAt=expiresAt;if(['account_banned','account_suspended','account_inactive'].includes(code)){csrfToken='';clearCache();if(path!=='/auth/login')onSessionExpired(error)}throw error;
        }
        let result;
        try { result=await response.json(); }
        catch(error) {
          if(error?.name==='AbortError') throw error;
          throw new ApiError(502,'invalid_server_response');
        }
        if(generation!==epoch||method==='GET'&&version!==revision(domain)) throw new ApiError(409,'session_changed');
        if(result===null || typeof result!=='object') throw new ApiError(502,'invalid_server_response');
        const token=response.headers?.get?.('x-csrf-token');
        if(token&&/^[\w-]{43}$/.test(token)) csrfToken=token;
        if(result.authenticated===false)csrfToken='';
        if(method==='POST'){invalidate(affected);if(affected===null)sessionBus?.postMessage('identity-changed')}
        else if(cacheMs>0 && generation===epoch){
          store(target,result,domain,cacheMs,seq);
          // La fila ya fue validada y leída para Perfil: compartirla sin otra consulta.
          if(path==='/profile'&&result.inventorySnapshot&&inventoryVersion===revision('inventory')){
            const key=keyFor('inventory'),existing=cache.get(key);
            if(!existing||existing.sequence<=seq)store(key,result.inventorySnapshot,'inventory',20_000,seq);
          }
        }
        return result;
      }catch(error){
        if(error?.name==='AbortError') throw new ApiError(408,'timeout');
        if(error instanceof ApiError) throw error;
        throw new ApiError(0,'network_error');
      } finally {clearTimeout(timer);if(inflight.get(target)===promise)inflight.delete(target);}
    };
    // Diferir execute evita acceder a promise antes de su inicialización si
    // fetchImpl lanza un error síncrono (p. ej. transporte inyectado).
    const promise=Promise.resolve().then(execute);
    if(method==='GET')inflight.set(target,promise);
    return promise;
  }

  // Todos los perfiles, inventarios y recompensas deben derivarse de la sesión en servidor,
  // nunca de un 'nick' enviado por el cliente para acceder a datos privados.
  return Object.freeze({
    clearCache,invalidate,peek,
    getCsrfToken:()=>csrfToken,
    getCacheEpoch:(...domains)=>[epoch,...domains.map(revision)].join(':'),
    getStore:()=>request('/store',{cacheMs:60_000}),getRaffleEvents:()=>request('/raffles'),getCommunity:({force=false}={})=>request('/community',{cacheMs:30_000,force}),
    buyProduct:async body=>{const before=revision('inventory');const result=await request('/store/buy',{method:'POST',body});if(revision('inventory')===before+2)applyPurchase(result);return result},registerRaffle:body=>request('/raffles/register',{method:'POST',body}),
    adminContext:()=>request('/admin/context'),
    adminRead:(section,params={})=>{if(!['users','account','sanctions','controls','records','store','raffles'].includes(section))throw new TypeError('Sección incorrecta');return request('/admin/'+section,{params})},
    adminExecute:body=>request('/admin/execute',{method:'POST',body}),
    getSession: ()=>request(ENDPOINTS.session,{cacheMs:0}),
    googleConfig: ()=>request('/auth/google/config'),
    googlePending: ()=>request('/auth/google/pending'),
    googleStatus: ()=>request('/auth/google/status',{cacheMs:30_000}),
    startGoogle: (mode='login',password)=>request('/auth/google/start',{method:'POST',body:{mode,...(password!==undefined?{password}:{})}}),
    registerGoogle: (nick,csrf,acceptedTerms,termsVersion)=>request('/auth/google/register',{method:'POST',body:{nick,csrf,acceptedTerms,termsVersion}}),
    cancelGoogle: ()=>request('/auth/google/cancel',{method:'POST',body:{}}),
    login: (nick,password)=>request('/auth/login',{method:'POST',body:{nick,password}}),
    logout: ()=>request('/auth/logout',{method:'POST',body:{}}),
    equipCosmetic:async(layer,id)=>{const result=await request('/profile/cosmetics',{method:'POST',body:{layer,id}});if(result.cosmetics){store(keyFor('cosmetics'),result.cosmetics,'cosmetics',30_000,++sequence);patch('profile',s=>({...s,profile:{...s.profile,...(layer==='logo'?{selectedLogoId:id,selectedLogoAssetId:id.replace(/^logo-/,'')}:{})}}),30_000)}return result},
    getProfile: ()=>request(ENDPOINTS.profile,{params:{deferCosmetics:1},cacheMs:30_000}),
    getCosmetics: ()=>request('/profile/cosmetics',{cacheMs:30_000}),
    updateAvatar: (avatarId)=>request('/profile/avatar',{method:'POST',body:{avatarId}}),
    getHistory: ({cursor,limit=20}={})=>request(ENDPOINTS.history,{params:{cursor,limit:pageLimit(limit)},cacheMs:10_000}),
    listUsers: ({cursor,limit=20}={})=>request(ENDPOINTS.users,{params:{cursor,limit:pageLimit(limit)},cacheMs:60_000}),
    getContainerOpening: (itemId,id)=>request('/inventory/open/status',{params:{itemId,id}}),
    openContainer: (itemId,idempotencyKey)=>request('/inventory/open',{method:'POST',body:{itemId,idempotencyKey}}),
    getInventory: ()=>request(ENDPOINTS.inventory,{params:{deferReadiness:1},cacheMs:20_000}),
    getInventoryReadiness:()=>request('/inventory/readiness',{cacheMs:20_000}),
    getReceipt: id=>request('/shop/receipt',{params:{id}}),
    getGameContext: ()=>request('/games/context'),
    getPerrilandContext: ()=>request('/perriland/context'),
    getNotifications: ({cursor,limit=20,state='unread'}={})=>request(ENDPOINTS.notifications,{params:{cursor,limit:pageLimit(limit),state},cacheMs:0}),
    markNotificationRead: (id)=>request('/notifications/read',{method:'POST',body:{id}}),
    listRandomKeys: ({ticketCursor,claimCursor,limit=20}={})=>request(ENDPOINTS.randomKey,{params:{ticketCursor,claimCursor,limit:pageLimit(limit)},cacheMs:20_000}),
    redeemRandomKey: (idempotencyKey)=>request('/shop/random-key/redeem',{method:'POST',body:{idempotencyKey}}),
    listRaffles: ()=>request(ENDPOINTS.raffles,{cacheMs:60_000}),
    buyRaffleTicket: ({raffleId,idempotencyKey})=>request('/shop/raffles/buy',{method:'POST',body:{raffleId,idempotencyKey}}),
  });
}

// Compatibilidad con retornos PKCE que Supabase devuelve a Site URL (/).
// Solo construye el callback local; el backend exige su cookie y verificador.
export function oauthCallbackPath({pathname,search}) {
  if(!['/','/index.html'].includes(pathname))return null;
  const query=new URLSearchParams(search);
  if(!query.has('code')&&!query.has('error'))return null;
  const next=new URLSearchParams();
  if(query.has('error'))next.set('error','access_denied');
  else if(query.getAll('code').length===1&&query.get('code')&&query.get('code').length<=4096)next.set('code',query.get('code'));
  else next.set('error','invalid_callback');
  return '/api/auth/google/callback?'+next;
}
