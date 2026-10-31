import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {createGoogleAuth,createGoogleProvider} from './google-auth.mjs';
import {createLegalPages} from './legal-pages.mjs';
import {createRepository} from './repository.mjs';
import {createBackend} from './app.mjs';
import {serveSite} from './site.mjs';
import {createEconomy} from './economy.mjs';
import {createGames} from './games.mjs';
import pg from 'pg';
import legacyGames from './games-original.cjs';
import {publicOrigin,canonicalSiteRedirect} from './request-security.mjs';
import {connectionDiagnostics} from './connection-diagnostics.mjs';
import {gamesEnabled} from './game-readiness.mjs';
import {databasePoolOptions} from './database-config.mjs';
const allowSessionWrites=process.env.ALLOW_SUPABASE_SESSION_WRITES==='true';
const production=process.env.NODE_ENV==='production';
const googleTestOnly=process.env.PW2_GOOGLE_ENABLED==='true'&&process.env.PW2_GOOGLE_TEST_MODE!=='false';
const repository=createRepository({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,allowSessionWrites});
const economy=createEconomy({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,enabled:process.env.PW2_ECONOMY_ENABLED==='true',rafflePrice:Number(process.env.PW2_RAFFLE_PRICE),raffleMax:Number(process.env.PW2_RAFFLE_MAX)});
let gamePool;
const enableGames=gamesEnabled(process.env.PW2_GAMES_ENABLED,Boolean(process.env.DATABASE_URL));
const sources=connectionDiagnostics({supabaseUrl:process.env.SUPABASE_URL,databaseUrl:process.env.DATABASE_URL,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY});
if(process.env.DATABASE_URL){gamePool=new pg.Pool(databasePoolOptions(process.env));gamePool.on('error',()=>console.error('La conexión de juegos no está disponible'))}
const games=createGames({pool:gamePool,legacy:legacyGames,enabled:enableGames,sourceCompatible:sources.projectMatch!=='different',onDiagnostic:event=>console.log(JSON.stringify(event))});
if(production&&!process.env.PUBLIC_ORIGIN)throw Error('PUBLIC_ORIGIN obligatorio en producción');
const configuredOrigin=publicOrigin(process.env.PUBLIC_ORIGIN??'http://127.0.0.1:4173');
const legal=createLegalPages({enabled:process.env.PW2_LEGAL_PUBLISHED==='true'&&!googleTestOnly,directory:process.env.PW2_LEGAL_DIRECTORY});
const authSecret=process.env.CSRF_SECRET??randomBytes(32).toString('hex');
let google;
if(process.env.PW2_GOOGLE_ENABLED==='true'){
 const testOnly=googleTestOnly;
 const registrationEnabled=!testOnly&&process.env.PW2_GOOGLE_REGISTRATION_ENABLED==='true';
 if(!repository.configured||!gamePool||sources.projectMatch==='different'||sources.keyProjectMatch==='different'||!allowSessionWrites||process.env.SESSION_STORE!=='supabase')throw Error('Google requiere PostgreSQL del mismo proyecto y sesiones persistentes habilitadas');
 google=createGoogleAuth({pool:gamePool,origin:configuredOrigin,secret:authSecret,termsVersion:legal.version,registrationEnabled,provider:createGoogleProvider({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY,origin:configuredOrigin,testOnly,testEmail:process.env.PW2_GOOGLE_TEST_EMAIL}),onDiagnostic:event=>console.log(JSON.stringify(event))});
}
const handler=createBackend({repository,economy,games,google,legalPublished:legal.enabled,publicOrigin:configuredOrigin,sessionStore:process.env.SESSION_STORE??'memory',production,allowSessionWrites,proxySecret:process.env.PERRIWEB_PROXY_SECRET, ...(production?{csrfSecret:process.env.CSRF_SECRET}:{csrfSecret:authSecret}),onAuthDiagnostic:event=>console.log(JSON.stringify(event)),onMetric:metric=>{if(process.env.BACKEND_METRICS==='true')console.log(JSON.stringify(metric))}});
const site=serveSite({authenticate:handler.authenticate});
const server=http.createServer((req,res)=>{
 if(req.url==='/healthz'){res.writeHead(repository.configured?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ready:repository.configured}));return}
 if(legal.matches(req.url))return legal.handle(req,res);
 if(req.url?.startsWith('/api/'))return handler(req,res);
 const canonical=canonicalSiteRedirect(req,configuredOrigin);
 if(canonical){res.writeHead(307,{'Location':canonical,'Cache-Control':'no-store'});res.end();return}
 return site(req,res);
});
server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=32;
server.listen(Number(process.env.PORT??process.env.BACKEND_PORT??4177),production?'0.0.0.0':'127.0.0.1',()=>{console.log(JSON.stringify({event:'auth_connection_configuration',...connectionDiagnostics({supabaseUrl:process.env.SUPABASE_URL,databaseUrl:process.env.DATABASE_URL,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY})}));console.log(`PerriWeb: ${repository.configured?'configurado':'backend no configurado'}; sesiones ${process.env.SESSION_STORE??'memory'}`)});
