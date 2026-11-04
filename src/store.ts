/**
 * The one SQLite file, `flashcards.db`, where every Deck, Note, Card and
 * Review lives, through Node's own `node:sqlite` (FirstMate ADR-0005).
 *
 * The file is in the Plugin's own directory, which is where the Host starts
 * the Plugin Server, so it is one relative path away. Its schema version is
 * `PRAGMA user_version`: opening an older file moves it up to the current
 * version, one step at a time, and a newer file than this code knows is
 * refused rather than guessed at.
 */
import { DatabaseSync } from 'node:sqlite';
import { deckKey } from './deck-key.ts';

/** Where the data lives, relative to the Plugin directory. */
export const FILE = 'flashcards.db';

/** The Store: one open connection to `flashcards.db`. */
export type Store = DatabaseSync;

/**
 * Each step moves the file up one version: SQL, or work that needs more than
 * SQL. A step is never edited once it has shipped; a change to the schema is
 * a new step at the end.
 */
const STEPS: readonly (string | ((store: Store) => void))[] = [
  // A Deck is a name, unique without regard to letter case.
  `
  CREATE TABLE decks (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL
  );
  `,
  // A Note is its Deck, its Note Type, its Fields (a JSON object of Field
  // name to Markdown) and its Tags (a JSON array of words). A Card is one
  // ordinal of one Note, with the FSRS state of its own schedule. A New Card
  // has the state of an empty FSRS card: state 0, no Review, Due from the
  // time it was made. Times are ISO 8601 in UTC, so they compare as text.
  // Deleting a Deck deletes its Notes, and deleting a Note deletes its Cards.
  `
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
  `,
  // A Review is one Grade of one Card: the Grade (1 Again, 2 Hard, 3 Good,
  // 4 Easy), when it was given, and the Card's whole FSRS state from before
  // it, in the same columns as `cards`, so Undo can copy them back. What a day
  // has shown is counted from here. Deleting a Card deletes its Reviews.
  `
  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY,
    card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    grade INTEGER NOT NULL,
    reviewed_at TEXT NOT NULL,
    due TEXT NOT NULL,
    stability REAL NOT NULL,
    difficulty REAL NOT NULL,
    state INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    lapses INTEGER NOT NULL,
    scheduled_days INTEGER NOT NULL,
    learning_step INTEGER NOT NULL,
    last_review TEXT
  );
  CREATE INDEX reviews_by_time ON reviews (reviewed_at);
  CREATE INDEX reviews_by_card ON reviews (card_id);
  `,
  // A Deck is found by its key (see deck-key.ts), which folds letter case
  // beyond ASCII, as NOCASE does not. Two Decks an older file kept apart only
  // by such letters become one: the one made first keeps its name and takes
  // the Notes of the others.
  (store) => {
    store.exec('ALTER TABLE decks ADD COLUMN key TEXT');
    const decks = store.prepare('SELECT id, name FROM decks ORDER BY created_at, id').all() as {
      id: number;
      name: string;
    }[];
    const kept = new Map<string, number>();
    for (const deck of decks) {
      const key = deckKey(deck.name);
      const first = kept.get(key);
      if (first === undefined) {
        kept.set(key, deck.id);
        store.prepare('UPDATE decks SET key = ? WHERE id = ?').run(key, deck.id);
        continue;
      }
      store.prepare('UPDATE notes SET deck_id = ? WHERE deck_id = ?').run(first, deck.id);
      store.prepare('DELETE FROM decks WHERE id = ?').run(deck.id);
    }
    store.exec('CREATE UNIQUE INDEX decks_by_key ON decks (key)');
  },
];

/** Open `flashcards.db`, and bring it up to the current version. */
export function openStore(path: string = FILE): Store {
  const store = new DatabaseSync(path);
  store.exec('PRAGMA foreign_keys = ON');
  const row = store.prepare('PRAGMA user_version').get() as { user_version: number };
  const version = row.user_version;
  if (version > STEPS.length) {
    store.close();
    throw new Error(
      `${path} is at schema version ${version}, and this flashcards knows only up to ` +
        `${STEPS.length}. Run a newer flashcards, or restore an older copy of the file.`,
    );
  }
  for (let step = version; step < STEPS.length; step += 1) {
    within(store, () => {
      const work = STEPS[step] ?? '';
      if (typeof work === 'string') store.exec(work);
      else work(store);
      store.exec(`PRAGMA user_version = ${step + 1}`);
    });
  }
  return store;
}

/** Do this work in one transaction: all of it lands, or none of it does. */
export function within<T>(store: Store, work: () => T): T {
  store.exec('BEGIN IMMEDIATE');
  try {
    const done = work();
    store.exec('COMMIT');
    return done;
  } catch (fault) {
    store.exec('ROLLBACK');
    throw fault;
  }
}
