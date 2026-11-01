import test from 'node:test';
import assert from 'node:assert/strict';
import {scaleForViewport,DESIGN_WIDTH,DESIGN_HEIGHT} from '../src/global-scale.js';
test('El factor global ajusta ambos ejes conservando proporciones',()=>{
 assert.equal(scaleForViewport(DESIGN_WIDTH,DESIGN_HEIGHT),1);
 assert.equal(scaleForViewport(DESIGN_WIDTH/2,DESIGN_HEIGHT/2),0.5);
 for(const [w,h]of [[390,844],[844,390],[1366,768],[3840,2160]]){
  const s=scaleForViewport(w,h);assert.ok(DESIGN_WIDTH*s<=w+1e-8);assert.ok(DESIGN_HEIGHT*s<=h+1e-8);
  assert.ok(Math.abs(DESIGN_WIDTH*s-w)<1e-8||Math.abs(DESIGN_HEIGHT*s-h)<1e-8);
 }
});
