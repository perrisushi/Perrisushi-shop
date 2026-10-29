// Comprobación MANUAL de solo lectura. No abre partidas ni consume recursos.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {inspectGameStorage,gameFailure,gamesEnabled} from '../backend/game-readiness.mjs';
import {connectionDiagnostics} from '../backend/connection-diagnostics.mjs';

export async function checkGames({pool,connections={projectMatch:'unknown'}}={}){
 if(!pool)return {ok:false,reason:'database_not_configured',connections};
 if(connections.projectMatch==='different')return {ok:false,reason:'database_project_mismatch',connections};
 let client;
 try{
  client=await pool.connect();await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='8s'");
  const schema=await inspectGameStorage(client);await client.query('ROLLBACK');
  return {ok:Object.values(schema.games).every(Boolean),reason:Object.values(schema.games).every(Boolean)?'storage_ready':'schema_incomplete',connections,...schema};
 }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return {ok:false,reason:'database_unavailable',failure:gameFailure(error),connections}}
 finally{client?.release()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let pool;
 try{
  const connections=connectionDiagnostics({supabaseUrl:process.env.SUPABASE_URL,databaseUrl:process.env.DATABASE_URL,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY});
  const enabled=gamesEnabled(process.env.PW2_GAMES_ENABLED,Boolean(process.env.DATABASE_URL));
  if(process.env.DATABASE_URL){const url=new URL(process.env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||url.hash)throw Error();url.searchParams.delete('sslmode');pool=new pg.Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:8000});pool.on('error',()=>{})}
  const result=await checkGames({pool,connections});console.log(JSON.stringify({enabled,...result},null,2));if(!enabled||!result.ok)process.exitCode=1;
 }catch{console.error('No se pudo comprobar la configuración de juegos. No se muestran variables privadas.');process.exitCode=1}
 finally{await pool?.end()}
}
