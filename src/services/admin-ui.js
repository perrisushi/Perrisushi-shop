import {escapeText as e} from './live-ui.js';
import {itemDetails} from './help-content.js';
const sections={profile:'Administración',users:'Administrar usuarios',inventory:'Revisar inventarios',shop:'Consultar catálogo',raffles:'Revisar boletos'};
const errors={admin_required:'No tienes permiso para realizar esta operación.',admin_unavailable:'No se pudo acceder a la administración. Inténtalo de nuevo.',admin_stale:'Los datos han cambiado. Consulta de nuevo la cuenta antes de corregirlos.',admin_protected:'No se puede suspender una cuenta administradora.',admin_recipient_limit:'El envío supera el límite de destinatarios de esta operación.',operation_conflict:'La operación ya existe con otros datos.',invalid_request:'Revisa los datos introducidos.',not_found:'No se ha encontrado la cuenta.',csrf_invalid:'Recarga la página antes de continuar.'};
export function createAdminTools({api,open,repaint,onChange=()=>{}}){
 let authorized=false,available=false,section='profile',data=null,account=null,status='',busy=false,epoch=0,pending=null,history=[];
 const escaped=value=>e(value??'');
 const resourceName=key=>key==='pc'?'PC':itemDetails(key).name;
 const button=(action,label)=>`<button type="button" class="textured-button" data-admin-view="${action}">${label}</button>`;
 function reset(){epoch++;authorized=false;available=false;data=null;account=null;pending=null;busy=false;status='';history=[]}
 async function recognize(){const generation=epoch;try{const result=await api.adminContext();if(generation!==epoch)return;authorized=result.isAdmin===true;available=result.available===true}catch{if(generation===epoch){authorized=false;available=false}}}
 function entry(route){return authorized&&Object.hasOwn(sections,route)?`<button type="button" class="textured-button admin-entry" data-admin-open="${route}" aria-haspopup="dialog">Administrar</button>`:''}
 function markup(){
  let content='';
  if(!authorized)content='<p>No tienes acceso a estas herramientas.</p>';
  else if(!available)content='<p>No se pudo acceder a la administración.</p>';
  else if(busy&&!data)content='<p role="status">Cargando…</p>';
  else if(section==='profile')content=`<nav class="admin-actions" aria-label="Herramientas administrativas">${button('notice','Enviar aviso')}${button('records','Registros administrativos')}</nav>`;
  else if(section==='notice')content=`<form data-admin-form="notice"><label>Destinatarios<select name="audience"><option value="individual">Una cuenta</option><option value="all">Todas las cuentas activas</option></select></label><label>Nick exacto (para una cuenta)<input name="target" maxlength="100" autocomplete="off"></label><label>Título<input name="title" maxlength="100" required></label><label>Mensaje<textarea name="message" rows="4" maxlength="1200" required></textarea></label>${reason()}<button class="textured-button" type="submit">Enviar aviso</button></form>`;
  else if(section==='users'||section==='inventory')content=`<form data-admin-form="lookup"><label>Buscar cuenta<input name="search" maxlength="100" value="${escaped(data?.search)}"></label><button class="textured-button" type="submit">Buscar</button></form><div class="admin-list">${(data?.items??[]).map(u=>`<article><strong>${escaped(u.nick)}</strong><span>${u.access_active&&u.player_active?'Activa':'Suspendida'}${u.is_admin?' · Administración':''}</span><span>PC: ${escaped(u.pc)} · Gemas: ${escaped(u.polvo_gema)}</span><button class="textured-button" type="button" data-admin-account="${escaped(u.nick)}">Consultar</button></article>`).join('')||'<p>No hay cuentas para mostrar.</p>'}</div>${data?.next?`<button type="button" class="textured-button" data-admin-more="users" data-after="${escaped(data.next)}">Cargar más</button>`:''}`;
  else if(section==='account'&&account){const a=account.account;content=`<h3>${escaped(a.nick)}</h3><p>${a.access_active&&a.player_active?'Cuenta activa':'Cuenta suspendida'}${a.is_admin?' · Administración':''}</p>${account.inventory?`<dl class="admin-inventory">${Object.entries(account.inventory).filter(([key,value])=>value>0||['pc','polvo_gema','monedas'].includes(key)).map(([key,value])=>`<div><dt>${escaped(resourceName(key))}</dt><dd>${escaped(value)}</dd></div>`).join('')}</dl><form data-admin-form="resource"><label>Recurso<select name="field">${account.editableFields.map(field=>`<option value="${field}">${escaped(resourceName(field))} (${escaped(account.inventory[field])})</option>`).join('')}</select></label><label>Nueva cantidad<input name="value" type="number" min="0" max="2147483647" step="1" required></label>${reason()}<button class="textured-button" type="submit">Aplicar corrección</button></form>`:'<p>Esta cuenta no tiene inventario.</p>'}${!a.is_admin?`<form data-admin-form="access"><p>${a.access_active&&a.player_active?'Suspender':'Reactivar'} la cuenta y cerrar sus sesiones anteriores.</p>${reason()}<button class="textured-button" type="submit">${a.access_active&&a.player_active?'Suspender cuenta':'Reactivar cuenta'}</button></form>`:''}`;
  }else if(section==='records')content=`<div class="admin-list">${history.map(r=>`<article><strong>${escaped(r.action)}</strong><span>${escaped(r.nick)} · ${escaped(new Date(r.created_at).toLocaleString('es-ES'))}</span><p>${escaped(r.audit?.reason)}</p>${r.audit?.target?`<span>Cuenta: ${escaped(r.audit.target)}</span>`:''}${r.audit?.field?`<span>${escaped(resourceName(r.audit.field))}: ${escaped(r.audit.before)} → ${escaped(r.audit.after)}</span>`:''}${r.audit?.audience?`<span>Avisos enviados: ${escaped(r.audit.count)}</span>`:''}${r.action==='admin:access'?`<span>${r.audit?.after?.access?'Cuenta reactivada':'Cuenta suspendida'}</span>`:''}</article>`).join('')||'<p>No hay modificaciones administrativas registradas.</p>'}</div>${data?.next?`<button class="textured-button" type="button" data-admin-more="records" data-after="${escaped(data.next)}">Cargar más</button>`:''}`;
  else if(section==='shop')content=`<h3>Catálogo de Perrilogos</h3><div class="admin-list">${(data?.logos??[]).map(l=>`<article><strong>${escaped(l.name)}</strong><span>${l.enabled?'Visible':'Oculto'}</span></article>`).join('')||'<p>No hay Perrilogos en el catálogo.</p>'}</div>`;
  else if(section==='raffles')content=`<h3>Boletos registrados</h3><dl class="admin-inventory">${Object.entries(data?.totals??{}).map(([k,v])=>`<div><dt>${escaped(resourceName(k))}</dt><dd>${escaped(v)}</dd></div>`).join('')||'<p>No hay boletos registrados.</p>'}</dl><h3>Últimas compras</h3><div class="admin-list">${(data?.operations??[]).map(r=>`<article><strong>${escaped(r.nick)}</strong><span>${escaped(new Date(r.created_at).toLocaleString('es-ES'))}</span></article>`).join('')||'<p>No hay compras registradas.</p>'}</div>`;
  return `<div class="modal-head"><h2 id="modal-title">${escaped(sections[section]??'Administración')}</h2><button type="button" class="modal-close" data-action="close-modal" aria-label="Cerrar">×</button></div><div class="admin-body">${section!=='profile'?button('profile','Herramientas'):''}<p class="admin-status" role="status">${escaped(status)}</p>${pending&&!busy?'<button type="button" class="textured-button" data-admin-retry>Reintentar la misma operación</button>':''}<div class="admin-content" ${busy||pending?'inert':''}>${content}</div></div>`;
 }
 function reason(){return '<label>Motivo<input name="reason" required maxlength="300"></label>'}
 async function load(view,params={},append=false){
  if(!authorized)return;section=view;status='';busy=true;if(!append)data=null;const generation=++epoch;repaint();
  try{let result;if(view==='account'){result=await api.adminRead('account',params);if(generation===epoch)account=result}else if(['users','inventory','records','shop','raffles'].includes(view)){result=await api.adminRead(view==='inventory'?'users':view==='shop'?'store':view,params);if(generation===epoch){data={...result,search:params.search??''};if(view==='records')history=append?[...history,...result.items]:result.items;if((view==='users'||view==='inventory')&&append)data.items=[...(load.previousItems??[]),...result.items]}}}
  catch(err){if(generation===epoch){status=errors[err.code]??'No se pudo completar la consulta.';if(err.code==='admin_required')authorized=false}}
  finally{if(generation===epoch){busy=false;repaint()}}
 }
 async function send(body){
  if(busy)return;if(!pending)pending={...body,operationId:crypto.randomUUID()};const frozen=pending,generation=epoch;busy=true;status='Guardando…';repaint();
  try{const result=await api.adminExecute(frozen);if(generation!==epoch)return;pending=null;status=frozen.action==='notice'?`Avisos enviados: ${result.count}.`:'Modificación guardada.';if(section==='account'){try{const refreshed=await api.adminRead('account',{target:frozen.target});if(generation===epoch)account=refreshed}catch{if(generation===epoch)status='Modificación guardada. Vuelve a consultar la cuenta para actualizar los datos.'}}if(generation!==epoch)return;onChange();}
  catch(err){if(generation!==epoch)return;status=errors[err.code]??'No se pudo confirmar el resultado. Reintenta la misma operación para comprobarlo sin repetir el cambio.';if([400,403,404,409].includes(err.status))pending=null;if(err.code==='admin_required')authorized=false}
  finally{if(generation===epoch){busy=false;repaint()}}
 }
 document.addEventListener('click',event=>{
  const root=event.target.closest('[data-admin-open],[data-admin-view],[data-admin-account],[data-admin-more],[data-admin-retry]');if(!root||!authorized)return;
  if(root.hasAttribute('data-admin-open')){section=root.dataset.adminOpen;open('admin:'+section);void load(section)}
  else if(root.hasAttribute('data-admin-retry'))void send(pending);
  else if(root.dataset.adminAccount)void load('account',{target:root.dataset.adminAccount});
  else if(root.dataset.adminMore){load.previousItems=data?.items??[];void load(root.dataset.adminMore,{after:root.dataset.after,...(root.dataset.adminMore==='users'?{search:data?.search??''}:{})},true)}
  else void load(root.dataset.adminView);
 });
 document.addEventListener('submit',event=>{
  const form=event.target;if(!form.matches('[data-admin-form]'))return;event.preventDefault();if(!authorized||busy||pending)return;
  const f=Object.fromEntries(new FormData(form)),kind=form.dataset.adminForm;
  if(kind==='lookup'){void load(section,{search:f.search});return}
  if(kind==='notice'){void send({action:'notice',audience:f.audience,...(f.audience==='individual'?{target:f.target}:{}),title:f.title,message:f.message,reason:f.reason});return}
  if(!account)return;
  if(kind==='resource')void send({action:'resource',target:account.account.nick,field:f.field,expected:account.inventory[f.field],value:Number(f.value),reason:f.reason});
  else if(kind==='access')void send({action:'access',target:account.account.nick,expectedAccess:account.account.access_active,expectedPlayer:account.account.player_active,active:!(account.account.access_active&&account.account.player_active),reason:f.reason});
 });
 return {reset,recognize,entry,markup};
}
