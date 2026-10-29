import {readFileSync} from 'node:fs';
import {X509Certificate} from 'node:crypto';

function certificateBundle(value){
 const pem=String(value).replace(/\\r\\n|\\n/g,'\n').trim();
 const pattern=/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
 const blocks=pem.match(pattern);
 if(!blocks?.length||pem.length>131072||pem.replace(pattern,'').trim())throw Error();
 for(const block of blocks)new X509Certificate(block);
 return pem+'\n';
}

// Única política TLS para el servidor y los verificadores. Nunca permite
// que los parámetros de la URL sustituyan la CA o desactiven la verificación.
export function databasePoolOptions({DATABASE_URL,DATABASE_SSL_CA}={}, {max=4}={}){
 let url;
 try{url=new URL(DATABASE_URL);if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||url.hash)throw Error()}
 catch{throw Object.assign(Error('DATABASE_URL no válida; no se muestra su contenido'),{code:'database_configuration_invalid'})}
 try{
  const ssl={rejectUnauthorized:true};
  const root=url.searchParams.get('sslrootcert');
  if(DATABASE_SSL_CA?.trim())ssl.ca=certificateBundle(DATABASE_SSL_CA);
  else if(root)ssl.ca=certificateBundle(readFileSync(root,'utf8'));
  // Conservar certificados cliente ya configurados, si los hubiera.
  for(const [parameter,key]of [['sslcert','cert'],['sslkey','key']]){
   const file=url.searchParams.get(parameter);if(file)ssl[key]=readFileSync(file,'utf8');
  }
  const negotiation=url.searchParams.get('sslnegotiation');
  if(negotiation&&!['direct','postgres'].includes(negotiation))throw Error();
  for(const name of ['ssl','sslmode','sslrootcert','sslcert','sslkey','uselibpqcompat','sslnegotiation'])url.searchParams.delete(name);
  return {connectionString:url.href,ssl,max,connectionTimeoutMillis:8000,...(negotiation?{sslnegotiation:negotiation}:{})};
 }catch{throw Object.assign(Error('Configuración TLS PostgreSQL no válida. Revisa DATABASE_SSL_CA y los archivos de certificados, sin desactivar la verificación.'),{code:'database_tls_configuration_invalid'})}
}
