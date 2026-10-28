import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = async name => readFile(resolve(root, name), 'utf8');
const file = async name => stat(resolve(root, 'public/assets', name));

test('Se usan ambos marcos originales y no hay marco recreado en la portada', async () => {
  const css = await read('src/styles.css');
  const js = await read('src/main.js');
  assert.match(css, /marco-recuadro-pc\.webp/);
  assert.match(css, /marco-recuadro-movil\.webp/);
  assert.doesNotMatch(js, /board-corner|board-logo/);
  assert.ok((await file('marco-recuadro-pc.webp')).size > 1000);
  assert.ok((await file('marco-recuadro-movil.webp')).size > 1000);
});

test('Menú: música, asistencia y cerrar sesión; no duplicar navegación', async () => {
  const html = await read('index.html');
  for (const action of ['music','assistance','logout']) assert.match(html, new RegExp(`data-action="${action}"`));
  assert.doesNotMatch(html, /id="quick-nav"/);
  assert.match(html, /musica-web\.mp3/);
  assert.ok((await file('musica-web.mp3')).size > 10000);
});

test('El avatar está preparado para selección del usuario y usa un catálogo válido', async () => {
  const html = await read('index.html');
  const js = await read('src/main.js');
  assert.match(html, /class="avatar-image"/);
  assert.match(html, /marco-logo\.webp/);
  assert.match(js, /export function setAuthenticatedProfile/);
  assert.match(js, /ALLOWED_AVATARS\.has\(id\)/);
  assert.ok((await file('logo-buho-1.webp')).size > 1000);
  assert.ok((await file('logo-pelusa-1.webp')).size > 1000);
});

test('Redes sociales apuntan a las cuentas actuales y el backend permanece aislado', async () => {
  const html = await read('index.html');
  const js = await read('src/main.js');
  assert.match(html, /https:\/\/www\.twitch\.tv\/perrisushi/);
  assert.match(html, /https:\/\/www\.youtube\.com\/@perrisushi/);
  assert.match(html, /connect-src 'self'/);
  assert.doesNotMatch(js, /fetch\s*\(|supabase\.from\s*\(|service_role/);
});
