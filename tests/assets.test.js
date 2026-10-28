import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
test('Los gráficos optimizados que requiere el menú están incluidos',async()=>{
 const names=['fondo-menu-web-pc','fondo-menu-web-movil','perrisushi-world','logo-perrisushi','boton-miperfil','boton-usuarios','boton-inventario','boton-minijuegos','boton-tienda','boton-atras','boton-twitch-l','boton-youtube-l','boton-perripet','boton-perricasilla','boton-perrirpg','menu-duelos','moneda'];
 for (const name of names)assert.ok((await stat(resolve(root,'public','assets',name+'.webp'))).size>100, name);
});
test('No hay claves ni conexiones activas de Supabase en la interfaz',async()=>{
 const js=await readFile(resolve(root,'src','main.js'),'utf8');
 const html=await readFile(resolve(root,'index.html'),'utf8');
 assert.doesNotMatch(js,/supabase\.co|service_role|setInterval\s*\(|fetch\s*\(/i);
 assert.match(html,/connect-src 'self'/);
});
