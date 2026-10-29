// Solo inspecciona formatos conocidos. No conecta ni registra URLs/credenciales.
export function connectionDiagnostics({supabaseUrl,databaseUrl,serviceKey}={}){
 let restRef,dbRef,keyRef,roleHint='unknown';
 try{restRef=new URL(supabaseUrl).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1]}catch{}
 try{
  const db=new URL(databaseUrl);
  if(['postgres:','postgresql:'].includes(db.protocol)){
   dbRef=db.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1];
   if(!dbRef&&db.hostname.endsWith('.pooler.supabase.com'))dbRef=decodeURIComponent(db.username).match(/\.([a-z0-9]+)$/)?.[1];
  }
 }catch{}
 if(typeof serviceKey==='string'){
  if(serviceKey.startsWith('sb_secret_'))roleHint='secret_key';
  else if(serviceKey.startsWith('sb_publishable_'))roleHint='publishable_key';
  else try{
   const payload=JSON.parse(Buffer.from(serviceKey.split('.')[1]??'','base64url').toString());
   roleHint=['service_role','anon','authenticated'].includes(payload.role)?payload.role:'unknown';
   if(typeof payload.ref==='string'&&/^[a-z0-9]+$/.test(payload.ref))keyRef=payload.ref;
  }catch{}
 }
 return {projectMatch:!databaseUrl?'not_configured':restRef&&dbRef?(restRef===dbRef?'same':'different'):'unknown',credentialRoleHint:roleHint,keyProjectMatch:restRef&&keyRef?(restRef===keyRef?'same':'different'):'unknown'};
}
