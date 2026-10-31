import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createGames} from '../../backend/games.mjs';
import {sessionKey} from '../../backend/security.mjs';
export async function rewardFixture({historic=false}={}){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;');
 await db.exec((await readFile('tests/fixtures/game-schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(await readFile('tests/fixtures/game-rpg.sql','utf8'));await db.exec(await readFile('tests/fixtures/game-pet.sql','utf8'));
 const migration=await readFile('sql/003-notificaciones-recompensas.sql','utf8');
 const user={nick:'LocalA',token:'x'.repeat(43)};
 await db.exec("insert into shop_players(nick) values('LocalA'),('LocalB');insert into shop_access(nick,code_hash,active) values('LocalA','test',true),('LocalB','test',true);insert into shop_profiles(nick,selected_logo_id,owned_logo_ids) values('LocalA','logo-buho-1','[\"logo-buho-1\"]');insert into shop_inventories(nick,pc,monedas,polvo_gema,duelo) values('LocalA',10000,10,5000,5),('LocalB',10000,10,5000,5)");
 if(historic)await db.exec("insert into shop_notifications(nick,kind,title,message,read_at) values('LocalA','llaves','Histórico intacto','Texto original',now()),('LocalA','welcome','Bienvenida','Mensaje útil',null),('LocalA','twitch','Directo','Estamos en directo',null)");
 await db.exec(migration);
 await db.query("insert into shop_sessions(token,nick,expires_at) values($1,$2,now()+interval '1 day')",[sessionKey(user.token),user.nick]);
 process.env.SUPABASE_URL='https://only-local.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='LOCAL-TEST-NOT-A-CREDENTIAL';const {default:legacy}=await import('../../backend/games-original.cjs');
 const pool={connect:async()=>({query:(...args)=>db.query(...args),release:()=>{}})};
 return {db,user,pool,legacy,migration,games:createGames({pool,legacy,enabled:true})};
}
