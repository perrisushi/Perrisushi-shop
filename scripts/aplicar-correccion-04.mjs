/**
 * Corrección 04: integración quirúrgica en el proyecto local.
 * Ejecutar DESDE la carpeta raíz de PerriWeb 2.0 (con Node.js).
 * Ejemplo: node scripts/aplicar-correccion-04.mjs --dry-run
 *          node scripts/aplicar-correccion-04.mjs
 * No accede a Supabase, no lanza procesos en segundo plano, no toca minijuegos.
 * En caso de cambios de Codex no reconocidos, se detiene para integración manual.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root=process.cwd();
const dryRun=process.argv.includes('--dry-run');
const mainPath=path.join(root,'src','main.js');
const indexPath=path.join(root,'index.html');
const serverPath=path.join(root,'dev-server.mjs');
const uiPath=path.join(root,'src','preview-pages.js');
const cssPath=path.join(root,'src','preview-pages.css');
const missing=[mainPath,indexPath,serverPath,uiPath,cssPath].filter(p=>!fs.existsSync(p));
if (missing.length) throw new Error('Archivos requeridos ausentes: '+missing.join(', '));

let main=fs.readFileSync(mainPath,'utf8');
let index=fs.readFileSync(indexPath,'utf8');
let server=fs.readFileSync(serverPath,'utf8');
const originalMain=main;
const originalIndex=index;
const originalServer=server;

function replaceView(name, next, newBody) {
  if (main.includes(`function ${name}() { return shellView(`)) {
    // Ya puede haber sido aplicada una vez; requerimos la referencia real.
    if(!main.includes(newBody.trim())) throw new Error(`Vista ${name} distinta a la esperada, revisar manualmente.`);
    return;
  }
  const rx = new RegExp(`\\bfunction ${name}\\(\\)\\s*\\{[\\s\\S]*?(?=\\n${next})`,'m');
  const found=main.match(rx);
  if(!found) throw new Error(`No se pudo localizar ${name} de forma segura. Codex debe integrar manualmente.`);
  main=main.replace(rx, newBody+'\n');
}

replaceView('usersView','function inventoryView\\(\\)',`function usersView() {
  return shellView('users', renderUsersPreview());
}`);
replaceView('inventoryView','function gamesView\\(\\)',`function inventoryView() {
  return shellView('inventory', renderInventoryPreview());
}`);
replaceView('shopView','const views\\b',`function shopView() {
  return shellView('shop', renderShopPreview());
}`);

const importLine = "import { renderUsersPreview, renderInventoryPreview, renderShopPreview, bindPreviewPageEvents } from './preview-pages.js';";
if(!main.includes(importLine)) {
  const marker="import { normalizeRoute, routeTitles } from './routes.js';";
  if(!main.includes(marker)) throw new Error('Import original de rutas no identificado: editar manualmente.');
  main=main.replace(marker,marker+'\n'+importLine);
}
if(!main.includes('bindPreviewPageEvents();')) {
  const marker='renderMusicOption();';
  const last=main.lastIndexOf(marker);
  if(last<0) throw new Error('Inicialización del módulo no identificada: editar manualmente.');
  main=main.slice(0,last)+'bindPreviewPageEvents();\n'+main.slice(last);
}
const cssLine='  <link rel="stylesheet" href="./src/preview-pages.css" />';
if(!index.includes('preview-pages.css')) {
  const rx=/(\s*<link rel="stylesheet" href="\.\/src\/styles\.css"\s*\/>)/;
  if(!rx.test(index)) throw new Error('No se encontró la hoja original en index.html: editar manualmente.');
  index=index.replace(rx, match => match+'\n'+cssLine);
}

// El servidor local original usa lista blanca. Ampliarla solo con los DOS recursos públicos nuevos.
const oldServerList=String.raw`src\/(?:main|routes)\.js|src\/styles\.css`;
const newServerList=String.raw`src\/(?:main|routes|preview-pages)\.js|src\/(?:styles|preview-pages)\.css`;
if (!server.includes(newServerList)) {
  if (!server.includes(oldServerList)) throw new Error('Lista blanca del servidor distinta a la conocida. Codex debe autorizar manualmente SOLO las dos rutas nuevas.');
  server=server.replace(oldServerList,newServerList);
}

const expected=['renderUsersPreview()', 'renderInventoryPreview()', 'renderShopPreview()', 'bindPreviewPageEvents();'];
for(const term of expected) if(!main.includes(term)) throw new Error('Integración incompleta: '+term);
if(main.includes('Comprar equipamiento')) throw new Error('Sigue apareciendo «Comprar equipamiento» en src/main.js, revisar antes de integrar.');

console.log(`${dryRun?'SIMULACIÓN':'APLICACIÓN'} - ${root}`);
console.log('Archivo principal:',main!==originalMain?'actualización localizada':'ya actualizado');
console.log('HTML:',index!==originalIndex?'añadir CSS':'ya actualizado');
console.log('Servidor local:',server!==originalServer?'permitir módulos nuevos en lista blanca':'ya actualizado');
if(!dryRun){
  if(main!==originalMain) fs.writeFileSync(mainPath,main,'utf8');
  if(index!==originalIndex) fs.writeFileSync(indexPath,index,'utf8');
  if(server!==originalServer) fs.writeFileSync(serverPath,server,'utf8');
}
console.log('Corrección 04 preparada. Sin operaciones sobre Supabase ni minijuegos.');
