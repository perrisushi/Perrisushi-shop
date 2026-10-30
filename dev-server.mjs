// Servidor LOCAL solo para vista previa. No usar como backend productivo.
import http from 'node:http';
import {serveSite} from './backend/site.mjs';
import { readFile,stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import {fileURLToPath} from 'node:url';
const HOST='127.0.0.1';
const PORT=Number(process.env.PORT ?? 4173);
const ROOT=resolve(import.meta.dirname);
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.mp3':'audio/mpeg','.json':'application/json; charset=utf-8'};
export function createFrontendServer({apiTarget=process.env.API_TARGET??'http://127.0.0.1:4177',authenticate}={}){
 const target=new URL(apiTarget);
 if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.pathname!=='/'||target.username||target.password||target.search||target.hash)throw Error('API_TARGET debe ser un backend loopback HTTP');
 const site=serveSite({root:ROOT,authenticate:authenticate??(async req=>{
  const response=await fetch(new URL('/api/session',target),{headers:{cookie:req.headers.cookie??''},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Session unavailable');
  return (await response.json()).authenticated===true;
 })});
 return http.createServer(async (request,response)=>{
  if(request.url?.startsWith('/api/')){
    if(!['GET','POST'].includes(request.method)){response.writeHead(405);response.end();return}
    const headers={};for(const name of ['cookie','origin','content-type','x-csrf-token','sec-fetch-site'])if(request.headers[name])headers[name]=request.headers[name];
    headers.host=target.host;
    const upstream=http.request(new URL(request.url,target),{method:request.method,headers,timeout:12000},incoming=>{
      const returned={};for(const name of ['content-type','cache-control','set-cookie','x-csrf-token','x-content-type-options','x-request-id','server-timing'])if(incoming.headers[name])returned[name]=incoming.headers[name];
      if(incoming.statusCode===303&&request.url?.startsWith('/api/auth/google/callback?')&&/^\/\?google=(?:login|linked|register|google_failed|google_cancelled|google_expired|google_conflict|account_inactive|session_expired|google_unavailable)#(?:home|profile)$/.test(incoming.headers.location??''))returned.location=incoming.headers.location;
      response.writeHead(incoming.statusCode??502,returned);incoming.pipe(response);
    });
    upstream.on('timeout',()=>upstream.destroy());
    upstream.on('error',()=>{if(!response.headersSent){response.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({error:'backend_unavailable'}))}else response.destroy()});
    request.on('aborted',()=>upstream.destroy());request.pipe(upstream);return;
  }
  return site(request,response);
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))createFrontendServer().listen(PORT,HOST,()=>{console.log(`PerriWeb 2.0 (solo desarrollo): http://${HOST}:${PORT}`);});
