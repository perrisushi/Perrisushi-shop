// PostgreSQL local en memoria. No lee .env ni abre conexiones a servicios externos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migration = await readFile(new URL('../sql/006-perriland.sql', import.meta.url), 'utf8');
const original = ['announcement','shop','raffles','PerriPet','PerriRPG','PerriCasillas','PerriDuelos'];
const closed = {active: true, message: 'PERRILAND no está activado.'};
const checkSQL = scopes => `CHECK(scope IN (${scopes.map(s => `'${s}'`).join(',')}))`;

test('006: regresiones de migración en PostgreSQL local aislado', async t => {
  const db = new PGlite();
  const rows = async (sql, args) => (await db.query(sql, args)).rows;
  const control = async () => (await rows("SELECT active,message FROM pw2_community_controls WHERE scope='PerriLand'"))[0];
  const definition = async () => (await rows("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid='pw2_community_controls'::regclass AND conname='pw2_community_controls_scope_check'"))[0].d;
  async function reset(scopes = original) {
    await db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO PUBLIC;
      CREATE TABLE shop_players(nick text PRIMARY KEY);
      INSERT INTO shop_players VALUES('Local');
      CREATE TABLE shop_operations(id text PRIMARY KEY);
      CREATE TABLE shop_sessions(id text PRIMARY KEY);
      CREATE FUNCTION pw2_assert_account_available(text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
      CREATE TABLE pw2_community_controls(
        scope text PRIMARY KEY ${checkSQL(scopes)},
        active boolean NOT NULL DEFAULT false,message text NOT NULL DEFAULT '',
        version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO pw2_community_controls(scope,active,message) VALUES('shop',false,'Conservar');`);
  }
  async function rejectsAtomically(pattern) {
    const before = await rows('SELECT * FROM pw2_community_controls ORDER BY scope');
    const check = await definition();
    await assert.rejects(db.exec(migration), pattern);
    await db.exec('ROLLBACK');
    assert.deepEqual(await rows('SELECT * FROM pw2_community_controls ORDER BY scope'), before);
    assert.equal(await definition(), check);
    assert.equal((await rows("SELECT to_regclass('public.pw2_perriland_room') AS room,to_regclass('public.pw2_perriland_events') AS events"))[0].room, null);
    assert.equal((await rows("SELECT to_regclass('public.pw2_perriland_events') AS events"))[0].events, null);
  }
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    await t.test('regexp_matches: capturas text[] y orden C aun con entrada ICU', async () => {
      await reset();
      const d = await definition();
      const query = migration.match(/ SELECT array_agg[^\n]+/)[0]
        .replace(' INTO names', ' AS names').replace('regexp_matches(d,', 'regexp_matches($1::text COLLATE "unicode",');
      assert.deepEqual((await rows(query, [d]))[0].names, [...original].sort());
      const captures = await rows("SELECT capture,pg_typeof(capture)::text AS type FROM regexp_matches($1,'''([^'']+)''','g') AS matches(capture)", [d]);
      assert.ok(captures.every(r => r.type === 'text[]' && r.capture.length === 1));
      assert.deepEqual(captures.map(r => r.capture[0]), original);
    });
    for (const scopes of [original, [...original].reverse(), [...original,'PerriLand'].reverse()]) {
      await t.test('acepta CHECK válido de ' + scopes.length + ' ámbitos, en orden ' + scopes[0], async () => {
        await reset(scopes);
        const shop = await rows("SELECT * FROM pw2_community_controls WHERE scope='shop'");
        await db.exec(migration);
        assert.deepEqual(await control(), closed);
        assert.deepEqual(await rows("SELECT * FROM pw2_community_controls WHERE scope='shop'"), shop);
      });
    }
    for (const active of [false, true]) {
      await t.test(`PerriLand existente active=${active}: cierra y actualiza mensaje; repetición conserva datos`, async () => {
        await reset([...original,'PerriLand']);
        await db.query("INSERT INTO pw2_community_controls(scope,active,message,version) VALUES('PerriLand',$1,'Mensaje anterior',7)", [active]);
        await db.exec(migration);
        assert.deepEqual(await control(), closed);
        await db.exec(`UPDATE pw2_perriland_room SET revision=12,state='{"local":true}';
          INSERT INTO pw2_perriland_events(id,nick,kind,requested,applied,before_pc,after_pc) VALUES('local','Local','normal_coin',5,5,10,15);`);
        const room = await rows('SELECT * FROM pw2_perriland_room');
        const events = await rows('SELECT * FROM pw2_perriland_events');
        const controls = await rows('SELECT * FROM pw2_community_controls ORDER BY scope');
        await db.exec(migration);
        assert.deepEqual(await rows('SELECT * FROM pw2_community_controls ORDER BY scope'), controls);
        assert.deepEqual(await rows('SELECT * FROM pw2_perriland_room'), room);
        assert.deepEqual(await rows('SELECT * FROM pw2_perriland_events'), events);
      });
    }
    await t.test('RLS y permisos reales: navegador bloqueado, servicio con privilegios mínimos', async () => {
      await reset(); await db.exec(migration);
      assert.ok((await rows("SELECT relrowsecurity FROM pg_class WHERE oid IN ('pw2_perriland_room'::regclass,'pw2_perriland_events'::regclass)")).every(r => r.relrowsecurity));
      for (const role of ['anon','authenticated']) {
        await db.exec('SET ROLE ' + role);
        try {
          for (const table of ['pw2_perriland_room','pw2_perriland_events']) {
            await assert.rejects(db.query('SELECT * FROM ' + table), e => e.code === '42501');
            await assert.rejects(db.query('DELETE FROM ' + table), e => e.code === '42501');
          }
        } finally { await db.exec('RESET ROLE'); }
      }
      await db.exec('SET ROLE service_role');
      try {
        await db.exec("UPDATE pw2_perriland_room SET revision=1; INSERT INTO pw2_perriland_events(id,nick,kind,requested,applied,before_pc,after_pc) VALUES('ok','Local','void',-2,-2,10,8)");
        assert.equal((await rows('SELECT count(*)::int AS n FROM pw2_perriland_events'))[0].n, 1);
        await assert.rejects(db.exec('UPDATE pw2_perriland_events SET applied=0'), e => e.code === '42501');
        await assert.rejects(db.exec('DELETE FROM pw2_perriland_events'), e => e.code === '42501');
        await assert.rejects(db.exec('DELETE FROM pw2_perriland_room'), e => e.code === '42501');
      } finally { await db.exec('RESET ROLE'); }
    });
    await t.test('CHECK, PK y FK rechazan datos inválidos', async () => {
      await reset(); await db.exec(migration);
      await assert.rejects(db.exec("INSERT INTO pw2_community_controls(scope) VALUES('desconocido')"), e => e.code === '23514');
      await assert.rejects(db.exec("INSERT INTO pw2_perriland_room(id) VALUES('otra')"), e => e.code === '23514');
      await assert.rejects(db.exec('UPDATE pw2_perriland_room SET revision=-1'), e => e.code === '23514');
      await assert.rejects(db.exec("INSERT INTO pw2_perriland_room(id) VALUES('main')"), e => e.code === '23505');
      for (const [nick,kind,before,after,code] of [['Local','otro',10,15,'23514'],['Local','normal_coin',-1,4,'23514'],['Local','normal_coin',10,16,'23514'],['Ausente','normal_coin',10,15,'23503']]) {
        await assert.rejects(db.query('INSERT INTO pw2_perriland_events(id,nick,kind,requested,applied,before_pc,after_pc) VALUES($1,$2,$3,5,5,$4,$5)', [kind,nick,kind,before,after]), e => e.code === code);
      }
    });
    for (const scopes of [[...original,'desconocido'], original.filter(s => s !== 'shop')]) {
      await t.test('ámbitos inesperados cancelan sin cambios: ' + scopes.length, async () => {
        await reset();
        await db.exec('DELETE FROM pw2_community_controls; ALTER TABLE pw2_community_controls DROP CONSTRAINT pw2_community_controls_scope_check; ALTER TABLE pw2_community_controls ADD CONSTRAINT pw2_community_controls_scope_check ' + checkSQL(scopes));
        await rejectsAtomically(/Ámbitos de mantenimiento inesperados/);
      });
    }
    await t.test('dependencia ausente cancela antes de DDL', async () => {
      await reset(); await db.exec('DROP TABLE shop_sessions');
      await rejectsAtomically(/Faltan los sistemas/);
    });
    await t.test('tabla ajena no se adopta ni se modifica', async () => {
      await reset(); await db.exec('CREATE TABLE pw2_perriland_room(secret text)');
      await assert.rejects(db.exec(migration), /Tabla preexistente no reconocida/);
      await db.exec('ROLLBACK');
      assert.equal((await rows("SELECT column_name FROM information_schema.columns WHERE table_name='pw2_perriland_room'"))[0].column_name, 'secret');
    });
    await t.test('fallo tardío de permisos revierte CHECK, upsert y tablas', async () => {
      await reset([...original,'PerriLand']);
      await db.exec("INSERT INTO pw2_community_controls(scope,active,message) VALUES('PerriLand',false,'Abierto'); DROP ROLE service_role");
      try { await rejectsAtomically(/service_role/); }
      finally { await db.exec('CREATE ROLE service_role BYPASSRLS'); }
    });
    await t.test('rol sin propiedad no puede aplicar migración', async () => {
      await reset(); await db.exec('GRANT SELECT ON pw2_community_controls TO anon; SET ROLE anon');
      try { await assert.rejects(db.exec(migration), e => e.code === '42501'); }
      finally { await db.exec('ROLLBACK; RESET ROLE'); }
      assert.equal(await control(), undefined);
    });
  } finally { await db.close(); }
});