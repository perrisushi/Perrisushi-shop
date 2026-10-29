import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {createRepository} from '../backend/repository.mjs';
import {createBackend} from '../backend/app.mjs';
import {digest} from '../backend/security.mjs';
import {renderLiveInventory,renderLiveUsers,renderLiveShop,setPageData} from '../src/services/live-ui.js';
import {itemDetails,itemCatalog,gameDescriptions} from '../src/services/help-content.js';

test('C1-C8 conserva los bloques y elimina solo los rótulos señalados',async()=>{
 const main=await readFile('src/main.js','utf8');
 for(const term of ['ESTADO DE LA CUENTA','Tu perfil personal','Perrilogo de tu cuenta','Elige tu juego','<span>Jugar</span>','class="eyebrow"'])assert.ok(!main.includes(term),term);
 assert.match(main,/data-action="album"/);assert.match(main,/data-action="history"/);assert.match(main,/data-game-help/);assert.match(main,/class="game-launch"/);
 setPageData('users',{status:'ready',items:[{nick:'Real',pc:8,logoId:'buho-1',achievements:['Logro']}]});
 setPageData('inventory',{status:'ready',inventory:{pc:2,monedas:3,pechera_sushi:4}});
 setPageData('shop',{status:'ready',randomKey:{inventoryRandomKey:1,tickets:{items:[]},claims:{items:[]}},raffles:{tickets:{boleto_sorteo1:0,boleto_sorteo2:2,mini_sorteo:0},operationsEnabled:true,policy:{price:3500,max:3}}});
 const users=renderLiveUsers(),inventory=renderLiveInventory(),shop=renderLiveShop();
 assert.ok(!users.includes('SALA DE USUARIOS'));assert.ok(users.includes('Logro'));
 for(const text of ['MI INVENTARIO','Mis objetos','Selecciona un objeto','pw04-item-info'])assert.ok(!inventory.includes(text));
 assert.ok(inventory.includes('data-live-item="pechera_sushi"'));assert.ok(inventory.includes('>4</span>'));
 assert.ok(!shop.includes('TIENDA DE PERRISUSHI'));assert.ok(!shop.includes('<h2>Tienda'));assert.ok(!shop.includes('Se muestran el estado'));
 assert.ok(shop.includes('Boleto de Sorteo 2: 2'));assert.ok(!shop.includes('Boleto de Sorteo 1:'));assert.ok(!shop.includes('MiniSorteo:'));assert.ok(shop.includes('Comprar boleto'));
});

test('descripciones verificadas no se inventan para objetos desconocidos',async()=>{
 const source=await readFile('games/original/index-production.html','utf8');
 for(const id of ['agua_divina','pocion_divina','pinza_real','gema_experiencia','incubadora_mejorada','cajita_armas'])assert.ok(source.includes(itemDetails(id).description),id);
 for(const id of ['llaves','fragmento_key','cuchillo','collar','saco_chatarra','boleto_sorteo1'])assert.equal(itemDetails(id).description,undefined,id);
 assert.equal(itemDetails('un_objeto_nuevo').description,undefined);
 for(const item of Object.values(itemCatalog))assert.ok(item.name);
 assert.deepEqual(Object.keys(gameDescriptions).sort(),['PerriCasillas','PerriDuelos','PerriPet','PerriRPG']);
});

test('ranking GLOBAL pc descendente: paginación completa con empates, PC nulo, cursor y nombres reservados sin escrituras',async()=>{
 const db=new PGlite();const queries=[];
 try{
  await db.exec("create table shop_public_users(nick text primary key,pc integer,logo_id text,karma text,achievements jsonb,selected_title_id text)");
  for(let i=0;i<68;i++)await db.query("insert into shop_public_users values($1,$2,'buho-1','Neutral','[]','')",['Nick'+String(i).padStart(3,'0'),i%13===0?null:(i%7)*100-10]);
  await db.query("insert into shop_public_users values($1,290,'buho-1','Neutral','[]','')",['Nick",)\\x']);
  const expected=(await db.query('select nick,pc from shop_public_users order by pc desc nulls last,nick asc')).rows;
  const repository=createRepository({url:'https://fixture.invalid',key:'LOCAL',fetchImpl:async(input,options)=>{
   const url=new URL(input);queries.push(url);assert.equal(options.method,'GET');assert.equal(url.searchParams.get('order'),'pc.desc.nullslast,nick.asc');
   let sql='select * from shop_public_users',params=[];const boundary=url.searchParams.get('or');
   if(boundary){
    const match=boundary.match(/^\(pc\.lt\.(-?\d+),and\(pc\.eq\.(-?\d+),nick\.gt\.("(?:[^"\\]|\\.)*")\),pc\.is\.null\)$/);assert.ok(match,boundary);assert.equal(match[1],match[2]);
    params=[Number(match[1]),JSON.parse(match[3])];sql+=' where pc < $1 or (pc=$1 and nick>$2) or pc is null';
   }else if(url.searchParams.get('pc')==='is.null'){params=[url.searchParams.get('nick').slice(3)];sql+=' where pc is null and nick>$1'}
   sql+=' order by pc desc nulls last,nick asc limit '+Number(url.searchParams.get('limit'));
   return {ok:true,json:async()=>(await db.query(sql,params)).rows};
  }});
  const access={nick:'Owner',active:true,code_hash:digest('only-local')};
  const backend=createBackend({repository:{...repository,canonicalAccess:async()=>access,access:async()=>access,accessStatus:async()=>access,player:async()=>({nick:'Owner',active:true})}});
  let cookie;
  const request=async(path,body)=>{
   const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{method:body?'POST':'GET',url:path,socket:{remoteAddress:'127.0.0.1'},headers:{origin:'http://127.0.0.1:4173','content-type':'application/json',cookie}});
   let status,data;await backend(req,{setHeader:()=>{},writeHead:(code,headers)=>{status=code;if(headers['Set-Cookie'])cookie=headers['Set-Cookie'].split(';')[0]},end:value=>{data=JSON.parse(value)}});return {status,data};
  };
  assert.equal((await request('/api/auth/login',{nick:'Owner',password:'only-local'})).status,200);
  const seen=[];let cursor;
  do{
   const response=await request('/api/users?limit=7'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(response.status,200);
   seen.push(...response.data.items.map(({nick,pc})=>({nick,pc})));cursor=response.data.nextCursor;
   assert.ok(seen.length<=expected.length);
  }while(cursor);
  assert.deepEqual(seen,expected);assert.equal(new Set(seen.map(r=>r.nick)).size,seen.length);assert.ok(queries.length>1);
  for(const bad of ['Owner',{nick:'Owner',pc:'8'},{nick:'Owner',pc:5,extra:true}]){
   const cursor=Buffer.from(JSON.stringify(bad)).toString('base64url');assert.equal((await request('/api/users?cursor='+cursor)).status,400);
  }
  assert.equal((await db.query('select count(*)::int as n from shop_public_users')).rows[0].n,69);
 }finally{await db.close()}
});
