import {cosmeticById,DEFAULT_BACKGROUND,DEFAULT_FRAME} from './perrilogo-catalog.js';
const safe=(id,layer,fallback)=>cosmeticById(id)?.active&&cosmeticById(id)?.layer===layer?id:fallback;
export function renderPerrilogo(selection={},classes='',label='Perrilogo'){
 const logo=String(selection.logo??'logo-pelusa-1');const layers={background:safe(selection.background,'background',DEFAULT_BACKGROUND),logo:safe(logo.startsWith('logo-')?logo:'logo-'+logo,'logo','logo-pelusa-1'),frame:safe(selection.frame,'frame',DEFAULT_FRAME)};
 return `<span class="perrilogo-composition ${classes}" role="img" aria-label="${String(label).replace(/[&<>"]/g,'')}" data-background="${layers.background}" data-logo="${layers.logo}" data-frame="${layers.frame}">${['background','logo','frame'].map(layer=>`<img class="perrilogo-layer" data-layer="${layer}" src="${cosmeticById(layers[layer]).src}" width="850" height="850" alt="" draggable="false">`).join('')}</span>`;
}
export function renderCosmeticCollection(state,tab='logo',draft=null){
 if(!state?.enabled)return '';
 const selected=draft??state.selected;
 return `<div class="perrilogo-customizer"><div class="album-selected">${renderPerrilogo(selected,'perrilogo-preview')}<strong>${draft?'Vista previa':'Equipado'}</strong></div><div class="cosmetic-tabs" role="tablist" aria-label="Capas del Perrilogo">${[['background','FONDO LOGO'],['logo','LOGO'],['frame','MARCO']].map(([id,name])=>`<button type="button" role="tab" aria-selected="${tab===id}" data-cosmetic-tab="${id}">${name}</button>`).join('')}</div><div class="cosmetic-grid" role="tabpanel">${state.items.filter(i=>i.layer===tab).map(i=>`<article class="cosmetic-choice"><button type="button" class="cosmetic-preview-button" data-cosmetic-preview="${i.id}" data-layer="${tab}" aria-label="Previsualizar ${i.name}">${renderPerrilogo({...state.selected,[tab]:i.id},'cosmetic-thumbnail')}</button><strong>${i.name}</strong>${state.selected[tab]===i.id?'<span>Equipado</span>':`<button type="button" class="textured-button" data-cosmetic-equip="${i.id}" data-layer="${tab}">Equipar</button>`}</article>`).join('')||'<p>No tienes elementos de esta categoría.</p>'}</div><p class="cosmetic-status" role="status"></p></div>`;
}

// Alternativa visual únicamente: nunca cambia la selección guardada o la propiedad.
if(typeof document!=='undefined')document.addEventListener('error',event=>{
 const img=event.target;if(!img?.matches?.('.perrilogo-layer'))return;
 if(img.dataset.fallbackApplied){img.hidden=true;return}img.dataset.fallbackApplied='true';
 const fallback={background:DEFAULT_BACKGROUND,logo:'logo-pelusa-1',frame:DEFAULT_FRAME}[img.dataset.layer];if(fallback)img.src=cosmeticById(fallback).src;
},true);
