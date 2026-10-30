// Reconciliación OFFLINE, sin SQL DML ni conexión a servicios.
// Produce un informe de PROPUESTA y conflictos; nunca autoriza por sí sola una fusión.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pairs,unwrap,validateSchema,assertPrivateOutput,parseExport,legacyPetId} from './prepare-account-merge.mjs';
const resources=new Set('monedas llaves polvo_gema duelo perricita pc espada espada_lv2 espada_lv3 escudo cuchillo collar random_key espada_legendaria escudo_madera escudo_metal escudo_legendario casco_sushi guantes_sushi pechera_sushi pantalones_sushi botas_sushi fragmento_key perri_cofres perri_cofres_minijuego boleto_sorteo1 boleto_sorteo2 mini_sorteo pinza_real chatarra agua_divina espada_sagrada gema_experiencia incubadora_mejorada pocion_divina reloj_cronotiempo saco_chatarra bolsa_gemas bolsa_chatarra cajita_armas bolsa_especial revivir_pet'.split(' '));
const same=(a,b)=>stable(a)===stable(b);
function stable(value){if(Array.isArray(value))return JSON.stringify(value.map(x=>JSON.parse(stable(x))));if(value&&typeof value==='object')return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(stable(value[k]))])));return JSON.stringify(value??null)}
export function sumCounter(a,b,type='integer'){
 const parse=value=>{if(value===undefined||value===null)throw Error('recurso nulo o ausente');if(!/^\d+$/.test(String(value)))throw Error('recurso negativo, decimal o impreciso');if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('entero JS impreciso');return BigInt(value)};
 const total=parse(a)+parse(b);
 const bound={smallint:32767n,integer:2147483647n,bigint:9223372036854775807n}[type];
 if(bound===undefined)throw Error('tipo cuantitativo sin revisar: '+type);
 if(total>bound)throw Error('desbordamiento de '+type);
 return total.toString();
}
export function unionUnique(a=[],b=[]){
 if(!Array.isArray(a)||!Array.isArray(b))throw Error('colección no válida');
 const result=[],seen=new Map();
 for(const value of [...a,...b]){
  const id=value&&typeof value==='object'&&!Array.isArray(value)?value.id??value.logo_id??value.title_id??value.item_id:null;
  const k=id!=null?'id:'+String(id):'value:'+stable(value);
  if(seen.has(k)){if(!same(seen.get(k),value))throw Error('identificador único con contenidos incompatibles: '+String(id));continue}
  seen.set(k,value);result.push(value);
 }
 return result;
}
function difference(a,b,path=''){
 const keys=new Set([...Object.keys(a??{}),...Object.keys(b??{})]),result=[];
 for(const k of keys){
  if(['nick','created_at','updated_at','version'].includes(k)&&!path)continue;
  const p=path?path+'.'+k:k;
  if(same(a?.[k],b?.[k]))continue;
  if(a?.[k]&&b?.[k]&&typeof a[k]==='object'&&typeof b[k]==='object'&&!Array.isArray(a[k])&&!Array.isArray(b[k]))result.push(...difference(a[k],b[k],p));
  else result.push(p);
 }
 return result;
}
export function proposal(input){
 const data=unwrap(input,'merge_data');
 if(data?.format!=='pw2-account-merge-data-v1')throw Error('Exportación de datos no válida');
 const schema=validateSchema(data.diagnostic);
 if(data.expected_catalog_fingerprint!==schema.catalog_fingerprint)throw Error('El esquema cambió entre diagnósticos; repetir la lectura antes de continuar');
 const table=name=>data.tables.find(t=>t.schema==='public'&&t.table===name&&!t.catalog)?.rows??[];
 const catalog=name=>data.tables.find(t=>t.schema==='public'&&t.table===name&&t.catalog)?.rows??[];
 const conflicts=[],report=[];
 const flag=(pair,table,reason,extra={})=>conflicts.push({pair:pair.keep,table,reason,...extra});
 for(const pair of pairs){
  const own=name=>table(name).filter(r=>r.nick===pair.keep||r.nick===pair.remove);
  const row=(name,nick)=>{const rows=table(name).filter(r=>r.nick===nick);if(rows.length>1)flag(pair,name,'más de una fila por nick');return rows[0]};
  const keepInv=row('shop_inventories',pair.keep),removeInv=row('shop_inventories',pair.remove);
  const inventory={beforeKeep:keepInv??null,beforeRemove:removeInv??null,afterProposed:{}};
  const invColumns=schema.catalog.tables.find(t=>t.schema_name==='public'&&t.table_name==='shop_inventories')?.columns??[];
  if(!keepInv||!removeInv)flag(pair,'shop_inventories','falta inventario: no inferir ceros ni crear uno silenciosamente');
  else for(const c of invColumns){
   if(['nick','updated_at'].includes(c.name))continue;
   if(!resources.has(c.name)){flag(pair,'shop_inventories','columna no clasificada; no sumar automáticamente',{column:c.name});continue}
   try{inventory.afterProposed[c.name]=sumCounter(keepInv[c.name],removeInv[c.name],c.type)}
   catch(e){flag(pair,'shop_inventories',e.message,{column:c.name})}
  }
  for(const nick of [pair.keep,pair.remove]){
   const player=row('shop_players',nick);
   if(!player)flag(pair,'shop_players','falta jugador original; no crear ni reactivar al fusionar',{nick});
   else if(player.active===false)flag(pair,'shop_players','jugador desactivado; requiere decisión explícita',{nick});
  }
  for(const [name,field]of [['shop_rpg_equipment','slot'],['shop_rpg_loadout','item_id']]){
   const rows=own(name),keys=new Set(rows.map(r=>r[field]));
   for(const key of keys){
    const a=rows.find(r=>r.nick===pair.keep&&r[field]===key),b=rows.find(r=>r.nick===pair.remove&&r[field]===key);
    if(a&&b&&difference(a,b).length)flag(pair,name,'selección de equipo/loadout incompatible; conservar objetos y decidir configuración sin exceder límites',{key});
   }
  }
  const accessKeep=row('shop_access',pair.keep),accessRemove=row('shop_access',pair.remove);
  if(!accessKeep?.traditional_password_present)flag(pair,'shop_access','la cuenta superviviente no tiene contraseña tradicional comprobable');
  if(accessKeep?.active===false||accessRemove?.active===false)flag(pair,'shop_access','hay una cuenta desactivada; no reactivar al fusionar');
  if(accessKeep&&accessRemove&&Boolean(accessKeep.is_admin)!==Boolean(accessRemove.is_admin))flag(pair,'shop_access','privilegios administrativos distintos; conservar privilegios del superviviente, nunca aplicar OR',{column:'is_admin',survivingPrivilege:Boolean(accessKeep.is_admin)});
  const accessFields=['free_cards_day','free_duelo_day','daily_pass_season_id','daily_pass_claimed_days','daily_pass_last_claim_day'];
  for(const field of accessFields)if(!same(accessKeep?.[field],accessRemove?.[field]))flag(pair,'shop_access','estado diario/temporada diferente; conservar límites sin conceder recompensas repetidas',{column:field});
  const kp=row('shop_profiles',pair.keep),rp=row('shop_profiles',pair.remove),profile={};
  for(const field of ['owned_logo_ids','achievements','owned_title_ids','titles']){
   if(kp?.[field]===undefined&&rp?.[field]===undefined)continue;
   try{profile[field]=unionUnique(kp?.[field]??[],rp?.[field]??[])}catch(e){flag(pair,'shop_profiles',e.message,{column:field})}
  }
  for(const field of ['karma','selected_title_id'])if(kp?.[field]&&rp?.[field]&&!same(kp[field],rp[field]))flag(pair,'shop_profiles','valores distintos; no sumar ni descartar títulos/estados',{column:field});
  profile.selected_logo_id=kp?.selected_logo_id??rp?.selected_logo_id??null;
  if(profile.selected_logo_id&&!profile.owned_logo_ids?.includes(profile.selected_logo_id))flag(pair,'shop_profiles','Perrilogo seleccionado no figura entre los poseídos');
  const quantities={};
  for(const name of ['shop_perripet_inventory','shop_rpg_inventory']){
   const rows=own(name),groups=new Map();quantities[name]=[];
   for(const r of rows){if(!groups.has(r.item_id))groups.set(r.item_id,[]);groups.get(r.item_id).push(r)}
   for(const [id,items]of groups){
    if(items.length>2||new Set(items.map(i=>i.nick)).size!==items.length){flag(pair,name,'filas duplicadas del mismo identificador',{itemId:id});continue}
    try{
     const quantityType=schema.catalog.tables.find(t=>t.schema_name==='public'&&t.table_name===name)?.columns.find(c=>c.name==='quantity')?.type;
     let total=items.map(i=>i.quantity).reduce((sum,q)=>sumCounter(sum,q,quantityType),'0');
     if(name==='shop_rpg_inventory'){
      const item=catalog('shop_rpg_catalog').find(c=>c.item_id===id);
      if(!item)throw Error('objeto sin catálogo; propiedad/cantidad sin clasificar');
      if(item.max_quantity==='1'){
       if(items.some(i=>BigInt(i.quantity)>1n))throw Error('objeto único con cantidad incoherente');
       total=items.some(i=>BigInt(i.quantity)>0n)?'1':'0';
      }else if(BigInt(total)>BigInt(item.max_quantity))throw Error('la suma supera max_quantity; no recortar ni perder unidades');
     }
     quantities[name].push({itemId:id,before:items.map(i=>({nick:i.nick,quantity:i.quantity})),afterProposed:total});
    }catch(e){flag(pair,name,e.message,{itemId:id})}
   }
  }
  for(const name of ['shop_perripet_states','shop_rpg_combat_state','perri_casillas_games']){
   const a=row(name,pair.keep),b=row(name,pair.remove);
   if(a&&b){const paths=difference(a,b);if(paths.length)flag(pair,name,'progresos incompatibles: requiere regla específica; nunca elegir el mayor nivel ni concatenar tableros',{paths})}
   if(name==='shop_perripet_states'&&(a||b))flag(pair,name,'revisar recursos espejo, cápsulas/criaturas y precedencia del inventario; no sumar instantánea e inventario');
  }
  const legacy=table('shop_operations').filter(r=>r.operation_id===legacyPetId(pair.keep)||(r.nick===pair.keep||r.nick===pair.remove)&&(r.action==='perripet_state'||r.legacy_pet_snapshot));
  if(legacy.length)flag(pair,'shop_operations','PerriPet usa también almacenamiento antiguo derivado del nick normalizado; revisar antes de reatribuir',{records:legacy.length,ownerMismatch:legacy.some(r=>r.nick!==pair.keep&&r.nick!==pair.remove)});
  const google=own('pw2_google_links');
  if(new Set(google.map(r=>r.auth_user_id)).size>1)flag(pair,'pw2_google_links','dos identidades Google no caben en el vínculo único del superviviente');
  const snapshotTime=Date.parse(data.captured_at);
  if(!Number.isFinite(snapshotTime))throw Error('Fecha de diagnóstico inválida; no calcular validez con la hora del ordenador');
  const tickets={};
  for(const nick of [pair.keep,pair.remove]){
   const rows=table('shop_random_key_tickets').filter(r=>r.nick===nick);
   tickets[nick]={total:rows.length,activeAndUnexpired:rows.filter(r=>r.status==='Activa'&&Date.parse(r.expires_at)>snapshotTime).length,
    expired:rows.filter(r=>Number.isFinite(Date.parse(r.expires_at))&&Date.parse(r.expires_at)<=snapshotTime).length,
    ids:rows.map(r=>r.id)};
  }
  const counts={};
  for(const t of data.tables.filter(t=>!t.catalog)){
   const owned=t.rows.filter(r=>[r.nick,r.assigned_to,r.redeemed_by].some(v=>v===pair.keep||v===pair.remove));
   if(owned.length)counts[t.schema+'.'+t.table]={beforeKeep:owned.filter(r=>[r.nick,r.assigned_to,r.redeemed_by].includes(pair.keep)).length,beforeRemove:owned.filter(r=>[r.nick,r.assigned_to,r.redeemed_by].includes(pair.remove)).length,recordsToPreserve:owned.length,identifiers:owned.map(r=>r.id??r.operation_id??r.chest_id??r.ledger_id??r.invite_id).filter(v=>v!==undefined)};
  }
  report.push({pair,inventory,profileUnionProposed:profile,quantities,randomKeyTicketValidity:tickets,recordCounts:counts,representationWarning:'No sumar tickets/cofres del historial por segunda vez a los contadores de inventario; conservar IDs, estados y caducidades originales.',credentials:'conservar hash exacto del superviviente sin exportarlo',sessions:'revocar ambas; no reactivarlas al restaurar'});
 }
 const integrity=data.integrity_review;
 if(integrity?.duplicate_key_groups?.length)conflicts.push({reason:'claves de juegos repetidas o atribuidas a propietarios distintos; revisar IDs sin conceder otra recompensa',groups:integrity.duplicate_key_groups});
 for(const pair of integrity?.resources??[]){
  for(const [resource,values]of Object.entries(pair.resources??{}))if(values.negative_input||values.exceeds_integer)conflicts.push({pair:pair.keep_nick,resource,reason:'contador negativo o desbordamiento en el diagnóstico SQL'});
 }
 const triggers=schema.catalog.triggers.filter(t=>t.enabled!=='D');
 if(triggers.length)conflicts.push({reason:'revisar disparadores antes de emitir DML; una transacción no revierte efectos externos',triggers:triggers.map(t=>({schema:t.schema_name,table:t.table_name,name:t.name}))});
 const reviewed=new Set(['shop_players','shop_access','shop_inventories','shop_profiles','shop_public_users','shop_perripet_inventory','shop_rpg_inventory','shop_perripet_states','shop_rpg_combat_state','perri_casillas_games','shop_sessions','shop_activity','shop_notifications','shop_random_key_tickets','shop_random_key_claims','shop_random_key_pool','shop_inventory_chests','shop_perri_chests','shop_account_activation_links','shop_access_requests','shop_chat_messages','shop_chat_presence','shop_operations','shop_rpg_ledger','shop_rpg_equipment','shop_rpg_loadout','pw2_google_links','pw2_oauth_flows','shop_logo_catalog','shop_rpg_catalog','shop_perripet_item_catalog']);
 for(const t of data.tables.filter(t=>!t.catalog&&t.rows.length)){
  if(t.schema!=='public'||!reviewed.has(t.table))conflicts.push({table:t.schema+'.'+t.table,reason:'tabla adicional con referencias o coincidencias: revisar todas sus columnas, claves y cascadas'});
 }
 return {format:'pw2-account-merge-proposal-v1',catalogFingerprint:schema.catalog_fingerprint,status:'NOT_AUTHORIZED_FOR_EXECUTION',capturedAt:data.captured_at,triggerReview:data.trigger_review??[],integrityReview:data.integrity_review??null,pairs:report,conflicts,notice:'DESPUÉS PROPUESTO, no datos fusionados. Falta revisar el diagnóstico real, resolver conflictos y generar la migración transaccional específica y su restauración.'};
}
async function main(){
 const [file,output]=process.argv.slice(2);if(!file||!output)throw Error('Uso: node tools/account-merge-report.mjs DATOS.json INFORME_PRIVADO.json');
 const report=proposal(parseExport(await readFile(resolve(file),'utf8'),'merge_data'));
 await writeFile(assertPrivateOutput(output),JSON.stringify(report,null,2),'utf8');
 console.log('Informe privado generado. Conflictos detectados: '+report.conflicts.length+'. No se ha ejecutado ni autorizado ninguna fusión.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1});
