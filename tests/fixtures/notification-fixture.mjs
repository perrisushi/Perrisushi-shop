// Base PostgreSQL efímera para verificar notificaciones; no usa credenciales reales.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createRepository} from '../../backend/repository.mjs';
import {digest} from '../../backend/security.mjs';
export const notificationId=n=>'12345678-1234-4234-8234-'+String(n).padStart(12,'0');
export async function notificationFixture(){
 const db=new PGlite();
 const schema=await readFile(new URL('./account-merge-real-structure.sql',import.meta.url),'utf8');
 const table=schema.match(/CREATE TABLE public\."shop_notifications" \([\s\S]*?\n\);/)[0];
 await db.exec(table+'; ALTER TABLE shop_notifications ADD PRIMARY KEY(id);');
 const requests=[];
 const repository=createRepository({url:'https://notifications-local.invalid',key:'LOCAL_ONLY',fetchImpl:async(input,opts)=>{
  const url=new URL(input);if(!url.pathname.endsWith('/shop_notifications'))throw Error('Unexpected table');
  requests.push({method:opts.method,params:Object.fromEntries(url.searchParams),body:opts.body});
  const values=[],clauses=[],param=v=>{values.push(v);return '$'+values.length};
  const owner=url.searchParams.get('nick');if(!owner?.startsWith('eq.'))throw Error('Owner required');clauses.push('nick='+param(owner.slice(3)));
  const read=url.searchParams.get('read_at');if(read==='is.null')clauses.push('read_at IS NULL');else if(read==='not.is.null')clauses.push('read_at IS NOT NULL');else throw Error('State required');
  const id=url.searchParams.get('id');if(id)clauses.push('id='+param(id.slice(3)));
  const cursor=url.searchParams.get('or');if(cursor){const m=cursor.match(/^\(created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.([a-f0-9-]+)\)\)$/);if(!m||m[1]!==m[2])throw Error('Invalid cursor');const t=param(m[1]);clauses.push('(created_at<'+t+' OR (created_at='+t+' AND id<'+param(m[3])+'))')}
  if(opts.method==='PATCH'){
   const data=JSON.parse(opts.body);if(Object.keys(data).join(',')!=='read_at')throw Error('Unexpected update');
   await db.query('UPDATE shop_notifications SET read_at='+param(data.read_at)+' WHERE '+clauses.join(' AND '),values);return new Response(null,{status:204});
  }
  if(opts.method!=='GET'||url.searchParams.get('order')!=='created_at.desc,id.desc')throw Error('Unexpected query');
  // Preserva microsegundos y zona de PostgreSQL al construir el cursor.
  const result=await db.query("SELECT id,kind,title,message,read_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US')||'+00:00' AS created_at FROM shop_notifications WHERE "+clauses.join(' AND ')+' ORDER BY created_at DESC,id DESC LIMIT '+param(Number(url.searchParams.get('limit'))),values);
  return Response.json(result.rows);
 }});
 const add=async({id,nick='Alpha',title='Notificación '+id,message='Contenido original',created='2026-08-13T21:22:09.236422+00:00',read=null})=>db.query('INSERT INTO shop_notifications(id,nick,kind,title,message,created_at,read_at) VALUES($1,$2,\'comunicado\',$3,$4,$5,$6)',[notificationId(id),nick,title,message,created,read]);
 return {db,requests,add,repository:{...repository,accessStatus:async nick=>({nick,active:true}),canonicalAccess:async nick=>['Alpha','Beta'].includes(nick)?{nick,active:true,code_hash:digest('local-only')}:null,access:async nick=>['Alpha','Beta'].includes(nick)?{nick,active:true,code_hash:digest('local-only')}:null,player:async nick=>({nick,active:true}),profile:async()=>({owned_logo_ids:[],achievements:[]}),logos:async()=>[],inventory:async()=>({pc:10,polvo_gema:2})}};
}
