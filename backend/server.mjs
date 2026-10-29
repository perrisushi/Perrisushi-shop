import http from 'node:http';
import {createRepository} from './repository.mjs';
import {createBackend} from './app.mjs';
import {serveSite} from './site.mjs';
import {createEconomy} from './economy.mjs';
import {createGames} from './games.mjs';
import pg from 'pg';
import legacyGames from './games-original.cjs';
import {publicOrigin,canonicalSiteRedirect} from './request-security.mjs';
import {connectionDiagnostics} from './connection-diagnostics.mjs';
const allowSessionWrites=process.env.ALLOW_SUPABASE_SESSION_WRITES==='true';
const production=process.env.NODE_ENV==='production';
const repository=createRepository({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,allowSessionWrites});
const economy=createEconomy({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,enabled:process.env.PW2_ECONOMY_ENABLED==='true',rafflePrice:Number(process.env.PW2_RAFFLE_PRICE),raffleMax:Number(process.env.PW2_RAFFLE_MAX)});
let gamePool;
if(process.env.PW2_GAMES_ENABLED==='true'&&!process.env.DATABASE_URL)throw Error('Falta DATABASE_URL para habilitar los juegos');
if(process.env.DATABASE_URL){let database;try{database=new URL(process.env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(database.protocol)||!database.hostname||database.hash)throw Error()}catch{throw Error('DATABASE_URL no válida; no se muestra su contenido')};database.searchParams.delete('sslmode');gamePool=new pg.Pool({connectionString:database.href,ssl:{rejectUnauthorized:true},max:4,connectionTimeoutMillis:8000});gamePool.on('error',()=>console.error('La conexión de juegos no está disponible'))}
const games=createGames({pool:gamePool,legacy:legacyGames,enabled:process.env.PW2_GAMES_ENABLED==='true'});
if(production&&!process.env.PUBLIC_ORIGIN)throw Error('PUBLIC_ORIGIN obligatorio en producción');
const configuredOrigin=publicOrigin(process.env.PUBLIC_ORIGIN??'http://127.0.0.1:4173');
const handler=createBackend({repository,economy,games,publicOrigin:configuredOrigin,sessionStore:process.env.SESSION_STORE??'memory',production,allowSessionWrites,proxySecret:process.env.PERRIWEB_PROXY_SECRET, ...(process.env.CSRF_SECRET?{csrfSecret:process.env.CSRF_SECRET}:{}),onAuthDiagnostic:event=>console.log(JSON.stringify(event)),onMetric:metric=>{if(process.env.BACKEND_METRICS==='true')console.log(JSON.stringify(metric))}});
const site=serveSite({authenticate:handler.authenticate});
const server=http.createServer((req,res)=>{
 if(req.url==='/healthz'){res.writeHead(repository.configured?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ready:repository.configured}));return}
 if(req.url?.startsWith('/api/'))return handler(req,res);
 const canonical=canonicalSiteRedirect(req,configuredOrigin);
 if(canonical){res.writeHead(307,{'Location':canonical,'Cache-Control':'no-store'});res.end();return}
 return site(req,res);
});
server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=32;
server.listen(Number(process.env.PORT??process.env.BACKEND_PORT??4177),production?'0.0.0.0':'127.0.0.1',()=>{console.log(JSON.stringify({event:'auth_connection_configuration',...connectionDiagnostics({supabaseUrl:process.env.SUPABASE_URL,databaseUrl:process.env.DATABASE_URL,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY})}));console.log(`PerriWeb: ${repository.configured?'configurado':'backend no configurado'}; sesiones ${process.env.SESSION_STORE??'memory'}`)});
