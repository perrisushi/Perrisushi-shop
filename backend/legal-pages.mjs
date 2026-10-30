import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
// El propietario proporciona HTML revisado fuera del build público.
// Sin aprobación explícita, no hay publicación accidental de borradores.
export function createLegalPages({enabled=false,directory}={}){
 const pages=new Map();
 if(enabled){
  if(!directory)throw Error('PW2_LEGAL_DIRECTORY obligatorio para publicar textos revisados');
  for(const [route,file]of [['/api/legal/privacy','privacidad.html'],['/api/legal/terms','condiciones.html']]){
   const html=readFileSync(resolve(directory,file),'utf8');
   if(!html.trim()||/data-legal-(?:draft|required)|Completar antes de publicar/i.test(html))throw Error('Revisar y aprobar los textos legales antes de publicarlos');
   pages.set(route,html);
  }
 }
 return {version:pages.size===2?createHash('sha256').update([...pages.values()].join('\n')).digest('hex'):null,enabled:pages.size===2,matches:url=>['/api/legal/privacy','/api/legal/terms'].includes(String(url).split('?')[0]),handle(req,res){
  const html=pages.get(String(req.url).split('?')[0]);const status=!['GET','HEAD'].includes(req.method)?405:html?200:404;
  res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(req.method==='HEAD'?'':status===200?html:'');
 }};
}
