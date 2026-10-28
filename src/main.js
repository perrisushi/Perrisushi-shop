import { normalizeRoute, routeTitles } from './routes.js';
import {createApiClient} from './services/api-client.js';
import {escapeText,logoId,message,stateNotice,pager,dataState,setPageData,renderLiveUsers,renderLiveInventory,renderLiveShop,bindPageEvents} from './services/live-ui.js';
const api=createApiClient({onSessionExpired:()=>errorState({code:'session_expired'})});
let session=null,sessionState={status:'loading'},profileState={status:'loading'},sessionEpoch=0,routeEpoch=0,modalKind=null,logoutPending=false;
const remoteStates={};

const ASSETS = './public/assets/';
const stage = document.querySelector('#contenido');
const overlay = document.querySelector('#overlay-layer');
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
      <div><span class="eyebrow">PERRISUSHI WORLD</span><h1>${routeTitles[route]}</h1></div>
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
    <div class="profile-details"><span class="section-kicker">ESTADO DE LA CUENTA</span><h2>${session?escapeText(session.nick):'Bienvenido, viajero'}</h2>
      <p>${profileState.status==='ready'?'Tu perfil personal.':escapeText(message(profileState))}</p>
      <div class="info-strip"><span>PC · Gemas</span><strong>${escapeText(profileState.balances?.pc??'—')} · ${escapeText(profileState.balances?.gemas??'—')}</strong></div><div class="info-strip"><span>Logros</span><strong>${escapeText(Array.isArray(profileState.profile?.achievements)?profileState.profile.achievements.join(' · '):'—')}</strong></div>
      <div class="info-strip"><span>Karma</span><strong>${escapeText(profileState.profile?.karma??'—')}</strong></div>
      <div class="profile-actions"><button class="textured-button history-button" type="button" data-action="history" aria-label="Historial" title="Historial"><span aria-hidden="true">⌛</span></button><button class="textured-button" type="button" data-action="album">Cambiar Perrilogos</button></div>
    </div>
  </div>`);
}

function usersView() {
  return shellView('users', renderLiveUsers());
}

function inventoryView() {
  return shellView('inventory', renderLiveInventory());
}

function gamesView() {
  const games = [
    ['menu-duelos','PerriDuelos'],['boton-perripet','PerriPet'],['boton-perricasilla','PerriCasillas'],['boton-perrirpg','PerriRPG']
  ];
  return shellView('games', `<p class="page-intro">Elige tu juego.</p>
    <div class="games-grid">${games.map(([file, name]) => `<button type="button" class="game-tile" data-game="${name}"><img src="${ASSETS}${file}.webp" alt="${name}" loading="lazy"/><span>Jugar</span></button>`).join('')}</div>`);
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
function modalMarkup(type) {
  if(type==='game-unavailable')return `<div class="modal-head"><h2 id="modal-title">Minijuegos</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p>El servicio de minijuegos no está disponible. Vuelve a intentarlo más tarde.</p>`;

  if(type.startsWith('game:')){const name=type.slice(5);return `<div class="modal-head"><h2 id="modal-title">${escapeText(name)}</h2><button type="button" class="textured-button" data-action="game-fullscreen" aria-label="Pantalla completa">⛶</button><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><iframe class="original-game" src="${gameRoutes[name]}" title="${escapeText(name)}" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe>`}
  if(type==='receipt')return `<div class="modal-head"><h2 id="modal-title">Operación completada</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div>${economicReceipt?.redeemed?`<p>${escapeText(economicReceipt.redeemed.game)}</p><code>${escapeText(economicReceipt.redeemed.key)}</code>`:`<p>Boletos: ${escapeText(economicReceipt?.tickets)} · PC: ${escapeText(economicReceipt?.pc)}</p>`}`;

  if(type==='history'||type==='notifications'){
    const s=remoteStates[type]??{status:'loading'};
    return `<div class="modal-head"><h2 id="modal-title">${type==='history'?'Historial':'Notificaciones'}</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div>${s.status==='ready'?`${(s.items??[]).map(item=>`<article class="info-strip"><div><strong>${escapeText(item.title??item.game??'Actividad')}</strong><p>${escapeText(item.message??item.result??'')}</p><p>${escapeText(item.details??'')}</p><small>${escapeText(item.created_at??'')}</small>${type==='notifications'&&!item.read_at?`<button type="button" class="textured-button" data-read-note="${escapeText(item.id)}">Marcar como leída</button>`:''}</div></article>`).join('')||stateNotice({status:'empty'})}${pager(s.nextCursor,type)}`:stateNotice(s)}`;
  }
  if(type==='album'){
    const s=profileState,logos=s.logos??[],owned=s.profile?.ownedLogoIds??[];
    return `<div class="modal-head"><h2 id="modal-title">Álbum de Perrilogos</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><div class="album-selected">${avatarMarkup(selectedAvatar)}<p>Perrilogo de tu cuenta</p></div>${s.status!=='ready'?stateNotice(s):`<p class="album-note">Selecciona uno de tus Perrilogos encontrados.</p><div class="album-tabs" role="group" aria-label="Colección"><button type="button" data-live-album="found" aria-pressed="true">Encontrados</button><button type="button" data-live-album="unknown" aria-pressed="false">Desconocidos</button></div><div class="album-grid">${logos.map(l=>`<button type="button" ${owned.includes(l.id)&&l.assetId?'':'disabled'} data-avatar-id="${escapeText(l.id)}" data-owned="${owned.includes(l.id)}" ${owned.includes(l.id)?'':'hidden'}><img src="${ASSETS}logo-${logoId(l.assetId??l.id)}.webp" alt=""/><span>${escapeText(l.name)}</span></button>`).join('')}</div>`}`;
  }
  if (type === 'assistance') return `<div class="modal-head"><h2 id="modal-title">Asistencia</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p class="modal-intro">Si necesitas ayuda con la tienda, puedes escribir a Perrisushi por Twitch. También publicamos avisos y novedades en YouTube.</p><a class="support-link textured-button" href="https://www.twitch.tv/perrisushi" target="_blank" rel="noopener noreferrer">Abrir Twitch</a>`;
  if (type === 'logout') return `<div class="modal-head"><h2 id="modal-title">Cerrar sesión</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p class="modal-intro">No hay sesión iniciada.</p>`;
  if (type === 'music-error') return `<div class="modal-head"><h2 id="modal-title">Música</h2><button data-action="close-modal" class="modal-close" aria-label="Cerrar">×</button></div><p class="modal-intro">El navegador no pudo reproducir la música. Comprueba el sonido y vuelve a intentarlo.</p>`;
  return `<div class="modal-head"><h2 id="modal-title">Entrar en PerriWeb</h2></div>
  <form id="traditional-login"><div class="login-fields"><label>Usuario<input name="nick" type="text" required maxlength="80" autocomplete="username" /></label>
  <label>Contraseña<input name="password" type="password" required maxlength="1024" autocomplete="current-password" /></label></div>
  <button type="submit" class="textured-button modal-primary">Iniciar sesión</button><p id="login-status" role="status"></p></form>`;
}

function openModal(type) {
  if(!session)type='auth';
  modalKind=type;
  lastFocus = sessionOptions.contains(document.activeElement) ? menuToggle : document.activeElement;
  closeMenu();
  overlay.innerHTML = `${type==='auth'?'':'<div class="modal-backdrop" data-action="close-modal"></div>'}<section class="modal-card ${type === 'album' ? 'album-card' : type.startsWith('game:') ? 'game-card' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">${modalMarkup(type)}</section>`;
  overlay.hidden = false;
  [...document.querySelector('#app').children].forEach(el => { if (el !== overlay) el.inert = true; });
  document.body.style.overflow = 'hidden';
  overlay.querySelector('input,.modal-close')?.focus();
}
function closeModal() {
  if(!session)return;
  if (overlay.hidden) return;
  if(modalKind?.startsWith('game:'))api.clearCache();
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
  const game=e.target.closest('[data-game]')?.dataset.game;if(game&&Object.hasOwn(gameRoutes,game)){void launchOriginalGame(game);return}
  const economic=e.target.closest('[data-economy]');if(economic&&!economic.disabled){void runEconomicOperation(economic.dataset.economy,economic);return}
  const avatar=e.target.closest('[data-avatar-id]');if(avatar&&!avatar.disabled){void savePersonalChange('avatar',avatar.dataset.avatarId,avatar);return}
  const note=e.target.closest('[data-read-note]');if(note&&!note.disabled){void savePersonalChange('notification',note.dataset.readNote,note);return}
  const liveAlbum=e.target.closest('[data-live-album]')?.dataset.liveAlbum;
  if(liveAlbum){overlay.querySelectorAll('[data-owned]').forEach(el=>el.hidden=el.dataset.owned!==String(liveAlbum==='found'));overlay.querySelectorAll('[data-live-album]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.liveAlbum===liveAlbum)));return}
  const item=e.target.closest('[data-live-item]')?.dataset.liveItem;
  if(item){const target=stage.querySelector('#pw04-item-info');target.textContent=`${item.replaceAll('_',' ')}: ${dataState.inventory.inventory?.[item]??'—'}.`;return}
  const next=e.target.closest('[data-live-next]');
  if(next){void loadMore(next.dataset.liveNext,next.dataset.cursor,next);return}
  const action = e.target.closest('[data-action]')?.dataset.action;
  const route = e.target.closest('[data-route]')?.dataset.route;
  if (route) { closeModal(); navigate(route); return; }
  if (action === 'auth') openModal('auth');
  else if (action === 'history') void openRemoteModal('history');
  else if (action === 'album') openModal('album');
  else if (action === 'music') { closeMenu(); void toggleMusic(); }
  else if (action === 'assistance') openModal('assistance');
  else if (action === 'logout') void logoutAccount();
  else if (action === 'notifications') void openRemoteModal('notifications');
  else if (action === 'game-fullscreen') { const card=overlay.querySelector('.game-card');if(card?.requestFullscreen)void card.requestFullscreen().then(()=>{if(matchMedia('(max-width:700px)').matches&&['game:PerriPet','game:PerriDuelos'].includes(modalKind))void screen.orientation?.lock?.('landscape').catch(()=>{})}).catch(()=>{}); }
  else if (action === 'close-modal') closeModal();
  else if (!e.target.closest('#session-options,.nav-toggle')) closeMenu();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {if(!overlay.hidden) closeModal();else if (!sessionOptions.hidden) { closeMenu(); menuToggle.focus(); }}
  if (e.key === 'Tab' && !overlay.hidden) {
    const focusables = [...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]')].filter(el => el.getClientRects().length);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length-1];
    if (e.shiftKey && document.activeElement === first) {e.preventDefault();last.focus();}
    else if (!e.shiftKey && document.activeElement === last) {e.preventDefault();first.focus();}
  }
});
window.addEventListener('hashchange',render);
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==overlay.querySelector('.original-game')?.contentWindow)return;if(event.data?.type==='pw2-game-updated')api.clearCache();if(event.data?.type==='pw2-session-expired')errorState({code:'session_expired'})});
window.addEventListener('pageshow',event=>{if(event.persisted)void bootstrapSession()});
bindPageEvents();
renderMusicOption();
overlay.innerHTML='<section class="modal-card" role="status">Comprobando sesión…</section>';overlay.hidden=false;
void bootstrapSession();

function showLogin(error){
 document.body.dataset.access='locked';stage.replaceChildren();closeMenu();openModal('auth');
 const status=overlay.querySelector('#login-status');status.textContent=error?message({error}):sessionState.status==='error'?message(sessionState):'';
 document.title='Entrar | Perrisushi World';
}
function paintStage(){if(!session){if(sessionState.status!=='loading')showLogin();return}stage.innerHTML=views[normalizeRoute(location.hash)]()}
function resetPrivateState(){
  session=null;sessionEpoch++;routeEpoch++;api.clearCache();profileState={status:'signedOut'};economicOperations.clear();economicReceipt=null;
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
async function bootstrapSession(){
  resetPrivateState();const generation=sessionEpoch;sessionState={status:'loading'};profileState={status:'loading'};
  try{const result=await api.getSession();if(generation!==sessionEpoch)return;session=result.authenticated?result:null;sessionState={status:session?'ready':'signedOut'};
   if(session){const p=await api.getProfile();if(generation!==sessionEpoch)return;profileState={status:'ready',...p};setAuthenticatedProfile({authenticated:true,displayName:session.nick,avatarId:p.profile?.selectedLogoAssetId??p.profile?.selectedLogoId})}
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
 const generation=sessionEpoch;button.disabled=true;
 try{
  if(kind==='users'){const result=await api.listUsers({cursor});if(generation!==sessionEpoch)return;setPageData('users',{status:'ready',items:[...dataState.users.items,...result.items],nextCursor:result.nextCursor});if(normalizeRoute(location.hash)==='users')paintStage()}
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
 const data=new FormData(form);resetPrivateState();sessionState={status:'loading'};syncIdentity();
 try{await api.login(data.get('nick'),data.get('password'));form.reset();history.replaceState(null,'','#home');await bootstrapSession()}
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
let openingGame=false;
async function launchOriginalGame(name){
 if(!session){openModal('auth');return}if(openingGame)return;openingGame=true;const generation=sessionEpoch;
 try{const context=await api.getGameContext();if(generation!==sessionEpoch)return;
  if(context.nick!==session.nick){await bootstrapSession();return}
  openModal(context.available?'game:'+name:'game-unavailable');
 }catch(error){if(generation===sessionEpoch){errorState(error);openModal('game-unavailable')}}finally{openingGame=false}
}
