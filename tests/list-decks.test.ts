/**
 * `list_decks`: every Deck with its Notes and Cards, its New and Due counts
 * for now, and when its next Card becomes Due, with what today has shown and
 * the Daily Limit.
 *
 * Until a Card can be graded, a Card that has had a Review is put in place
 * by `reviewed`, which writes its schedule into `flashcards.db` while the
 * Plugin Server is stopped, as an earlier Review would have left it. Once
 * Grades exist, these tests can grade instead.
 */
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { type TestContext } from 'node:test';
import { addBasic, listDecks } from './helpers/cards.ts';
import { makeDirectory, NOW, startedAndShaken, type Started } from './helpers/plugin.ts';

/**
 * Give the Card of the Note with this id the schedule a Review left it, due
 * at this time, then start the Plugin Server again on the same directory.
 */
async function reviewed(t: TestContext, plugin: Started, schedule: ReadonlyMap<number, string>): Promise<Started> {
  plugin.stop();
  await plugin.ended();
  const file = new DatabaseSync(join(plugin.directory, 'flashcards.db'));
  const update = file.prepare(
    'UPDATE cards SET state = 2, reps = 1, stability = 2.3065, difficulty = 2.118, scheduled_days = 1, ' +
      'last_review = ?, due = ? WHERE note_id = ?',
  );
  for (const [note, due] of schedule) update.run('2026-11-03T10:00:00.000Z', due, note);
  file.close();
  return startedAndShaken(t, { directory: plugin.directory });
}

test('with no Decks it answers none, the Daily Limit, and nothing done today', async (t) => {
  const plugin = await startedAndShaken(t);

  const listed = await listDecks(plugin);

  assert.deepEqual(listed.decks, []);
  assert.deepEqual(listed.today, { reviews: 0, newCards: 0 });
  assert.deepEqual(listed.limit, { newCards: 20, reviews: 200 });
  assert.equal(listed.now, NOW);
});

test('a Card that has had no Review is a New Card, and is not Due', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Japanese N4 vocabulary', '勉強', 'study');
  await addBasic(plugin, 'Japanese N4 vocabulary', '駅', 'station');

  const listed = await listDecks(plugin);

  assert.deepEqual(listed.decks, [
    { name: 'Japanese N4 vocabulary', notes: 2, cards: 2, new: 2, due: 0, nextDue: null, left: 2 },
  ]);
});

test('every Deck is listed by name, without regard to letter case', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'rust ownership', 'Who frees a Box?', 'Its owner.');
  await addBasic(plugin, 'AWS Solutions Architect', 'Cheapest S3 class?', 'Glacier Deep Archive');
  await addBasic(plugin, 'Japanese N4 vocabulary', '駅', 'station');

  const listed = await listDecks(plugin);

  assert.deepEqual(
    listed.decks.map((deck) => deck.name),
    ['AWS Solutions Architect', 'Japanese N4 vocabulary', 'rust ownership'],
  );
});

test('a Card whose time has come is Due, and one whose time has not come gives the next Due', async (t) => {
  const first = await startedAndShaken(t);
  const study = await addBasic(first, 'Japanese N4 vocabulary', '勉強', 'study');
  const station = await addBasic(first, 'Japanese N4 vocabulary', '駅', 'station');
  const company = await addBasic(first, 'Japanese N4 vocabulary', '会社', 'company');
  await addBasic(first, 'Japanese N4 vocabulary', '質問', 'question');

  const plugin = await reviewed(
    t,
    first,
    new Map([
      [study.id, '2026-11-04T04:00:00.000Z'], // Due from 4:00 today
      [station.id, NOW], // Due this very moment
      [company.id, '2026-11-05T04:00:00.000Z'], // Due tomorrow
    ]),
  );
  const listed = await listDecks(plugin);

  assert.deepEqual(listed.decks, [
    { name: 'Japanese N4 vocabulary', notes: 4, cards: 4, new: 1, due: 2, nextDue: '2026-11-05T04:00:00.000Z', left: 3 },
  ]);
});

test('the next Due is the soonest of the Cards still to come', async (t) => {
  const first = await startedAndShaken(t);
  const later = await addBasic(first, 'Rust ownership', 'Who frees a Box?', 'Its owner.');
  const sooner = await addBasic(first, 'Rust ownership', 'What does move do?', 'It hands the value on.');

  const plugin = await reviewed(
    t,
    first,
    new Map([
      [later.id, '2026-11-12T04:00:00.000Z'],
      [sooner.id, '2026-11-04T10:10:00.000Z'], // a learning step, ten minutes on
    ]),
  );
  const listed = await listDecks(plugin);

  assert.equal(listed.decks[0]?.due, 0);
  assert.equal(listed.decks[0]?.nextDue, '2026-11-04T10:10:00.000Z');
});

test('each Deck counts only its own Cards', async (t) => {
  const first = await startedAndShaken(t);
  const due = await addBasic(first, 'AWS Solutions Architect', 'Cheapest S3 class?', 'Glacier Deep Archive');
  await addBasic(first, 'Portuguese irregular verbs', 'fazer, eu, pretérito', 'fiz');

  const plugin = await reviewed(t, first, new Map([[due.id, '2026-11-04T04:00:00.000Z']]));
  const listed = await listDecks(plugin);

  assert.deepEqual(
    listed.decks.map((deck) => [deck.name, deck.new, deck.due, deck.nextDue]),
    [
      ['AWS Solutions Architect', 0, 1, null],
      ['Portuguese irregular verbs', 1, 0, null],
    ],
  );
});

test('a Deck kept from an older flashcards with no Notes yet is listed with nothing in it', async (t) => {
  const directory = await makeDirectory(t);
  const old = new DatabaseSync(join(directory, 'flashcards.db'));
  old.exec(`
    CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at TEXT NOT NULL);
    INSERT INTO decks (name, created_at) VALUES ('Rust ownership', '2026-11-01T09:00:00.000Z');
    PRAGMA user_version = 1;
  `);
  old.close();
  const plugin = await startedAndShaken(t, { directory });

  const listed = await listDecks(plugin);

  assert.deepEqual(listed.decks, [{ name: 'Rust ownership', notes: 0, cards: 0, new: 0, due: 0, nextDue: null, left: 0 }]);
});
