// Solo física pura compartida. Nunca empaqueta sala, persistencia, cuentas ni transporte.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,posix} from 'node:path';
const root=resolve(import.meta.dirname,'..');
export async function buildPerrilandPrediction(){
 const ids=['src/config/scene.cjs','src/reused/scene.js','src/reused/weapons.js','src/reused/engine.cjs','src/jetpacks.cjs','public/jetpack-shared.js'];
 const sources=await Promise.all(ids.map(id=>readFile(resolve(root,'backend/perriland/vendor',id),'utf8'))),links={};
 for(let i=0;i<ids.length;i++){links[ids[i]]={};for(const match of sources[i].matchAll(/require\(['"]([^'"]+)['"]\)/g)){const target=posix.normalize(posix.join(posix.dirname(ids[i]),match[1]));if(!ids.includes(target))throw Error('Dependencia de predicción no autorizada: '+target);links[ids[i]][match[1]]=target;}}
 const modules=ids.map((id,i)=>JSON.stringify(id)+':function(module,exports,require){\n'+sources[i]+'\n}').join(',\n');
 const text='/* Generado desde la física pura de PERRILAND. Sin red ni economía. */\n(function(root){\nconst modules={'+modules+'},links='+JSON.stringify(links)+',cache={};\nfunction load(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](module,module.exports,name=>{const target=links[id][name];if(!target)throw Error("Dependencia no autorizada");return load(target)});return module.exports;}\nconst engine=load("src/reused/engine.cjs");root.PerrilandPhysics={World:engine.World,STEP:engine.STEP,scene:load("src/config/scene.cjs"),JetpackSystem:load("src/jetpacks.cjs").JetpackSystem};\n})(globalThis);\n';
 await writeFile(resolve(root,'games/perriland/prediction-physics.js'),text);
}
