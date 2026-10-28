import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('Cabeceras sin brillos puramente decorativos', () => {
  assert.doesNotMatch(main, /header-decoration|[✦✧★☆✩✨]/u);
  assert.doesNotMatch(css, /\.header-decoration\b/u);
});

test('Siguen existiendo títulos, retorno y todas las pantallas', () => {
  assert.match(main, /class="content-header"/u);
  assert.match(main, /class="back-button"/u);
  for (const route of ['profile','users','inventory','games','shop']) {
    assert.ok(main.includes("shellView('" + route + "',"));
  }
});
