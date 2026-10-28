/** Vistas conectadas al backend propio. Sin cuentas, saldos ni objetos demo. */
import {renderLiveUsers,renderLiveInventory,renderLiveShop} from './services/live-ui.js';
export function renderUsersPreview(){return renderLiveUsers()}
export function renderInventoryPreview(){return renderLiveInventory()}
export function renderShopPreview(){return renderLiveShop()}
export function bindPreviewPageEvents(root=document){
 root.addEventListener('click',event=>{
  const tab=event.target.closest('[data-pw04-shop-tab]');if(!tab)return;
  const parent=tab.closest('.pw04-shop'),selected=tab.dataset.pw04ShopTab;
  if(!parent||!['random','sorteos'].includes(selected))return;
  for(const el of parent.querySelectorAll('[data-pw04-shop-tab]')){const active=el.dataset.pw04ShopTab===selected;el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1}
  for(const panel of parent.querySelectorAll('[data-pw04-shop-panel]'))panel.hidden=panel.dataset.pw04ShopPanel!==selected;
 });
 root.addEventListener('keydown',event=>{
  const tab=event.target.closest('[data-pw04-shop-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const tabs=[...tab.closest('.pw04-shop-tabs').querySelectorAll('[data-pw04-shop-tab]')];if(tabs.length!==2)return;
  event.preventDefault();let i=tabs.indexOf(tab);i=event.key==='Home'?0:event.key==='End'?1:(i+(event.key==='ArrowRight'?1:-1)+2)%2;tabs[i].focus();tabs[i].click();
 });
}
