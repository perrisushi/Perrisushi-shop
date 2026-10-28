import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoute,ROUTES } from '../src/routes.js';
test('Las rutas usadas son exactamente las aprobadas',()=>assert.deepEqual(ROUTES,['home','profile','users','inventory','games','shop']));
test('Permite rutas válidas',()=>{
 for(const route of ROUTES)assert.equal(normalizeRoute('#'+route),route);
});
test('Rutas desconocidas o maliciosas vuelven a inicio',()=>{
 for(const entry of ['', '#unknown', '#../../server', '#<script>', '#javascript:alert(1)'])assert.equal(normalizeRoute(entry),'home');
});
