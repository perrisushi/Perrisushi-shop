// Solo configuración; no conecta ni registra direcciones o credenciales.
export function assertPerrilandConfiguration({enabled,projectMatch,keyProjectMatch,databaseUrl,sessionStore,allowSessionWrites}={}){
 if(!enabled)return;
 if(projectMatch!=='same'||keyProjectMatch==='different')throw Error('PERRILAND requiere verificar que REST y PostgreSQL pertenecen al mismo proyecto de Supabase.');
 if(sessionStore!=='supabase'||!allowSessionWrites)throw Error('PERRILAND requiere las sesiones persistentes existentes de PerriWeb.');
 let url;try{url=new URL(databaseUrl);}catch{throw Error('PERRILAND requiere DATABASE_URL configurada.');}
 if(url.port==='6543')throw Error('PERRILAND requiere PostgreSQL directo o pooler en modo sesión (5432); no usar el pooler de transacciones 6543.');
}
