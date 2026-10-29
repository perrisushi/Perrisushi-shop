import {BackendError} from './repository.mjs';
import {matchesPassword,newToken,sessionKey} from './security.mjs';

export function authDiagnostic(error){
 const value=error instanceof BackendError?error.diagnostic:null;
 if(!value)return {};
 const result={};
 if(['supabase','application'].includes(value.source))result.source=value.source;
 if(['shop_access','shop_players','shop_sessions'].includes(value.table))result.table=value.table;
 if(['GET','POST','DELETE'].includes(value.method))result.method=value.method;
 if(Number.isInteger(value.httpStatus)&&value.httpStatus>=100&&value.httpStatus<=599)result.upstreamStatus=value.httpStatus;
 if(['42501','42703','42P01','23503','23505','PGRST100','PGRST116','PGRST204','PGRST301','PGRST302','other'].includes(value.upstreamCode))result.upstreamCode=value.upstreamCode;
 if(['timeout','transport','response_shape','ambiguous_nick'].includes(value.failure))result.failure=value.failure;
 return result;
}

export async function authenticateTraditional({repository,nick,password,sessionStore,allowSessionWrites,sessionTtlMs,now,createMemorySession,requestId,onDiagnostic=()=>{}}){
 let stage='access_lookup',reason='query_failed';
 const emit=(outcome,error)=>{try{onDiagnostic({event:'traditional_auth',requestId,stage,outcome,reason,...authDiagnostic(error)})}catch{}};
 const reject=(status,code,why)=>{reason=why;throw new BackendError(status,code)};
 try{
  const access=await (repository.canonicalAccess??repository.access)(nick.trim());
  if(!access){matchesPassword(password.trim(),null);reject(401,'invalid_credentials','access_not_found')}
  stage='access_validation';
  if(typeof access.nick!=='string'||!access.nick.trim())reject(503,'backend_unavailable','invalid_access_record');
  if(access.active===false)reject(401,'invalid_credentials','access_disabled');
  if(access.active!=null&&typeof access.active!=='boolean')reject(503,'backend_unavailable','invalid_active_field');
  stage='password_verification';
  // Igual que el sistema original: trim, SHA-256 UTF-8, sin lower-case ni NFC.
  if(typeof access.code_hash!=='string'||! /^[a-f0-9]{64}$/i.test(access.code_hash.trim()))reject(503,'backend_unavailable','invalid_hash_format');
  if(!matchesPassword(password.trim(),access.code_hash))reject(401,'invalid_credentials','password_mismatch');
  stage='player_lookup';reason='query_failed';
  const player=await repository.player(access.nick);
  if(!player)reject(503,'backend_unavailable','player_missing');
  if(player.active===false)reject(401,'invalid_credentials','player_disabled');
  if(player.active!=null&&typeof player.active!=='boolean')reject(503,'backend_unavailable','invalid_active_field');
  const token=newToken(),row={token:sessionKey(token),nick:access.nick,expires_at:new Date(now()+sessionTtlMs).toISOString(),created_at:new Date(now()).toISOString(),updated_at:new Date(now()).toISOString()};
  stage='session_create';reason='session_write_failed';
  if(sessionStore==='supabase'){
   if(!allowSessionWrites)reject(503,'session_writes_disabled','session_writes_disabled');
   await repository.createSession(row);
   stage='session_readback';reason='session_read_failed';
   const saved=await repository.session(row.token);
   if(!saved||saved.token!==row.token||saved.nick!==row.nick||Date.parse(saved.expires_at)!==Date.parse(row.expires_at))reject(503,'backend_unavailable','session_not_recoverable');
  }else createMemorySession(row);
  stage='complete';reason='authenticated';emit('success');return {token,row};
 }catch(error){
  emit('failure',error);
  if(error instanceof BackendError)throw error;
  throw new BackendError(503,'backend_unavailable');
 }
}
