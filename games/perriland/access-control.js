/* Acceso directo al control administrativo existente; no añade permisos ni otro estado de sala. */
(function(root){'use strict';
class AccessControl{
 constructor({button,label,fetcher=(...args)=>fetch(...args),getCsrf,onChange=()=>{},onError=()=>{},beforeChange=()=>{},createId=()=>crypto.randomUUID()}){
  Object.assign(this,{button,label,fetcher,getCsrf,onChange,onError,beforeChange,createId});this.isAdmin=false;this.available=false;this.busy=false;
  button.addEventListener('click',()=>{void this.toggle();});this.render();
 }
 render(){this.button.hidden=this.label.hidden=!this.isAdmin;this.button.disabled=!this.isAdmin||this.busy;this.button.setAttribute?.('aria-label',this.available?'Cerrar PERRILAND al público':'Abrir PERRILAND al público');this.button.textContent=this.busy?'Guardando…':this.available?'Cerrar PERRILAND':'Abrir PERRILAND';this.label.textContent=this.available?'Abierta al público':'Cerrada al público';}
 sync(info){this.isAdmin=info?.isAdmin===true;this.available=info?.available===true;this.render();}
 async request(path,options={}){
  const response=await this.fetcher(path,{credentials:'same-origin',cache:'no-store',...options});let data;
  try{data=await response.json();}catch{throw Object.assign(Error('No se pudo comprobar el estado de PERRILAND.'),{code:'invalid_response'});}
  if(!response.ok)throw Object.assign(Error(data.error??'request_failed'),{code:data.error,status:response.status});return data;
 }
 async toggle(){
  if(!this.isAdmin||this.busy)return;const open=!this.available;this.busy=true;this.render();this.beforeChange();
  try{
   const controls=await this.request('/api/admin/controls');if(!Array.isArray(controls.items))throw Error('invalid_response');
   const row=controls.items.find(r=>r.scope==='PerriLand');
   if(!row||row.active===open){
    const result=await this.request('/api/admin/execute',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':this.getCsrf()},body:JSON.stringify({action:'control',scope:'PerriLand',active:!open,message:open?'':'PERRILAND está cerrado temporalmente.',expectedVersion:row?.version??null,operationId:this.createId(),reason:open?'Apertura desde Minijuegos':'Cierre desde Minijuegos',confirmed:true})});
    if(result.control?.scope!=='PerriLand'||typeof result.control.active!=='boolean')throw Error('invalid_response');
    this.available=!result.control.active;
   }else{this.available=!row.active;}
   this.onChange({available:this.available});
  }catch(error){
   // Si se perdió la respuesta del POST, consultar el estado real antes de permitir otra pulsación.
   try{this.sync(await this.request('/api/perriland/context'));}catch{if(error.status===401||error.status===403)this.isAdmin=false;}
   this.onError(error.code==='admin_stale'?'El estado ha cambiado. Revisa el botón y vuelve a pulsar.':error.status===401||error.status===403?'No tienes permiso para cambiar el acceso.':'No se pudo confirmar el cambio. Revisa el estado y vuelve a intentarlo.');
  }finally{this.busy=false;this.render();}
 }
}
root.PerrilandAccessControl=AccessControl;
})(globalThis);
