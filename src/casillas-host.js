// Solo montaje del tablero original; sus funciones, reglas y premios no se reescriben.
(async()=>{try{const data=await window.pw2GameContext();
 state.sessionToken='cookie-session';setLoggedNick(data.nick);state.inventory=data.inventory;
 loginView.hidden=true;appView.hidden=false;
 showAppSection('perriCasillas',{resetHistory:true,recordHistory:false});
 const board=document.querySelector('#perriCasillasView');document.body.append(board);
 board.hidden=false;new MutationObserver(()=>{if(board.hidden)board.hidden=false}).observe(board,{attributes:true,attributeFilter:['hidden']});
 document.body.append(document.querySelector('#perriCasillasRewardModal'));
 const sizing=document.createElement('style');sizing.textContent=`
 #perriCasillasView { display:grid!important; position:fixed!important; inset:0!important; width:100%!important; height:100%!important; margin:0!important; padding:8px!important; transform:none!important; box-sizing:border-box; }
 #perriCasillasView .perricasillas-shell { height:100%; width:min(650px,100%); }
 #perriCasillasView .perricasillas-game { box-sizing:border-box; }
 #perriCasillasView .perricasillas-board { width:min(100%,calc(100dvh - 150px)); height:auto; aspect-ratio:1; }
 @media(max-width:700px) {
  #perriCasillasView .perricasillas-stat { font-size:clamp(7px,2.35vw,9px); letter-spacing:0; }
  #perriCasillasView .perricasillas-stat strong { font-size:clamp(9px,3vw,12px); }
 }
 `;document.head.append(sizing);
 document.querySelectorAll('#mobileSessionMenu,#desktopStackBackButton,#backToMinigamesFromPerriCasillas,.session-bar,.session-logo-badge,.social-links,.desktop-back-button').forEach(el=>{el.hidden=true;el.style.setProperty('display','none','important')});
 await loadPerriCasillasState();
}catch(error){const p=document.createElement('p');p.textContent=error.message;document.body.prepend(p)}})();
