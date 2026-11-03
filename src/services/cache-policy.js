// Dominios de datos; nunca se cachea una autorización para ejecutar acciones.
export const ECONOMIC_DATA=['inventory','profile','cosmetics','history','notifications','users'];
export function dataDomain(path){
 if(path==='/store')return 'store';if(path.startsWith('/profile/cosmetics'))return 'cosmetics';
 if(path.startsWith('/inventory'))return 'inventory';if(path==='/profile')return 'profile';
 if(path.startsWith('/notifications'))return 'notifications';if(path.startsWith('/admin/'))return 'admin';
 if(path.startsWith('/auth/google/'))return 'google';if(path.includes('raffle'))return 'raffles';
 return path.slice(1).split('/')[0];
}
export function mutationDomains(path,body={}){
 if(['/auth/login','/auth/logout','/auth/google/register'].includes(path))return null;
 if(path==='/auth/google/start')return body.mode==='link'?['google']:null;
 if(path==='/auth/google/cancel')return ['google'];
 if(path==='/notifications/read')return ['notifications'];
 if(['/profile/avatar','/profile/cosmetics'].includes(path))return ['profile','cosmetics','users'];
 if(path==='/store/buy')return [...ECONOMIC_DATA,'store'];
 if(path==='/inventory/open'||path==='/games/action')return ECONOMIC_DATA;
 if(path==='/shop/raffles/buy'||path==='/raffles/register')return [...ECONOMIC_DATA,'raffles'];
 if(path==='/admin/execute'){
  if(body.action==='product')return ['store','admin'];
  if(body.action==='notice')return ['notifications','admin'];
  if(body.action==='control')return ['community','store','raffles','admin'];
  if(body.action==='raffle'||body.action==='transition')return ['raffles','admin'];
  return [...ECONOMIC_DATA,'raffles','admin'];
 }
 return null; // Operación desconocida: limpieza privada completa por seguridad.
}
