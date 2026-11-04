/**
 * The testing clock: `FLASHCARDS_NOW` fixes the time the Plugin Server treats
 * as now, so a test moves across days and around 4:00 without waiting. Without
 * it, the Plugin Server uses the real clock.
 *
 * The time is read off `list_decks`, which answers `now` for the Plugin Page.
 */
import { strict as assert } from 'node:assert';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { NOW, startedAndShaken, startPluginServer, structureOf } from './helpers/plugin.ts';

type Listed = { now: string };

test('with FLASHCARDS_NOW set, that is the time it treats as now', async (t) => {
  const plugin = await startedAndShaken(t, { env: { FLASHCARDS_NOW: '2026-12-31T03:59:00.000Z' } });

  const listed = structureOf<Listed>(await plugin.call('list_decks'));

  assert.equal(listed.now, '2026-12-31T03:59:00.000Z');
});

test('the fixed time does not move while the Plugin Server runs', async (t) => {
  const plugin = await startedAndShaken(t);

  const first = structureOf<Listed>(await plugin.call('list_decks'));
  const second = structureOf<Listed>(await plugin.call('list_decks'));

  assert.equal(first.now, NOW);
  assert.equal(second.now, NOW);
});

test('without FLASHCARDS_NOW, it uses the real clock', async (t) => {
  const before = Date.now();
  // An empty value counts as unset, as it does for every variable.
  const plugin = await startedAndShaken(t, { env: { FLASHCARDS_NOW: '' } });

  const listed = structureOf<Listed>(await plugin.call('list_decks'));

  const now = Date.parse(listed.now);
  assert.ok(now >= before && now <= Date.now(), `it said now is ${listed.now}`);
});

test('a FLASHCARDS_NOW that is not a time stops it with one sentence, and opens no flashcards.db', async (t) => {
  const plugin = await startPluginServer(t, { env: { FLASHCARDS_NOW: 'next Tuesday' } });

  const ending = await plugin.ended();

  assert.notEqual(ending.code, 0);
  const said = plugin.output().trim();
  assert.ok(said.startsWith('flashcards: '), `stderr said: ${said}`);
  assert.ok(said.includes('FLASHCARDS_NOW') && said.includes('next Tuesday'), `stderr said: ${said}`);
  assert.equal(said.split('\n').length, 1, `stderr said more than one line: ${said}`);
  assert.equal(plugin.lines().length, 0, 'something reached stdout');
  assert.deepEqual(await readdir(plugin.directory), []);
});
