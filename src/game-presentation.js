// Ajuste exclusivo de geometría del visor original de Duelos.
(()=>{
 const app=document.querySelector('.duel-app');if(!app||typeof window.resizePerriDuelosApp!=='function')return;
 window.resizePerriDuelosApp=()=>{
  const width=window.visualViewport?.width||innerWidth,height=window.visualViewport?.height||innerHeight;
  const scale=Math.min(width/1920,height/1015);app.classList.remove('is-mobile-cover');
  app.style.setProperty('--app-scale-x',String(scale));app.style.setProperty('--app-scale-y',String(scale));
  // Las coordenadas de colocación de pestañas deben usar la misma escala visual.
  if(typeof currentAppScale==='number')currentAppScale=scale;
  if(typeof currentAppScaleY==='number')currentAppScaleY=scale;
 };
 window.resizePerriDuelosApp();requestAnimationFrame(()=>{if(typeof window.alignEquipmentTab==='function')window.alignEquipmentTab()});
})();
