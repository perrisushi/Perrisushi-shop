// Infraestructura de pruebas LOCAL. Nunca se importa desde el servidor de producción.
import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {digest} from '../backend/security.mjs';import {BackendError} from '../backend/repository.mjs';
export async function perrilandFixture(){const db=new PGlite();await db.exec(`
CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE TABLE shop_players(nick text PRIMARY KEY,active boolean DEFAULT true);
CREATE TABLE shop_access(nick text PRIMARY KEY,active boolean DEFAULT true,is_admin boolean DEFAULT false,code_hash text);
CREATE TABLE shop_sessions(token text PRIMARY KEY,nick text,expires_at timestamptz,created_at timestamptz,updated_at timestamptz);
CREATE TABLE shop_inventories(nick text PRIMARY KEY,pc integer NOT NULL,updated_at timestamptz DEFAULT now());
CREATE TABLE shop_public_users(nick text PRIMARY KEY,pc integer,updated_at timestamptz DEFAULT now());
CREATE TABLE shop_profiles(nick text PRIMARY KEY,selected_logo_id text,owned_logo_ids jsonb,cosmetics jsonb);
CREATE TABLE shop_activity(id bigserial PRIMARY KEY,nick text,game text,result text,details text,created_at timestamptz);
CREATE TABLE shop_operations(operation_id text PRIMARY KEY,nick text,action text,response jsonb,created_at timestamptz);
-- Catálogos vacíos para los controles administrativos reales en las pruebas HTTP.
CREATE TABLE shop_notifications(id bigint PRIMARY KEY);
CREATE TABLE shop_logo_catalog(logo_id text PRIMARY KEY);
CREATE TABLE pw2_community_controls(scope text PRIMARY KEY CHECK(scope IN ('announcement','shop','raffles','PerriPet','PerriRPG','PerriCasillas','PerriDuelos')),active boolean NOT NULL,message text DEFAULT '',version integer DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE test_bans(nick text PRIMARY KEY);
CREATE FUNCTION pw2_assert_account_available(n text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM test_bans WHERE nick=n) THEN RAISE EXCEPTION 'account_banned';END IF;END $$;
`);await db.exec(await readFile(new URL('../sql/006-perriland.sql',import.meta.url),'utf8'));
for(const nick of ['Alpha','Beta','Perrisushi']){const logo=nick==='Beta'?'logo-buho-1':nick==='Perrisushi'?'logo-perrisushi-adm':'logo-pelusa-1';await db.query('INSERT INTO shop_players(nick) VALUES($1)',[nick]);await db.query('INSERT INTO shop_access(nick,is_admin,code_hash) VALUES($1,$2,$3)',[nick,nick==='Perrisushi',digest('perriland-local-test')]);await db.query('INSERT INTO shop_inventories(nick,pc) VALUES($1,100)',[nick]);await db.query('INSERT INTO shop_public_users(nick,pc) VALUES($1,100)',[nick]);await db.query('INSERT INTO shop_profiles VALUES($1,$2,$3,$4)',[nick,logo,JSON.stringify([logo]),JSON.stringify({ownedBackgroundIds:['fondo-logo-basico'],ownedFrameIds:['marco-logo-basico'],selectedBackgroundId:'fondo-logo-basico',selectedFrameId:'marco-logo-basico'})]);}
let lease=null;const pool={async connect(){const client={async query(sql,args){if(sql.includes('pg_try_advisory_lock')){if(lease&&lease!==client)return {rows:[{acquired:false}]};lease=client;return {rows:[{acquired:true}]};}if(sql.includes('pg_advisory_unlock')){if(lease===client)lease=null;return {rows:[{released:true}]};}return db.query(sql,args??[]);},release(){if(lease===client)lease=null;}};return client;}};
const one=async(sql,args)=>(await db.query(sql,args)).rows[0]??null;
const repository={configured:true,access:n=>one('SELECT * FROM shop_access WHERE nick=$1',[n]),adminAccess:n=>one('SELECT * FROM shop_access WHERE nick=$1',[n]),player:n=>one('SELECT * FROM shop_players WHERE nick=$1',[n]),profile:n=>one('SELECT * FROM shop_profiles WHERE nick=$1',[n]),inventory:n=>one('SELECT * FROM shop_inventories WHERE nick=$1',[n]),logos:async()=>[],async createSession(r){await db.query('INSERT INTO shop_sessions(token,nick,expires_at,created_at) VALUES($1,$2,$3,$4)',[r.token,r.nick,r.expires_at,r.created_at]);},session:async k=>{const r=await one('SELECT * FROM shop_sessions WHERE token=$1',[k]);return r?{...r,expires_at:new Date(r.expires_at).toISOString()}:null;},async deleteSession(k){await db.query('DELETE FROM shop_sessions WHERE token=$1',[k]);}};
const moderation={enabled:true,async enforceWithClient(c,n){try{await c.query('SELECT pw2_assert_account_available($1)',[n]);}catch(error){if(error.message.includes('account_banned'))throw new BackendError(403,'account_banned');throw error;}},async check(n){const c=await pool.connect();try{await this.enforceWithClient(c,n);}finally{c.release();}},async service(scope){if((await one('SELECT active FROM pw2_community_controls WHERE scope=$1',[scope]))?.active)throw new BackendError(503,'service_maintenance');}};
return {db,pool,repository,moderation,async enable(value=true){await db.query("UPDATE pw2_community_controls SET active=$1 WHERE scope='PerriLand'",[!value]);},async close(){await db.close();}};
}
