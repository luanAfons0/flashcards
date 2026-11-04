/**
 * The Plugin Settings: the Daily Limit, New Cards per day and Reviews per
 * day, read with `get_settings` and changed with `update_settings`.
 *
 * The Plugin keeps them in `settings.json` in its own directory, so they
 * survive a restart, and the Daily Limit that `list_decks` answers is the one
 * they hold.
 */
import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { listDecks, refusalOf } from './helpers/cards.ts';
import { startedAndShaken, structureOf, type Answer, type Started } from './helpers/plugin.ts';

/** What `get_settings` and `update_settings` answer. */
type Settings = { readonly newCardsPerDay: number; readonly reviewsPerDay: number };

async function settingsOf(plugin: Started): Promise<Settings> {
  return structureOf<Settings>(await plugin.call('get_settings'));
}

function update(plugin: Started, given: Record<string, unknown>): Promise<Answer> {
  return plugin.call('update_settings', given);
}

test('with nothing saved, the Settings are the default Daily Limit: 20 New Cards and 200 Reviews', async (t) => {
  const plugin = await startedAndShaken(t);

  assert.deepEqual(await settingsOf(plugin), { newCardsPerDay: 20, reviewsPerDay: 200 });
});

test('saved Settings are read back, are the Daily Limit, and survive a restart', async (t) => {
  const plugin = await startedAndShaken(t);

  const saved = structureOf<Settings>(await update(plugin, { newCardsPerDay: 5, reviewsPerDay: 80 }));
  plugin.stop();
  await plugin.ended();
  const again = await startedAndShaken(t, { directory: plugin.directory });

  assert.deepEqual(saved, { newCardsPerDay: 5, reviewsPerDay: 80 });
  assert.deepEqual(await settingsOf(again), { newCardsPerDay: 5, reviewsPerDay: 80 });
  assert.deepEqual((await listDecks(again)).limit, { newCards: 5, reviews: 80 });
});

test('the Settings are kept in settings.json in the Plugin directory', async (t) => {
  const plugin = await startedAndShaken(t);

  await update(plugin, { newCardsPerDay: 0, reviewsPerDay: 9999 });
  const file = JSON.parse(await readFile(join(plugin.directory, 'settings.json'), 'utf8')) as unknown;

  assert.deepEqual(file, { newCardsPerDay: 0, reviewsPerDay: 9999 });
});

test('a setting left out keeps its value, and null puts back the default', async (t) => {
  const plugin = await startedAndShaken(t);
  await update(plugin, { newCardsPerDay: 7, reviewsPerDay: 70 });

  const kept = structureOf<Settings>(await update(plugin, { reviewsPerDay: 90 }));
  const reset = structureOf<Settings>(await update(plugin, { newCardsPerDay: null }));

  assert.deepEqual(kept, { newCardsPerDay: 7, reviewsPerDay: 90 });
  assert.deepEqual(reset, { newCardsPerDay: 20, reviewsPerDay: 90 });
});

test('a value that is not a whole number from 0 to 9999 is refused with a sentence, and nothing is saved', async (t) => {
  const plugin = await startedAndShaken(t);
  await update(plugin, { newCardsPerDay: 12, reviewsPerDay: 120 });

  for (const wrong of [-1, 10000, 1.5, '20', '', true]) {
    assert.equal(
      refusalOf(await update(plugin, { newCardsPerDay: wrong, reviewsPerDay: 100 })),
      'New Cards per day must be a whole number from 0 to 9999.',
    );
    assert.equal(
      refusalOf(await update(plugin, { newCardsPerDay: 10, reviewsPerDay: wrong })),
      'Reviews per day must be a whole number from 0 to 9999.',
    );
  }
  assert.deepEqual(await settingsOf(plugin), { newCardsPerDay: 12, reviewsPerDay: 120 });
});

test('a settings.json that is not a JSON object is named in a sentence, and a save writes a new one', async (t) => {
  const plugin = await startedAndShaken(t);
  await writeFile(join(plugin.directory, 'settings.json'), 'not json');

  const refused = refusalOf(await plugin.call('get_settings'));
  const saved = structureOf<Settings>(await update(plugin, { newCardsPerDay: 3, reviewsPerDay: 30 }));

  assert.match(refused, /settings\.json is not a JSON object; save the Settings on the Plugin Page to write it again\.$/);
  assert.deepEqual(saved, { newCardsPerDay: 3, reviewsPerDay: 30 });
  assert.deepEqual(await settingsOf(plugin), { newCardsPerDay: 3, reviewsPerDay: 30 });
});

test('a value in settings.json that is out of range is named in a sentence', async (t) => {
  const plugin = await startedAndShaken(t);
  await writeFile(join(plugin.directory, 'settings.json'), '{ "newCardsPerDay": -4 }');

  assert.match(
    refusalOf(await plugin.call('list_decks')),
    /settings\.json holds a newCardsPerDay of -4, and New Cards per day must be a whole number from 0 to 9999\. Save the Settings on the Plugin Page to write it again\.$/,
  );
});
