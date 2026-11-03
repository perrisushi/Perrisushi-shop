import test from 'node:test';import assert from 'node:assert/strict';
import {renderLiveShop,setPageData,shopSelection} from '../src/services/live-ui.js';
test('PerriTienda: pestañas, categorías, saldos auténticos y catálogo vacío sin compras',()=>{
 setPageData('shop',{status:'ready',catalog:{items:[]},balances:{pc:123,gemas:456},randomKey:{inventoryRandomKey:2,tickets:{items:[]},claims:{items:[{game:'Propio',key:'CLAVE-PROPIA'}]},operationsEnabled:false}});
 shopSelection.tab='cosmetics';shopSelection.category='backgrounds';const html=renderLiveShop();
 for(const text of ['COSMÉTICOS','UTILIDAD','Fondos de logo','Marcos','123','456','Sin artículos'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/Random Key|CLAVE-PROPIA|Accesorio 1|Accesorio 2|data-store-category="logos"/);
 assert.doesNotMatch(html,/PerriTienda 2\.0|Próximamente|data-economy="buy"|Comprar|En construcción/);
 assert.match(html,/id="store-panel-utility"[^>]*hidden/);
 shopSelection.tab='utility';assert.match(renderLiveShop(),/id="store-panel-cosmetics"[^>]*hidden/);
 shopSelection.tab='cosmetics';
});

test('tienda sin instantánea muestra carga, no un catálogo vacío inventado',()=>{setPageData('shop',{status:'loading'});const html=renderLiveShop();assert.match(html,/Cargando/);assert.doesNotMatch(html,/Sin artículos/)});
