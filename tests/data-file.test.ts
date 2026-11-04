/**
 * `flashcards.db`: the one SQLite file, made in the Plugin's own directory on
 * the first start, kept across restarts, and moved up to the current schema
 * when it comes from an older flashcards. A file at a schema this flashcards
 * does not know is refused with a sentence rather than guessed at.
 *
 * A test reaches into the file only to write one as an older flashcards would
 * have left it, before the Plugin Server starts.
 */
import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeDirectory, startedAndShaken, startPluginServer, structureOf } from './helpers/plugin.ts';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));

type Listed = { decks: { name: string }[] };

/** The schema the first flashcards wrote, at version 1, with two Decks in it. */
const VERSION_1 = `
  CREATE TABLE decks (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL
  );
  INSERT INTO decks (name, created_at) VALUES ('Rust ownership', '2026-11-01T09:00:00.000Z');
  INSERT INTO decks (name, created_at) VALUES ('AWS Solutions Architect', '2026-11-02T09:00:00.000Z');
  PRAGMA user_version = 1;
`;

/**
 * The schema at version 2, as flashcards left it before Deck names were
 * compared beyond ASCII: SQLite's NOCASE let "Verbos AÇÃO" and "verbos ação"
 * be two Decks, each with a Note and its Card.
 */
const VERSION_2_TWO_SPELLINGS = `
  CREATE TABLE decks (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    deck_id INTEGER NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    note_type TEXT NOT NULL,
    fields TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
  );
  CREATE INDEX notes_by_deck ON notes (deck_id);
  CREATE TABLE cards (
    id INTEGER PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    due TEXT NOT NULL,
    stability REAL NOT NULL DEFAULT 0,
    difficulty REAL NOT NULL DEFAULT 0,
    state INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    learning_step INTEGER NOT NULL DEFAULT 0,
    last_review TEXT,
    UNIQUE (note_id, ordinal)
  );
  CREATE INDEX cards_by_due ON cards (due);
  INSERT INTO decks (id, name, created_at) VALUES (1, 'Verbos AÇÃO', '2026-11-01T09:00:00.000Z');
  INSERT INTO decks (id, name, created_at) VALUES (2, 'verbos ação', '2026-11-02T09:00:00.000Z');
  INSERT INTO decks (id, name, created_at) VALUES (3, 'Rust ownership', '2026-11-02T09:00:00.000Z');
  INSERT INTO notes (deck_id, note_type, fields, created_at, modified_at)
    VALUES (1, 'basic', '{"Front":"fazer, eu","Back":"fiz"}', '2026-11-01T09:00:00.000Z', '2026-11-01T09:00:00.000Z');
  INSERT INTO notes (deck_id, note_type, fields, created_at, modified_at)
    VALUES (2, 'basic', '{"Front":"ter, eu","Back":"tive"}', '2026-11-02T09:00:00.000Z', '2026-11-02T09:00:00.000Z');
  INSERT INTO cards (note_id, ordinal, due) VALUES (1, 0, '2026-11-01T09:00:00.000Z');
  INSERT INTO cards (note_id, ordinal, due) VALUES (2, 0, '2026-11-02T09:00:00.000Z');
  PRAGMA user_version = 2;
`;

/** Write `flashcards.db` into a Plugin directory as an older flashcards left it. */
function seed(directory: string, sql: string): void {
  const old = new DatabaseSync(join(directory, 'flashcards.db'));
  old.exec(sql);
  old.close();
}

test('the first start makes flashcards.db in the Plugin directory, and it has no Decks', async (t) => {
  const plugin = await startedAndShaken(t);

  const listed = structureOf<Listed>(await plugin.call('list_decks'));

  assert.deepEqual(listed.decks, []);
  assert.ok((await readdir(plugin.directory)).includes('flashcards.db'));
});

test('the Decks in flashcards.db survive a restart of the Plugin Server', async (t) => {
  const directory = await makeDirectory(t);
  seed(directory, VERSION_1);
  const first = await startedAndShaken(t, { directory });
  first.stop();
  await first.ended();

  const second = await startedAndShaken(t, { directory });
  const listed = structureOf<Listed>(await second.call('list_decks'));

  assert.deepEqual(
    listed.decks.map((deck) => deck.name),
    ['AWS Solutions Architect', 'Rust ownership'],
  );
});

test('two Decks an older file kept apart only by letters beyond ASCII become one, with every Note', async (t) => {
  const directory = await makeDirectory(t);
  seed(directory, VERSION_2_TWO_SPELLINGS);
  const plugin = await startedAndShaken(t, { directory });

  const listed = structureOf<{ decks: { name: string; notes: number; cards: number }[] }>(
    await plugin.call('list_decks'),
  );
  const added = structureOf<{ deck: string }>(
    await plugin.call('add_note', { deck: 'VERBOS AÇÃO', noteType: 'basic', fields: { Front: 'ir, eu', Back: 'fui' } }),
  );

  assert.deepEqual(
    listed.decks.map((deck) => [deck.name, deck.notes, deck.cards]),
    [['Rust ownership', 0, 0], ['Verbos AÇÃO', 2, 2]],
  );
  assert.equal(added.deck, 'Verbos AÇÃO');
});

test('a file at a schema newer than this flashcards knows stops it with one sentence', async (t) => {
  const directory = await makeDirectory(t);
  seed(directory, 'PRAGMA user_version = 99;');
  const plugin = await startPluginServer(t, { directory });

  const ending = await plugin.ended();

  assert.notEqual(ending.code, 0);
  const said = plugin.output().trim();
  assert.ok(said.startsWith('flashcards: '), `stderr said: ${said}`);
  assert.ok(said.includes('flashcards.db') && said.includes('99'), `stderr said: ${said}`);
  assert.equal(said.split('\n').length, 1, `stderr said more than one line: ${said}`);
  assert.equal(plugin.lines().length, 0, 'something reached stdout');
});

test('flashcards.db and the files SQLite keeps beside it are git-ignored', async () => {
  const ignored = (await readFile(join(REPOSITORY, '.gitignore'), 'utf8')).split('\n');

  for (const name of ['flashcards.db', 'flashcards.db-journal', 'flashcards.db-wal', 'flashcards.db-shm']) {
    assert.ok(ignored.includes(name), `.gitignore does not name ${name}`);
  }
});
