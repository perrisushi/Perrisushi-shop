// Preparación OFFLINE. Nunca conecta a Supabase ni ejecuta SQL.
// Las entradas/salidas con datos reales deben permanecer fuera de Git.
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(import.meta.dirname,'..');
export function assertPrivateOutput(output){
 const out=resolve(output),local=relative(root,out),privateRoot=resolve(root,'private-merge'),insidePrivate=relative(privateRoot,out);
 const inRepository=local===''||(!isAbsolute(local)&&local!=='..'&&!local.startsWith('..'+sep));
 const inPrivate=insidePrivate===''||(!isAbsolute(insidePrivate)&&insidePrivate!=='..'&&!insidePrivate.startsWith('..'+sep));
 if(inRepository&&!inPrivate)throw Error('Dentro del repositorio solo se permiten exportaciones en private-merge, excluido de Git');
 return out;
}
export const pairs=Object.freeze([
 {keep:'Isoldequeen',remove:'isoldequeen'},
 {keep:'Kazzialtime',remove:'KazzialTime'},
 {keep:'Sr_vic_',remove:'Sr_Vic_'}
]);
const infrastructure=new Set(['auth','storage','realtime','extensions','vault','net','graphql','graphql_public','supabase_functions','supabase_migrations','cron','pgsodium','pgsodium_masks','pgbouncer','pw2_merge_backup']);
const secret=/password|code_hash|secret|credential|(^|_)(token|salt|authorization|cookie)(_|$)|^(key|email)$/i;
const reference=/nick|player|owner|assigned_to|redeemed_by|attacker|defender|winner|loser|target_user/i;
const safeText=new Set(['nick','active','game','kind','status','action','item_id','logo_id','selected_logo_id','selected_title_id','karma','free_cards_day','free_duelo_day','daily_pass_season_id','daily_pass_last_claim_day','slot','round_id','chest_type','issued_label','terms_version']);
const safeJson=new Map([
 ['shop_profiles',new Set(['owned_logo_ids','achievements','owned_title_ids','titles'])],
 ['shop_perripet_states',new Set(['pet_state','farm_state','encounters_state'])],
 ['shop_rpg_combat_state',new Set(['player_statuses','enemy_statuses','combat_log'])],
 ['perri_casillas_games',new Set(['cells'])],
 ['shop_chat_messages',new Set(['liked_by_nicks','reactions'])]
]);
const qi=value=>'"'+String(value).replaceAll('"','""')+'"';
const lit=value=>"'"+String(value).replaceAll("'","''")+"'";
const qualified=t=>qi(t.schema_name)+'.'+qi(t.table_name);
const key=t=>t.schema_name+'.'+t.table_name;
export function unwrap(input,field){
 if(Array.isArray(input)){if(input.length!==1)throw Error('Exportar una única fila JSON del diagnóstico');return unwrap(input[0],field)}
 if(input?.[field])return typeof input[field]==='string'?JSON.parse(input[field]):input[field];
 return input;
}

export const legacyPetId=nick=>'perripet-state-'+createHash('sha256').update(nick.trim().toLowerCase()).digest('hex').slice(0,32);
export function parseExport(text,field='diagnostic'){
 const source=String(text).replace(/^\uFEFF/,'').trim();
 if(source.startsWith('{')||source.startsWith('['))return unwrap(JSON.parse(source),field);
 // CSV RFC4180 de UNA columna/celda JSON (exportación del editor SQL).
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(quoted){if(c==='"'&&source[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}
  else if(c==='"'){if(cell.length)throw Error('CSV no válido');quoted=true}
  else if(c===','){row.push(cell);cell=''}
  else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}
  else cell+=c;
 }
 if(quoted)throw Error('CSV incompleto');
 row.push(cell.replace(/\r$/,''));if(row.some(c=>c!==''))rows.push(row);
 if(rows.length!==2||rows[0].length!==1||rows[1].length!==1||rows[0][0]!==field)throw Error('Exportar exactamente una fila y una columna '+field+' en JSON o CSV');
 return unwrap(JSON.parse(rows[1][0]),field);
}

export function validateSchema(input){
 const schema=unwrap(input,'diagnostic');
 if(schema?.format!=='pw2-account-merge-schema-v1'||!schema.catalog?.tables||!schema.catalog_fingerprint)throw Error('Formato de diagnóstico no válido');
 if(!schema.operator?.superuser&&!schema.operator?.bypass_rls)throw Error('No se puede garantizar visibilidad completa con este rol/RLS. No continuar.');
 const wanted=new Set(pairs.map(p=>p.keep.toLowerCase().trim()));
 if(schema.duplicates?.length!==3)throw Error('El diagnóstico no contiene exactamente los tres grupos confirmados; revisar todos los grupos antes de continuar.');
 for(const p of pairs){
  const group=schema.duplicates.find(g=>g.normalized_nick===p.keep.toLowerCase().trim());
  if(!group||group.size!=2||JSON.stringify([...group.nicks].sort())!==JSON.stringify([p.keep,p.remove].sort()))throw Error('Los nicks reales no coinciden exactamente con la pareja aprobada: '+p.keep);
 }
 if(schema.duplicates.some(g=>!wanted.has(g.normalized_nick)))throw Error('Hay duplicados no incluidos en el plan');
 return schema;
}
export function inspectSchema(input){
 const schema=validateSchema(input),tables=schema.catalog.tables.filter(t=>['r','p','f'].includes(t.relkind)&&!infrastructure.has(t.schema_name));
 const triggers=schema.catalog.triggers.filter(t=>tables.some(x=>key(x)===key(t))&&t.enabled!=='D');
 const fks=schema.catalog.constraints.filter(c=>c.kind==='f');
 const reaches=(from,to,seen=new Set())=>{
  if(from===to)return true;if(seen.has(from))return false;seen.add(from);
  return fks.filter(f=>key(f)===from).some(f=>reaches(f.reference_schema+'.'+f.reference_table,to,new Set(seen)));
 };
 const cycles=fks.filter(f=>reaches(f.reference_schema+'.'+f.reference_table,key(f)));
 return {schema,tables,triggers,cycles,cascades:fks.filter(c=>c.on_delete==='c'),foreignTables:tables.filter(t=>t.relkind==='f'),unreadable:tables.filter(t=>!t.can_select),fks};
}
export function safeRowExpression(table,constraints){
 const pk=constraints.find(c=>key(c)===key(table)&&c.kind==='p')?.columns??[];
 const exposed=[],redacted=[];
 for(const c of table.columns){
  if(secret.test(c.name)){redacted.push(c.name);continue}
  const knownJson=safeJson.get(table.table_name)?.has(c.name);
  const include=c.category==='N'||c.category==='B'||c.category==='D'||pk.includes(c.name)||reference.test(c.name)||safeText.has(c.name)||knownJson;
  if(!include){redacted.push(c.name);continue}
  // Los contadores se exportan como texto para no redondear bigint/numeric en JS.
  const value=c.category==='N'?'t.'+qi(c.name)+'::text':'to_jsonb(t.'+qi(c.name)+')';
  exposed.push(lit(c.name),value);
 }
 if(table.table_name==='shop_access'&&table.columns.some(c=>c.name==='code_hash')){
  exposed.push(lit('traditional_password_present'),"(t.code_hash IS NOT NULL AND btrim(t.code_hash) ~* '^[a-f0-9]{64}$')");
 }
 if(table.table_name==='shop_operations'&&table.columns.some(c=>c.name==='response')){
  // El estado antiguo de Pet puede vivir aquí. No exportar otros recibos ni claves.
  exposed.push(lit('legacy_pet_snapshot'),"CASE WHEN t.action='perripet_state' THEN t.response->'snapshot' ELSE NULL END");
 }
 return {expression:exposed.length?'jsonb_build_object('+exposed.join(',')+')':"'{}'::jsonb",redacted};
}
function directPredicate(table){
 const literals=pairs.map(p=>lit(p.keep.toLowerCase())).join(',');
 const checks=[];
 if(table.schema_name==='public'&&table.table_name==='shop_operations')checks.push('t.operation_id IN ('+pairs.map(p=>lit(legacyPetId(p.keep))).join(',')+')');
 for(const c of table.columns){
  if(secret.test(c.name))continue;
  if(c.category==='S')checks.push('lower(btrim(t.'+qi(c.name)+'::text)) IN ('+literals+')');
  if(['json','jsonb'].includes(c.base_type)||c.category==='A'){
   checks.push("EXISTS(SELECT 1 FROM unnest(ARRAY["+literals+"]) n WHERE strpos(lower(coalesce(to_jsonb(t."+qi(c.name)+")::text,'')),n)>0)");
  }
 }
 return checks.length?'('+checks.join(' OR ')+')':'false';
}

export function triggerReviewSql(schema){
 const refs=schema.catalog.triggers.filter(t=>t.schema_name==='public'&&t.enabled!=='D');
 if(!refs.length)return "'[]'::jsonb";
 const names=[...new Set(refs.map(t=>t.function_schema+'.'+t.function_name))];
 return "(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'function',p.proname,'identity_arguments',pg_get_function_identity_arguments(p.oid),'language',l.lanname,'security_definer',p.prosecdef,'source_fingerprint',md5(pg_get_functiondef(p.oid)),'mentions_notifications',p.prosrc ~* 'shop_notifications','mentions_inventory',p.prosrc ~* 'shop_inventories','possible_external_side_effect',p.prosrc ~* '(http_post|http_get|http_request|net[.]|dblink|pg_notify)') ORDER BY n.nspname,p.proname),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE p.prokind='f' AND (n.nspname||'.'||p.proname) IN ("+names.map(lit).join(',')+"))";
}

export async function buildReadOnlyDataSql(input){
 const inspected=inspectSchema(input),{schema,tables,fks}=inspected;
 if(inspected.foreignTables.length)throw Error('Hay tablas externas: revisar antes de ejecutar lecturas remotas');
 if(inspected.unreadable.length)throw Error('El rol no puede leer todas las tablas de aplicación');
 const metadata=(await readFile(resolve(root,'sql/fusion-usuarios/01-diagnostico-solo-lectura.sql'),'utf8')).trim().replace(/;\s*$/,'');
 const subqueries=[];
 function matching(table,alias='t',trail=[]){
  const predicates=[directPredicate(table).replaceAll('t.',alias+'.')];
  const next=[...trail,key(table)];
  for(const fk of fks.filter(c=>key(c)===key(table))){
   const parent=tables.find(t=>t.schema_name===fk.reference_schema&&t.table_name===fk.reference_table);
   if(!parent||!fk.columns?.length)continue;
   const parentAlias='p'+next.length;
   const join=fk.columns.map((c,i)=>parentAlias+'.'+qi(fk.reference_columns[i])+'='+alias+'.'+qi(c)).join(' AND ');
   // Cadenas acíclicas completas. Los ciclos se señalan para revisión explícita.
   const parentMatch=next.includes(key(parent))?directPredicate(parent).replaceAll('t.',parentAlias+'.'):matching(parent,parentAlias,next);
   predicates.push('EXISTS(SELECT 1 FROM '+qualified(parent)+' '+parentAlias+' WHERE '+join+' AND '+parentMatch+')');
  }
  return '('+predicates.join(' OR ')+')';
 }
 for(const table of tables){
  const safe=safeRowExpression(table,schema.catalog.constraints),predicates=[matching(table)];
  const sql="SELECT jsonb_build_object('schema',"+lit(table.schema_name)+",'table',"+lit(table.table_name)+",'redacted_columns',"+lit(JSON.stringify(safe.redacted))+"::jsonb,'rows',coalesce(jsonb_agg(x.safe_row ORDER BY x.safe_row::text),'[]'::jsonb),'count',count(*)::text) AS payload FROM (SELECT "+safe.expression+' AS safe_row FROM '+qualified(table)+' t WHERE '+predicates.join(' OR ')+') x';
  subqueries.push('('+sql+')');
 }
 for(const name of ['shop_rpg_catalog','shop_perripet_item_catalog','shop_logo_catalog']){
  const table=tables.find(t=>t.schema_name==='public'&&t.table_name===name);if(!table)continue;
  const safe=safeRowExpression(table,schema.catalog.constraints);
  subqueries.push("(SELECT jsonb_build_object('schema','public','table',"+lit(name)+",'catalog',true,'rows',coalesce(jsonb_agg("+safe.expression+" ORDER BY "+safe.expression+"::text),'[]'::jsonb),'count',count(*)::text) AS payload FROM "+qualified(table)+' t)');
 }
 const supportsIntegrity=schema.catalog.tables.some(t=>t.schema_name==='public'&&t.table_name==='shop_access'&&t.columns.some(c=>c.name==='is_admin'))&&['shop_inventories','shop_random_key_claims','shop_random_key_pool','shop_inventory_chests','shop_random_key_tickets','shop_sessions','shop_public_users'].every(name=>tables.some(t=>t.schema_name==='public'&&t.table_name===name));
 const integritySql=supportsIntegrity?(await readFile(resolve(root,'sql/fusion-usuarios/04-integridad-solo-lectura.sql'),'utf8')).trim().replace(/;\s*$/,''):null;
 return "-- Generado desde el esquema real. SOLO LECTURA. Mantener este resultado fuera de Git.\nBEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\nWITH metadata AS (\n"+metadata+"\n), records AS (\n"+subqueries.join('\nUNION ALL\n')+"\n)"+(integritySql?", integrity_snapshot AS (\n"+integritySql+"\n)":"")+"\nSELECT jsonb_build_object('format','pw2-account-merge-data-v1','captured_at',transaction_timestamp(),'expected_catalog_fingerprint',"+lit(schema.catalog_fingerprint)+",'diagnostic',(SELECT diagnostic FROM metadata),'trigger_review',"+triggerReviewSql(schema)+",'integrity_review',"+(integritySql?'(SELECT integrity_review FROM integrity_snapshot)':'NULL')+",'tables',coalesce((SELECT jsonb_agg(payload ORDER BY payload->>'schema',payload->>'table') FROM records),'[]'::jsonb)) AS merge_data;\nCOMMIT;\n";
}
export function structureReport(input){
 const info=inspectSchema(input),{schema,tables}=info;
 return {format:'pw2-account-merge-review-v1',pairs,catalogFingerprint:schema.catalog_fingerprint,applicationTables:tables.map(t=>key(t)),
  cascadeForeignKeys:info.cascades.map(c=>({table:key(c),constraint:c.name,reference:c.reference_schema+'.'+c.reference_table})),
  enabledTriggers:info.triggers,cyclicReferences:info.cycles,foreignTables:info.foreignTables.map(key),unreadable:info.unreadable.map(key),
  warning:'Estructura detectada, no aprobada. Revisar disparadores, tablas nuevas, referencias JSON y datos antes de generar DML.'};
}
async function main(){
 const [file,output]=process.argv.slice(2);
 if(!file||!output)throw Error('Uso: node tools/prepare-account-merge.mjs ESQUEMA.json DIRECTORIO_PRIVADO');
 const data=parseExport(await readFile(resolve(file),'utf8'),'diagnostic'),schema=validateSchema(data);
 const out=assertPrivateOutput(output);
 await mkdir(out,{recursive:true});
 await writeFile(resolve(out,'02-datos-solo-lectura.sql'),await buildReadOnlyDataSql(schema),'utf8');
 await writeFile(resolve(out,'revision-estructura.json'),JSON.stringify(structureReport(schema),null,2),'utf8');
 console.log('Preparado diagnóstico de datos de solo lectura. No se ha conectado a ninguna base de datos ni generado una fusión ejecutable.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1});
