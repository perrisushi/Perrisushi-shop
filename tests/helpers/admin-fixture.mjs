// Fixture exclusivamente local: jamás utiliza variables o conexiones de producción.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {digest,sessionKey} from '../../backend/security.mjs';
import {createAdministration} from '../../backend/administration.mjs';
export async function adminFixture(){
 const db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
 await db.exec((await readFile(new URL('../fixtures/game-schema.sql',import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec('ALTER TABLE shop_access ADD COLUMN is_admin boolean NOT NULL DEFAULT false');
 const names=['Perrisushi','Usuario','perrisushi','Cuenta con nombre largo de prueba'];
 for(const n of names){await db.query('INSERT INTO shop_players(nick) VALUES($1)',[n]);await db.query('INSERT INTO shop_access(nick,code_hash,is_admin) VALUES($1,$2,$3)',[n,digest('clave-local-pruebas'),n==='Perrisushi']);await db.query('INSERT INTO shop_inventories(nick,pc,polvo_gema) VALUES($1,100,25)',[n]);await db.query('INSERT INTO shop_public_users(nick,pc) VALUES($1,100)',[n]);await db.query('INSERT INTO shop_profiles(nick) VALUES($1)',[n]);}
 const admin={nick:'Perrisushi',token:'a'.repeat(43)},user={nick:'Usuario',token:'b'.repeat(43)};
 for(const u of [admin,user])await db.query("INSERT INTO shop_sessions(token,nick,expires_at) VALUES($1,$2,now()+interval '1 day')",[sessionKey(u.token),u.nick]);
 await db.query("UPDATE shop_logo_catalog SET name='Búho' WHERE logo_id='logo-buho-1'");
 let tail=Promise.resolve();const pool={connect:async()=>{const previous=tail;let release;tail=new Promise(r=>release=r);await previous;return {query:(...args)=>db.query(...args),release}}};
 const diagnostics=[],administration=createAdministration({pool,onDiagnostic:e=>diagnostics.push(e)});
 const one=async(sql,args)=>JSON.parse(JSON.stringify((await db.query(sql,args)).rows[0]??null));
 const repository={configured:true,access:n=>one('SELECT nick,code_hash,active FROM shop_access WHERE nick=$1',[n]),accessStatus:n=>one('SELECT nick,active FROM shop_access WHERE nick=$1',[n]),adminAccess:n=>one('SELECT nick,active,is_admin FROM shop_access WHERE nick=$1',[n]),player:n=>one('SELECT nick,active FROM shop_players WHERE nick=$1',[n]),session:t=>one('SELECT token,nick,expires_at FROM shop_sessions WHERE token=$1',[t]),createSession:r=>db.query('INSERT INTO shop_sessions(token,nick,expires_at) VALUES($1,$2,$3)',[r.token,r.nick,r.expires_at]),deleteSession:t=>db.query('DELETE FROM shop_sessions WHERE token=$1',[t]),profile:n=>one('SELECT * FROM shop_profiles WHERE nick=$1',[n]),inventory:n=>one('SELECT * FROM shop_inventories WHERE nick=$1',[n]),logos:async()=>(await db.query('SELECT * FROM shop_logo_catalog WHERE enabled=true')).rows,page:async(kind,n)=>kind==='users'?(await db.query('SELECT * FROM shop_public_users ORDER BY pc DESC,nick')).rows:kind==='notifications'?(await db.query('SELECT id,kind,title,message,payload,read_at,created_at FROM shop_notifications WHERE nick=$1 AND read_at IS NULL ORDER BY created_at DESC',[n])).rows:[]};
 return {db,admin,user,pool,administration,repository,diagnostics};
}

