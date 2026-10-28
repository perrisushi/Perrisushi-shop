// Verifica SOLO lecturas reales. No crea sesiones en BD ni ejecuta cambios personales/económicos.
import {Readable} from 'node:stream';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRepository} from '../backend/repository.mjs';
import {createBackend} from '../backend/app.mjs';

export async function checkLive({url,key,nick,password,fetchImpl=globalThis.fetch}={}){
 if(!url||!key)throw Error('Faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY del servicio Railway existente');
 if(typeof nick!=='string'||!nick.trim()||typeof password!=='string'||!password.trim())throw Error('Falta una cuenta propia autorizada: PW2_VERIFY_NICK y PW2_VERIFY_PASSWORD');
 const methods=[],checks=[];
 const repository=createRepository({url,key,fetchImpl:(target,options)=>{
  if(options.method!=='GET')throw Error('read_only_violation');
  methods.push(options.method);return fetchImpl(target,options);
 }});
 // No utiliza SESSION_STORE del hosting: esta comprobación nunca escribe shop_sessions.
 const origin='http://127.0.0.1:4173';const handle=createBackend({repository,publicOrigin:origin,sessionStore:'memory'});
 let cookie,csrf;
 async function call(route,body){
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  Object.assign(req,{url:'/api'+route,method:body===undefined?'GET':'POST',socket:{remoteAddress:'127.0.0.1'},headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})}});
  let status,data,headers;await handle(req,{writeHead:(s,h)=>{status=s;headers=h},end:text=>{data=JSON.parse(text)}});
  if(status!==200)throw Error(`Comprobación ${route}: ${status} ${data?.error??'request_failed'}`);
  if(headers['Set-Cookie'])cookie=headers['Set-Cookie'].split(';')[0];
  if(headers['X-CSRF-Token'])csrf=headers['X-CSRF-Token'];
  return data;
 }
 const requireCheck=(name,condition)=>{if(!condition)throw Error(`No verificado: ${name}`);checks.push(name)};
 const login=await call('/auth/login',{nick,password});requireCheck('acceso tradicional',login.authenticated===true);
 const session=await call('/session');requireCheck('identidad de sesión',session.authenticated===true&&session.nick===login.nick);
 const profile=await call('/profile');requireCheck('perfil existente',profile.profile!==null&&profile.nick===session.nick);
 requireCheck('colección Perrilogos',Array.isArray(profile.profile.ownedLogoIds)&&Array.isArray(profile.logos));
 const selected=profile.profile.selectedLogoId;
 requireCheck('Perrilogo seleccionado íntegro',selected===null||profile.profile.ownedLogoIds.includes(selected));
 requireCheck('Perrilogo original visible',selected===null||typeof profile.profile.selectedLogoAssetId==='string');
 const sourceProfile=await repository.profile(session.nick);
 requireCheck('sin sustitución del Perrilogo original',sourceProfile?.selected_logo_id==null?selected===null:sourceProfile.selected_logo_id===selected);
 requireCheck('colección original sin pérdidas',JSON.stringify(sourceProfile?.owned_logo_ids)===JSON.stringify(profile.profile.ownedLogoIds));
 const inventory=await call('/inventory');requireCheck('inventario existente',inventory.inventory!==null);
 const sourceInventory=await repository.inventory(session.nick);const {nick:_owner,...sourceValues}=sourceInventory??{};
 requireCheck('cantidades originales sin normalización',JSON.stringify(sourceValues)===JSON.stringify(inventory.inventory));
 requireCheck('saldos personales coherentes',inventory.inventory.pc===profile.balances?.pc&&inventory.inventory.polvo_gema===profile.balances?.gemas);
 for(const kind of ['history','notifications','users']){
  const page=await call('/'+kind+'?limit=2');requireCheck(kind,Array.isArray(page.items)&&page.items.length<=2);
  if(page.nextCursor){const next=await call('/'+kind+'?limit=2&cursor='+encodeURIComponent(page.nextCursor));requireCheck(kind+' paginado',Array.isArray(next.items)&&next.items.length<=2&&!next.items.some(row=>page.items.some(first=>(row.id??row.nick)===(first.id??first.nick))));}
 }
 const random=await call('/shop/random-key?limit=2');requireCheck('Random Key solo lectura',Array.isArray(random.tickets?.items)&&Array.isArray(random.claims?.items)&&random.operationsEnabled===false);
 const raffles=await call('/shop/raffles');requireCheck('Sorteos solo lectura',raffles.operationsEnabled===false&&raffles.tickets!==null);
 await call('/auth/logout',{});requireCheck('cierre de sesión',!(await call('/session')).authenticated);
 requireCheck('cero escrituras a Supabase',methods.every(method=>method==='GET'));
 return {mode:'READ_ONLY',checks,queries:methods.length,supabaseWrites:0,economyEnabled:false,personalWritesVerified:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await checkLive({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,nick:process.env.PW2_VERIFY_NICK,password:process.env.PW2_VERIFY_PASSWORD}),null,2))}
 catch(error){console.error(error.message.startsWith('Falt')||error.message.startsWith('Comprobación')||error.message.startsWith('No verificado')?error.message:'No se pudo verificar la conexión; no se muestran secretos ni registros');process.exitCode=1}
}
