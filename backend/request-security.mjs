// La autoridad es la configuración del propietario, nunca Host/X-Forwarded-*.
export function publicOrigin(value){
 let url;try{url=new URL(value)}catch{throw Error('PUBLIC_ORIGIN debe ser un origen HTTP(S) válido')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('PUBLIC_ORIGIN debe contener solo protocolo y dominio, sin rutas ni credenciales');
 return url.origin;
}

export function canonicalSiteRedirect(req,configuredOrigin){
 if(!['GET','HEAD'].includes(req.method))return null;
 const canonical=new URL(configuredOrigin);
 if(canonical.protocol!=='https:')return null;
 let path;try{path=new URL(req.url,'http://local')}catch{return null}
 if(!['/','/index.html'].includes(path.pathname))return null;
 const host=req.headers.host;
 if(typeof host!=='string'||!/^([a-z0-9.-]+)(:\d+)?$/i.test(host))return null;
 const incoming=new URL('https://'+host);
 const alias=canonical.hostname.startsWith('www.')?canonical.hostname.slice(4):'www.'+canonical.hostname;
 if(incoming.hostname!==alias||incoming.port!==canonical.port)return null;
 return canonical.origin+path.pathname+path.search;
}
