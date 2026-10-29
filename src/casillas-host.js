// Solo montaje del tablero original; sus funciones, reglas y premios no se reescriben.
(async()=>{try{const data=await window.pw2GameContext();
 state.sessionToken='cookie-session';setLoggedNick(data.nick);state.inventory=data.inventory;
 loginView.hidden=true;appView.hidden=false;
 showAppSection('perriCasillas',{resetHistory:true,recordHistory:false});
 const board=document.querySelector('#perriCasillasView');document.body.append(board);
 board.hidden=false;new MutationObserver(()=>{if(board.hidden)board.hidden=false}).observe(board,{attributes:true,attributeFilter:['hidden']});
 document.body.append(document.querySelector('#perriCasillasRewardModal'));
 const sizing=document.createElement('style');sizing.textContent=`
 #perriCasillasView { display:grid!important; position:fixed!important; inset:0!important; width:100%!important; height:100%!important; margin:0!important; padding:4px!important; transform:none!important; box-sizing:border-box; background:#101010!important; background-image:none!important; }
 #perriCasillasView .perricasillas-shell { height:100%; width:min(650px,100%); }
 #perriCasillasView > .section-topbar {display:none!important;}
 #perriCasillasView .perricasillas-game { box-sizing:border-box; }
 #perriCasillasView .perricasillas-board { width:min(100%,calc(100dvh - 150px)); height:auto; aspect-ratio:1; }
 @media(max-width:700px) {
  #perriCasillasView .perricasillas-stat { font-size:clamp(7px,2.35vw,9px); letter-spacing:0; }
  #perriCasillasView .perricasillas-stat strong { font-size:clamp(9px,3vw,12px); }
 }
 @media(orientation:landscape) and (max-height:600px) {
  #perriCasillasView .perricasillas-shell { padding:0; }
  #perriCasillasView .perricasillas-game { padding:6px;gap:8px;grid-template-columns:minmax(110px,1fr) auto;grid-template-rows:auto minmax(0,1fr) auto;align-items:center; }
  #perriCasillasView .perricasillas-head {grid-column:1;grid-row:1;}
  #perriCasillasView .perricasillas-stats {grid-column:1;grid-row:2;grid-template-columns:1fr;align-content:center;gap:4px;}
  #perriCasillasView .perricasillas-result {grid-column:1;grid-row:3;margin:0;font-size:9px;}
  #perriCasillasView .perricasillas-title-logo {max-height:30px;}
  #perriCasillasView .perricasillas-stat {min-height:34px;font-size:10px;line-height:1.2;letter-spacing:0;}
  #perriCasillasView .perricasillas-stat strong {font-size:12px;}
  #perriCasillasView .perricasillas-board { grid-column:2;grid-row:1 / 4;width:min(calc(100dvh - 28px),calc(100vw - 140px));height:auto;max-height:none; }
 }
 `;document.head.append(sizing);
 document.querySelectorAll('#mobileSessionMenu,#desktopStackBackButton,#backToMinigamesFromPerriCasillas,.session-bar,.session-logo-badge,.social-links,.desktop-back-button').forEach(el=>{el.hidden=true;el.style.setProperty('display','none','important')});
 await loadPerriCasillasState();
}catch(error){const p=document.createElement('p');p.textContent=error.message;document.body.prepend(p)}})();
