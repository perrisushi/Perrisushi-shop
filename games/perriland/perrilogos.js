/* Renderizado local: nunca escribe en el motor, boletos ni equipamiento. */
(function(root){
'use strict';
const catalog=root.SalaPerrilogoCatalog,layers=[['fondo','background'],['logo','logo'],['marco','frame']];
const images=new Map(),compositions=new Map(),bodies=new Map(),warnings=new Set();
const metrics={imageLoads:0,compositions:0};
function warn(message){if(warnings.has(message))return;warnings.add(message);console.warn('[Perrilogos] '+message)}
function resolve(selection){return Object.fromEntries(layers.map(([key,layer])=>{const id=selection?.[key],item=catalog.items.find(i=>i.id===id&&i.layer===layer&&i.active);if(!item&&id!==undefined)warn('ID no vÃ¡lido en '+key+': '+id);return [key,item?.id||catalog.defaults[key]]}))}
const keyOf=s=>layers.map(([key])=>s[key]).join('|');
function image(id){if(!images.has(id)){metrics.imageLoads++;images.set(id,new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>img.naturalWidth===catalog.size&&img.naturalHeight===catalog.size?resolve(img):reject(Error('Lienzo distinto de 850Ã—850: '+id));img.onerror=()=>reject(Error('No se puede cargar '+id));img.src=catalog.items.find(i=>i.id===id).src}));}return images.get(id)}
async function layerImage(key,id){try{return await image(id)}catch(error){warn(error.message+'; alternativa '+catalog.defaults[key]);if(id!==catalog.defaults[key]){try{return await image(catalog.defaults[key])}catch(e){warn(e.message)}}return null}}
function compose(selection){const ids=resolve(selection),key=keyOf(ids);if(!compositions.has(key)){compositions.set(key,(async()=>{const loaded=await Promise.all(layers.map(([name])=>layerImage(name,ids[name]))),canvas=document.createElement('canvas');canvas.width=canvas.height=catalog.size;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;for(const img of loaded)if(img)ctx.drawImage(img,0,0,catalog.size,catalog.size);metrics.compositions++;return canvas})());}return compositions.get(key)}
function refresh(id,selection){const ids=resolve(selection),key=keyOf(ids),prior=bodies.get(id);if(prior?.key===key){prior.requested={...selection};return prior.ready;}const entry={key,selection:ids,requested:{...selection},canvas:prior?.canvas||null,ready:null};bodies.set(id,entry);entry.ready=compose(ids).then(canvas=>{if(bodies.get(id)===entry)entry.canvas=canvas;return canvas});return entry.ready}
function draw(ctx,player,radius){const selection=player.perrilogo;const current=bodies.get(player.id);if(selection&&layers.some(([name])=>selection[name]!==current?.requested?.[name]))refresh(player.id,selection);const entry=bodies.get(player.id);if(!entry?.canvas)return;/* Un Ãºnico rectÃ¡ngulo comÃºn para las tres capas. Sin giro, reflejo, recorte ni desplazamiento individual. */const diameter=radius*2;ctx.drawImage(entry.canvas,player.x-diameter/2,player.y-diameter/2,diameter,diameter)}
root.SalaPerrilogos={catalog,metrics,compose,resolve,draw,set:refresh,get(id){const entry=bodies.get(id);return entry?{...entry.selection}:null},get warnings(){return [...warnings]},ready:Promise.all((catalog.participants||[]).map(p=>refresh(p.id,p.perrilogo)))};
})(window);
