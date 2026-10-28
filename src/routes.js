/** Única lista autorizada de pantallas. No se evalúa ni ejecuta contenido de la URL. */
export const ROUTES = Object.freeze(['home','profile','users','inventory','games','shop']);
export const routeTitles = Object.freeze({
  home:'Inicio', profile:'Mi perfil', users:'Usuarios', inventory:'Inventario', games:'Minijuegos', shop:'Tienda'
});
export function normalizeRoute(hash) {
  const value = String(hash ?? '').replace(/^#\/?/, '').split(/[/?#]/, 1)[0].trim().toLowerCase();
  return ROUTES.includes(value) ? value : 'home';
}
