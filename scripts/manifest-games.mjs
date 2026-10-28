import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
const root=resolve('games/original'),files=[];
for(const entry of await readdir(root,{recursive:true,withFileTypes:true}))if(entry.isFile()&&/\.(html|js|css|png|jpg|jpeg|webp|svg|mp3|json|woff2?|ttf|wasm)$/i.test(entry.name)){
 const file=resolve(entry.parentPath,entry.name);files.push({path:'games/original/'+relative(root,file).replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(file)).digest('hex')});
}
await writeFile('games/manifest.json',JSON.stringify({source:'Copias locales de los minijuegos originales',files},null,2));console.log('Recursos originales incluidos: '+files.length);
