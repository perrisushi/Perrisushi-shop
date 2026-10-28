import {onRequest as proxy} from './api/[[path]].js';
import {gamePath} from '../backend/public-paths.mjs';

// Pages también debe comprobar la sesión antes de entregar recursos de juegos.
export async function onRequest(context){
 let path;try{path=decodeURIComponent(new URL(context.request.url).pathname)}catch{return new Response(null,{status:400})}
 if(!gamePath(path).startsWith('/games/original/'))return context.next();
 const url=new URL('/api/session',context.request.url);
 const response=await proxy({...context,request:new Request(url,{headers:{cookie:context.request.headers.get('cookie')??''}})});
 if(!response.ok)return new Response('No se pudo comprobar tu sesión. Vuelve a intentarlo.',{status:503,headers:{'Cache-Control':'no-store'}});
 let session;try{session=await response.json()}catch{return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}})}
 if(session.authenticated!==true)return new Response(null,{status:303,headers:{Location:'/', 'Cache-Control':'no-store'}});
 const result=await context.next();const headers=new Headers(result.headers);headers.set('Cache-Control','no-store');
 return new Response(result.body,{status:result.status,headers});
}
