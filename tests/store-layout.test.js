import test from 'node:test';import assert from 'node:assert/strict';
import {renderLiveShop,setPageData,shopSelection} from '../src/services/live-ui.js';
test('PerriTienda: pestañas, categorías, saldos auténticos y catálogo vacío sin compras',()=>{
 setPageData('shop',{status:'ready',balances:{pc:123,gemas:456},randomKey:{inventoryRandomKey:2,tickets:{items:[]},claims:{items:[{game:'Propio',key:'CLAVE-PROPIA'}]},operationsEnabled:false}});
 shopSelection.tab='cosmetics';shopSelection.category='logos';const html=renderLiveShop();
 for(const text of ['COSMÉTICOS','UTILIDAD','Logos','Marcos','Accesorio 1','Accesorio 2','123','456','Sin artículos','CLAVE-PROPIA'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/PerriTienda 2\.0|Próximamente|data-economy="buy"|Comprar|En construcción/);
 assert.match(html,/id="store-panel-utility"[^>]*hidden/);
 shopSelection.tab='utility';assert.match(renderLiveShop(),/id="store-panel-cosmetics"[^>]*hidden/);
 shopSelection.tab='cosmetics';
});
