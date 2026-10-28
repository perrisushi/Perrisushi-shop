import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {publicPattern,gamePath,gameHtml} from './public-paths.mjs';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.mp3':'audio/mpeg','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
export function serveSite({root=resolve(import.meta.dirname,'../dist')}={}){
 const manifest=readFile(resolve(root,'games/manifest.json'),'utf8').then(text=>new Set(JSON.parse(text).files.map(f=>'/'+f.path))).catch(()=>new Set());
 return async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
  let path;try{path=decodeURIComponent(new URL(req.url,'http://local').pathname)}catch{res.writeHead(400);res.end();return}
  if(path==='/')path='/index.html';
  path=gamePath(path);const isGame=(await manifest).has(path);
  if(!publicPattern.test(path)&&!isGame){res.writeHead(404);res.end();return}
  try{let file=await readFile(resolve(root,'.'+path));if(isGame&&extname(path)==='.html')file=Buffer.from(gameHtml(file.toString(),path.endsWith('/index-production.html')));res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream','Content-Length':file.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':isGame?'SAMEORIGIN':'DENY',...(isGame?{'Content-Security-Policy':"default-src 'self' data: blob:; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'"}:{})});res.end(req.method==='HEAD'?undefined:file)}catch{res.writeHead(404);res.end()}
 }
}
