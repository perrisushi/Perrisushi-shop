export const publicPattern=/^\/(?:index\.html|src\/(?:main|routes|game-bridge|casillas-host)\.js|src\/services\/(?:api-client|live-ui|help-content)\.js|src\/(?:styles|desktop-layout-fix|preview-pages)\.css|public\/assets\/[\w-]+\.(?:webp|mp3))$/;
export function gamePath(path){
 if(path==='/musica-web.mp3')return '/public/assets/musica-web.mp3';
 if(path==='/perricasillas'||path==='/perricasillas/')return '/games/original/index-production.html';
 if(path==='/perrirpg.html'||path==='/perrirpg.js'||path==='/perrirpg.css'||path==='/ui-layout-editor.js'||path==='/ui-layout-editor.css'||path==='/home-layout.css')return '/games/original'+path;
 for(const prefix of ['/assets/','/perripet-app/','/perriduelos-app/'])if(path.startsWith(prefix))return '/games/original'+path;
 return path;
}
export function gameHtml(html,casillas){if(html.includes('src="/src/game-bridge.js"'))return html;return html.replace(/<script src="\.\/ui-layout-editor\.js[^\"]*"><\/script>/g,'').replace('</head>','<script src="/src/game-bridge.js"></script></head>').replace('</body>',`${casillas?'<script src="/src/casillas-host.js"></script>':''}</body>`)}
