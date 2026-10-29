// Cloudflare Pages: únicamente /api/*; claves Supabase exclusivamente en Railway.
export async function onRequest({request,env}){
 const incoming=new URL(request.url);
 const unavailable=()=>Response.json({error:'backend_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 let backend;try{backend=new URL(env.PERRIWEB_BACKEND_ORIGIN);if(backend.protocol!=='https:'||backend.pathname!=='/'||backend.search||backend.hash||backend.username||backend.password)throw Error()}catch{return unavailable()}
 if(!env.PERRIWEB_PROXY_SECRET||env.PERRIWEB_PROXY_SECRET.length<32)return unavailable();
 if(!['GET','POST'].includes(request.method))return new Response(null,{status:405});
 const maxBody=incoming.pathname==='/api/games/action'?1048576:4096;
 if(Number(request.headers.get('content-length')??0)>maxBody)return new Response(null,{status:413});
 const headers=new Headers();for(const key of ['cookie','origin','content-type','x-csrf-token','sec-fetch-site'])if(request.headers.has(key))headers.set(key,request.headers.get(key));
 headers.set('x-perriweb-proxy-secret',env.PERRIWEB_PROXY_SECRET);
 headers.set('x-perriweb-client-ip',request.headers.get('cf-connecting-ip')??'');
 try{
  // Leer con límite evita reenviar cuerpos chunked ilimitados.
  let body;if(request.method==='POST'){const reader=request.body?.getReader();let size=0,parts=[];if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBody){await reader.cancel();return new Response(null,{status:413})}parts.push(value)}body=new Uint8Array(size);let at=0;for(const part of parts){body.set(part,at);at+=part.length}}
  const target=new URL(incoming.pathname+incoming.search,backend);
  if(target.origin!==backend.origin||!target.pathname.startsWith('/api/'))return new Response(null,{status:400});
  const response=await fetch(target,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(response.status>=300&&response.status<400)return unavailable();
  const returned=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});for(const key of ['content-type','set-cookie','x-csrf-token','x-request-id','server-timing'])if(response.headers.has(key))returned.set(key,response.headers.get(key));
  return new Response(response.body,{status:response.status,headers:returned});
 }catch{return unavailable()}
}
