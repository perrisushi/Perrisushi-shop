export const DESIGN_WIDTH=1440,DESIGN_HEIGHT=1080;
export const scaleForViewport=(width,height)=>Math.min(width/DESIGN_WIDTH,height/DESIGN_HEIGHT);
export const desktopScaleActive=()=>document.documentElement.dataset.globalScale==='true';
export const designHeight=()=>desktopScaleActive()?DESIGN_HEIGHT:window.innerHeight;
export const interfaceScale=()=>Number(document.documentElement.style.getPropertyValue('--interface-scale'))||1;
export function designRect(element){
 const rect=element.getBoundingClientRect(),scale=interfaceScale();
 return Object.fromEntries(['x','y','top','right','bottom','left','width','height'].map(key=>[key,rect[key]/scale]));
}
export function initializeGlobalScale(win=window){
 const fit=()=>{
  const mobile=win.navigator.userAgentData?.mobile===true||/Android|iPhone|iPad/i.test(win.navigator.userAgent)||win.matchMedia('(pointer:coarse)').matches;
  const active=!mobile&&win.innerWidth>700;
  document.documentElement.dataset.globalScale=String(active);
  for(const sheet of document.querySelectorAll('link[data-layout]'))sheet.media=(sheet.dataset.layout==='fixed')===active?'all':'not all';
  document.documentElement.style.setProperty('--interface-scale',String(active?scaleForViewport(win.innerWidth,win.innerHeight):1));
 };
 fit();win.addEventListener('resize',fit);
 return ()=>win.removeEventListener('resize',fit);
}
