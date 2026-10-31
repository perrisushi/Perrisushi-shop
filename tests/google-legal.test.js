import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildLegalDocuments,legalFields,prepareLegalFiles} from '../tools/prepare-google-legal.mjs';
import {createLegalPages} from '../backend/legal-pages.mjs';
const config=()=>({aprobado:true,...Object.fromEntries(legalFields.map(([key])=>[key,key==='email'?'legal@example.test':'Contenido local revisado para '+key]))});
const templates=async()=>Object.fromEntries(await Promise.all(['privacidad.html','condiciones.html'].map(async file=>[file,await readFile('docs/google-auth/legal/'+file,'utf8')])));
test('Legales Google: exige todos los datos y aprobación, sin inventar responsable',async()=>{
 const t=await templates(),missing=config();missing.responsable='';
 assert.throws(()=>buildLegalDocuments(missing,t),/Nombre completo/);
 assert.throws(()=>buildLegalDocuments({...config(),aprobado:false},t),/aprobar/);
 assert.throws(()=>buildLegalDocuments({...config(),email:'no-correo'},t),/correo/);
});
test('Legales Google: genera ambos documentos completos, escapa contenido y no reemplaza versiones',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pw2-approved-generator-'));
 try{
  const c=config();c.responsable='Responsable local <script>bad()</script>';
  const html=buildLegalDocuments(c,await templates());
  assert.match(html['privacidad.html'],/&lt;script&gt;/);assert.doesNotMatch(html['privacidad.html'],/<script>/);
  for(const file of Object.keys(html))assert.doesNotMatch(html[file],/data-legal-(draft|required)|Completar antes de publicar/i);
  await prepareLegalFiles(c,{output:directory});
  const pages=createLegalPages({enabled:true,directory});assert.equal(pages.enabled,true);assert.ok(pages.version);
  await assert.rejects(prepareLegalFiles(c,{output:directory}),/Ya existe/);
 }finally{for(const file of ['privacidad.html','condiciones.html'])await unlink(join(directory,file));await rmdir(directory)}
});

test('Legales Google: asistente CLI admite JSON y directorio de salida sin publicar',async()=>{
 const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');
 const {fileURLToPath}=await import('node:url');
 const {writeFile,readFile}=await import('node:fs/promises');
 const directory=await mkdtemp(join(tmpdir(),'pw2-legal-cli-')),input=join(directory,'approved.json'),out=join(directory,'reviewed');
 const script=fileURLToPath(new URL('../tools/prepare-google-legal.mjs',import.meta.url));
 try{
  await writeFile(input,JSON.stringify(config()));
  await promisify(execFile)(process.execPath,[script,input,'--output',out]);
  assert.match(await readFile(join(out,'privacidad.html'),'utf8'),/Política de Privacidad/);
  await assert.rejects(promisify(execFile)(process.execPath,[script,join(directory,'missing.json')]),error=>error.stderr.includes('ENOENT'));
 }finally{
  for(const file of ['privacidad.html','condiciones.html'])await unlink(join(out,file));
  await rmdir(out);await unlink(input);await rmdir(directory);
 }
});

test('Legales: la dirección no es una exigencia técnica OAuth; no se inventa ni se exige DNI',async()=>{
 const c=config();delete c.direccion;
 const documents=buildLegalDocuments(c,await templates());
 for(const html of Object.values(documents)){
  assert.match(html,/Responsable local|Contenido local revisado para responsable/);
  assert.match(html,/legal@example.test/);
  assert.doesNotMatch(html,/<p><\/p>|undefined|data-legal-(draft|required)/);
 }
 const professional=buildLegalDocuments({...c,direccion:'Oficina profesional de contacto <local>'},await templates());
 assert.match(professional['privacidad.html'],/Oficina profesional de contacto &lt;local&gt;/);
 assert.throws(()=>buildLegalDocuments({...c,responsable:''},{}),/Nombre completo/);
});
