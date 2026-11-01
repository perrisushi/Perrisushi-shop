import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {achievementName,achievementNames} from '../src/services/help-content.js';
import {renderSelectedAchievement,renderProfileAchievements} from '../src/services/live-ui.js';
test('Nombres de logros coinciden con el catálogo original',async()=>{
 const original=await readFile('backend/games-original.cjs','utf8');
 for(const [id,name] of Object.entries(achievementNames))assert.ok(original.includes(`id: "${id}", name: "${name}"`));
 assert.equal(achievementName('me_gusta_el_marisco'),'Me gusta el marisco');
 assert.equal(achievementName('Logo especial del pase diario'),'Logo especial del pase diario');
 assert.equal(achievementName('unknown_internal_id'),'');
});
test('Placa y lista distinguen el logro seleccionado sin modificar el perfil',()=>{
 const profile={selectedTitleId:'me_gusta_el_marisco',achievements:['me_gusta_el_marisco','Logo especial del pase diario']};
 const before=JSON.stringify(profile),plaque=renderSelectedAchievement(profile),list=renderProfileAchievements(profile);
 assert.match(plaque,/Me gusta el marisco/);assert.doesNotMatch(plaque,/me_gusta_el_marisco/);
 assert.match(list,/is-selected/);assert.match(list,/Seleccionado/);assert.match(list,/Obtenido/);assert.match(list,/Logo especial del pase diario/);
 assert.equal(JSON.stringify(profile),before);
 assert.equal(renderSelectedAchievement({}),'');
 assert.match(renderProfileAchievements({}),/Sin logros obtenidos/);
 assert.doesNotMatch(renderProfileAchievements({achievements:['unknown_internal_id']}),/unknown_internal_id/);
 assert.match(renderProfileAchievements({achievements:['<b>Nombre</b>']}),/&lt;b&gt;/);
});
