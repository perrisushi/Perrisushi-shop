// Diagnóstico MANUAL de solo lectura. Nunca imprime identidad ni credenciales.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {createRepository} from '../backend/repository.mjs';
import {matchesPassword} from '../backend/security.mjs';
import {authDiagnostic} from '../backend/traditional-auth.mjs';
import {connectionDiagnostics} from '../backend/connection-diagnostics.mjs';
import {databasePoolOptions} from '../backend/database-config.mjs';

export async function checkAuthSources({repository,pool,nick,password}){
 if(!repository?.configured||typeof nick!=='string'||!nick.trim()||typeof password!=='string'||!password.trim())throw Error('Faltan configuración o credenciales privadas de comprobación');
 const result={mode:'READ ONLY',rest:{},postgres:{configured:Boolean(pool)}};
 let access;
 try{
  access=await repository.canonicalAccess(nick.trim());
  result.rest={reachable:true,accessFound:Boolean(access),active:access?access.active!==false:null,hashFormat:access? /^[a-f0-9]{64}$/i.test(String(access.code_hash??'').trim()):null,passwordMatches:access?matchesPassword(password.trim(),access.code_hash):null};
  if(access){const player=await repository.player(access.nick);result.rest.playerFound=Boolean(player);result.rest.playerActive=player?player.active!==false:null}
  if(repository.probeAccessLookup)result.rest.lookupProbe=await repository.probeAccessLookup(nick.trim());
 }catch(error){result.rest={reachable:false,...authDiagnostic(error)}}
 if(!pool)return result;
 let client;
 try{
  client=await pool.connect();await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='5s'");
  let rows=(await client.query('SELECT nick,code_hash,active FROM public.shop_access WHERE nick=$1 LIMIT 1',[nick.trim()])).rows;
  if(!rows.length)rows=(await client.query('SELECT nick,code_hash,active FROM public.shop_access WHERE lower(nick)=lower($1) LIMIT 2',[nick.trim()])).rows;
  const found=rows.length===1?rows[0]:null;
  result.postgres={configured:true,reachable:true,accessFound:Boolean(found),ambiguous:rows.length>1,passwordMatches:found?matchesPassword(password.trim(),found.code_hash):null,active:found?found.active!==false:null};
  if(found){
   const players=await client.query('SELECT active FROM public.shop_players WHERE nick=$1',[found.nick]);
   const sessions=await client.query("SELECT EXISTS(SELECT 1 FROM public.shop_sessions WHERE nick=$1 AND expires_at>now()) AS active_session,has_table_privilege(current_user,'public.shop_sessions','INSERT') AS insert_allowed",[found.nick]);
   Object.assign(result.postgres,{playerFound:players.rows.length===1,playerActive:players.rows.length===1?players.rows[0].active!==false:null,activeSessionExists:sessions.rows[0].active_session,sessionInsertPrivilege:sessions.rows[0].insert_allowed});
   if(result.rest.reachable)result.sourcesAgree=Boolean(access&&access.nick===found.nick&&access.code_hash===found.code_hash&&access.active===found.active);
  }else if(result.rest.reachable)result.sourcesAgree=!access;
  await client.query('ROLLBACK');
 }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});result.postgres={configured:true,reachable:false,failure:['28P01','42501','42P01','42703','3D000','53300','57P03','57014'].includes(error?.code)?error.code:'connection_or_query_failed'}}
 finally{client?.release()}
 return result;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let pool;
 try{
  const nick=process.env.PW2_VERIFY_NICK,password=process.env.PW2_VERIFY_PASSWORD;
  const repository=createRepository({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY});
  if(!repository.configured||!nick||!password)throw Error('missing_config');
  if(process.env.DATABASE_URL){pool=new pg.Pool(databasePoolOptions(process.env,{max:1}));pool.on('error',()=>{})}
  const connections=connectionDiagnostics({supabaseUrl:process.env.SUPABASE_URL,databaseUrl:process.env.DATABASE_URL,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY});
  const result=await checkAuthSources({repository,pool,nick,password});result.connections=connections;
  if(connections.projectMatch==='different'||connections.keyProjectMatch==='different')result.finding='different_projects';
  else if(result.rest.accessFound&&result.rest.lookupProbe&&!result.rest.lookupProbe.oldQuotedExactFound&&!result.rest.lookupProbe.oldQuotedCaseFound)result.finding='quoted_filter_miss_reproduced';
  else if(result.rest.reachable&&!result.rest.accessFound&&result.postgres.reachable&&result.postgres.accessFound)result.finding='rest_visibility_or_configuration_mismatch';
  else if(result.rest.reachable&&!result.rest.accessFound&&result.postgres.reachable&&!result.postgres.accessFound&&!result.postgres.ambiguous)result.finding='not_found_in_visible_records';
  console.log(JSON.stringify(result,null,2));
  if(!result.rest.reachable||!result.rest.passwordMatches||result.rest.active!==true||!result.rest.playerFound||result.rest.playerActive!==true||connections.projectMatch==='different'||connections.keyProjectMatch==='different'||(pool&&(!result.postgres.reachable||result.sourcesAgree!==true)))process.exitCode=1;
 }catch{console.error('No se pudo completar el diagnóstico. Revisa las variables privadas SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PW2_VERIFY_NICK, PW2_VERIFY_PASSWORD y, si procede, DATABASE_URL. No se muestran sus valores.');process.exitCode=1}
 finally{await pool?.end()}
}
