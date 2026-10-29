/**
 * PerriWeb 2.0 · Cliente del backend propio; Supabase solo se consulta en servidor.
 * - Solo rutas relativas del backend propio, sin credenciales de Supabase en navegador.
 * - Usa cookie HttpOnly del mismo origen y CSRF vinculado a la sesión.
 * - Consultas deduplicadas, caché corta opcional; ninguna encuesta automática.
 * - Las acciones que cambian datos JAMÁS se reintentan automáticamente.
 * - No enviar objeto de recompensa/precio o identidad del usuario para determinar premios.
 */
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
  const cache = new Map(), inflight = new Map();
  let epoch = 0;
  let csrfToken = '';

  function clearCache() { cache.clear(); inflight.clear(); epoch++; }
  const pageLimit = value => Number.isFinite(value) ? Math.min(50, Math.max(1, Math.trunc(value))) : 20;
  function url(path, params) {
    if (!/^\/[a-z0-9/_-]+$/i.test(path) || path.includes('//')) throw new TypeError('Ruta API incorrecta');
    const query = new URLSearchParams();
    for (const [k,v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== '') query.set(k, String(v));
    }
    const q=query.toString();return base+path+(q ? '?' + q:'');
  }
  async function request(path, {method='GET', params, body, cacheMs=0}={}) {
    if(!['GET','POST'].includes(method)) throw new TypeError('Método no permitido');
    if(method==='GET' && body!==undefined) throw new TypeError('GET sin cuerpo');
    // Toda mutación separa la caché y las lecturas pendientes del estado anterior,
    // también si login/logout falla o se pierde su respuesta.
    if(method==='POST') clearCache();
    const target=url(path,params), generation=epoch;
    if(method==='GET' && cacheMs>0) {
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
        if(generation!==epoch) throw new ApiError(409,'session_changed');
        if(!response.ok) {
          if(response.status===401) { csrfToken=''; clearCache();if(path!=='/auth/login')onSessionExpired(); }
          const fallback=response.status===401?'session_expired':response.status===403?'forbidden':response.status===429?'too_many_requests':'request_failed';
          let code=fallback;
          try{const data=await response.json();if(['origin_mismatch','proxy_auth_required','cross_site_request','csrf_invalid','unsupported_media_type','backend_not_configured','backend_unavailable','invalid_credentials','operation_disabled','session_writes_disabled','item_not_owned','avatar_not_owned','avatar_not_changed','operation_conflict','insufficient_balance','invalid_balance','ticket_limit','no_stock','no_active_ticket','account_inactive','inventory_missing','economy_unavailable','games_not_configured','games_unavailable'].includes(data?.error))code=data.error}catch{}
          throw new ApiError(response.status,code);
        }
        let result;
        try { result=await response.json(); }
        catch(error) {
          if(error?.name==='AbortError') throw error;
          throw new ApiError(502,'invalid_server_response');
        }
        if(generation!==epoch) throw new ApiError(409,'session_changed');
        if(result===null || typeof result!=='object') throw new ApiError(502,'invalid_server_response');
        const token=response.headers?.get?.('x-csrf-token');
        if(token&&/^[\w-]{43}$/.test(token)) csrfToken=token;
        if(result.authenticated===false)csrfToken='';
        if(method==='POST') clearCache();
        else if(cacheMs>0 && generation===epoch) cache.set(target,{data:result,expires:now()+cacheMs});
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
    clearCache,
    getCsrfToken:()=>csrfToken,
    getSession: ()=>request(ENDPOINTS.session,{cacheMs:0}),
    login: (nick,password)=>request('/auth/login',{method:'POST',body:{nick,password}}),
    logout: ()=>request('/auth/logout',{method:'POST',body:{}}),
    getProfile: ()=>request(ENDPOINTS.profile,{cacheMs:30_000}),
    updateAvatar: (avatarId)=>request('/profile/avatar',{method:'POST',body:{avatarId}}),
    getHistory: ({cursor,limit=20}={})=>request(ENDPOINTS.history,{params:{cursor,limit:pageLimit(limit)},cacheMs:10_000}),
    listUsers: ({cursor,limit=20}={})=>request(ENDPOINTS.users,{params:{cursor,limit:pageLimit(limit)},cacheMs:60_000}),
    openContainer: (itemId,idempotencyKey)=>request('/inventory/open',{method:'POST',body:{itemId,idempotencyKey}}),
    getInventory: ()=>request(ENDPOINTS.inventory,{cacheMs:20_000}),
    getReceipt: id=>request('/shop/receipt',{params:{id}}),
    getGameContext: ()=>request('/games/context'),
    getNotifications: ({cursor,limit=20}={})=>request(ENDPOINTS.notifications,{params:{cursor,limit:pageLimit(limit)},cacheMs:30_000}),
    markNotificationRead: (id)=>request('/notifications/read',{method:'POST',body:{id}}),
    listRandomKeys: ({ticketCursor,claimCursor,limit=20}={})=>request(ENDPOINTS.randomKey,{params:{ticketCursor,claimCursor,limit:pageLimit(limit)},cacheMs:20_000}),
    redeemRandomKey: (idempotencyKey)=>request('/shop/random-key/redeem',{method:'POST',body:{idempotencyKey}}),
    listRaffles: ()=>request(ENDPOINTS.raffles,{cacheMs:60_000}),
    buyRaffleTicket: ({raffleId,idempotencyKey})=>request('/shop/raffles/buy',{method:'POST',body:{raffleId,idempotencyKey}}),
  });
}
