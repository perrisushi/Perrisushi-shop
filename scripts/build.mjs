import {mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gameHtml} from '../backend/public-paths.mjs';
const root=resolve(import.meta.dirname,'..');
const files=['index.html','privacidad.html','_redirects','_headers','src/main.js','src/routes.js','src/styles.css','src/desktop-layout-fix.css','src/preview-pages.css','src/services/api-client.js','src/services/live-ui.js','src/services/help-content.js','src/game-bridge.js','src/casillas-host.js','games/manifest.json'];
const {readFile}=await import('node:fs/promises');
files.push('src/game-window.js','src/game-window.css','src/game-presentation.js','src/game-presentation.css');
files.push(...JSON.parse(await readFile(resolve(root,'games/manifest.json'),'utf8')).files.map(f=>f.path));
for(const name of await readdir(resolve(root,'public/assets')))if(/^[\w-]+\.(webp|mp3)$/.test(name))files.push('public/assets/'+name);
// Nunca publicar archivos antiguos o ajenos que hayan quedado en dist.
try{for(const entry of await readdir(resolve(root,'dist'),{recursive:true,withFileTypes:true}))if(entry.isFile()){
 const name=resolve(entry.parentPath,entry.name).slice(resolve(root,'dist').length+1).replaceAll('\\','/');
 if(!files.includes(name))throw Error('dist contiene un archivo no autorizado; revisa y retíralo antes de construir');
}}catch(error){if(error.code!=='ENOENT')throw error}
for(const file of files){const target=resolve(root,'dist',file);await mkdir(resolve(target,'..'),{recursive:true});await copyFile(resolve(root,file),target);if(file.startsWith('games/original/')&&file.endsWith('.html')){const {writeFile}=await import('node:fs/promises');await writeFile(target,gameHtml(await readFile(target,'utf8'),file.endsWith('/index-production.html')))}}
console.log(`Publicados ${files.length} archivos públicos en dist; sin backend, claves, referencias ni pruebas.`);
