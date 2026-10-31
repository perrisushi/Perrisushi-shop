import { normalizeRoute, routeTitles } from './routes.js';
import {createGameWindow,mobileGameView} from './game-window.js';
import {createApiClient} from './services/api-client.js';
import {escapeText,logoId,message,stateNotice,pager,dataState,setPageData,renderUserRows,renderLiveUsers,renderLiveInventory,renderLiveShop,bindPageEvents} from './services/live-ui.js';
import {itemDetails,gameDescriptions} from './services/help-content.js';
const api=createApiClient({onSessionExpired:()=>errorState({code:'session_expired'})});
let session=null,sessionState={status:'loading'},profileState={status:'loading'},sessionEpoch=0,routeEpoch=0,modalKind=null,logoutPending=false,gameBootstrap=null;
let googleConfig={enabled:false,legalPublished:false},googlePending=null,googleLinked=null,googleNotice='';
let openingGame=false,gameLaunchEpoch=0;
const containerOperations=new Map();
let inventoryObserver=null;
const openableContainers=['perri_cofres','perri_cofres_minijuego','bolsa_gemas','bolsa_chatarra','bolsa_especial','cajita_armas'];
const remoteStates={};

const ASSETS = './public/assets/';
const stage = document.querySelector('#contenido');
const overlay = document.querySelector('#overlay-layer');
const gameWindow=createGameWindow({overlay});
const sessionOptions = document.querySelector('#session-options');
const musicButton = document.querySelector('[data-action="music"]');
const backgroundMusic = document.querySelector('#background-music');
const profileBadge = document.querySelector('.profile-badge');
const avatarImage = document.querySelector('.avatar-image');
// Solo identificadores del catálogo. Nunca construir una URL de avatar con un valor sin validar.
const ALLOWED_AVATARS = new Set(['abeja-1','abuela-1','amparo-1','buho-1','cabra-1','cami-1','croqueta-1','esq-1','estresario-1','gato-1','panda-1','pelusa-1','perriweb1','slime-1','slime-2']);
let selectedAvatar = 'perriweb1';
function avatarMarkup(id, className = '') {
  return `<span class="perrilogo-preview ${className}"><img class="perrilogo-frame" src="${ASSETS}marco-logo.webp" alt="" /><img class="perrilogo-icon" src="${ASSETS}logo-${id}.webp" alt="Perrilogo seleccionado" /></span>`;
}
/** Se llamará después de autenticar la sesión y leer el avatar verificado del usuario. */
export function setAuthenticatedProfile(profile) {
  const id = profile?.authenticated === true ? profile.avatarId : null;
  selectedAvatar = ALLOWED_AVATARS.has(id) ? id : 'perriweb1';
  avatarImage.src = ASSETS + 'logo-' + (ALLOWED_AVATARS.has(id) ? id : 'perriweb1') + '.webp';
  profileBadge.setAttribute('aria-label', profile?.authenticated === true && profile?.displayName ? 'Perfil de ' + String(profile.displayName).slice(0,80) : 'Entrar en tu cuenta');
  profileBadge.dataset.authenticated = profile?.authenticated === true ? 'true' : 'false';
}
setAuthenticatedProfile(null);
// Música desactivada de inicio; cargar el MP3 solo tras una pulsación explícita.
let musicEnabled = false;
function renderMusicOption(){ musicButton.textContent = musicEnabled ? 'Apagar música' : 'Encender música'; musicButton.setAttribute('aria-pressed', String(musicEnabled)); }
async function toggleMusic() {
  if(musicEnabled){backgroundMusic.pause();musicEnabled=false;renderMusicOption();return;}
  backgroundMusic.volume = 0.5;
  try {await backgroundMusic.play();musicEnabled=true;}
  catch {musicEnabled=false;openModal('music-error');}
  renderMusicOption();
}

const menuToggle = document.querySelector('.nav-toggle');
let lastFocus = null;

const imageButton = (image, route, label) => `
  <button class="art-menu-button" type="button" data-route="${route}" aria-label="${label}">
    <img src="${ASSETS}${image}.webp" alt="" draggable="false" />
    <span class="sr-only">${label}</span>
  </button>`;

function homeView() {
  return `<section class="home-menu" aria-label="Menú principal">
      <div class="home-links">
        ${imageButton('boton-miperfil','profile','Mi perfil')}
        ${imageButton('boton-usuarios','users','Usuarios')}
        ${imageButton('boton-inventario','inventory','Inventario')}
        ${imageButton('boton-minijuegos','games','Minijuegos')}
        ${imageButton('boton-tienda','shop','Tienda')}
      </div>
  </section>`;
}

function shellView(route, content) {
  return `<section class="content-board" aria-label="${routeTitles[route]}">
    <header class="content-header">
      <button type="button" class="back-button" data-route="home" aria-label="Volver al inicio"><img src="${ASSETS}boton-atras.webp" alt="" /></button>
      <div><h1>${routeTitles[route]}</h1></div>
    </header>
    <div class="content-scroll">${content}</div>
  </section>`;
}

function emptyNotice(title, details, icon = '') {
  const symbol = icon ? `<span class="empty-symbol" aria-hidden="true">${icon}</span>` : '';
  return `<div class="empty-notice">${symbol}<h2>${title}</h2><p>${details}</p></div>`;
}

function profileView() {
  return shellView('profile', `<div class="profile-grid">
    <div class="profile-portrait">${avatarMarkup(selectedAvatar)}<span class="portrait-subtitle">${escapeText(profileState.profile?.selectedTitleId??'')}</span></div>
    <div class="profile-details"><h2>${escapeText(session?.nick)}</h2>
      ${profileState.status==='ready'?'':stateNotice(profileState)}
      <div class="info-strip"><span>PC · Gemas</span><strong>${escapeText(profileState.balances?.pc??'—')} · ${escapeText(profileState.balances?.gemas??'—')}</strong></div><div class="info-strip"><span>Logros</span><strong>${escapeText(Array.isArray(profileState.profile?.achievements)?profileState.profile.achievements.join(' · '):'—')}</strong></div>
      <div class="info-strip"><span>Karma</span><strong>${escapeText(profileState.profile?.karma??'—')}</strong></div>
      <div class="profile-actions"><button class="textured-button history-button" type="button" data-action="history" aria-label="Historial" title="Historial"><span aria-hidden="true">⌛</span></button><button class="textured-button" type="button" data-action="album">Cambiar Perrilogos</button></div>
      ${googleConfig.enabled?`<div class="google-profile">${googleLinked===true?'<p>Google vinculado</p>':googleLinked===null?'<button type="button" class="textured-button" data-action="google-status">Comprobar vinculación de Google</button>':`<button type="button" class="textured-button" data-action="link-google">Vincular Google</button>`}${googleNotice==='linked'?'<p role="status">Tu cuenta de Google se ha vinculado.</p>':''}</div>`:''}
    </div>
  </div>`);
}

function usersView() {
  return shellView('users', renderLiveUsers());
}

function fitInventoryGrid(){
 inventoryObserver?.disconnect();inventoryObserver=null;
 const board=stage.querySelector('.content-board:has(.pw04-inventory)'),panel=board?.querySelector('.pw04-inventory'),main=panel?.querySelector('.pw04-inventory-main'),grid=main?.querySelector('.pw04-inventory-grid');if(!grid)return;
 const fit=()=>{
  if(!main.isConnected)return;
  const style=e=>getComputedStyle(e),value=(css,key)=>parseFloat(css.getPropertyValue(key))||0;
  const horizontal=css=>value(css,'padding-left')+value(css,'padding-right')+value(css,'border-left-width')+value(css,'border-right-width');
  const vertical=css=>value(css,'padding-top')+value(css,'padding-bottom')+value(css,'border-top-width')+value(css,'border-bottom-width');
  const header=board.querySelector('.content-header'),scroll=board.querySelector('.content-scroll'),balances=panel.querySelector('.pw04-inventory-balances');
  const boardCss=style(board),scrollCss=style(scroll),mainCss=style(main),headerCss=style(header),balanceCss=style(balances);
  const hostCss=style(stage),hostWidth=stage.clientWidth-value(hostCss,'padding-left')-value(hostCss,'padding-right'),hostHeight=stage.clientHeight-value(hostCss,'padding-top')-value(hostCss,'padding-bottom');
  const maxWidth=Math.min(hostWidth,value(boardCss,'--inventory-panel-max')||900),insetX=horizontal(boardCss)+horizontal(scrollCss)+horizontal(style(panel))+horizontal(mainCss);
  const availableWidth=Math.max(1,maxWidth-insetX),capacity=availableWidth<300?3:availableWidth<400?4:6,count=grid.children.length,columns=Math.min(count||1,capacity);
  grid.style.setProperty('--inventory-columns',String(columns));grid.style.setProperty('--inventory-gap',innerHeight<=360?'6px':capacity<6?'6px':'8px');grid.style.setProperty('--inventory-pad',innerHeight<=360?'6px':capacity<6?'8px':'12px');
  const css=style(grid),gap=value(css,'column-gap'),borderX=value(css,'border-left-width')+value(css,'border-right-width'),padX=horizontal(css),padY=vertical(css);
  const gutter=Math.max(0,grid.offsetWidth-grid.clientWidth-borderX),ideal=(availableWidth-padX-gutter-(capacity-1)*gap)/capacity;
  const childrenWidth=e=>[...e.children].reduce((sum,child)=>sum+child.getBoundingClientRect().width,0);
  const headerNeed=childrenWidth(header)+Math.max(0,header.children.length-1)*value(headerCss,'column-gap')+horizontal(headerCss)+horizontal(boardCss);
  const balanceNeed=childrenWidth(balances)+Math.max(0,balances.children.length-1)*value(balanceCss,'column-gap')+insetX;
  const minWidth=Math.min(maxWidth,Math.max(headerNeed,balanceNeed,260));
  // El ancho preferido de una casilla depende del espacio máximo, no de un panel ya reducido.
  const preferredGridWidth=columns*Math.max(1,ideal)+(columns-1)*gap+padX+gutter;
  board.style.width=Math.min(maxWidth,Math.max(minWidth,preferredGridWidth+insetX))+'px';
  if(!count){grid.style.removeProperty('width');grid.style.removeProperty('height');return}
  const outside=[...panel.children].filter(e=>e!==main&&!e.hidden).reduce((sum,e)=>{const c=style(e);return sum+e.getBoundingClientRect().height+value(c,'margin-top')+value(c,'margin-bottom')},0);
  const height=hostHeight-vertical(boardCss)-header.getBoundingClientRect().height-vertical(scrollCss)-vertical(style(panel))-outside-vertical(mainCss)-padY;
  if(height<=0||ideal<=0)return;
  const actualRows=Math.ceil(count/columns),visibleRows=Math.min(actualRows,Math.max(1,Math.ceil((height+gap)/(ideal+gap))));
  const cell=Math.floor(Math.max(1,Math.min(ideal,(height-(visibleRows-1)*gap)/visibleRows))*64)/64;
  const gridWidth=columns*cell+(columns-1)*gap+padX+gutter;
  board.style.width=Math.min(maxWidth,Math.max(minWidth,gridWidth+insetX))+'px';
  grid.style.width=gridWidth+'px';grid.style.height=(visibleRows*cell+(visibleRows-1)*gap+padY)+'px';
 };
 inventoryObserver=new ResizeObserver(fit);inventoryObserver.observe(stage);fit();
}

function inventoryView() {
  const recoveries=openableContainers.filter(id=>pendingContainer(id)&&!(dataState.inventory.inventory?.[id]>0));
  const links=recoveries.length?`<div class="inventory-recovery">${recoveries.map(id=>`<button type="button" class="textured-button" data-live-item="${id}">Consultar apertura: ${escapeText(itemDetails(id).name)}</button>`).join('')}</div>`:'';
  return shellView('inventory',renderLiveInventory().replace('<div class="pw04-inventory-main"',links+'<div class="pw04-inventory-main"'));
}

function gamesView() {
  const games = [
    ['menu-duelos','PerriDuelos'],['boton-perripet','PerriPet'],['boton-perricasilla','PerriCasillas'],['boton-perrirpg','PerriRPG']
  ];
  return shellView('games', `<div class="games-grid">${games.map(([file,name])=>`<article class="game-tile" data-game="${name}"><button type="button" class="game-launch" aria-label="Abrir ${name}"><img src="${ASSETS}${file}.webp" alt="${name}" loading="lazy"/></button><button type="button" class="game-help" data-game-help="${name}" aria-label="Información de ${name}" aria-haspopup="dialog">?</button></article>`).join('')}</div>`);
}

function shopView() {
  return shellView('shop', renderLiveShop());
}

const views = {home:homeView,profile:profileView,users:usersView,inventory:inventoryView,games:gamesView,shop:shopView};

function closeMenu() {
  sessionOptions.hidden = true;
  menuToggle.setAttribute('aria-expanded','false');
}

function render() {
  if(!session){stage.replaceChildren();if(sessionState.status!=='loading')showLogin();return}
  document.body.dataset.access='ready';
  const route = normalizeRoute(location.hash);
  stage.innerHTML = views[route]();
  fitInventoryGrid();
  stage.classList.toggle('show-home', route === 'home');
  document.title = `${routeTitles[route]} | Perrisushi World`;
  closeMenu();
  stage.scrollTop = 0;
  stage.focus({preventScroll:true});
  void loadCurrentRoute(route);
}

function navigate(route) {
  const safe = normalizeRoute('#'+route);
  if (location.hash === '#' + safe) render();
  else location.hash = safe;
}

const gameRoutes={PerriDuelos:'/perriduelos-app/index.html',PerriPet:'/perripet-app/index.html',PerriCasillas:'/perricasillas',PerriRPG:'/perrirpg.html'};
const economicOperations=new Map();let economicReceipt=null;
function gameMarkup(name,pending=false){return `<div class="modal-head"><h2 id="modal-title">${escapeText(name)}</h2><div class="game-window-actions"><button type="button" data-action="game-fullscreen" aria-label="Pantalla completa" aria-pressed="false">⛶</button><button type="button" data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div></div>${pending?'<div class="game-opening" role="status">Abriendo juego…</div>':`<iframe class="original-game" src="${gameRoutes[name]}" title="${escapeText(name)}" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe>`}<p class="game-rotate-hint" role="status">Gira el móvil para jugar en horizontal.</p>`}
function containerStorageKey(id){return 'pw2:container:'+session?.nick+':'+id}
function storedContainer(id){
 try{const raw=sessionStorage.getItem(containerStorageKey(id));if(!raw)return null;
  const value=raw.startsWith('{')?JSON.parse(raw):{id:raw,phase:'unknown'};
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id??'')&&['unknown','retry','blocked'].includes(value.phase)?value:null;
 }catch{return null}
}
function pendingContainer(id){const value=storedContainer(id);return value?.phase==='unknown'?value.id:null}
function storeContainer(id,op){try{if(['unknown','retry','blocked'].includes(op.phase))sessionStorage.setItem(containerStorageKey(id),JSON.stringify({id:op.id,phase:op.phase}));else sessionStorage.removeItem(containerStorageKey(id))}catch{}}
function containerArt(id,opened=false){
 if(id==='perri_cofres')return '/assets/perricofre1-'+(opened?'abierto':'cerrado')+'.png';
 if(id==='perri_cofres_minijuego')return '/assets/perricofres-minijuego-'+(opened?'abierto':'cerrado')+'.png';
 return itemDetails(id).image;
}
function inventoryItemMarkup(id){
 const item=itemDetails(id),quantity=dataState.inventory.inventory?.[id]??0,op=containerOperations.get(id)??(storedContainer(id)?.phase==='blocked'?{phase:'blocked',error:'No se pudo recuperar esta apertura. Revisa tu historial.'}:null),rewards=op?.result?.rewards;
 const canOpen=openableContainers.includes(id)&&(quantity>0||pendingContainer(id))&&op?.phase!=='blocked';
 return `<div class="modal-head"><h2 id="modal-title">${escapeText(rewards?'Recompensas obtenidas':item.name)}</h2><button type="button" data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div>
 <div class="item-detail ${openableContainers.includes(id)?'container-detail':''}"><img src="${escapeText(openableContainers.includes(id)?containerArt(id,Boolean(rewards)):item.image)}" alt="${escapeText(item.name)}"/>
 ${rewards?`<p class="reward-confirmation">${escapeText(item.name)}</p><ul class="container-rewards">${rewards.map(reward=>{
  const key=String(reward.kind==='rpgItem'?'cajitaArmas':reward.kind??'').replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),image=reward.kind==='logo'?ASSETS+'logo-'+logoId(reward.logoId)+'.webp':itemDetails(key).image;
  return `<li><img src="${escapeText(image)}" alt=""/><div><strong>${escapeText(reward.label)}</strong>${reward.kind==='rpgItem'?'<small>Guardado en el inventario de PerriRPG</small>':''}</div></li>`;
 }).join('')}</ul>${quantity>0?`<button type="button" class="textured-button container-open" data-next-container="${id}">Abrir otro</button>`:''}`:`<p class="item-quantity">Cantidad: <strong>${escapeText(quantity)}</strong></p>${item.description?'<p>'+escapeText(item.description)+'</p>':''}${canOpen?`${pendingContainer(id)?'<p class="container-consumption">Consulta el resultado de tu apertura anterior.</p>':''}<button type="button" class="textured-button container-open" data-open-container="${id}" ${op?.busy?'disabled aria-busy="true"':''}>${op?.busy?op.phase==='unknown'?'Consultando…':'Abriendo…':pendingContainer(id)?'Consultar apertura':'Abrir'}</button>`:''}`}
 <p class="container-status" role="status">${escapeText(op?.error??'')}</p></div>`;
}
function paintContainer(id){
 if(modalKind!=='item:'+id||overlay.hidden)return;
 const card=overlay.querySelector('.modal-card');card.innerHTML=inventoryItemMarkup(id);card.scrollTop=0;
 card.querySelector('.modal-close')?.focus({preventScroll:true});
}
async function confirmContainer(id,op,result,generation){
 if(generation!==sessionEpoch)return;
 op.result={rewards:result.rewards};op.phase='complete';op.busy=false;op.error='';storeContainer(id,op);
 api.clearCache();await loadCurrentRoute(normalizeRoute(location.hash));
 try{const profile=await api.getProfile();if(generation!==sessionEpoch)return;profileState={status:'ready',...profile};setAuthenticatedProfile({authenticated:true,displayName:session.nick,avatarId:profile.profile?.selectedLogoAssetId})}catch{}
 if(generation===sessionEpoch)paintContainer(id);
}
async function recoverContainer(id,op,generation){
 op.phase='unknown';op.busy=true;storeContainer(id,op);paintContainer(id);
 try{
  const result=await api.getContainerOpening(id,op.id);if(generation!==sessionEpoch)return;
  if(result.status==='complete'){await confirmContainer(id,op,result,generation);return}
  if(result.status!=='not_found')throw Error('Invalid opening status');
  // Conservar el UUID para un reintento: una petición retrasada no puede cobrar dos veces.
  op.phase='retry';op.error='No se pudo completar la apertura. Puedes intentarlo de nuevo.';
 }catch(error){if(generation!==sessionEpoch)return;
  if(error.code==='operation_conflict'){op.phase='blocked';op.error='No se pudo recuperar esta apertura. Revisa tu historial.'}
  else{errorState(error);op.error='No se pudo comprobar el resultado. Consulta la apertura antes de volver a abrir.'}
 }
 if(generation!==sessionEpoch)return;op.busy=false;storeContainer(id,op);paintContainer(id);
}
async function openInventoryContainer(id,button){
 if(!session||!openableContainers.includes(id)||containerOperations.get(id)?.busy)return;
 const generation=sessionEpoch,saved=storedContainer(id),previous=containerOperations.get(id);
 const op=previous??{id:saved?.id,phase:saved?.phase};containerOperations.set(id,op);
 if(saved?.phase==='unknown'||op.phase==='unknown'){op.id=saved?.id??op.id;await recoverContainer(id,op,generation);return}
 if(op.phase==='blocked')return;
 op.id=saved?.id??(op.phase==='retry'?op.id:null)??crypto.randomUUID();op.phase='opening';op.busy=true;op.error='';
 // Guardar como indeterminado antes de enviar; una recarga solo consulta este UUID.
 storeContainer(id,{id:op.id,phase:'unknown'});button.disabled=true;button.textContent='Abriendo…';button.setAttribute('aria-busy','true');
 try{const result=await api.openContainer(id,op.id);if(generation!==sessionEpoch)return;await confirmContainer(id,op,result,generation)}
 catch(error){if(generation!==sessionEpoch)return;
  if(error.status>=400&&error.status<500&&error.status!==408&&error.code!=='operation_conflict'){
   op.busy=false;op.phase='rejected';storeContainer(id,op);errorState(error);op.error=message({error:error.code});paintContainer(id);
  }else await recoverContainer(id,op,generation);
 }
}
function modalMarkup(type) {
  if(type.startsWith('item:'))return inventoryItemMarkup(type.slice(5));
  if(type.startsWith('game-help:')){
    const name=type.slice(10);return `<div class="modal-head"><h2 id="modal-title">${escapeText(name)}</h2><button type="button" data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p class="modal-intro">${escapeText(gameDescriptions[name])}</p>`;
  }
  if(type==='game-unavailable')return `<div class="modal-head"><h2 id="modal-title">Minijuegos</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p>El servicio de minijuegos no está disponible. Vuelve a intentarlo más tarde.</p>`;

  if(type.startsWith('game:'))return gameMarkup(type.slice(5));
  if(type==='receipt')return `<div class="modal-head"><h2 id="modal-title">Operación completada</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div>${economicReceipt?.redeemed?`<p>${escapeText(economicReceipt.redeemed.game)}</p><code>${escapeText(economicReceipt.redeemed.key)}</code>`:`<p>Boletos: ${escapeText(economicReceipt?.tickets)} · PC: ${escapeText(economicReceipt?.pc)}</p>`}`;

  if(type==='history'||type==='notifications'){
    const s=remoteStates[type]??{status:'loading'};
    return `<div class="modal-head"><h2 id="modal-title">${type==='history'?'Historial':'Notificaciones'}</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div>${s.status==='ready'?`${(s.items??[]).map(item=>`<article class="info-strip"><div><strong>${escapeText(item.title??item.game??'Actividad')}</strong><p>${escapeText(item.message??item.result??'')}</p><p>${escapeText(item.details??'')}</p><small>${escapeText(item.created_at??'')}</small>${type==='notifications'&&!item.read_at?`<button type="button" class="textured-button" data-read-note="${escapeText(item.id)}">Marcar como leída</button>`:''}</div></article>`).join('')||stateNotice({status:'empty'})}${pager(s.nextCursor,type)}`:stateNotice(s)}`;
  }
  if(type==='album'){
    const s=profileState,logos=s.logos??[],owned=s.profile?.ownedLogoIds??[];
    return `<div class="modal-head"><h2 id="modal-title">Álbum de Perrilogos</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><div class="album-selected">${avatarMarkup(selectedAvatar)}</div>${s.status!=='ready'?stateNotice(s):`<p class="album-note">Selecciona uno de tus Perrilogos encontrados.</p><div class="album-tabs" role="group" aria-label="Colección"><button type="button" data-live-album="found" aria-pressed="true">Encontrados</button><button type="button" data-live-album="unknown" aria-pressed="false">Desconocidos</button></div><div class="album-grid">${logos.map(l=>`<button type="button" ${owned.includes(l.id)&&l.assetId?'':'disabled'} data-avatar-id="${escapeText(l.id)}" data-owned="${owned.includes(l.id)}" ${owned.includes(l.id)?'':'hidden'}><img src="${ASSETS}logo-${logoId(l.assetId??l.id)}.webp" alt=""/><span>${escapeText(l.name)}</span></button>`).join('')}</div>`}`;
  }
  if (type === 'assistance') return `<div class="modal-head"><h2 id="modal-title">Asistencia</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p class="modal-intro">Si necesitas ayuda con la tienda, puedes escribir a Perrisushi por Twitch. También publicamos avisos y novedades en YouTube.</p><a class="support-link textured-button" href="https://www.twitch.tv/perrisushi" target="_blank" rel="noopener noreferrer">Abrir Twitch</a>`;
  if (type === 'logout') return `<div class="modal-head"><h2 id="modal-title">Cerrar sesión</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p class="modal-intro">No hay sesión iniciada.</p>`;
  if (type === 'music-error') return `<div class="modal-head"><h2 id="modal-title">Música</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p class="modal-intro">El navegador no pudo reproducir la música. Comprueba el sonido y vuelve a intentarlo.</p>`;
  if(type==='link-google')return `<div class="modal-head"><h2 id="modal-title">Vincular Google</h2><button type="button" data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p>Confirma la contraseña de ${escapeText(session.nick)} para vincular tu cuenta de Google.</p><form id="google-link"><div class="login-fields"><label>Contraseña actual<input type="password" name="password" required maxlength="1024" autocomplete="current-password" /></label></div><button type="submit" class="textured-button modal-primary">Continuar con Google</button><p id="google-link-status" role="status"></p></form>`;
  return accessMarkup();
}

function openModal(type,{pending=false,immersive=false}={}) {
  if(!session)type='auth';
  modalKind=type;
  lastFocus = sessionOptions.contains(document.activeElement) ? menuToggle : document.activeElement;
  closeMenu();
  overlay.innerHTML = `${type==='auth'?'':'<div class="modal-backdrop" data-action="close-modal"></div>'}<section class="modal-card ${type === 'album' ? 'album-card' : type.startsWith('game:') ? 'game-card' : type.startsWith('item:')||type.startsWith('game-help:')?'info-card':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">${pending&&type.startsWith('game:')?gameMarkup(type.slice(5),true):modalMarkup(type)}</section>`;
  overlay.hidden = false;
  [...document.querySelector('#app').children].forEach(el => { if (el !== overlay) el.inert = true; });
  document.body.style.overflow = 'hidden';
  overlay.querySelector('input,.modal-close')?.focus();
  if(type.startsWith('game:'))gameWindow.open(overlay.querySelector('.game-card'),{immersive});
}
function closeModal() {
  if(!session)return;
  if (overlay.hidden) return;
  if(modalKind?.startsWith('game:')){
   const card=overlay.querySelector('.game-card'),mobile=gameWindow.isMobile();gameLaunchEpoch++;openingGame=false;api.clearCache();gameBootstrap=null;
   stage.querySelectorAll('[data-game][aria-busy="true"]').forEach(el=>{el.disabled=false;el.removeAttribute('aria-busy')});
   void gameWindow.close().then(()=>{if(overlay.querySelector('.game-card')!==card)return;finishCloseModal();if(mobile&&session&&normalizeRoute(location.hash)!=='games')navigate('games')});return;
  }
  finishCloseModal();
}
function finishCloseModal(){
  overlay.hidden=true;overlay.replaceChildren();
  modalKind=null;
  [...document.querySelector('#app').children].forEach(el => { if (el !== overlay) el.inert = false; });
  document.body.style.overflow = '';
  if (lastFocus?.isConnected) lastFocus.focus();
}

document.querySelector('.skip-link').addEventListener('click', e => {
  e.preventDefault();
  stage.focus();
});

menuToggle.addEventListener('click', () => {
  sessionOptions.hidden = !sessionOptions.hidden;
  menuToggle.setAttribute('aria-expanded',String(!sessionOptions.hidden));
});
document.addEventListener('click', e => {
  const help=e.target.closest('[data-game-help]')?.dataset.gameHelp;if(help&&Object.hasOwn(gameDescriptions,help)){openModal('game-help:'+help);return}
  const game=e.target.closest('[data-game]')?.dataset.game;if(game&&Object.hasOwn(gameRoutes,game)){void launchOriginalGame(game);return}
  const economic=e.target.closest('[data-economy]');if(economic&&!economic.disabled){void runEconomicOperation(economic.dataset.economy,economic);return}
  const avatar=e.target.closest('[data-avatar-id]');if(avatar&&!avatar.disabled){void savePersonalChange('avatar',avatar.dataset.avatarId,avatar);return}
  const note=e.target.closest('[data-read-note]');if(note&&!note.disabled){void savePersonalChange('notification',note.dataset.readNote,note);return}
  const liveAlbum=e.target.closest('[data-live-album]')?.dataset.liveAlbum;
  if(liveAlbum){overlay.querySelectorAll('[data-owned]').forEach(el=>el.hidden=el.dataset.owned!==String(liveAlbum==='found'));overlay.querySelectorAll('[data-live-album]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.liveAlbum===liveAlbum)));return}
  const nextOpening=e.target.closest('[data-next-container]');if(nextOpening){const id=nextOpening.dataset.nextContainer;if(containerOperations.get(id)?.busy)return;containerOperations.delete(id);void openInventoryContainer(id,nextOpening);return}
  const opening=e.target.closest('[data-open-container]');if(opening){void openInventoryContainer(opening.dataset.openContainer,opening);return}
  const item=e.target.closest('[data-live-item]')?.dataset.liveItem;
  if(item&&(Object.hasOwn(dataState.inventory.inventory??{},item)||openableContainers.includes(item)&&pendingContainer(item))){if(containerOperations.get(item)?.result)containerOperations.delete(item);openModal('item:'+item);return}
  const next=e.target.closest('[data-live-next]');
  if(next){void loadMore(next.dataset.liveNext,next.dataset.cursor,next);return}
  const action = e.target.closest('[data-action]')?.dataset.action;
  const route = e.target.closest('[data-route]')?.dataset.route;
  if (route) { closeModal(); navigate(route); return; }
  if(action==='google-status'){void refreshGoogleStatus(e.target.closest('button'));return}
  if(action==='google-login'){void beginGoogle(e.target.closest('button'));return}
  if(action==='link-google'){openModal('link-google');return}
  if(action==='google-cancel'){void cancelGoogleRegistration(e.target.closest('button'));return}
  if (action === 'auth') openModal('auth');
  else if (action === 'history') void openRemoteModal('history');
  else if (action === 'album') openModal('album');
  else if (action === 'music') { closeMenu(); void toggleMusic(); }
  else if (action === 'assistance') openModal('assistance');
  else if (action === 'logout') void logoutAccount();
  else if (action === 'notifications') void openRemoteModal('notifications');
  else if (action === 'game-fullscreen') void gameWindow.toggle();
  else if (action === 'close-modal') closeModal();
  else if (!e.target.closest('#session-options,.nav-toggle')) closeMenu();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {if(modalKind?.startsWith('game:')&&(gameWindow.isFullscreen()||gameWindow.recentlyExited())){if(gameWindow.isFullscreen())void gameWindow.toggle();return}if(!overlay.hidden) closeModal();else if (!sessionOptions.hidden) { closeMenu(); menuToggle.focus(); }}
  if (e.key === 'Tab' && !overlay.hidden) {
    const focusables = [...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]')].filter(el => el.getClientRects().length);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length-1];
    if (e.shiftKey && document.activeElement === first) {e.preventDefault();last.focus();}
    else if (!e.shiftKey && document.activeElement === last) {e.preventDefault();first.focus();}
  }
});
window.addEventListener('hashchange',render);
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==overlay.querySelector('.original-game')?.contentWindow)return;if(['perriduelos-exit','perripet-exit'].includes(event.data?.type)){closeModal();return}if(event.data?.type==='pw2-game-context-request'&&gameBootstrap&&typeof event.data.id==='string')event.source.postMessage({type:'pw2-game-context',id:event.data.id,context:gameBootstrap},location.origin);if(event.data?.type==='pw2-game-updated')api.clearCache();if(event.data?.type==='pw2-session-expired')errorState({code:'session_expired'})});
window.addEventListener('pageshow',event=>{if(event.persisted)void initializeGoogleAccess()});
bindPageEvents();
renderMusicOption();
overlay.innerHTML='<section class="modal-card" role="status">Comprobando sesión…</section>';overlay.hidden=false;
void initializeGoogleAccess();

function showLogin(error){
 document.body.dataset.access='locked';stage.replaceChildren();closeMenu();openModal('auth');
 const status=overlay.querySelector('#login-status');status.textContent=error?message({error}):sessionState.status==='error'?message(sessionState):googleErrorNotice();
 document.title='Entrar | Perrisushi World';
}
function paintStage(){if(!session){if(sessionState.status!=='loading')showLogin();return}stage.innerHTML=views[normalizeRoute(location.hash)]();fitInventoryGrid()}
function resetPrivateState(){
  inventoryObserver?.disconnect();inventoryObserver=null;
  containerOperations.clear();
  gameLaunchEpoch++;openingGame=false;void gameWindow.close();
  session=null;gameBootstrap=null;sessionEpoch++;routeEpoch++;api.clearCache();profileState={status:'signedOut'};economicOperations.clear();economicReceipt=null;
  for(const kind of ['users','inventory','shop'])setPageData(kind,{status:'signedOut'});
  for(const kind of Object.keys(remoteStates))delete remoteStates[kind];
  setAuthenticatedProfile(null);
  document.body.dataset.access='locked';stage.replaceChildren();
  modalKind=null;overlay.innerHTML='<section class="modal-card" role="status">Comprobando sesión…</section>';overlay.hidden=false;
}
function errorState(error){
  if(error.code==='session_expired'){
    resetPrivateState();sessionState={status:'signedOut'};syncIdentity();paintStage();
    showLogin('session_expired');
  }
  return {status:'error',error:error.code};
}
function syncIdentity(){const el=document.querySelector('.identity-chip strong');el.textContent=session?session.nick.slice(0,16):sessionState.status==='error'?'Sin conexión':'Sin sesión';el.title=session?.nick??message(sessionState)}
async function bootstrapSession(authenticated=null){
  resetPrivateState();const generation=sessionEpoch;sessionState={status:'loading'};profileState={status:'loading'};
  try{const result=authenticated??await api.getSession();if(generation!==sessionEpoch)return;session=result.authenticated?result:null;sessionState={status:session?'ready':'signedOut'};
   if(session){googlePending=null;if(googleConfig.enabled){try{googleLinked=(await api.googleStatus()).linked}catch{googleLinked=null}}const p=await api.getProfile();if(generation!==sessionEpoch)return;profileState={status:'ready',...p};setAuthenticatedProfile({authenticated:true,displayName:session.nick,avatarId:p.profile?.selectedLogoAssetId??p.profile?.selectedLogoId})}
   else profileState={status:'signedOut'};
  }catch(error){if(generation!==sessionEpoch)return;sessionState=errorState(error);profileState=sessionState}
  syncIdentity();if(session){closeModal();document.body.dataset.access='ready'}render();
}
async function loadCurrentRoute(route){
 const sequence=++routeEpoch,generation=sessionEpoch;
 if(!['profile','users','inventory','shop'].includes(route))return;
 if(!session){if(route!=='profile')setPageData(route,sessionState.status!=='ready'?sessionState:{status:'signedOut'});paintStage();return}
 if(route!=='profile')setPageData(route,{status:'loading'});paintStage();
 try{
  const result=route==='profile'?await api.getProfile():route==='users'?await api.listUsers():route==='inventory'?await api.getInventory():await Promise.all([api.listRandomKeys(),api.listRaffles()]);
  if(sequence!==routeEpoch||generation!==sessionEpoch)return;
  if(route==='profile'){profileState={status:'ready',...result};setAuthenticatedProfile({authenticated:true,displayName:session.nick,avatarId:result.profile?.selectedLogoAssetId??result.profile?.selectedLogoId})}
  else setPageData(route,{status:'ready',...(route==='shop'?{randomKey:result[0],raffles:result[1]}:result)});
 }catch(error){if(sequence!==routeEpoch||generation!==sessionEpoch)return;const state=errorState(error);if(route==='profile')profileState=state;else setPageData(route,state);syncIdentity()}
 if(sequence===routeEpoch&&generation===sessionEpoch)paintStage();
}
function paintRemote(kind){if(modalKind!==kind)return;overlay.querySelector('.modal-card').innerHTML=modalMarkup(kind);overlay.querySelector('.modal-close').focus()}
async function openRemoteModal(kind){remoteStates[kind]=session?{status:'loading'}:sessionState.status==='error'?sessionState:{status:'signedOut'};openModal(kind);if(!session)return;const generation=sessionEpoch;
 try{const result=await (kind==='history'?api.getHistory():api.getNotifications());if(generation!==sessionEpoch)return;remoteStates[kind]={status:'ready',...result}}
 catch(error){if(generation!==sessionEpoch)return;remoteStates[kind]=errorState(error);syncIdentity();paintStage()}
 paintRemote(kind);
}
async function loadMore(kind,cursor,button){
 const generation=sessionEpoch,previousUsers=dataState.users;button.disabled=true;
 try{
  if(kind==='users'){const result=await api.listUsers({cursor});if(generation!==sessionEpoch||dataState.users!==previousUsers)return;setPageData('users',{status:'ready',items:[...previousUsers.items,...result.items],nextCursor:result.nextCursor});if(normalizeRoute(location.hash)==='users'){const list=button.isConnected&&stage.querySelector('.pw04-user-rows');if(list){list.insertAdjacentHTML('beforeend',renderUserRows(result.items));if(result.nextCursor)button.dataset.cursor=result.nextCursor;else button.remove()}else paintStage()}}
  else if(['history','notifications'].includes(kind)){const result=await (kind==='history'?api.getHistory({cursor}):api.getNotifications({cursor}));if(generation!==sessionEpoch)return;remoteStates[kind]={status:'ready',items:[...remoteStates[kind].items,...result.items],nextCursor:result.nextCursor};paintRemote(kind)}
  else if(['tickets','claims'].includes(kind)){const result=await api.listRandomKeys({[kind==='tickets'?'ticketCursor':'claimCursor']:cursor});if(generation!==sessionEpoch)return;const current=dataState.shop.randomKey;current[kind]={items:[...current[kind].items,...result[kind].items],nextCursor:result[kind].nextCursor};if(normalizeRoute(location.hash)==='shop')paintStage()}
 }catch(error){if(generation===sessionEpoch){errorState(error);button.textContent=message({error:error.code})}}
 finally{if(button.isConnected)button.disabled=false}
}
async function logoutAccount(){
 if(!session)return;
 logoutPending=true;closeModal();resetPrivateState();sessionState={status:'signedOut'};syncIdentity();showLogin();const button=overlay.querySelector('button[type="submit"]');button.disabled=true;
 try{await api.logout()}
 catch(error){showLogin(error.code)}
 finally{logoutPending=false;if(button.isConnected)button.disabled=false}
}
document.addEventListener('submit',async event=>{
 if(event.target.id!=='traditional-login')return;event.preventDefault();if(logoutPending)return;const form=event.target,submit=form.querySelector('button'),status=form.querySelector('#login-status');submit.disabled=true;status.textContent='Comprobando acceso…';
 googlePending=null;googleNotice='';const data=new FormData(form);resetPrivateState();sessionState={status:'loading'};syncIdentity();
 try{const authenticated=await api.login(data.get('nick'),data.get('password'));form.reset();history.replaceState(null,'','#home');await bootstrapSession(authenticated)}
 catch(error){sessionState={status:'error',error:error.code};profileState=sessionState;syncIdentity();showLogin(error.code);const login=overlay.querySelector('#traditional-login');login.elements.nick.value=String(data.get('nick')??'');login.elements.password.focus()}
 finally{if(submit.isConnected)submit.disabled=false}
});
const pendingPersonalChanges=new Set();
async function savePersonalChange(kind,id,button){
 if(pendingPersonalChanges.has(kind)||!session)return;
 pendingPersonalChanges.add(kind);button.disabled=true;const generation=sessionEpoch;
 try{
  if(kind==='avatar'){
   await api.updateAvatar(id);const result=await api.getProfile();if(generation!==sessionEpoch)return;
   profileState={status:'ready',...result};setAuthenticatedProfile({authenticated:true,displayName:session.nick,avatarId:result.profile?.selectedLogoAssetId});paintStage();paintRemote('album');
  }else{
   await api.markNotificationRead(id);if(generation!==sessionEpoch)return;
   remoteStates.notifications.items=remoteStates.notifications.items.map(n=>n.id===id?{...n,read_at:new Date().toISOString()}:n);paintRemote('notifications');
  }
 }catch(error){if(generation===sessionEpoch){errorState(error);if(button.isConnected){button.textContent=message({error:error.code});button.disabled=false}}}
 finally{pendingPersonalChanges.delete(kind)}
}
async function runEconomicOperation(kind,button){
 if(!session||economicOperations.get(kind)?.busy)return;
 const storageKey='pw2:pending:'+session.nick+':'+kind;let saved;try{saved=sessionStorage.getItem(storageKey)}catch{}
 const generation=sessionEpoch,operation=economicOperations.get(kind)??{id:/^[a-f0-9-]{36}$/i.test(saved??'')?saved:crypto.randomUUID()};try{sessionStorage.setItem(storageKey,operation.id)}catch{}operation.busy=true;economicOperations.set(kind,operation);button.disabled=true;
 try{
  const result=await (kind==='redeem'?api.redeemRandomKey(operation.id):api.buyRaffleTicket({raffleId:'boletoSorteo2',idempotencyKey:operation.id}));
  if(generation!==sessionEpoch)return;economicOperations.delete(kind);try{sessionStorage.removeItem(storageKey)}catch{}economicReceipt=result;await loadCurrentRoute('shop');openModal('receipt');
 }catch(error){if(generation===sessionEpoch){operation.busy=false;if(error.code==='operation_conflict'){try{const receipt=await api.getReceipt(operation.id);if(generation!==sessionEpoch)return;if(receipt.kind===(kind==='redeem'?'random-redeem':'raffle-buy')){economicReceipt=receipt;economicOperations.delete(kind);try{sessionStorage.removeItem(storageKey)}catch{}await loadCurrentRoute('shop');openModal('receipt');return}}catch{}button.textContent='Revisa la operación anterior en el historial antes de continuar.';button.disabled=true;return}if(['invalid_request','insufficient_balance','invalid_balance','ticket_limit','no_stock','no_active_ticket','account_inactive','inventory_missing','operation_disabled'].includes(error.code)){economicOperations.delete(kind);try{sessionStorage.removeItem(storageKey)}catch{}}errorState(error);button.textContent=message({error:error.code})+' Pulsa para reintentar.';button.disabled=false}}
}
async function launchOriginalGame(name){
 if(!session){openModal('auth');return}if(openingGame)return;openingGame=true;const generation=sessionEpoch,attempt=++gameLaunchEpoch,immersive=mobileGameView(),button=stage.querySelector(`[data-game="${name}"]`);if(button){button.disabled=true;button.setAttribute('aria-busy','true')}
 // Solicitar fullscreen en la misma pulsación, antes de esperar a la red.
 if(immersive)openModal('game:'+name,{pending:true,immersive:true});
 try{const context=await api.getGameContext();if(generation!==sessionEpoch||attempt!==gameLaunchEpoch)return;
  if(context.nick!==session.nick){await bootstrapSession();return}
  const available=context.available&&context.games?.[name]!==false;gameBootstrap={...context,csrfToken:api.getCsrfToken()};
  if(immersive&&available){const card=overlay.querySelector('.game-card');if(!card)return;card.innerHTML=gameMarkup(name);gameWindow.sync();card.querySelector('.modal-close')?.focus()}
  else {if(immersive)await gameWindow.close();if(generation!==sessionEpoch||attempt!==gameLaunchEpoch)return;openModal(available?'game:'+name:'game-unavailable')}
 }catch(error){if(generation===sessionEpoch&&attempt===gameLaunchEpoch){if(immersive)await gameWindow.close();if(generation!==sessionEpoch||attempt!==gameLaunchEpoch)return;errorState(error);openModal('game-unavailable')}}finally{if(attempt===gameLaunchEpoch){openingGame=false;if(button){button.disabled=false;button.removeAttribute('aria-busy')}}}
}

function googleErrorNotice(){
 const messages={google_cancelled:'Has cancelado el acceso con Google.',google_expired:'El acceso con Google ha caducado. Vuelve a intentarlo.',google_conflict:'Esta cuenta de Google ya está vinculada a otra cuenta, o tu usuario tiene otra vinculación.',account_inactive:'Esta cuenta no tiene el acceso habilitado.',session_expired:'Tu sesión ha caducado. Vuelve a entrar para vincular Google.',google_unavailable:'No se pudo conectar con Google. Vuelve a intentarlo.',google_failed:'No se pudo completar el acceso con Google. Vuelve a intentarlo.',google_not_allowed:'Esta cuenta de Google no tiene el acceso habilitado.',registration_unavailable:'Entra con tu usuario y contraseña y vincula Google desde Mi perfil.'};
 return messages[googleNotice]??'';
}
function legalLinks(){
 return googleConfig.legalPublished?'<p class="access-legal"><a href="/api/legal/privacy" target="_blank" rel="noopener">Política de Privacidad</a> · <a href="/api/legal/terms" target="_blank" rel="noopener">Condiciones del Servicio</a></p>':'';
}
function accessMarkup(){
 if(googlePending)return `<div class="modal-head"><h2 id="modal-title">Crear cuenta</h2></div>
 ${googleConfig.legalPublished&&googleConfig.registrationEnabled!==false?`<form id="google-register"><div class="access-register-content">
 <p>¿Ya tienes cuenta? Entra con tu usuario y vincula Google desde tu perfil.</p>
 <div class="login-fields"><label>Elige tu nick<input name="nick" type="text" required minlength="3" maxlength="30" autocomplete="nickname" aria-describedby="nick-help" /></label><small id="nick-help">De 3 a 30 letras, números, guiones o guiones bajos.</small></div>
 <label class="access-accept"><input name="acceptedTerms" type="checkbox" required /> He leído la Política de Privacidad y acepto las Condiciones del Servicio.</label>
 ${legalLinks()}</div><button type="submit" class="textured-button modal-primary">Crear cuenta</button></form>`:'<p>El registro no está disponible en este momento. Si ya tienes cuenta, entra con tu usuario y contraseña.</p>'}
 <button type="button" class="textured-button access-cancel" data-action="google-cancel">Cancelar y volver al acceso</button><p id="login-status" role="status"></p>`;
 return `<div class="modal-head"><h2 id="modal-title">Entrar en PerriWeb</h2></div><p class="access-legal">Comunidad con minijuegos y participaciones para sorteos en Twitch.</p>
  <form id="traditional-login"><div class="login-fields"><label>Usuario<input name="nick" type="text" required maxlength="80" autocomplete="username" /></label>
  <label>Contraseña<input name="password" type="password" required maxlength="1024" autocomplete="current-password" /></label></div>
  <button type="submit" class="textured-button modal-primary">Iniciar sesión</button><p id="login-status" role="status"></p></form>
  ${googleConfig.enabled?'<button type="button" class="textured-button google-access" data-action="google-login">Continuar con Google</button>':''}${legalLinks()}`;
}
async function initializeGoogleAccess(){
 const query=new URLSearchParams(location.search);googleNotice=query.get('google')??'';
 if(query.has('google')){query.delete('google');history.replaceState(null,'',location.pathname+(query.size?'?'+query:'')+location.hash)}
 googlePending=null;googleLinked=null;
 try{googleConfig=await api.googleConfig();if(googleConfig.enabled){const pending=await api.googlePending();if(pending.pending)googlePending=pending}}catch{googleConfig={enabled:false,legalPublished:false}}
 await bootstrapSession();
}
async function beginGoogle(button,password){
 if(!button||button.disabled)return;
 button.disabled=true;const status=overlay.querySelector('#google-link-status,#login-status');if(status)status.textContent='Conectando con Google…';
 try{
  const result=await api.startGoogle(password===undefined?'login':'link',password);
  const target=new URL(result.url);if(target.protocol!=='https:'||target.pathname!=='/auth/v1/authorize'||target.searchParams.get('provider')!=='google')throw {code:'google_failed'};
  location.assign(target.href);
 }catch(error){if(status)status.textContent=message({error:error.code});button.disabled=false}
}
async function cancelGoogleRegistration(button){
 button.disabled=true;
 try{await api.cancelGoogle();googlePending=null;googleNotice='';showLogin()}
 catch(error){overlay.querySelector('#login-status').textContent=message({error:error.code});button.disabled=false}
}
document.addEventListener('submit',async event=>{
 if(event.target.id==='google-link'){
  event.preventDefault();const form=event.target,password=form.elements.password.value;
  form.elements.password.value='';await beginGoogle(form.querySelector('button[type="submit"]'),password);
 }else if(event.target.id==='google-register'){
  event.preventDefault();if(!googlePending)return;
  const form=event.target,button=form.querySelector('button[type="submit"]'),status=overlay.querySelector('#login-status');if(button.disabled)return;
  button.disabled=true;status.textContent='Creando tu cuenta…';
  try{
   const result=await api.registerGoogle(form.elements.nick.value,googlePending.csrf,form.elements.acceptedTerms.checked,googleConfig.legalVersion);
   googlePending=null;googleNotice='';history.replaceState(null,'','#home');await bootstrapSession(result);
  }catch(error){status.textContent=message({error:error.code});button.disabled=false}
 }
});

async function refreshGoogleStatus(button){
 if(!button||button.disabled||!session)return;button.disabled=true;const generation=sessionEpoch;
 try{
  const result=await api.googleStatus();if(generation!==sessionEpoch)return;
  googleLinked=result.linked===true;
  if(normalizeRoute(location.hash)==='profile')paintStage();
 }catch(error){
  if(generation===sessionEpoch&&button.isConnected){button.textContent='No se pudo comprobar. Reintentar';button.disabled=false}
 }
}
