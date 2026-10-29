import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createRepository} from '../backend/repository.mjs';
import {createBackend} from '../backend/app.mjs';
import {digest,sessionKey} from '../backend/security.mjs';
import {Readable} from 'node:stream';
import {connectionDiagnostics} from '../backend/connection-diagnostics.mjs';
import {readFile} from 'node:fs/promises';

test('regresión real de valores escalares: eq."nick" da access_not_found; eq.nick recupera la cuenta y su sesión',async()=>{
 const db=new PGlite();const events=[],queries=[];let oldQuotes=true;
 try{
  await db.exec('create table shop_players(nick text primary key,active boolean);create table shop_access(nick text primary key,code_hash text,active boolean);create table shop_sessions(token text primary key,nick text,expires_at timestamptz,created_at timestamptz,updated_at timestamptz);');
  await db.query('insert into shop_players values($1,true)',['Perrisushi']);await db.query('insert into shop_access values($1,$2,true)',['Perrisushi',digest('original-password')]);
  const fetchImpl=async(input,options)=>{
   const url=new URL(input),table=url.pathname.split('/').pop();assert.ok(['shop_players','shop_access','shop_sessions'].includes(table));
   assert.equal(options.headers['Accept-Profile'],'public');
   if(options.method==='POST'){
    const row=JSON.parse(options.body);await db.query('insert into shop_sessions(token,nick,expires_at,created_at,updated_at) values($1,$2,$3,$4,$5)',Object.values(row));return {ok:true};
   }
   let sql=options.method==='DELETE'?'delete from '+table:'select '+url.searchParams.get('select')+' from '+table;
   const values=[],where=[];
   for(const [field,filter]of url.searchParams){if(['select','limit','order'].includes(field))continue;assert.ok(['nick','token'].includes(field));const dot=filter.indexOf('.'),operator=filter.slice(0,dot);let value=filter.slice(dot+1);
    // Regla de filtro SIMPLE PostgREST: no quitar comillas ni JSON.parse(value).
    if(oldQuotes)value='"'+value+'"';
    const op={eq:'=',ilike:'ILIKE',imatch:'~*'}[operator];assert.ok(op);if(operator==='ilike')value=value.replaceAll('*','%');values.push(value);where.push(field+' '+op+' $'+values.length);queries.push({operator,value});
   }
   if(where.length)sql+=' where '+where.join(' and ');if(options.method==='GET')sql+=' limit '+Number(url.searchParams.get('limit'));
   const result=await db.query(sql,values);return {ok:true,json:async()=>JSON.parse(JSON.stringify(result.rows))};
  };
  const repository=createRepository({url:'https://fixture.invalid',key:'LOCAL',allowSessionWrites:true,fetchImpl});
  const backend=createBackend({repository,sessionStore:'supabase',allowSessionWrites:true,onAuthDiagnostic:event=>events.push(event)});
  const login=async nick=>{
   const req=Readable.from([JSON.stringify({nick,password:'original-password'})]);Object.assign(req,{method:'POST',url:'/api/auth/login',headers:{origin:'http://127.0.0.1:4173','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}});
   let status,data,headers;await backend(req,{setHeader:()=>{},writeHead:(s,h)=>{status=s;headers=h},end:b=>{data=JSON.parse(b)}});return {status,data,headers};
  };
  assert.equal((await login('Perrisushi')).status,401);assert.equal(events.at(-1).reason,'access_not_found');
  assert.equal((await db.query("select count(*)::int as n from shop_access where nick='Perrisushi'")).rows[0].n,1);
  oldQuotes=false;queries.length=0;
  const result=await login('  pErRiSuShI  ');assert.equal(result.status,200);assert.equal(result.data.nick,'Perrisushi');assert.equal(events.at(-1).reason,'authenticated');
  assert.deepEqual(queries.slice(0,2),[{operator:'eq',value:'pErRiSuShI'},{operator:'ilike',value:'pErRiSuShI'}]);
  const probe=await repository.probeAccessLookup('Perrisushi');assert.deepEqual(probe,{correctExactFound:true,oldQuotedExactFound:false,oldQuotedCaseFound:false});
  const token=result.headers['Set-Cookie'].split(';')[0].slice('pw2_session='.length);
  assert.equal((await repository.session(sessionKey(token))).nick,'Perrisushi');await repository.deleteSession(sessionKey(token));assert.equal(await repository.session(sessionKey(token)),null);
  assert.equal((await db.query('select count(*)::int as n from shop_access')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from shop_players')).rows[0].n,1);
  await db.exec('create role service_role;grant select on shop_access,shop_players to service_role');
  const sql=(await readFile('sql/diagnostico-access-lectura.sql','utf8')).replaceAll('TU_USUARIO','Perrisushi');
  const reports=await db.exec(sql),counts=reports.find(report=>report.rows[0]?.access_exact!==undefined).rows[0];
  assert.equal(Number(counts.access_exact),1);assert.equal(Number(counts.access_with_added_quotes),0);assert.equal(Number(counts.access_player_link),1);
 }finally{await db.close()}
});

test('URLSearchParams mantiene comillas reales y caracteres reservados como datos sin inyectar filtros',async()=>{
 const names=['A,"B',"O'Neil",'A&B+?nick=eq.Other','Nombre con espacios','a\\b','%_name','a*b'];
 for(const nick of names){
  const requests=[];const repo=createRepository({url:'https://fixture.invalid',key:'LOCAL',fetchImpl:async input=>{const url=new URL(input);requests.push(url);return {ok:true,json:async()=>[{nick,active:true,code_hash:'unused'}]}}});
  assert.equal((await repo.canonicalAccess(' '+nick+' ')).nick,nick);
  assert.equal(requests[0].searchParams.get('nick'),'eq.'+nick);assert.deepEqual([...requests[0].searchParams.keys()],['select','limit','nick']);
 }
});

test('ILIKE literal y regex anclada no convierten _ % ni * de un nick en comodines',async()=>{
 const db=new PGlite();try{
  await db.exec('create table names(nick text)');await db.query('insert into names values($1),($2),($3),($4),($5),($6)',['A_B','AxB','A%B','A*B','AxxB','Otro']);
  for(const input of ['a_b','a%b','a*b']){
   const repo=createRepository({url:'https://fixture.invalid',key:'LOCAL',fetchImpl:async url=>{const filter=new URL(url).searchParams.get('nick'),index=filter.indexOf('.'),op=filter.slice(0,index),value=filter.slice(index+1);const rows=(await db.query('select nick from names where nick '+({eq:'=',ilike:'ILIKE',imatch:'~*'}[op])+' $1',[value])).rows;return {ok:true,json:async()=>rows}}});
   assert.equal((await repo.canonicalAccess(input)).nick.toLowerCase(),input);
  }
 }finally{await db.close()}
});

test('proyecto: URL directa o pooler compara las referencias sin revelar credenciales',()=>{
 const base={supabaseUrl:'https://abc123.supabase.co',serviceKey:'sb_secret_PRIVATE'};
 for(const databaseUrl of ['postgresql://postgres:PRIVATE@db.abc123.supabase.co/postgres','postgresql://postgres.abc123:PRIVATE@aws-1-region.pooler.supabase.com/postgres']){
  const info=connectionDiagnostics({...base,databaseUrl});assert.equal(info.projectMatch,'same');assert.ok(!JSON.stringify(info).includes('PRIVATE'));assert.ok(!JSON.stringify(info).includes('abc123'));
 }
 assert.equal(connectionDiagnostics({...base,databaseUrl:'postgresql://postgres:PRIVATE@db.other.supabase.co/postgres'}).projectMatch,'different');
 assert.equal(connectionDiagnostics({...base,databaseUrl:'postgresql://postgres:PRIVATE@custom.internal/postgres'}).projectMatch,'unknown');
 const jwt='header.'+Buffer.from(JSON.stringify({role:'anon',ref:'other'})).toString('base64url')+'.signature';
 const info=connectionDiagnostics({...base,serviceKey:jwt});assert.equal(info.credentialRoleHint,'anon');assert.equal(info.keyProjectMatch,'different');
});
