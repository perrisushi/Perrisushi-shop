import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {achievementName,achievementNames} from '../src/services/help-content.js';
import {renderSelectedAchievement,renderProfileAchievements,renderUserRows} from '../src/services/live-ui.js';
test('Nombres de logros coinciden con el catálogo original',async()=>{
 const original=await readFile('backend/games-original.cjs','utf8');
 for(const [id,name] of Object.entries(achievementNames))assert.ok(original.includes(`id: "${id}", name: "${name}"`));
 assert.equal(achievementName('me_gusta_el_marisco'),'Me gusta el marisco');
 assert.equal(achievementName('Logo especial del pase diario'),'Logo especial del pase diario');
 assert.equal(achievementName('unknown_internal_id'),'Unknown internal id');
});
test('Placa y lista distinguen el logro seleccionado sin modificar el perfil',()=>{
 const profile={selectedTitleId:'me_gusta_el_marisco',achievements:['me_gusta_el_marisco','Logo especial del pase diario']};
 const before=JSON.stringify(profile),plaque=renderSelectedAchievement(profile),list=renderProfileAchievements(profile);
 assert.match(plaque,/Me gusta el marisco/);assert.doesNotMatch(plaque,/me_gusta_el_marisco/);
 assert.match(list,/is-selected/);assert.match(list,/Seleccionado/);assert.match(list,/Obtenido/);assert.match(list,/Logo especial del pase diario/);
 assert.equal(JSON.stringify(profile),before);
 assert.equal(renderSelectedAchievement({}),'');
 assert.match(renderProfileAchievements({}),/Sin logros obtenidos/);
 assert.match(renderProfileAchievements({achievements:['unknown_internal_id']}),/Unknown internal id/);
 assert.doesNotMatch(renderProfileAchievements({achievements:['unknown_internal_id']}),/unknown_internal_id/);
 assert.match(renderProfileAchievements({achievements:['<b>Nombre</b>']}),/&lt;b&gt;/);
});

test('Usuarios muestra solo el logro seleccionado y conserva el avatar',()=>{
 const users=[{nick:'Usuario',logoId:'buho-1',selectedTitleId:'me_gusta_el_marisco',achievements:['Perrilogo aleatorio del pase diario','me_gusta_el_marisco','otro_logro']},{nick:'Sin selección',logoId:'panda-1',selectedTitleId:null,achievements:['Perrilogo aleatorio del pase diario','me_gusta_el_marisco']}];
 const before=JSON.stringify(users),html=renderUserRows(users);
 assert.match(html,/Me gusta el marisco/);assert.doesNotMatch(html,/Perrilogo aleatorio|otro_logro|me_gusta_el_marisco/);
 assert.match(html,/logo-buho-1\.png/);assert.match(html,/data-layer="background"/);assert.match(html,/data-layer="frame"/);assert.match(html,/logo-panda-1\.png/);
 const empty=html.slice(html.indexOf('Sin selección'));
 assert.match(empty,/class="pw04-user-achievements" role="cell" hidden><\/div>/);
 assert.equal(JSON.stringify(users),before);
 assert.match(renderUserRows([{nick:'Otro',selectedTitleId:'nuevo_logro_largo'}]),/Nuevo logro largo/);
});
