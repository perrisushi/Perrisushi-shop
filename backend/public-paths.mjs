export const publicPattern=/^\/(?:index\.html|privacidad\.html|src\/(?:main|routes|game-bridge|game-window|game-presentation|casillas-host)\.js|src\/services\/(?:api-client|live-ui|help-content|notifications)\.js|src\/(?:styles|desktop-layout-fix|preview-pages|game-window|game-presentation)\.css|public\/assets\/[\w-]+\.(?:webp|mp3))$/;
export function gamePath(path){
 if(path==='/privacidad'||path==='/privacidad/')return '/privacidad.html';
 if(path==='/musica-web.mp3')return '/public/assets/musica-web.mp3';
 if(path==='/perricasillas'||path==='/perricasillas/')return '/games/original/index-production.html';
 if(path==='/perrirpg.html'||path==='/perrirpg.js'||path==='/perrirpg.css'||path==='/ui-layout-editor.js'||path==='/ui-layout-editor.css'||path==='/home-layout.css')return '/games/original'+path;
 for(const prefix of ['/assets/','/perripet-app/','/perriduelos-app/'])if(path.startsWith(prefix))return '/games/original'+path;
 return path;
}
export function gameHtml(html,casillas){
 html=html.replace(/<script src="\.\/ui-layout-editor\.js[^\"]*"><\/script>/g,'');
 if(!html.includes('data-pw2-game'))html=html.replace(/<html\b/i,'<html data-pw2-game');
 if(!html.includes('src="/src/game-bridge.js"'))html=html.replace('</head>','<script src="/src/game-bridge.js"></script></head>');
 if(!html.includes('href="/src/game-presentation.css"'))html=html.replace('</head>','<link rel="stylesheet" href="/src/game-presentation.css"><script defer src="/src/game-presentation.js"></script></head>');
 if(casillas&&!html.includes('src="/src/casillas-host.js"'))html=html.replace('</body>','<script src="/src/casillas-host.js"></script></body>');
 return html;
}
