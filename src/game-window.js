// Solo ciclo de presentación. No consulta ni modifica datos del juego.
export const mobileGameView=(win=window)=>win.matchMedia('(pointer: coarse) and (max-width: 1100px)').matches||win.navigator.userAgentData?.mobile===true||/Android|iPhone|iPad/i.test(win.navigator.userAgent);
export function createGameWindow({overlay,doc=document,win=window}){
 let card=null,mobile=false,marker=null,closing=null,wasFullscreen=false,lastExit=-Infinity,epoch=0;
 const fullscreen=()=>doc.fullscreenElement===card&&card!==null;
 function sync(){
  const active=fullscreen();if(wasFullscreen&&!active)lastExit=win.performance.now();wasFullscreen=active;
  const button=card?.querySelector('[data-action="game-fullscreen"]');if(button){button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'Salir de pantalla completa':'Pantalla completa');button.title=active?'Salir de pantalla completa':'Pantalla completa';button.textContent=active?'↙':'⛶'}
 }
 function unlock(){try{win.screen.orientation?.unlock?.()}catch{}}
 function landscape(current,version){
  if(card!==current||epoch!==version||!mobile)return;
  try{Promise.resolve(win.screen.orientation?.lock?.('landscape')).then(()=>{if(!card)unlock()}).catch(()=>{})}catch{}
 }
 function request(current=card){
  if(!current)return Promise.resolve(false);const version=epoch;
  if(typeof current.requestFullscreen!=='function'||doc.fullscreenEnabled===false){landscape(current,version);return Promise.resolve(false)}
  try{return Promise.resolve(current.requestFullscreen({navigationUI:'hide'})).then(()=>{
   if(card!==current||epoch!==version){if(doc.fullscreenElement===current)void doc.exitFullscreen?.().catch(()=>{});return false}
   sync();landscape(current,version);return fullscreen();
  }).catch(()=>{landscape(current,version);sync();return false})}catch{landscape(current,version);sync();return Promise.resolve(false)}
 }
 function open(current,{immersive=false}={}){
  card=current;mobile=immersive;epoch++;wasFullscreen=false;
  if(mobile){if(!marker){marker=doc.createComment('game-overlay-position');overlay.before(marker);doc.body.append(overlay)}doc.body.classList.add('game-immersive')}
  sync();if(mobile)void request(current);
 }
 async function close(){
  if(closing)return closing;const old=card,wasMobile=mobile;card=null;mobile=false;epoch++;
  closing=(async()=>{try{if(old&&doc.fullscreenElement===old)await doc.exitFullscreen?.()}catch{}finally{
   if(wasMobile&&!card)unlock();if(!card){doc.body.classList.remove('game-immersive');if(marker){marker.replaceWith(overlay);marker=null}}wasFullscreen=false;
  }})();const work=closing;work.finally(()=>{if(closing===work)closing=null});return work;
 }
 async function toggle(){if(fullscreen()){try{await doc.exitFullscreen()}catch{}sync()}else await request()}
 doc.addEventListener('fullscreenchange',sync);doc.addEventListener('fullscreenerror',sync);
 return {open,close,toggle,sync,isMobile:()=>mobile,isFullscreen:fullscreen,recentlyExited:()=>win.performance.now()-lastExit<350};
}
