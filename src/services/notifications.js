import {escapeText} from './live-ui.js';
import {itemDetails} from './help-content.js';
// read_at pertenece al servidor; ninguna lectura GET modifica notificaciones.
const dates=new Intl.DateTimeFormat('es-ES',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Madrid'});
export function notificationDate(value){const date=new Date(value);return value&&Number.isFinite(date.getTime())?dates.format(date):''}
function notificationTime(value){
 const milliseconds=Date.parse(value);if(!Number.isFinite(milliseconds))return 0n;
 const fraction=String(value).match(/\.(\d+)/)?.[1]??'';
 return BigInt(milliseconds)*1000n+BigInt(fraction.padEnd(6,'0').slice(3,6));
}
export function mergeNotifications(previous=[],incoming=[]){
 const rows=new Map();for(const item of [...previous,...incoming])rows.set(item.id,item);
 return [...rows.values()].sort((a,b)=>{const delta=notificationTime(b.created_at)-notificationTime(a.created_at);return delta>0n?1:delta<0n?-1:String(b.id).localeCompare(String(a.id))});
}
export function createNotificationCenter({api,onPending=()=>{},onViewed=()=>{},onError=()=>{},isActive=()=>true,intervalMs=30_000}={}){
 let generation=0,running=false,timer=null,inflight=null,queue=Promise.resolve(),queued=0;
 const viewed=new Set(),pending=new Map();
 async function refresh(){
  if(!running||!isActive()||queued)return;
  if(inflight)return inflight;
  const current=generation;
  const work=Promise.resolve().then(()=>api.getNotifications({state:'unread',limit:1})).then(result=>{if(running&&generation===current)onPending(result.items.length>0)}).catch(()=>{}).finally(()=>{if(inflight===work)inflight=null});
  inflight=work;return work;
 }
 function stop(){generation++;running=false;clearInterval(timer);timer=null;inflight=null;queued=0;queue=Promise.resolve();viewed.clear();pending.clear();onPending(false)}
 function start(){stop();running=true;void refresh();timer=setInterval(()=>void refresh(),intervalMs);timer.unref?.()}
 function markViewed(id,visible=()=>true){
  if(!running||viewed.has(id))return Promise.resolve(false);
  if(pending.has(id))return pending.get(id);
  const current=generation;queued++;
  const work=queue.then(async()=>{
   if(!running||generation!==current||!isActive()||!visible())return false;
   try{
    await api.markNotificationRead(id);
    if(!running||generation!==current)return false;
    viewed.add(id);onViewed(id);return true;
   }catch(error){if(running&&generation===current)onError(error);return false}
  }).finally(()=>{if(generation===current){pending.delete(id);queued--;if(!queued)void refresh()}});
  queue=work.catch(()=>{});pending.set(id,work);return work;
 }
 return {start,stop,refresh,markViewed};
}

const rewardItems=new Set(['perri_cofres','perri_cofres_minijuego','cajita_armas','bolsa_especial','bolsa_chatarra','bolsa_gemas','monedas']);
export function notificationCard(item,unread=false){
 const id=rewardItems.has(item.payload?.itemId)?item.payload.itemId:rewardItems.has(item.kind)?item.kind:null;
 const image=id?itemDetails(id).image:['welcome','twitch','youtube'].includes(item.kind)?'./public/assets/icono-notificacion-social.webp':'./public/assets/icono-notificacion-comunicado.webp';
 const amount=item.payload?.amount;
 return `<article class="notification-entry" ${unread&&!item.read_at?`data-notification-id="${escapeText(item.id)}"`:''}><span class="notification-graphic" aria-hidden="true"><img src="${escapeText(image)}" alt="" draggable="false"/>${id&&typeof amount==='number'&&Number.isFinite(amount)&&amount>0?`<span class="notification-amount">+${escapeText(amount.toLocaleString('es-ES'))}</span>`:''}</span><div class="notification-copy"><h3>${escapeText(item.title)}</h3><p>${escapeText(item.message)}</p><time datetime="${escapeText(item.created_at)}">${escapeText(notificationDate(item.created_at))}</time></div></article>`;
}
