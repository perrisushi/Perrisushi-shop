import {startAuthenticatedUI,measuredLoad} from './services/startup.js';
import {renderPerrilogo,renderCosmeticCollection} from './services/perrilogo.js';
import {createAdminTools} from './services/admin-ui.js';
import {initializeGlobalScale,designRect,designHeight,desktopScaleActive} from './global-scale.js';
import {createNotificationCenter,mergeNotifications,notificationCard} from './services/notifications.js';
import { normalizeRoute, routeTitles } from './routes.js';
import {createGameWindow,mobileGameView} from './game-window.js';
import {createApiClient,oauthCallbackPath} from './services/api-client.js';
import {escapeText,logoId,message,stateNotice,pager,dataState,setPageData,renderUserRows,renderLiveUsers,renderLiveInventory,renderLiveShop,renderLiveRaffles,shopSelection,renderSelectedAchievement,renderProfileAchievements} from './services/live-ui.js';
import {itemDetails,gameDescriptions} from './services/help-content.js';
initializeGlobalScale();
const api=createApiClient({onSessionExpired:()=>errorState({code:'session_expired'})});
const adminTools=createAdminTools({api,open:type=>openModal(type),repaint:()=>{if(modalKind?.startsWith('admin:')){const card=overlay.querySelector('.modal-card');if(card){card.innerHTML=adminTools.markup();card.querySelector('.modal-close')?.focus({preventScroll:true})}}},onChange:()=>{void refreshCommunity(true);void loadCurrentRoute(normalizeRoute(location.hash));void notificationCenter.refresh()}});
let session=null,sessionState={status:'loading'},profileState={status:'loading'},sessionEpoch=0,routeEpoch=0,modalKind=null,logoutPending=false,logoutError=null,gameBootstrap=null;
let googleConfig={enabled:false,legalPublished:false},googlePending=null,googleLinked=null,googleNotice='',googleUntil=null;
let communityState={enabled:false},communityLastCheck=0,selectedRaffleTab='buy';
let openingGame=false,gameLaunchEpoch=0;
const containerOperations=new Map();
let inventoryObserver=null;
const openableContainers=['perri_cofres','perri_cofres_minijuego','bolsa_gemas','bolsa_chatarra','bolsa_especial','cajita_armas'];
const remoteStates={};
let notificationObserver=null,notificationReadTimer=null,notificationModalEpoch=0;
const notificationCenter=createNotificationCenter({api,isActive:()=>Boolean(session)&&document.visibilityState==='visible',onPending:pending=>{
 const bell=document.querySelector('.notification-trigger');bell.classList.toggle('has-unread',pending);bell.setAttribute('aria-label',pending?'Notificaciones nuevas pendientes':'Notificaciones');
},onViewed:id=>{const state=remoteStates.notifications;if(state?.items)state.items=state.items.map(item=>item.id===id?{...item,read_at:new Date().toISOString()}:item)},onError:()=>{
 const status=overlay.querySelector('.notification-status');if(status){status.innerHTML='No se pudo guardar la lectura. <button type="button" class="textured-button" data-action="retry-notifications">Reintentar</button>';}
}});
const refreshNotifications=()=>{if(document.visibilityState==='visible'){void refreshCommunity();void notificationCenter.refresh();if(modalKind==='notifications')observeNotificationCards()}};
document.addEventListener('visibilitychange',refreshNotifications);
window.addEventListener('focus',refreshNotifications);
function notificationVisible(element){
 if(modalKind!=='notifications'||!element.isConnected||overlay.hidden||document.visibilityState!=='visible')return false;
 const r=element.getBoundingClientRect(),list=overlay.querySelector('.notification-list'),b=list.getBoundingClientRect();
 return r.bottom>b.top&&r.top<Math.min(b.bottom,innerHeight);
}
function scheduleNotificationRead(){
 clearTimeout(notificationReadTimer);const epoch=notificationModalEpoch;
 notificationReadTimer=setTimeout(()=>{
  if(epoch!==notificationModalEpoch||modalKind!=='notifications')return;
  overlay.querySelectorAll('[data-notification-id]').forEach(element=>{if(notificationVisible(element))void notificationCenter.markViewed(element.dataset.notificationId,()=>notificationVisible(element))});
 },120);
}
function observeNotificationCards(){
 notificationObserver?.disconnect();clearTimeout(notificationReadTimer);
 if(modalKind!=='notifications'||document.visibilityState!=='visible')return;
 const list=overlay.querySelector('.notification-list');if(!list)return;
 list.removeEventListener('scroll',scheduleNotificationRead);list.addEventListener('scroll',scheduleNotificationRead,{passive:true});
 notificationObserver=new IntersectionObserver(scheduleNotificationRead,{root:list,threshold:0});
 overlay.querySelectorAll('[data-notification-id]').forEach(el=>notificationObserver.observe(el));
 scheduleNotificationRead();
}

const ASSETS = './public/assets/';
const stage = document.querySelector('#contenido');
const overlay = document.querySelector('#overlay-layer');
const gameWindow=createGameWindow({overlay});
const sessionOptions = document.querySelector('#session-options');
const musicButton = document.querySelector('[data-action="music"]');
const backgroundMusic = document.querySelector('#background-music');
const profileBadge = document.querySelector('.profile-badge');
let selectedComposition={},cosmeticTab='logo',cosmeticDraft=null;
// Solo identificadores del catálogo. Nunca construir una URL de avatar con un valor sin validar.
const ALLOWED_AVATARS = new Set(['abeja-1','abuela-1','amparo-1','buho-1','cabra-1','cami-1','croqueta-1','esq-1','estresario-1','gato-1','panda-1','pelusa-1','perriweb1','slime-1','slime-2','perrisushi-adm']);
let selectedAvatar = 'perriweb1';
function avatarMarkup(id,className='') {if(session&&!profileState.cosmetics&&profileState.cosmeticsEnabled!==false)return `<span class="perrilogo-composition perrilogo-preview ${className}" role="status" aria-label="Cargando Perrilogo" aria-busy="true"></span>`;return renderPerrilogo({...selectedComposition,logo:'logo-'+id},'perrilogo-preview '+className)}
/** Se llamará después de autenticar la sesión y leer el avatar verificado del usuario. */
export function setAuthenticatedProfile(profile) {
  const id = profile?.authenticated === true ? (profileState.cosmetics?.selected?.logo?.replace(/^logo-/,'')??profile.avatarId) : null;
  selectedAvatar = ALLOWED_AVATARS.has(id) ? id : 'perriweb1';
  selectedComposition=profile?.authenticated===true?(profileState.cosmetics?.selected??{logo:'logo-'+selectedAvatar}):{logo:'logo-perriweb1'};
  profileBadge.querySelectorAll('.avatar-image,.avatar-frame,.perrilogo-composition').forEach(el=>el.remove());profileBadge.insertAdjacentHTML('afterbegin',profile?.authenticated===true&&!profileState.cosmetics&&profileState.cosmeticsEnabled!==false?'<span class="perrilogo-composition" role="status" aria-label="Cargando Perrilogo" aria-busy="true"></span>':renderPerrilogo(selectedComposition));
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

const imageButton = (image, route, label, extension = 'webp') => `
  <button class="art-menu-button" type="button" data-route="${route}" aria-label="${label}">
    <img src="${ASSETS}${image}.${extension}" alt="" draggable="false" />
    <span class="sr-only">${label}</span>
  </button>`;

function homeView() {
  return `<section class="home-menu" aria-label="Menú principal">${communityState.announcement?`<aside class="community-announcement" role="status"><span>${escapeText(communityState.announcement.length>40?communityState.announcement.slice(0,37)+'…':communityState.announcement)}</span><button type="button" class="textured-button" data-action="community-notice" aria-label="Leer aviso completo de la comunidad">Leer</button></aside>`:''}
      <div class="home-links">
        ${imageButton('menu-boton-perfil','profile','Mi perfil','png')}
        ${imageButton('menu-boton-usuarios','users','Usuarios','png')}
        ${imageButton('menu-boton-inventario','inventory','Inventario','png')}
        ${imageButton('menu-boton-minijuegos','games','Minijuegos','png')}
        ${imageButton('menu-boton-tienda','shop','Tienda','png')}
        ${imageButton('menu-boton-sorteo','raffles','Sorteo','png')}
      </div>
  </section>`;
}

function shellView(route, content) {
  return `<section class="content-board" aria-label="${routeTitles[route]}">
    <header class="content-header">
      <button type="button" class="back-button" data-route="home" aria-label="Volver al inicio"><img src="${ASSETS}boton-atras.webp" alt="" /></button>
      <div><h1>${routeTitles[route]}</h1></div>${adminTools.entry(route)}
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
    <div class="profile-portrait">${avatarMarkup(selectedAvatar)}${renderSelectedAchievement(profileState.profile)}</div>
    <div class="profile-details"><h2>${escapeText(session?.nick)}</h2>
      ${profileState.status==='ready'?'':stateNotice(profileState)}
      <div class="info-strip profile-wallet"><span><span class="wallet-pc-label">PC</span><span class="wallet-separator"> · </span><span class="wallet-gems-label">Gemas</span></span><strong><span class="wallet-pc-value">${escapeText(profileState.balances?.pc??'—')}</span><span class="wallet-separator"> · </span><span class="wallet-gems-value">${escapeText(profileState.balances?.gemas??'—')}</span></strong></div>${renderProfileAchievements(profileState.profile)}
      <div class="info-strip"><span>Karma</span><strong>${escapeText(profileState.profile?.karma??'—')}</strong></div>
      <div class="profile-actions"><button class="textured-button history-button" type="button" data-action="history" aria-label="Historial" title="Historial"><span aria-hidden="true">⌛</span></button><button class="textured-button history-button" type="button" data-action="notification-history" aria-label="Historial de notificaciones" title="Historial de notificaciones"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg></button><button class="textured-button" type="button" data-action="album">Cambiar Perrilogos</button></div>
      ${googleConfig.enabled?`<div class="google-profile">${googleLinked===true?'<p class="google-linked-status">Google vinculado</p>':googleLinked===null?'<button type="button" class="textured-button" data-action="google-status">Comprobar vinculación de Google</button>':`<button type="button" class="textured-button" data-action="link-google">Vincular Google</button>`}${googleNotice==='linked'?'<p role="status">Tu cuenta de Google se ha vinculado.</p>':''}</div>`:''}
    </div>
  </div>`);
}

// Solo presentación: reubicar los mismos nodos, sin duplicar datos ni controles.
function fitMobileProfile(){
 const grid=stage.querySelector('.profile-grid');if(!grid)return;
 const portrait=grid.querySelector('.profile-portrait'),details=grid.querySelector('.profile-details');
 let info=portrait.querySelector('.profile-mobile-info');
 if(matchMedia('(max-width:767px)').matches&&!desktopScaleActive()){
  if(!info){info=document.createElement('div');info.className='profile-mobile-info';portrait.append(info)}
  const name=details.querySelector('h2'),title=portrait.querySelector(':scope > .profile-selected-title');
  if(name)info.prepend(name);if(title)info.append(title);
 }else if(info){
  const name=info.querySelector('h2'),title=info.querySelector('.profile-selected-title');
  if(name)details.prepend(name);if(title)portrait.append(title);info.remove();
 }
}
window.addEventListener('resize',fitMobileProfile);

function usersView() {
  return shellView('users', renderLiveUsers());
}

// El panel utiliza el hueco real entre cabecera y redes, sin modificar ninguno de ellos.
function fitInteriorPanel(){
 const scene=stage.closest('.scene'),board=stage.querySelector('.content-board');
 const active=Boolean(board&&!board.querySelector('.pw04-inventory')&&!stage.classList.contains('show-home'));
 stage.classList.toggle('interior-layout',active);if(!active)return;
 const r=designRect(scene),gap=12;
 const header=designRect(scene.querySelector('.topbar'));
 const social=[...scene.querySelectorAll('.social-preview')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
 const bottom=social.length?Math.min(...social.map(el=>designRect(el).top)):r.bottom-24;
 stage.style.setProperty('--panel-top',Math.max(0,header.bottom-r.top-scene.clientTop+gap)+'px');
 stage.style.setProperty('--panel-bottom',Math.max(24,r.bottom-bottom-scene.clientTop+gap)+'px');
}
let panelFrame=0;
function scheduleInteriorFit(){cancelAnimationFrame(panelFrame);panelFrame=requestAnimationFrame(fitInteriorPanel)}
const panelSpaceObserver=new ResizeObserver(scheduleInteriorFit);
for(const element of document.querySelectorAll('.scene,.topbar,.scene-footer'))panelSpaceObserver.observe(element);
window.addEventListener('resize',scheduleInteriorFit);

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
  grid.style.setProperty('--inventory-columns',String(columns));grid.style.setProperty('--inventory-gap',designHeight()<=360?'6px':capacity<6?'6px':'8px');grid.style.setProperty('--inventory-pad',designHeight()<=360?'6px':capacity<6?'8px':'12px');
  const css=style(grid),gap=value(css,'column-gap'),borderX=value(css,'border-left-width')+value(css,'border-right-width'),padX=horizontal(css),padY=vertical(css);
  const gutter=desktopScaleActive()?16:Math.max(0,grid.offsetWidth-grid.clientWidth-borderX),ideal=(availableWidth-padX-gutter-(capacity-1)*gap)/capacity;
  const childrenWidth=e=>[...e.children].reduce((sum,child)=>sum+designRect(child).width,0);
  const headerNeed=childrenWidth(header)+Math.max(0,header.children.length-1)*value(headerCss,'column-gap')+horizontal(headerCss)+horizontal(boardCss);
  const balanceNeed=childrenWidth(balances)+Math.max(0,balances.children.length-1)*value(balanceCss,'column-gap')+insetX;
  const minWidth=Math.min(maxWidth,Math.max(headerNeed,balanceNeed,260));
  // El ancho preferido de una casilla depende del espacio máximo, no de un panel ya reducido.
  const preferredGridWidth=columns*Math.max(1,ideal)+(columns-1)*gap+padX+gutter;
  board.style.width=Math.min(maxWidth,Math.max(minWidth,preferredGridWidth+insetX))+'px';
  if(!count){grid.style.removeProperty('width');grid.style.removeProperty('height');return}
  const outside=[...panel.children].filter(e=>e!==main&&!e.hidden).reduce((sum,e)=>{const c=style(e);return sum+designRect(e).height+value(c,'margin-top')+value(c,'margin-bottom')},0);
  const height=hostHeight-vertical(boardCss)-designRect(header).height-vertical(scrollCss)-vertical(style(panel))-outside-vertical(mainCss)-padY;
  if(height<=0||ideal<=0)return;
  const actualRows=Math.ceil(count/columns),visibleRows=Math.min(actualRows,Math.max(1,Math.ceil((height+gap)/(ideal+gap))));
  const cell=Math.floor(Math.max(1,Math.min(ideal,(height-(visibleRows-1)*gap)/visibleRows))*64)/64;
  const gridWidth=columns*cell+(columns-1)*gap+padX+gutter;
  board.style.width=Math.min(maxWidth,Math.max(minWidth,gridWidth+insetX))+'px';
  grid.style.setProperty('--inventory-cell',cell+'px');
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

function rafflesView() {return `<section class="content-board raffle-board" aria-label="Sorteos">
 <header class="content-header"><button type="button" class="back-button" data-route="home" aria-label="Volver al inicio"><img src="${ASSETS}boton-atras.webp" alt="" /></button><h1>Sorteos</h1>${adminTools.entry('raffles')}
 <div class="raffle-tabs" role="tablist" aria-label="Sorteos">
 <button type="button" role="tab" id="raffle-buy-tab" aria-controls="raffle-buy-panel" aria-selected="true" data-raffle-tab="buy">COMPRAR</button>
 <button type="button" role="tab" id="raffle-room-tab" aria-controls="raffle-room-panel" aria-selected="false" tabindex="-1" data-raffle-tab="room">SALA SORTEO</button>
 </div></header><div class="content-scroll">${renderLiveRaffles()}</div></section>`}
function selectStoreItem(group,value,focus=false){
 const allowed=group==='tab'?['cosmetics','utility']:['backgrounds','frames'];if(!allowed.includes(value))return;
 shopSelection[group==='tab'?'tab':'category']=value;
 const root=stage.querySelector('.perri-store');if(!root)return;
 root.querySelectorAll(`[data-store-${group}]`).forEach(button=>{const active=button.dataset[group==='tab'?'storeTab':'storeCategory']===value;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus)button.focus({preventScroll:true})});
 if(group==='tab')root.querySelectorAll('.store-panel').forEach(panel=>panel.hidden=panel.id!=='store-panel-'+value);
 else root.querySelectorAll('[data-store-items]').forEach(panel=>panel.hidden=panel.dataset.storeItems!==value);
}
function selectRaffleTab(value,focus=false){
 const board=stage.querySelector('.raffle-board');if(!board||!['buy','room'].includes(value))return;selectedRaffleTab=value;
 board.querySelectorAll('[data-raffle-tab]').forEach(tab=>{const selected=tab.dataset.raffleTab===value;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;if(selected&&focus)tab.focus()});
 board.querySelectorAll('[data-raffle-panel]').forEach(panel=>panel.hidden=panel.dataset.rafflePanel!==value);
}

const views = {home:homeView,profile:profileView,users:usersView,inventory:inventoryView,games:gamesView,shop:shopView,raffles:rafflesView};

function closeMenu() {
  sessionOptions.hidden = true;
  menuToggle.setAttribute('aria-expanded','false');
}

function render() {
  if(!session){stage.replaceChildren();if(sessionState.status!=='loading')showLogin();return}
  document.body.dataset.access='ready';
  const route = normalizeRoute(location.hash);
  stage.innerHTML = views[route]();selectRaffleTab(selectedRaffleTab);
  stage.classList.toggle('show-home', route === 'home');
  fitInteriorPanel();fitInventoryGrid();
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
 try{const profile=await loadProfileData();if(generation!==sessionEpoch)return;setAuthenticatedProfile({authenticated:true,displayName:session.nick,avatarId:profile.profile?.selectedLogoAssetId})}catch{}
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
  if(type==='community-notice')return `<div class="modal-head"><h2 id="modal-title">Aviso de la comunidad</h2><button type="button" class="modal-close" data-action="close-modal" aria-label="Cerrar">×</button></div><p>${escapeText(communityState.announcement)}</p>`;
  if(type.startsWith('admin:'))return adminTools.markup();
  if(type.startsWith('item:'))return inventoryItemMarkup(type.slice(5));
  if(type.startsWith('game-help:')){
    const name=type.slice(10);return `<div class="modal-head"><h2 id="modal-title">${escapeText(name)}</h2><button type="button" data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p class="modal-intro">${escapeText(gameDescriptions[name])}</p>`;
  }
  if(type==='game-unavailable')return `<div class="modal-head"><h2 id="modal-title">Minijuegos</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p>El servicio de minijuegos no está disponible. Vuelve a intentarlo más tarde.</p>`;

  if(type.startsWith('game:'))return gameMarkup(type.slice(5));
  if(type==='receipt')return `<div class="modal-head"><h2 id="modal-title">Operación completada</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div>${economicReceipt?.redeemed?`<p>${escapeText(economicReceipt.redeemed.game)}</p><code>${escapeText(economicReceipt.redeemed.key)}</code>`:`<p>Boletos: ${escapeText(economicReceipt?.tickets)} · PC: ${escapeText(economicReceipt?.pc)}</p>`}`;

  if(type==='notifications'||type==='notification-history'){
    const state=remoteStates[type]??{status:'loading'},unread=type==='notifications';
    return `<div class="modal-head"><h2 id="modal-title">${unread?'Notificaciones nuevas':'Historial de notificaciones'}</h2><button type="button" data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div>${state.status==='ready'?`<div class="notification-list" role="region" aria-label="Listado de notificaciones" tabindex="-1">${(state.items??[]).map(item=>notificationCard(item,unread)).join('')||`<p class="notification-empty">${unread?'No tienes notificaciones nuevas.':'Todavía no hay notificaciones revisadas.'}</p>`}${pager(state.nextCursor,type)}</div>`:stateNotice(state)}${unread?'<p class="notification-status" role="status"></p>':''}`;
  }
  if(type==='history'){
    const state=remoteStates[type]??{status:'loading'};
    return `<div class="modal-head"><h2 id="modal-title">Historial</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div>${state.status==='ready'?`${(state.items??[]).map(item=>`<article class="info-strip"><div><strong>${escapeText(item.title??item.game??'Actividad')}</strong><p>${escapeText(item.message??item.result??'')}</p><p>${escapeText(item.details??'')}</p><small>${escapeText(item.created_at??'')}</small></div></article>`).join('')||stateNotice({status:'empty'})}${pager(state.nextCursor,type)}`:stateNotice(state)}`;
  }
  if(type==='album'&&(!profileState.cosmetics&&profileState.cosmeticsEnabled!==false))return `<div class="modal-head"><h2 id="modal-title">Perrilogos</h2><button type="button" data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p role="status">${profileState.cosmeticsError?'No se pudieron cargar. Cierra y vuelve a abrir para reintentar.':'Cargando…'}</p>`;
  if(type==='album'&&profileState.cosmetics?.enabled)return `<div class="modal-head"><h2 id="modal-title">Perrilogos</h2><button type="button" data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div>${renderCosmeticCollection(profileState.cosmetics,cosmeticTab,cosmeticDraft)}`;
  if(type==='album'){
    const s=profileState,logos=s.logos??[],owned=s.profile?.ownedLogoIds??[];
    return `<div class="modal-head"><h2 id="modal-title">Álbum de Perrilogos</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><div class="album-selected">${avatarMarkup(selectedAvatar)}</div>${s.status!=='ready'?stateNotice(s):`<p class="album-note">Selecciona uno de tus Perrilogos encontrados.</p><div class="album-tabs" role="group" aria-label="Colección"><button type="button" data-live-album="found" aria-pressed="true">Encontrados</button><button type="button" data-live-album="unknown" aria-pressed="false">Desconocidos</button></div><div class="album-grid">${logos.map(l=>`<button type="button" ${owned.includes(l.id)&&l.assetId?'':'disabled'} data-avatar-id="${escapeText(l.id)}" data-owned="${owned.includes(l.id)}" ${owned.includes(l.id)?'':'hidden'}><img src="${ASSETS}logo-${logoId(l.assetId??l.id)}.webp" alt=""/><span>${escapeText(l.name)}</span></button>`).join('')}</div>`}`;
  }
  if (type === 'assistance') return `<div class="modal-head"><h2 id="modal-title">Asistencia</h2><button type="button" data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><div class="support-content"><h3>¿Necesitas ayuda con PerriWeb?</h3><p>Si tienes problemas con tu cuenta, inventario, minijuegos, participaciones o cualquier otra función de la web, puedes contactar con nuestro servicio de asistencia.</p><div class="support-contact"><p>Correo oficial:</p><p class="support-email">perriwebasistencia@gmail.com</p></div><a class="support-link textured-button" href="mailto:perriwebasistencia@gmail.com">Enviar correo</a><p class="support-privacy"><a href="/privacidad" target="_blank" rel="noopener">Política de Privacidad</a></p></div>`;
  if(type==='logout'&&session&&logoutError)return `<div class="modal-head"><h2 id="modal-title">Cerrar sesión</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p role="status">${escapeText(message({error:logoutError}))} Tu sesión sigue abierta. Vuelve a intentarlo.</p><button type="button" class="textured-button modal-primary" data-action="logout">Reintentar cierre de sesión</button>`;
  if (type === 'logout') return `<div class="modal-head"><h2 id="modal-title">Cerrar sesión</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p class="modal-intro">No hay sesión iniciada.</p>`;
  if (type === 'music-error') return `<div class="modal-head"><h2 id="modal-title">Música</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p class="modal-intro">El navegador no pudo reproducir la música. Comprueba el sonido y vuelve a intentarlo.</p>`;
  if(type==='google-error')return `<div class="modal-head"><h2 id="modal-title">Acceso con Google</h2><button type="button" data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p role="status">${escapeText(googleErrorNotice())}</p>`;
  if(type==='link-google')return `<div class="modal-head"><h2 id="modal-title">Vincular Google</h2><button type="button" data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p>Confirma la contraseña de ${escapeText(session.nick)} para vincular tu cuenta de Google.</p><form id="google-link"><div class="login-fields"><label>Contraseña actual<input type="password" name="password" required maxlength="1024" autocomplete="current-password" /></label></div><button type="submit" class="textured-button modal-primary">Continuar con Google</button><p id="google-link-status" role="status"></p></form>`;
  return accessMarkup();
}

function openModal(type,{pending=false,immersive=false}={}) {
  notificationModalEpoch++;notificationObserver?.disconnect();clearTimeout(notificationReadTimer);
  if(!session)type='auth';
  modalKind=type;
  if(type==='album'&&session&&(!profileState.cosmetics||profileState.cosmeticsError))void loadProfileData().catch(()=>{});
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
  notificationModalEpoch++;notificationObserver?.disconnect();clearTimeout(notificationReadTimer);
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
  const store=e.target.closest('[data-store-tab],[data-store-category]');if(store){selectStoreItem(store.hasAttribute('data-store-tab')?'tab':'category',store.dataset.storeTab??store.dataset.storeCategory,true);return}
  const raffleTab=e.target.closest('[data-raffle-tab]');if(raffleTab){selectRaffleTab(raffleTab.dataset.raffleTab);return}
  const help=e.target.closest('[data-game-help]')?.dataset.gameHelp;if(help&&Object.hasOwn(gameDescriptions,help)){openModal('game-help:'+help);return}
  const game=e.target.closest('[data-game]')?.dataset.game;if(game&&Object.hasOwn(gameRoutes,game)){void launchOriginalGame(game);return}
  const economic=e.target.closest('[data-economy]');if(economic&&!economic.disabled){void runEconomicOperation(economic.dataset.economy,economic);return}
  const avatar=e.target.closest('[data-avatar-id]');if(avatar&&!avatar.disabled){void savePersonalChange('avatar',avatar.dataset.avatarId,avatar);return}
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
  if(action==='community-notice'){openModal('community-notice');return}
  if(action==='link-google'){openModal('link-google');return}
  if(action==='google-cancel'){void cancelGoogleRegistration(e.target.closest('button'));return}
  if (action === 'auth') openModal('auth');
  else if (action === 'history') void openRemoteModal('history');
  else if (action === 'album') openModal('album');
  else if (action === 'music') { closeMenu(); void toggleMusic(); }
  else if (action === 'assistance') openModal('assistance');
  else if (action === 'logout') void logoutAccount();
  else if (action === 'notifications') void openRemoteModal('notifications');
  else if (action === 'notification-history') void openRemoteModal('notification-history');
  else if (action === 'retry-notifications') {const status=overlay.querySelector('.notification-status');if(status)status.replaceChildren();observeNotificationCards()}
  else if (action === 'game-fullscreen') void gameWindow.toggle();
  else if (action === 'close-modal') closeModal();
  else if (!e.target.closest('#session-options,.nav-toggle')) closeMenu();
});
document.addEventListener('keydown', e => {
  const store=e.target.closest('[data-store-tab],[data-store-category]');if(store&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const group=store.hasAttribute('data-store-tab')?'tab':'category',tabs=[...store.parentElement.querySelectorAll('[role=tab]')],current=tabs.indexOf(store),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(current+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectStoreItem(group,tabs[next].dataset.storeTab??tabs[next].dataset.storeCategory,true);return}
  const raffleTab=e.target.closest('[data-raffle-tab]');if(raffleTab&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();selectRaffleTab(e.key==='Home'?'buy':e.key==='End'?'room':raffleTab.dataset.raffleTab==='buy'?'room':'buy',true);return}
  if (e.key === 'Escape') {if(modalKind?.startsWith('game:')&&(gameWindow.isFullscreen()||gameWindow.recentlyExited())){if(gameWindow.isFullscreen())void gameWindow.toggle();return}if(!overlay.hidden) closeModal();else if (!sessionOptions.hidden) { closeMenu(); menuToggle.focus(); }}
  if (e.key === 'Tab' && !overlay.hidden) {
    const focusables = [...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href],.notification-list[tabindex="0"]')].filter(el => el.getClientRects().length);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length-1];
    if (e.shiftKey && document.activeElement === first) {e.preventDefault();last.focus();}
    else if (!e.shiftKey && document.activeElement === last) {e.preventDefault();first.focus();}
  }
});
window.addEventListener('hashchange',render);
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==overlay.querySelector('.original-game')?.contentWindow)return;if(['perriduelos-exit','perripet-exit'].includes(event.data?.type)){closeModal();return}if(event.data?.type==='pw2-game-context-request'&&gameBootstrap&&typeof event.data.id==='string')event.source.postMessage({type:'pw2-game-context',id:event.data.id,context:gameBootstrap},location.origin);if(event.data?.type==='pw2-game-updated')api.clearCache();if(event.data?.type==='pw2-session-expired')errorState({code:'session_expired'})});
window.addEventListener('pageshow',event=>{if(event.persisted)void initializeGoogleAccess()});
renderMusicOption();
overlay.innerHTML='<section class="modal-card" role="status">Comprobando sesión…</section>';overlay.hidden=false;
void initializeGoogleAccess();

function showLogin(error){
 document.body.dataset.access='locked';stage.replaceChildren();closeMenu();openModal('auth');
 const status=overlay.querySelector('#login-status');status.textContent=error?message({error}):sessionState.status==='error'?message(sessionState):googleErrorNotice();
 document.title='Entrar | Perrisushi World';
}
function paintStage(){if(!session){if(sessionState.status!=='loading')showLogin();return}stage.innerHTML=views[normalizeRoute(location.hash)]();selectRaffleTab(selectedRaffleTab);fitMobileProfile();fitInteriorPanel();fitInventoryGrid()}
function resetPrivateState(){
  notificationCenter.stop();notificationObserver?.disconnect();clearTimeout(notificationReadTimer);notificationModalEpoch++;
  inventoryObserver?.disconnect();inventoryObserver=null;
  containerOperations.clear();
  gameLaunchEpoch++;openingGame=false;void gameWindow.close();
  communityState={enabled:false};selectedRaffleTab='buy';shopSelection.tab='cosmetics';shopSelection.category='backgrounds';
  adminTools.reset();communityState={enabled:false};communityLastCheck=0;session=null;gameBootstrap=null;sessionEpoch++;routeEpoch++;api.clearCache();profileState={status:'signedOut'};cosmeticDraft=null;cosmeticTab='logo';economicOperations.clear();economicReceipt=null;
  for(const kind of ['users','inventory','shop','raffles'])setPageData(kind,{status:'signedOut'});
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
function refreshProfilePresentation(){
 if(!session)return;
 setAuthenticatedProfile({authenticated:true,displayName:session.nick,avatarId:profileState.profile?.selectedLogoAssetId??profileState.profile?.selectedLogoId?.replace(/^logo-/,'')});
 if(normalizeRoute(location.hash)==='profile')paintStage();
 if(normalizeRoute(location.hash)==='shop'&&dataState.shop.status==='ready'){setPageData('shop',{...dataState.shop,cosmetics:profileState.cosmetics});paintStage()}
 if(modalKind==='album')paintRemote('album');
}
let profileRead=null;
function loadProfileData(){
 const key=sessionEpoch+':'+api.getCacheEpoch();
 if(profileRead?.key===key)return profileRead.promise;
 const promise=readProfileData();profileRead={key,promise};
 void promise.finally(()=>{if(profileRead?.promise===promise)profileRead=null}).catch(()=>{});return promise;
}
async function readProfileData(){
 const generation=sessionEpoch;
 // Empezar las dos lecturas independientes juntas; nunca dejar un rechazo sin observar.
 const composition=measuredLoad('cosmetics',()=>api.getCosmetics()).then(data=>({data}),error=>({error}));
 const result=await measuredLoad('profile',()=>api.getProfile());
 if(generation!==sessionEpoch)return result;
 profileState={...profileState,status:'ready',...result};refreshProfilePresentation();
 if(result.cosmeticsEnabled){
  void composition.then(({data:cosmetics,error})=>{
   if(generation!==sessionEpoch)return;if(error)throw error;
   if(profileState.cosmetics===cosmetics)return;profileState={...profileState,cosmetics,cosmeticsError:false};refreshProfilePresentation();
  }).catch(error=>{if(generation===sessionEpoch&&error.code!=='session_changed'){profileState={...profileState,cosmeticsError:true};if(modalKind==='album')paintRemote('album')}});
 }
 return {...result,...(profileState.cosmetics?{cosmetics:profileState.cosmetics}:{})};
}
async function loadGoogleLink(){
 if(!session||!googleConfig.enabled||normalizeRoute(location.hash)!=='profile')return;
 const generation=sessionEpoch;
 try{const result=await measuredLoad('google-status',()=>api.googleStatus());if(generation!==sessionEpoch)return;googleLinked=result.linked===true;if(normalizeRoute(location.hash)==='profile')paintStage()}catch{}
}
async function bootstrapSession(authenticated=null){
 resetPrivateState();const generation=sessionEpoch;sessionState={status:'loading'};profileState={status:'loading'};
 try{
  await startAuthenticatedUI({authenticated,getSession:()=>api.getSession(),onSession:result=>{
   if(generation!==sessionEpoch)return false;
   session=result.authenticated?result:null;sessionState={status:session?'ready':'signedOut'};
   if(!session){profileState={status:'signedOut'};if(['login','linked'].includes(googleNotice))googleNotice='google_session_missing';syncIdentity();render();return false}
   googlePending=null;return true;
  },show:()=>{syncIdentity();closeModal();document.body.dataset.access='ready';setAuthenticatedProfile({authenticated:true,displayName:session.nick});render()},tasks:{
   profile:()=>loadProfileData(),admin:async()=>{await adminTools.recognize();if(generation!==sessionEpoch)return;const header=stage.querySelector('.content-header');if(header&&!header.querySelector('.admin-entry'))header.insertAdjacentHTML('beforeend',adminTools.entry(normalizeRoute(location.hash)))},
   community:()=>refreshCommunity(true),notifications:()=>{if(generation===sessionEpoch)notificationCenter.start()}
  },onError:(error,name)=>{if(generation!==sessionEpoch||error.code==='session_changed')return;if(name==='profile'){profileState={...profileState,...errorState(error)};refreshProfilePresentation()}}});
 }catch(error){if(generation!==sessionEpoch)return;sessionState=errorState(error);profileState=sessionState;syncIdentity();render()}
}
let sessionRecovery=null;
function recoverSessionConnection(){
 if(document.visibilityState!=='visible'||logoutPending||sessionRecovery||sessionState.status!=='error'||!['network_error','timeout','backend_unavailable','backend_not_configured','moderation_unavailable','request_failed','invalid_server_response'].includes(sessionState.error))return;
 sessionRecovery=bootstrapSession().finally(()=>{sessionRecovery=null});
}
window.addEventListener('online',recoverSessionConnection);
window.addEventListener('focus',recoverSessionConnection);
document.addEventListener('visibilitychange',recoverSessionConnection);

async function loadCurrentRoute(route){
 const sequence=++routeEpoch,generation=sessionEpoch;
 if(!['profile','users','inventory','shop','raffles'].includes(route))return;
 if(!session){if(route!=='profile')setPageData(route,sessionState.status!=='ready'?sessionState:{status:'signedOut'});paintStage();return}
 if(route!=='profile')setPageData(route,{status:'loading'});paintStage();
 if(route==='profile')void loadGoogleLink();
 try{
  const result=route==='profile'?await loadProfileData():route==='users'?await api.listUsers():route==='inventory'?await api.getInventory():route==='shop'?await Promise.all([api.getStore(),loadProfileData()]):await Promise.all([api.listRaffles(),api.getRaffleEvents()]);
  if(sequence!==routeEpoch||generation!==sessionEpoch)return;
  if(route==='profile'){setAuthenticatedProfile({authenticated:true,displayName:session.nick,avatarId:result.profile?.selectedLogoAssetId??result.profile?.selectedLogoId})}
  else {setPageData(route,{status:'ready',...(route==='shop'?{catalog:result[0],balances:result[1].balances,ownedLogoIds:result[1].profile?.ownedLogoIds??[],cosmetics:profileState.cosmetics}:route==='raffles'?{raffles:result[0],events:result[1]}:result)});}
 }catch(error){if(sequence!==routeEpoch||generation!==sessionEpoch)return;const state=errorState(error);if(route==='profile')profileState=state;else setPageData(route,state);syncIdentity()}
 if(sequence===routeEpoch&&generation===sessionEpoch)paintStage();
}
function fitNotificationPanel(){
 if(!['notifications','notification-history'].includes(modalKind)||remoteStates[modalKind]?.status!=='ready')return;
 const card=overlay.querySelector('.modal-card');if(!card)return;const list=card.querySelector('.notification-list'),scroll=list?.scrollTop??0;
 card.classList.remove('notification-cards-ready');card.style.height='';
 card.style.height=designRect(card).height+'px';card.classList.add('notification-cards-ready');if(list){list.scrollTop=scroll;list.tabIndex=list.scrollHeight>list.clientHeight+1?0:-1;}
}
window.addEventListener('resize',()=>{fitNotificationPanel();if(modalKind==='notifications')scheduleNotificationRead()});
function paintRemote(kind){if(modalKind!==kind)return;const card=overlay.querySelector('.modal-card'),scroll=card.querySelector('.notification-list')?.scrollTop??card.scrollTop;card.classList.remove('notification-cards-ready');card.style.height='';card.innerHTML=modalMarkup(kind);fitNotificationPanel();card.querySelector('.modal-close').focus({preventScroll:true});const list=card.querySelector('.notification-list');if(list)list.scrollTop=scroll;else card.scrollTop=scroll;if(kind==='notifications')observeNotificationCards()}
async function openRemoteModal(kind){remoteStates[kind]=session?{status:'loading'}:sessionState.status==='error'?sessionState:{status:'signedOut'};openModal(kind);if(!session)return;const generation=sessionEpoch,modalEpoch=notificationModalEpoch;
 try{const result=await (kind==='history'?api.getHistory():api.getNotifications({state:kind==='notifications'?'unread':'read'}));if(generation!==sessionEpoch||modalEpoch!==notificationModalEpoch)return;remoteStates[kind]={status:'ready',...result,items:kind==='history'?result.items:mergeNotifications([],result.items)}}
 catch(error){if(generation!==sessionEpoch||modalEpoch!==notificationModalEpoch)return;remoteStates[kind]=errorState(error);syncIdentity();paintStage()}
 paintRemote(kind);
}
async function loadMore(kind,cursor,button){
 const generation=sessionEpoch,previousUsers=dataState.users;button.disabled=true;
 try{
  if(kind==='users'){const result=await api.listUsers({cursor});if(generation!==sessionEpoch||dataState.users!==previousUsers)return;setPageData('users',{status:'ready',items:[...previousUsers.items,...result.items],nextCursor:result.nextCursor});if(normalizeRoute(location.hash)==='users'){const list=button.isConnected&&stage.querySelector('.pw04-user-rows');if(list){list.insertAdjacentHTML('beforeend',renderUserRows(result.items));if(result.nextCursor)button.dataset.cursor=result.nextCursor;else button.remove()}else paintStage()}}
  else if(['history','notifications','notification-history'].includes(kind)){const modalEpoch=notificationModalEpoch;const result=await (kind==='history'?api.getHistory({cursor}):api.getNotifications({cursor,state:kind==='notifications'?'unread':'read'}));if(generation!==sessionEpoch||modalEpoch!==notificationModalEpoch)return;remoteStates[kind]={status:'ready',items:kind==='history'?[...remoteStates[kind].items,...result.items]:mergeNotifications(remoteStates[kind].items,result.items),nextCursor:result.nextCursor};paintRemote(kind)}
  else if(['tickets','claims'].includes(kind)){const result=await api.listRandomKeys({[kind==='tickets'?'ticketCursor':'claimCursor']:cursor});if(generation!==sessionEpoch)return;const current=dataState.shop.randomKey;current[kind]={items:[...current[kind].items,...result[kind].items],nextCursor:result[kind].nextCursor};if(normalizeRoute(location.hash)==='shop')paintStage()}
 }catch(error){if(generation===sessionEpoch){errorState(error);button.textContent=message({error:error.code})}}
 finally{if(button.isConnected)button.disabled=false}
}
async function logoutAccount(){
 if(!session||logoutPending)return;
 logoutPending=true;logoutError=null;closeMenu();
 try{
  await api.logout();
  closeModal();resetPrivateState();sessionState={status:'signedOut'};syncIdentity();showLogin();
 }catch(error){
  // No presentar un fallo de red como una revocación confirmada.
  if(session){logoutError=error.code;openModal('logout')}
 }finally{logoutPending=false}
}

document.addEventListener('submit',async event=>{
 if(event.target.id!=='traditional-login')return;event.preventDefault();if(logoutPending)return;const form=event.target,submit=form.querySelector('button'),status=form.querySelector('#login-status');submit.disabled=true;status.textContent='Comprobando acceso…';
 googlePending=null;googleNotice='';const data=new FormData(form);resetPrivateState();sessionState={status:'loading'};syncIdentity();
 try{const authenticated=await api.login(data.get('nick'),data.get('password'));form.reset();history.replaceState(null,'','#home');await bootstrapSession(authenticated)}
 catch(error){sessionState={status:'error',error:error.code};profileState=sessionState;syncIdentity();showLogin(error.code);overlay.querySelector('#login-status').textContent=message({error:error.code,expiresAt:error.expiresAt});const login=overlay.querySelector('#traditional-login');login.elements.nick.value=String(data.get('nick')??'');login.elements.password.focus()}
 finally{if(submit.isConnected)submit.disabled=false}
});
const pendingPersonalChanges=new Set();
async function savePersonalChange(kind,id,button){
 if(pendingPersonalChanges.has(kind)||!session)return;
 pendingPersonalChanges.add(kind);button.disabled=true;const generation=sessionEpoch;
 try{
  if(kind==='avatar'){
   await api.updateAvatar(id);const result=await loadProfileData();if(generation!==sessionEpoch)return;
   setAuthenticatedProfile({authenticated:true,displayName:session.nick,avatarId:result.profile?.selectedLogoAssetId});paintStage();paintRemote('album');
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
  if(generation!==sessionEpoch)return;economicOperations.delete(kind);try{sessionStorage.removeItem(storageKey)}catch{}economicReceipt=result;await loadCurrentRoute(kind==='redeem'?'shop':'raffles');openModal('receipt');
 }catch(error){if(generation===sessionEpoch){operation.busy=false;if(error.code==='operation_conflict'){try{const receipt=await api.getReceipt(operation.id);if(generation!==sessionEpoch)return;if(receipt.kind===(kind==='redeem'?'random-redeem':'raffle-buy')){economicReceipt=receipt;economicOperations.delete(kind);try{sessionStorage.removeItem(storageKey)}catch{}await loadCurrentRoute(kind==='redeem'?'shop':'raffles');openModal('receipt');return}}catch{}button.textContent='Revisa la operación anterior en el historial antes de continuar.';button.disabled=true;return}if(['invalid_request','insufficient_balance','invalid_balance','ticket_limit','no_stock','no_active_ticket','account_inactive','inventory_missing','operation_disabled'].includes(error.code)){economicOperations.delete(kind);try{sessionStorage.removeItem(storageKey)}catch{}}errorState(error);button.textContent=message({error:error.code})+' Pulsa para reintentar.';button.disabled=false}}
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
 const messages={google_session_missing:'Google ha respondido, pero no se pudo recuperar la sesión. Vuelve a intentarlo.',google_cancelled:'Has cancelado el acceso con Google.',google_expired:'El acceso con Google ha caducado. Vuelve a intentarlo.',google_conflict:'Esta cuenta de Google ya está vinculada a otra cuenta, o tu usuario tiene otra vinculación.',account_inactive:'Esta cuenta no tiene el acceso habilitado.',session_expired:'Tu sesión ha caducado. Vuelve a entrar para vincular Google.',google_unavailable:'No se pudo conectar con Google. Vuelve a intentarlo.',google_failed:'No se pudo completar el acceso con Google. Vuelve a intentarlo.',google_not_allowed:'Esta cuenta de Google no tiene el acceso habilitado.',registration_unavailable:'Entra con tu usuario y contraseña y vincula Google desde Mi perfil.'};
 return ['account_suspended','account_banned','moderation_unavailable'].includes(googleNotice)?message({error:googleNotice,expiresAt:googleUntil}):messages[googleNotice]??'';
}
function legalLinks(){
 return '<p class="access-legal"><a href="/privacidad" target="_blank" rel="noopener">Política de Privacidad</a>'+ (googleConfig.legalPublished?' · <a href="/api/legal/terms" target="_blank" rel="noopener">Condiciones del Servicio</a>':'')+'</p>';
}
function accessMarkup(){
 if(googlePending)return `<div class="modal-head"><h2 id="modal-title">Crear cuenta</h2></div>
 ${googleConfig.registrationEnabled!==false?`<form id="google-register"><div class="access-register-content">
 <p>¿Ya tienes cuenta? Entra con tu usuario y vincula Google desde tu perfil.</p>
 <div class="login-fields"><label>Elige tu nick<input name="nick" type="text" required minlength="3" maxlength="30" autocomplete="nickname" aria-describedby="nick-help" /></label><small id="nick-help">De 3 a 30 letras, números, guiones o guiones bajos.</small></div>
 ${googleConfig.legalPublished?'<label class="access-accept"><input name="acceptedTerms" type="checkbox" required /> He leído la Política de Privacidad y acepto las Condiciones del Servicio.</label>':''}
 ${legalLinks()}</div><button type="submit" class="textured-button modal-primary">Crear cuenta</button></form>`:'<p>El registro no está disponible en este momento. Si ya tienes cuenta, entra con tu usuario y contraseña.</p>'}
 <button type="button" class="textured-button access-cancel" data-action="google-cancel">Cancelar y volver al acceso</button><p id="login-status" role="status"></p>`;
 return `<div class="modal-head access-brand"><h2 id="modal-title" class="sr-only">Entrar en Perrisushi World</h2><img class="access-world-logo" src="${ASSETS}perrisushi-world.webp" alt="Perrisushi World" draggable="false" /></div>
  <form id="traditional-login"><div class="login-fields"><label>Usuario<input name="nick" type="text" required maxlength="80" autocomplete="username" /></label>
  <label>Contraseña<input name="password" type="password" required maxlength="1024" autocomplete="current-password" /></label></div>
  <button type="submit" class="textured-button modal-primary">Iniciar sesión</button><p id="login-status" role="status"></p></form>
  ${googleConfig.enabled?'<button type="button" class="textured-button google-access" data-action="google-login"><img src="./public/assets/google-g.webp" width="18" height="18" alt="" /><span>Continuar con Google</span></button>':''}${legalLinks()}`;
}
async function initializeGoogleAccess(){
 const callback=oauthCallbackPath(location);
 if(callback){location.replace(callback);return}
 const query=new URLSearchParams(location.search);googleNotice=query.get('google')??'';googleUntil=query.get('until');query.delete('until');
 if(query.has('google')){query.delete('google');history.replaceState(null,'',location.pathname+(query.size?'?'+query:'')+location.hash)}
 googlePending=null;googleLinked=null;
 const boot=bootstrapSession(),generation=sessionEpoch;
 void (async()=>{try{googleConfig=await api.googleConfig();if(googleConfig.enabled&&!session){const pending=await api.googlePending();if(generation===sessionEpoch&&pending.pending)googlePending=pending}}catch{googleConfig={enabled:false,legalPublished:false}}if(generation!==sessionEpoch)return;if(!session&&sessionState.status!=='loading'){const form=overlay.querySelector('#traditional-login');if(!form||(!form.elements.nick.value&&!form.elements.password.value))showLogin()}else void loadGoogleLink()})();
 await boot;
 if(session&&googleErrorNotice())openModal('google-error');
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
   const result=await api.registerGoogle(form.elements.nick.value,googlePending.csrf,form.elements.acceptedTerms?.checked??false,googleConfig.legalVersion);
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

async function runCommunityOperation(kind,body,button,status){
 const generation=sessionEpoch,key='pw2:public:'+session.nick+':'+kind+':'+body.id;
 if(button.disabled)return;button.disabled=true;
 try{
  let operation;try{operation=JSON.parse(sessionStorage.getItem(key)??'null')}catch{}
  if(!operation){operation={...body,idempotencyKey:crypto.randomUUID()};sessionStorage.setItem(key,JSON.stringify(operation))}
  const result=await (kind==='store'?api.buyProduct(operation):api.registerRaffle(operation));if(generation!==sessionEpoch)return;
  sessionStorage.removeItem(key);await loadCurrentRoute(normalizeRoute(location.hash));if(kind==='store'&&result.acquired){const message=stage.querySelector('[data-store-status="'+body.id+'"]');if(message)message.textContent='¡COSMÉTICO ADQUIRIDO!';}
 }catch(error){if(generation!==sessionEpoch)return;if([400,403,404,409].includes(error.status)&&error.code!=='operation_conflict')sessionStorage.removeItem(key);status.textContent=message({error:error.code,expiresAt:error.expiresAt});button.disabled=false}
}
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-store-buy]');if(!b||!session)return;
 const p=dataState.shop.catalog?.items?.find(p=>p.id===b.dataset.storeBuy);if(!p)return;
 if(!confirm('Comprar '+p.name+' por '+p.price+' '+(p.currency==='pc'?'PC':'Gemas')+'?'))return;
 void runCommunityOperation('store',{id:p.id,expectedVersion:p.version},b,b.closest('article').querySelector('[role=status]'));
});
document.addEventListener('submit',event=>{
 const form=event.target;if(!form.matches('[data-raffle-register]')||!session)return;event.preventDefault();const quantity=Number(new FormData(form).get('quantity'));
 if(!confirm('Asignar '+quantity+' boleto(s) a este sorteo? Los boletos inscritos se reservan para este evento.'))return;
 void runCommunityOperation('raffle',{id:form.dataset.raffleRegister,quantity},form.querySelector('button'),form.querySelector('[role=status]'));
});

async function refreshCommunity(force=false){
 if(!session||document.visibilityState!=='visible'||!force&&Date.now()-communityLastCheck<30000)return;
 communityLastCheck=Date.now();const generation=sessionEpoch;
 try{const fresh=await api.getCommunity({force});if(generation!==sessionEpoch)return;const changed=fresh.announcement!==communityState.announcement;communityState=fresh;if(changed&&normalizeRoute(location.hash)==='home')paintStage()}catch{}
}


document.addEventListener('click',async event=>{
 const tab=event.target.closest('[data-cosmetic-tab]');if(tab){cosmeticTab=tab.dataset.cosmeticTab;paintRemote('album');return}
 const preview=event.target.closest('[data-cosmetic-preview]');if(preview){cosmeticDraft={...profileState.cosmetics.selected,[preview.dataset.layer]:preview.dataset.cosmeticPreview};paintRemote('album');return}
 const equip=event.target.closest('[data-cosmetic-equip]');if(!equip||!session||pendingPersonalChanges.has('cosmetic'))return;
 const generation=sessionEpoch;pendingPersonalChanges.add('cosmetic');equip.disabled=true;
 try{await api.equipCosmetic(equip.dataset.layer,equip.dataset.cosmeticEquip);const result=await loadProfileData();if(generation!==sessionEpoch)return;cosmeticDraft=null;setAuthenticatedProfile({authenticated:true,displayName:session.nick,avatarId:result.profile?.selectedLogoAssetId});paintStage();paintRemote('album')}
 catch(error){if(generation===sessionEpoch){const status=overlay.querySelector('.cosmetic-status');if(status)status.textContent=message({error:error.code});equip.disabled=false}}
 finally{pendingPersonalChanges.delete('cosmetic')}
});

document.addEventListener('keydown',event=>{
 const tab=event.target.closest('[data-cosmetic-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=['background','logo','frame'],index=tabs.indexOf(cosmeticTab);cosmeticTab=tabs[event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3];paintRemote('album');overlay.querySelector('[data-cosmetic-tab="'+cosmeticTab+'"]').focus({preventScroll:true});
});
