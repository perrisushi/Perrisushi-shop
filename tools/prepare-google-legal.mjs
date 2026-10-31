// Preparación local de textos legales. Sin red, publicación ni credenciales.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
const root=resolve(import.meta.dirname,'..');
export const legalFields=[
 ['responsable','Nombre completo o razón social del responsable'],
 ['direccion','Dirección profesional de contacto, solo si procede; puede dejarse vacía'],
 ['email','Correo de contacto y ejercicio de derechos'],
 ['finalidades_y_bases','Finalidades y bases jurídicas que has revisado y aprobado'],
 ['proveedores_y_transferencias','Proveedores reales, ubicación y transferencias/garantías aplicables'],
 ['conservacion','Plazos o criterios de conservación de cuentas, historiales, registros y copias'],
 ['derechos_y_autoridad','Cómo ejercer derechos, tramitar bajas y reclamar ante la autoridad competente'],
 ['ambito_y_menores','Ámbito del servicio, edad de acceso y condiciones aplicables a menores'],
 ['economia_y_sorteos','Condiciones aprobadas de PC, monedas, objetos, sorteos y canjes'],
 ['incidencias_y_cierre','Atención de incidencias, moderación, suspensión y cierre de cuenta'],
 ['otras_condiciones','Propiedad de contenidos, disponibilidad, responsabilidad, cambios y resolución de conflictos']
];
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paragraph=value=>'<p>'+escape(value)+'</p>';
export function validateLegalConfig(config){
 if(config?.aprobado!==true)throw Error('Debes revisar y aprobar el contenido legal antes de preparar su publicación');
 for(const [key,label]of legalFields){
  const value=config[key]??(key==='direccion'?'':undefined);
  if(key==='direccion'&&typeof value==='string'&&!value.trim())continue;
  if(typeof value!=='string'||!value.trim()||value.length>24000||/^(pendiente|por definir|completar|tbd|xxx)$/i.test(value.trim()))throw Error('Falta completar: '+label);
 }
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email.trim()))throw Error('El correo de contacto no es válido');
 return Object.fromEntries([...legalFields.map(([k])=>[k,typeof config[k]==='string'?config[k].trim():'']),['aprobado',true]]);
}
export function buildLegalDocuments(config,templates){
 const c=validateLegalConfig(config);
 const owner=paragraph(c.responsable)+(c.direccion?paragraph(c.direccion):'')+paragraph('Contacto: '+c.email);
 const sections={
  'privacidad.html':[
   '<section><h2>Responsable y contacto</h2>'+owner+'</section>',
   '<section><h2>Finalidades, bases jurídicas y proveedores</h2>'+paragraph(c.finalidades_y_bases)+paragraph(c.proveedores_y_transferencias)+'</section>',
   '<section><h2>Conservación, derechos y menores</h2>'+paragraph(c.conservacion)+paragraph(c.derechos_y_autoridad)+paragraph(c.ambito_y_menores)+'</section>'
  ],
  'condiciones.html':[
   '<section><h2>Prestador y ámbito del servicio</h2>'+owner+paragraph(c.ambito_y_menores)+'</section>',
   '<section><h2>Reglas económicas, incidencias y moderación</h2>'+paragraph(c.economia_y_sorteos)+paragraph(c.incidencias_y_cierre)+'</section>',
   '<section><h2>Otras condiciones</h2>'+paragraph(c.otras_condiciones)+'</section>'
  ]
 };
 const output={};
 for(const file of Object.keys(sections)){
  const template=templates[file];if(typeof template!=='string')throw Error('Falta la plantilla '+file);
  let i=0;const html=template.replace(/<section data-legal-required>[\s\S]*?<\/section>/g,()=>{
   if(!sections[file][i])throw Error('La plantilla legal cambió; revisar antes de continuar');
   return sections[file][i++];
  }).replace(/\sdata-legal-draft\b/g,'').replace('</style>','p{white-space:pre-line}</style>');
  if(i!==3||/data-legal-(draft|required)|Completar antes de publicar/i.test(html))throw Error('El documento conserva apartados sin aprobar: '+file);
  output[file]=html;
 }
 return output;
}
export async function prepareLegalFiles(config,{output=resolve(root,'backend/legal-reviewed'),templatesDirectory=resolve(root,'docs/google-auth/legal')}={}){
 const templates={};
 for(const file of ['privacidad.html','condiciones.html'])templates[file]=await readFile(resolve(templatesDirectory,file),'utf8');
 const documents=buildLegalDocuments(config,templates),directory=resolve(output);
 // No reemplazar una versión ya publicada o revisada.
 for(const file of Object.keys(documents)){
  try{await access(resolve(directory,file));throw Error('Ya existe '+file+'. Elige otro directorio para la nueva versión.')}
  catch(error){if(error.code!=='ENOENT')throw error}
 }
 await mkdir(directory,{recursive:true});
 for(const [file,html]of Object.entries(documents))await writeFile(resolve(directory,file),html,{encoding:'utf8',flag:'wx'});
 return directory;
}
async function main(){
 const args=process.argv.slice(2);let config;
 const outputIndex=args.indexOf('--output');
 const output=outputIndex>=0?args[outputIndex+1]:undefined;
 if(outputIndex>=0&&(!output||output.startsWith('--')))throw Error('Indica un directorio después de --output');
 if(args.includes('--interactive')){
  const reader=createInterface({input:process.stdin,output:process.stdout});
  try{
   console.log('PerriWeb: preparación local de Política de Privacidad y Condiciones.');
   console.log('No se publicará nada. No escribas contraseñas o claves. Una respuesta por línea.');
   config={};
   for(const [key,label]of legalFields)config[key]=await reader.question(label+': ');
   console.log('Se incorporarán estos datos a las plantillas que están en docs/google-auth/legal.');
   const answer=await reader.question('¿Has revisado y aprobado esos datos y el contenido de las plantillas? Escribe APRUEBO: ');
   config.aprobado=answer.trim()==='APRUEBO';
  }finally{reader.close()}
 }else{
  const file=args.find((a,i)=>!a.startsWith('--')&&(outputIndex<0||i!==outputIndex+1));
  if(!file)throw Error('Uso: npm run legal:prepare -- --interactive (o indicar un archivo JSON de datos aprobados)');
  config=JSON.parse(await readFile(resolve(file),'utf8'));
 }
 const directory=await prepareLegalFiles(config,output?{output}:{});
 console.log('Documentos preparados en '+directory);
 console.log('Abre privacidad.html y condiciones.html, revisa su contenido y guarda esos archivos antes de activar PW2_LEGAL_PUBLISHED.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1});
