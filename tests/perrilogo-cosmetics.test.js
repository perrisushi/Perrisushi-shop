import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';import http from 'node:http';
import {adminFixture} from './helpers/admin-fixture.mjs';import {createCommunity} from '../backend/community.mjs';import {EDITABLE_RESOURCES} from '../backend/administration.mjs';import {installedCosmetics} from '../backend/cosmetics.mjs';import {PERRILOGO_CATALOG} from '../src/services/perrilogo-catalog.js';import {renderPerrilogo} from '../src/services/perrilogo.js';import {createGames} from '../backend/games.mjs';import {createGoogleAuth,oauthToken} from '../backend/google-auth.mjs';import {createBackend} from '../backend/app.mjs';
const failure=code=>e=>e.code===code,sql=await readFile('sql/005-perrilogos-capas.sql','utf8');
async function use(work,cosmetics=true){const f=await adminFixture({extended:true,cosmetics});f.community=createCommunity({pool:f.pool,moderation:f.moderation,cosmeticsEnabled:cosmetics,resources:EDITABLE_RESOURCES});try{await work(f)}finally{await f.db.close()}}
const state=f=>f.community.read(f.user,'cosmetics');const profile=async(f,nick='Usuario')=>(await f.db.query('SELECT * FROM shop_profiles WHERE nick=$1',[nick])).rows[0];
const product=async(f,id)=>(await f.db.query('SELECT * FROM pw2_store_products WHERE reward_id=$1',[id])).rows[0];
const buy=async(f,id,key=randomUUID())=>{const p=await product(f,id);return f.community.execute(f.user,'store-buy',{id:p.id,expectedVersion:p.version,idempotencyKey:key})};
const funds=f=>f.db.exec("UPDATE shop_inventories SET pc=20000 WHERE nick='Usuario';UPDATE shop_public_users SET pc=20000 WHERE nick='Usuario'");

test('recursos: 26 originales PNG 850×850 con transparencia y SHA256 idéntico; un marco fuera de catálogo',async()=>{
 const manifest=JSON.parse(await readFile('docs/perrilogos-recursos.json','utf8'));assert.equal(manifest.length,26);
 for(const i of manifest){const bytes=await readFile('.'+i.src);assert.equal(bytes.readUInt32BE(16),850);assert.equal(bytes.readUInt32BE(20),850);assert.equal(createHash('sha256').update(bytes).digest('hex'),i.sha256);assert.equal(i.transparency,true)}
 assert.equal(PERRILOGO_CATALOG.filter(i=>i.origin==='shop').length,6);assert.equal(PERRILOGO_CATALOG.find(i=>i.id==='marco-logo-metalg').active,false);
 const markup=renderPerrilogo({logo:'logo-buho-1'});assert.equal((markup.match(/class="perrilogo-layer"/g)??[]).length,3);assert.ok(markup.indexOf('data-layer="background"')<markup.indexOf('data-layer="logo"'));assert.ok(markup.indexOf('data-layer="logo"')<markup.indexOf('data-layer="frame"'));
});

test('005: predeterminados para todos, exclusivo solo Perrisushi, idempotencia y selección no forzada',()=>use(async f=>{
 const before=await profile(f,'Perrisushi');assert.ok(before.owned_logo_ids.includes('logo-perrisushi-adm'));assert.equal(before.selected_logo_id,'logo-pelusa-1');
 await f.db.exec(sql);await f.db.exec(sql);for(const p of (await f.db.query('SELECT * FROM shop_profiles')).rows){assert.deepEqual(p.cosmetics.ownedBackgroundIds,['fondo-logo-negro']);assert.deepEqual(p.cosmetics.ownedFrameIds,['marco-basico']);assert.equal(p.owned_logo_ids.filter(i=>i==='logo-perrisushi-adm').length,p.nick==='Perrisushi'?1:0)}
 assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_store_products')).rows[0].n,6);assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_store_purchases')).rows[0].n,0);
}));

test('005 conserva eventos legítimos, elección anterior, cuentas, saldos y economía',()=>use(async f=>{
 await f.db.exec("UPDATE shop_profiles SET owned_logo_ids=owned_logo_ids||'[\"logo-perriweb1\"]',selected_logo_id='logo-perriweb1' WHERE nick='Usuario'");
 const snapshot=async()=>({profiles:(await f.db.query('SELECT nick,selected_logo_id,owned_logo_ids,karma,achievements FROM shop_profiles ORDER BY nick')).rows,inventory:(await f.db.query('SELECT to_jsonb(i) row FROM shop_inventories i ORDER BY nick')).rows,accounts:(await f.db.query('SELECT to_jsonb(a) row FROM shop_access a ORDER BY nick')).rows});
 const before=await snapshot();await f.db.exec(sql);const expected=structuredClone(before);expected.profiles.find(p=>p.nick==='Perrisushi').owned_logo_ids.push('logo-perrisushi-adm');assert.deepEqual(await snapshot(),expected);const fresh=createCommunity({pool:f.pool,moderation:f.moderation,cosmeticsEnabled:true,resources:EDITABLE_RESOURCES});assert.ok((await fresh.read(f.user,'cosmetics')).owned.logo.includes('logo-perriweb1'));
},false));

test('005 retira antiguos productos Logo sin perder compras ni recibos',()=>use(async f=>{
 const id=randomUUID(),receipt=randomUUID();await f.db.query("INSERT INTO pw2_store_products(id,name,category,reward_type,reward_id,quantity,currency,price,enabled,hidden) VALUES($1,'Histórico','logos','logo','logo-buho-1',1,'pc',10,true,false)",[id]);await f.db.query("INSERT INTO pw2_store_purchases(id,product_id,nick,snapshot) VALUES($1,$2,'Usuario','{\"price\":10}')",[receipt,id]);
 await f.db.exec(sql);const p=(await f.db.query('SELECT * FROM pw2_store_products WHERE id=$1',[id])).rows[0];assert.equal(p.enabled,false);assert.equal(p.hidden,true);assert.equal((await f.db.query('SELECT snapshot FROM pw2_store_purchases WHERE id=$1',[receipt])).rows[0].snapshot.price,10);
},false));

test('nuevas cuentas: perfil por inicialización diferida, sin requerir visitar tienda ni duplicar perfil explícito',()=>use(async f=>{
 await f.db.exec("BEGIN;INSERT INTO shop_players(nick) VALUES('Nueva');INSERT INTO shop_access(nick,code_hash) VALUES('Nueva','local');COMMIT;");const p=await profile(f,'Nueva');assert.ok(p.cosmetics.ownedFrameIds.includes('marco-basico'));
 await f.db.exec("BEGIN;INSERT INTO shop_players(nick) VALUES('Explícita');INSERT INTO shop_access(nick,code_hash) VALUES('Explícita','local');INSERT INTO shop_profiles(nick) VALUES('Explícita');COMMIT;");assert.equal((await f.db.query("SELECT count(*)::int n FROM shop_profiles WHERE nick='Explícita'")).rows[0].n,1);
}));

for(const kind of ['background','frame'])test('compra '+kind+': PC exactos, propiedad permanente, no equipamiento y reintento simultáneo único',()=>use(async f=>{
 await funds(f);const id=kind==='background'?'fondo-logo-cuadricula':'marco-logo-planta',before=await state(f),key=randomUUID();const results=await Promise.all([buy(f,id,key),buy(f,id,key)]);assert.equal(results[0].acquired,id);assert.deepEqual(results[0],results[1]);
 assert.equal((await f.repository.inventory('Usuario')).pc,20000-(kind==='background'?500:1500));const after=await state(f);assert.deepEqual(after.selected,before.selected);assert.ok(after.owned[kind].includes(id));await assert.rejects(buy(f,id),failure('already_owned'));
 assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_store_purchases')).rows[0].n,1);assert.equal(after.owned[kind].filter(i=>i===id).length,1);
}));

test('compra: falta de PC, deshabilitado, precio manipulado y fallo de entrega/recibo no cobran',()=>use(async f=>{
 const id='fondo-logo-piedra',p=await product(f,id);await assert.rejects(buy(f,id),failure('insufficient_balance'));await funds(f);await f.db.query('UPDATE pw2_store_products SET enabled=false WHERE id=$1',[p.id]);await assert.rejects(buy(f,id),failure('product_unavailable'));await f.db.query('UPDATE pw2_store_products SET enabled=true WHERE id=$1',[p.id]);
 await assert.rejects(f.community.execute(f.user,'store-buy',{id:p.id,expectedVersion:1,idempotencyKey:randomUUID(),price:0}),failure('invalid_request'));
 for(const constraint of ["ALTER TABLE shop_profiles ADD CONSTRAINT reject_cosmetics CHECK(NOT (cosmetics->'ownedBackgroundIds' ? 'fondo-logo-piedra'))","ALTER TABLE shop_operations ADD CONSTRAINT reject_cosmetics CHECK(action<>'store-buy')"]){
  await f.db.exec(constraint);await assert.rejects(buy(f,id),failure('community_unavailable'));assert.equal((await f.repository.inventory('Usuario')).pc,20000);assert.ok(!(await state(f)).owned.background.includes(id));await f.db.exec('ALTER TABLE '+(constraint.includes('shop_profiles')?'shop_profiles':'shop_operations')+' DROP CONSTRAINT reject_cosmetics');
 }
 assert.equal((await f.db.query('SELECT count(*)::int n FROM pw2_store_purchases')).rows[0].n,0);
}));

test('equipamiento: cambia una sola capa, conserva las demás, selección entre dispositivos y recarga',()=>use(async f=>{
 await funds(f);await buy(f,'fondo-logo-basico');await buy(f,'marco-logo-metalico');const initial=await state(f);await f.community.equip(f.user,{layer:'background',id:'fondo-logo-basico'});let s=await state(f);assert.equal(s.selected.logo,initial.selected.logo);assert.equal(s.selected.frame,initial.selected.frame);
 await f.community.equip(f.user,{layer:'frame',id:'marco-logo-metalico'});s=await state(f);assert.equal(s.selected.background,'fondo-logo-basico');assert.equal(s.selected.logo,initial.selected.logo);assert.ok(s.owned.frame.includes('marco-basico'));
 const another=createCommunity({pool:f.pool,moderation:f.moderation,cosmeticsEnabled:true,resources:EDITABLE_RESOURCES});assert.deepEqual((await another.read(f.user,'cosmetics')).selected,s.selected);
 await f.db.exec(sql);assert.deepEqual((await state(f)).selected,s.selected);
}));

test('equipar inexistente, no obtenido, evento o administrativo ajeno se rechaza en servidor',()=>use(async f=>{
 for(const [layer,id] of [['background','fondo-logo-cuadricula'],['frame','marco-logo-2026'],['logo','logo-perriweb1'],['frame','no-existe'],['logo','logo-perrisushi-adm']])await assert.rejects(f.community.equip(f.user,{layer,id}),e=>['cosmetic_not_owned','exclusive_cosmetic'].includes(e.code));
 await assert.rejects(f.community.equip(f.user,{layer:'frame',id:'marco-basico',nick:'Perrisushi'}),failure('invalid_request'));
 const admin=f.admin;await f.community.equip(admin,{layer:'logo',id:'logo-perrisushi-adm'});await f.community.equip(admin,{layer:'logo',id:'logo-pelusa-1'});assert.ok((await f.community.read(admin,'cosmetics')).owned.logo.includes('logo-perrisushi-adm'));
}));

test('exclusividad: ni catálogo/SQL ni herramienta administrativa genérica distribuyen especiales',()=>use(async f=>{
 for(const id of ['logo-perrisushi-adm','logo-perriweb1'])await assert.rejects(f.administration.execute(f.admin,{action:'logo',operationId:randomUUID(),target:'Usuario',logoId:id,grant:true,expectedOwned:false,reason:'Local',confirmed:true}),failure('exclusive_cosmetic'));
 for(const [category,type,id] of [['logos','logo','logo-perrisushi-adm'],['frames','frame','marco-logo-2026'],['backgrounds','background','fondo-logo-negro']]){
  await assert.rejects(f.administration.execute(f.admin,{action:'product',operationId:randomUUID(),id:randomUUID(),expectedVersion:null,confirmed:true,reason:'Local',name:'No permitido',category,rewardType:type,rewardId:id,quantity:1,price:1,stock:null,enabled:true,hidden:false}),e=>['exclusive_cosmetic','invalid_reward'].includes(e.code));
  await assert.rejects(f.db.query('INSERT INTO pw2_store_products(id,name,category,reward_type,reward_id,quantity,currency,price,enabled,hidden) VALUES($1,$2,$3,$4,$5,1,$6,1,true,false)',[randomUUID(),'No permitido',category,type,id,'pc']),e=>e.code==='23514');
 }
 await assert.rejects(f.db.exec("UPDATE shop_profiles SET owned_logo_ids=owned_logo_ids||'[\"logo-perrisushi-adm\"]' WHERE nick='Usuario'"),/exclusive_cosmetic/);
}));

test('catálogo: seis precios exactos, sin gratuitos/eventos/Logos; administración conserva edición y disponibilidad',()=>use(async f=>{
 const items=(await f.community.read(f.user,'store')).items;assert.equal(items.length,6);assert.equal(items.filter(p=>p.category==='backgrounds'&&p.price===500&&p.currency==='pc').length,3);assert.equal(items.filter(p=>p.category==='frames'&&p.price===1500&&p.currency==='pc').length,3);assert.ok(items.every(p=>['background','frame'].includes(p.reward_type)));
 const p=items[0];await f.administration.execute(f.admin,{action:'product',operationId:randomUUID(),id:p.id,expectedVersion:p.version,confirmed:true,reason:'Pausa de venta',name:p.name,category:p.category,rewardType:p.reward_type,rewardId:p.reward_id,quantity:1,price:p.price,stock:null,enabled:false,hidden:false});assert.equal((await product(f,p.reward_id)).enabled,false);await f.db.exec(sql);assert.equal((await product(f,p.reward_id)).enabled,false);
}));

test('sanciones y mantenimiento: comprar bloqueado; equipar colección sigue permitido en mantenimiento de tienda',()=>use(async f=>{
 await funds(f);await f.db.exec("INSERT INTO pw2_community_controls(scope,active,message) VALUES('shop',true,'Local')");await assert.rejects(buy(f,'fondo-logo-basico'),failure('service_maintenance'));await f.community.equip(f.user,{layer:'frame',id:'marco-basico'});
 await f.db.exec("UPDATE pw2_community_controls SET active=false WHERE scope='shop'");await f.administration.execute(f.admin,{action:'moderation',operationId:randomUUID(),target:'Usuario',mode:'temporary',durationSeconds:900,expectedSanctionId:null,reason:'Local',confirmed:true});await assert.rejects(buy(f,'fondo-logo-basico'),e=>['session_expired','account_suspended'].includes(e.code));
}));

test('cofres originales: normales obtenibles con misma probabilidad y eventos/admin excluidos, colección preservada',()=>use(async f=>{
 process.env.SUPABASE_URL='https://only-local.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='LOCAL';const {default:legacy}=await import('../backend/games-original.cjs');const games=createGames({pool:f.pool,moderation:f.moderation,legacy,enabled:true});await f.db.exec("UPDATE shop_inventories SET perri_cofres=30 WHERE nick IN ('Usuario','Perrisushi')");
 const oldRandom=Math.random;Math.random=()=>0;try{for(let n=0;n<18;n++){const r=await games.execute(f.user,{action:'publicShopOpenInventoryChest',chestType:'perriCofres',chestOpenId:'server',idempotencyKey:randomUUID()});assert.equal(r.ok,true,JSON.stringify(r));assert.ok(!(r.rewardBundle?.rewards??[]).some(i=>['logo-perriweb1','logo-perrisushi-adm'].includes(i.logoId)))}const r=await games.execute(f.admin,{action:'publicShopOpenInventoryChest',chestType:'perriCofres',chestOpenId:'server',idempotencyKey:randomUUID()});assert.equal(r.ok,true)}finally{Math.random=oldRandom}
 const owned=(await profile(f)).owned_logo_ids;assert.ok(owned.length>1);assert.ok(!owned.includes('logo-perriweb1'));assert.ok(!owned.includes('logo-perrisushi-adm'));assert.ok((await profile(f,'Perrisushi')).owned_logo_ids.includes('logo-perrisushi-adm'));
 const source=await readFile('backend/games-original.cjs','utf8');assert.match(source,/PERRI_CHEST_LOGO_CHANCE = 30/);assert.match(source,/!\['logo-perriweb1','logo-perrisushi-adm'\]\.includes\(logo.id\)/);
}));

test('usuarios: composición persistida por lote, sin consultas por usuario ni exposición de colecciones',()=>use(async f=>{
 await funds(f);await buy(f,'marco-logo-planta');await f.community.equip(f.user,{layer:'frame',id:'marco-logo-planta'});const data=await f.community.compositions(f.user,['Usuario','Perrisushi']);assert.equal(data.Usuario.frame,'marco-logo-planta');assert.deepEqual(Object.keys(data.Usuario).sort(),['background','frame','logo']);
}));

test('Google: registro existente inicializa defaults, no admin; conserva unicidad e inicio tradicional',()=>use(async f=>{
 await f.db.exec('CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY)');await f.db.exec(await readFile('sql/002-google-auth.sql','utf8'));const id=randomUUID();await f.db.query('INSERT INTO auth.users VALUES($1)',[id]);const google=createGoogleAuth({pool:f.pool,moderation:f.moderation,origin:'https://perrisushi.com',secret:'s'.repeat(40),provider:{authorize:()=> 'https://local.invalid',exchange:async()=>id}});
 const flow=oauthToken((await google.start()).cookie);await google.callback(flow,'local');const pending=await google.pending(flow);await google.register(flow,pending.csrf,'GoogleNueva');const p=await profile(f,'GoogleNueva');assert.deepEqual(p.cosmetics.ownedFrameIds,['marco-basico']);assert.ok(!p.owned_logo_ids.includes('logo-perrisushi-adm'));
}));

test('instalación: detecta 005 completa, rechaza trigger ausente; columna ajena aborta sin tocar saldos',()=>use(async f=>{
 assert.equal(await installedCosmetics(f.pool),false);await f.db.exec('ALTER TABLE shop_profiles ADD COLUMN cosmetics jsonb');await assert.rejects(f.db.exec(sql),/origen desconocido/);await f.db.exec('ROLLBACK');await f.db.exec('ALTER TABLE shop_profiles DROP COLUMN cosmetics');await f.db.exec(sql);assert.equal(await installedCosmetics(f.pool),true);await f.db.exec('DROP TRIGGER pw2_profile_cosmetics_defaults ON shop_profiles');await assert.rejects(installedCosmetics(f.pool),/005/);
},false));


test('HTTP: sesión y CSRF obligatorios, sin identidad de cliente ni recurso administrativo ajeno',()=>use(async f=>{
 const server=http.createServer(createBackend({repository:f.repository,moderation:f.moderation,administration:f.administration,community:f.community,sessionStore:'supabase',allowSessionWrites:true,csrfSecret:'s'.repeat(40)}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const request=(path,body,cookie,csrf)=>fetch(origin+'/api'+path,{method:body?'POST':'GET',headers:{Origin:'http://127.0.0.1:4173',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
  const cookie='pw2_session='+f.user.token,session=await request('/session',null,cookie),csrf=session.headers.get('x-csrf-token');
  assert.equal((await request('/profile/cosmetics',{layer:'frame',id:'marco-basico'},cookie)).status,403);
  const bad=await request('/profile/cosmetics',{layer:'logo',id:'logo-perrisushi-adm'},cookie,csrf);assert.equal(bad.status,403);assert.equal((await bad.json()).error,'exclusive_cosmetic');
  assert.equal((await request('/profile/cosmetics',{layer:'frame',id:'marco-basico',nick:'Perrisushi'},cookie,csrf)).status,400);
  assert.equal((await request('/profile/cosmetics',{layer:'frame',id:'marco-basico'},cookie,csrf)).status,200);
  assert.equal((await request('/profile/cosmetics',{layer:'frame',id:'marco-basico'},'pw2_session='+'x'.repeat(43),csrf)).status,401);
  const profileData=await (await request('/profile',null,cookie)).json();assert.equal(profileData.cosmetics.selected.frame,'marco-basico');const users=await (await request('/users',null,cookie)).json();assert.ok(users.items.every(i=>i.perrilogo));assert.ok(users.items.every(i=>!i.ownedFrameIds));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
}));

test('evento histórico de marco: se conserva propiedad y selección; no se concede a otros',()=>use(async f=>{
 await f.db.exec("ALTER TABLE shop_profiles DISABLE TRIGGER pw2_profile_cosmetics_defaults;UPDATE shop_profiles SET cosmetics=cosmetics||'{\"ownedFrameIds\":[\"marco-basico\",\"marco-logo-2026\"],\"selectedFrameId\":\"marco-logo-2026\"}' WHERE nick='Usuario';ALTER TABLE shop_profiles ENABLE TRIGGER pw2_profile_cosmetics_defaults;");
 await f.db.exec(sql);const s=await state(f);assert.equal(s.selected.frame,'marco-logo-2026');assert.ok(s.items.some(i=>i.id==='marco-logo-2026'));await assert.rejects(f.db.exec("UPDATE shop_profiles SET cosmetics=jsonb_set(cosmetics,'{ownedFrameIds}','[\"marco-basico\",\"marco-logo-2026\"]') WHERE nick='Visitante'"),/event_cosmetic_unavailable/);
}));
