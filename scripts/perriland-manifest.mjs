import {buildPerrilandPrediction} from './perriland-prediction.mjs';
import {PERRILOGO_CATALOG,DEFAULT_BACKGROUND,DEFAULT_FRAME} from '../src/services/perrilogo-catalog.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),scene=require('../backend/perriland/vendor/src/config/scene.cjs');
import {readdir,readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve} from 'node:path';
export async function updatePerrilandManifest(){await buildPerrilandPrediction();const root=resolve(import.meta.dirname,'..');
await writeFile(resolve(root,'games/perriland/perrilogo-catalog.js'),'window.SalaPerrilogoCatalog='+JSON.stringify({size:850,defaults:{fondo:DEFAULT_BACKGROUND,logo:'logo-pelusa-1',marco:DEFAULT_FRAME},items:PERRILOGO_CATALOG})+';');
await writeFile(resolve(root,'games/perriland/scene-config.js'),'window.OverlayScene='+JSON.stringify({width:scene.width,height:scene.height,characterScale:scene.characterScale,targetFps:scene.targetFps,snapshotFps:scene.snapshotFps,image:{...scene.image,src:'/games/perriland/assets/terreno/plataformas.png'}})+';');
const manifest=JSON.parse(await readFile(resolve(root,'games/manifest.json'),'utf8'));const files=await readdir(resolve(root,'games/perriland'),{recursive:true,withFileTypes:true});manifest.files=manifest.files.filter(f=>!f.path.startsWith('games/perriland/'));for(const entry of files.filter(e=>e.isFile())){const file=resolve(entry.parentPath,entry.name),path=file.slice(root.length+1).replaceAll('\\','/');manifest.files.push({path,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});}await writeFile(resolve(root,'games/manifest.json'),JSON.stringify(manifest,null,2)+'\n');}
if(process.argv[1]&&resolve(process.argv[1])===import.meta.filename)await updatePerrilandManifest();
