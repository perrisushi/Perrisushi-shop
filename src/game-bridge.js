// Adaptador de transporte: conserva los scripts y mecánicas originales.
(()=>{
 document.documentElement.style.visibility='hidden';
 const native=window.fetch.bind(window),pending=new Map();let csrf='',contextPromise;
 const getContext=()=>contextPromise??=(async()=>{const s=await native('/api/session',{credentials:'same-origin',cache:'no-store'});csrf=s.headers.get('x-csrf-token')??'';const r=await native('/api/games/context',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Inicia sesión en PerriWeb');const data=await r.json();if(!data.available)throw Error('Los juegos no están disponibles. Inténtalo más tarde.');return data})().catch(e=>{contextPromise=null;throw e});
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(!url.pathname.endsWith('/shop-api'))return native(input,options);
  let body;try{body=JSON.parse(options.body??'{}')}catch{return Response.json({ok:false,error:'invalid_request'},{status:400})}
  const {sessionToken,...payload}=body;const fingerprint=JSON.stringify(payload);
  let entry=pending.get(fingerprint);if(entry?.promise)return (await entry.promise).clone();
  entry??={id:crypto.randomUUID()};pending.set(fingerprint,entry);
  entry.promise=(async()=>{await getContext();const response=await native('/api/games/action',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({...payload,idempotencyKey:entry.id})});
   const result=await response.clone().json();if(response.ok&&typeof result?.ok==='boolean')pending.delete(fingerprint);
   if(response.status===401)window.parent.postMessage({type:'pw2-session-expired'},location.origin);
   if(!response.ok)return Response.json({ok:false,error:result.error??'games_unavailable'},{status:response.status});if(result?.ok)window.parent.postMessage({type:'pw2-game-updated'},location.origin);return response;
  })();try{return (await entry.promise).clone()}finally{entry.promise=null}
 };
 navigator.sendBeacon=(url,data)=>{if(String(url).endsWith('shop-api')){void (async()=>{await window.fetch(url,{method:'POST',body:await data.text()})})().catch(()=>{});return true}return false};
 const send=async()=>{try{const c=await getContext();const kind=location.pathname.includes('perriduelos')?'perriduelos':location.pathname.includes('perripet')?'perripet':location.pathname.includes('perrirpg')?'perrirpg':null;
  if(kind)window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window.parent,data:{type:kind+'-session',...c}}));document.documentElement.style.visibility='visible';
 }catch(error){const notice=document.createElement('p');notice.setAttribute('role','alert');notice.textContent=error.message;document.body.replaceChildren(notice);document.documentElement.style.visibility='visible'}};
 window.addEventListener('load',()=>void send());
 // El documento antiguo de Casillas no debe recuperar ni persistir tokens del navegador.
 const oldGet=Storage.prototype.getItem,oldSet=Storage.prototype.setItem;
 Storage.prototype.getItem=function(key){return key==='perri-shop-session-token'?null:oldGet.call(this,key)};
 Storage.prototype.setItem=function(key,value){if(key!=='perri-shop-session-token')oldSet.call(this,key,value)};
 window.pw2GameContext=getContext;
})();
