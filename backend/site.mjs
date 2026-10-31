import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {gzip as gzipCallback} from 'node:zlib';
import {promisify} from 'node:util';
import {publicPattern,gamePath,gameHtml} from './public-paths.mjs';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.mp3':'audio/mpeg','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const gzip=promisify(gzipCallback);
export function serveSite({root=resolve(import.meta.dirname,'../dist'),authenticate=async()=>null}={}){
 const manifest=readFile(resolve(root,'games/manifest.json'),'utf8').then(text=>new Set(JSON.parse(text).files.map(f=>'/'+f.path))).catch(()=>new Set());
 const cache=new Map(),pending=new Map();let cacheBytes=0;
 async function load(path,isGame){
  const filename=resolve(root,'.'+path),info=await stat(filename),version=info.mtimeMs+':'+info.size,cached=cache.get(path);
  if(cached?.version===version){cache.delete(path);cache.set(path,cached);return cached}
  const key=path+':'+version;if(pending.has(key))return pending.get(key);
  const work=(async()=>{
   let file=await readFile(filename);if(isGame&&extname(path)==='.html')file=Buffer.from(gameHtml(file.toString(),path.endsWith('/index-production.html')));
   const zipped=/\.(?:html|js|css|svg|json)$/.test(path)&&file.length>1024?await gzip(file):null;
   const entry={version,file,zipped:zipped?.length<file.length?zipped:null,etag:'W/"'+createHash('sha256').update(file).digest('base64url')+'"'};entry.bytes=file.length+(entry.zipped?.length??0);
   if(cache.has(path)){cacheBytes-=cache.get(path).bytes;cache.delete(path)}
   if(entry.bytes<=64*1024*1024){cache.set(path,entry);cacheBytes+=entry.bytes;while(cacheBytes>64*1024*1024){const oldest=cache.keys().next().value;cacheBytes-=cache.get(oldest).bytes;cache.delete(oldest)}}
   return entry;
  })();pending.set(key,work);try{return await work}finally{pending.delete(key)}
 }
 return async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
  let path;try{path=decodeURIComponent(new URL(req.url,'http://local').pathname)}catch{res.writeHead(400);res.end();return}
  if(path==='/')path='/index.html';
  path=gamePath(path);const isGame=(await manifest).has(path);
  if(!publicPattern.test(path)&&!isGame){res.writeHead(404);res.end();return}
  if(isGame){
   try{if(!await authenticate(req)){res.writeHead(303,{'Location':'/','Cache-Control':'no-store'});res.end();return}}
   catch{res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('No se pudo comprobar tu sesión. Vuelve a intentarlo.');return}
  }
  try{
   const entry=await load(path,isGame),compressed=entry.zipped&&/\bgzip\b(?!\s*;\s*q=0(?:\.0*)?(?:\s|,|$))/i.test(req.headers?.['accept-encoding']??''),file=compressed?entry.zipped:entry.file;
   const headers={'Content-Type':types[extname(path)]??'application/octet-stream','Cache-Control':isGame?(extname(path)==='.html'?'no-store':'private, no-cache'):'no-cache',ETag:entry.etag,Vary:isGame?'Cookie, Accept-Encoding':'Accept-Encoding','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':isGame?'SAMEORIGIN':'DENY',...(compressed?{'Content-Encoding':'gzip'}:{}),...(path==='/privacidad.html'?{'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}:{}),...(isGame?{'Content-Security-Policy':"default-src 'self' data: blob:; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'"}:{})};
   if(extname(path)!=='.html'&&String(req.headers?.['if-none-match']??'').split(/\s*,\s*/).includes(entry.etag)){res.writeHead(304,headers);res.end();return}
   res.writeHead(200,{...headers,'Content-Length':file.length});res.end(req.method==='HEAD'?undefined:file);
  }catch{res.writeHead(404);res.end()}
 }
}
