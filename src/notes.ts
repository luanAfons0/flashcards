/**
 * Notes: what you want to remember, written once as Fields, in one Deck, with
 * one Note Type and any Tags.
 *
 * Adding a Note makes its Deck when the name is new, and makes one New Card
 * for each ordinal its Note Type gives. Each check refuses with a sentence
 * that names what to change, and a refused Note leaves nothing behind.
 */
import { makeCards, NEW_STATE } from './cards.ts';
import { deckNamed } from './decks.ts';
import { badInput } from './mcp.ts';
import { listed, NOTE_TYPES, noteTypeOf, type Fields, type NoteType } from './note-types.ts';
import { within, type Store } from './store.ts';

/** A Note to add, already checked. */
export type NewNote = {
  readonly deck: string;
  readonly noteType: string;
  readonly fields: Fields;
  readonly tags: readonly string[];
};

/** What adding a Note answers: its id, the name of its Deck as kept, and how many Cards it made. */
export type AddedNote = { readonly id: number; readonly deck: string; readonly cards: number };

/** The key of the Note Type a caller named, or a refusal that names the ones there are. */
export function checkNoteType(tool: string, given: unknown): string {
  const known = listed(Object.keys(NOTE_TYPES).map((key) => `"${key}"`));
  if (typeof given !== 'string' || given === '') {
    throw badInput(`${tool} needs "noteType" as one of ${known}.`);
  }
  if (noteTypeOf(given) === undefined) {
    throw badInput(`There is no Note Type "${given}". Give one of ${known}.`);
  }
  return given;
}

/**
 * The Fields a caller gave for this Note Type, or a refusal. Every Field of
 * the Note Type must be there as text with something in it, and no other;
 * an optional Field may be left out or empty, and is kept as empty text.
 */
export function checkFields(tool: string, noteType: NoteType, given: unknown): Fields {
  const names = listed(noteType.fields);
  if (typeof given !== 'object' || given === null || Array.isArray(given)) {
    throw badInput(`${tool} needs "fields" as an object with the Fields ${names}.`);
  }
  const fields = given as Record<string, unknown>;
  for (const name of Object.keys(fields)) {
    if (!noteType.fields.includes(name)) {
      throw badInput(`A ${noteType.name} Note has no Field "${name}". Its Fields are ${names}.`);
    }
  }
  for (const name of noteType.fields) {
    const value = fields[name];
    const optional = noteType.optional.includes(name);
    if (value === undefined && optional) continue;
    if (value === undefined) throw badInput(`A ${noteType.name} Note needs its ${name} Field. Its Fields are ${names}.`);
    if (typeof value !== 'string') throw badInput(`The ${name} Field must be text, written in Markdown.`);
    if (value.trim() === '' && !optional) throw badInput(`The ${name} Field is empty. Write what it should hold.`);
  }
  return Object.fromEntries(noteType.fields.map((name) => [name, (fields[name] as string | undefined) ?? '']));
}

/**
 * The Tags a caller gave, each one word, kept once each in the order given,
 * or a refusal. No Tags given is no Tags.
 */
export function checkTags(tool: string, given: unknown): readonly string[] {
  if (given === undefined || given === null) return [];
  if (!Array.isArray(given)) throw badInput(`${tool} takes "tags" as a list of Tags, each one word, such as ["noun", "lesson-12"].`);
  const tags: string[] = [];
  for (const each of given) {
    const tag = typeof each === 'string' ? each.trim() : '';
    if (tag === '') throw badInput('Each Tag must be a word, such as "lesson-12".');
    if (/\s/.test(tag)) {
      throw badInput(`The Tag "${tag}" has a space in it. Make it one word, such as "${tag.replace(/\s+/g, '-')}".`);
    }
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

/** Add this Note, its Deck if it is new, and its Cards, all in one transaction. */
export function addNote(store: Store, note: NewNote, now: Date): AddedNote {
  const noteType = noteTypeOf(note.noteType);
  if (noteType === undefined) throw new Error(`There is no Note Type "${note.noteType}".`);
  const ordinals = noteType.ordinals(note.fields);
  if (ordinals.length === 0) throw badInput(noteType.noCard);
  return within(store, () => {
    const deck = deckNamed(store, note.deck, now);
    const time = now.toISOString();
    const { lastInsertRowid } = store
      .prepare(
        'INSERT INTO notes (deck_id, note_type, fields, tags, created_at, modified_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(deck.id, note.noteType, JSON.stringify(note.fields), JSON.stringify(note.tags), time, time);
    const id = Number(lastInsertRowid);
    makeCards(store, id, ordinals, now);
    return { id, deck: deck.name, cards: ordinals.length };
  });
}

/** A Note that is there: its id, its Deck as kept, its Note Type, Fields and Tags. */
export type KeptNote = {
  readonly id: number;
  readonly deck: string;
  readonly noteType: string;
  readonly fields: Fields;
  readonly tags: readonly string[];
};

/**
 * One Card of a Note: its ordinal, the side or gap it asks as a Review names
 * it, when it is Due next (null for a New Card, which waits for its first
 * Review), and how many Reviews it has had.
 */
export type NoteCard = {
  readonly id: number;
  readonly ordinal: number;
  readonly side: string;
  readonly due: string | null;
  readonly reviews: number;
};

/** The id of a Note a caller gave, or a refusal. */
export function checkNoteId(tool: string, given: unknown): number {
  if (!Number.isInteger(given)) throw badInput(`${tool} needs "id" as the id of a Note, as list_notes answers it.`);
  return given as number;
}

/** The Note with this id, or a refusal when there is none. */
export function existingNote(tool: string, store: Store, id: number): KeptNote {
  const row = store
    .prepare(
      `SELECT notes.id AS id, decks.name AS deck, notes.note_type AS noteType, notes.fields AS fields, notes.tags AS tags
         FROM notes JOIN decks ON decks.id = notes.deck_id
        WHERE notes.id = ?`,
    )
    .get(id) as { id: number; deck: string; noteType: string; fields: string; tags: string } | undefined;
  if (row === undefined) {
    throw badInput(`${tool} found no Note with the id ${id}. list_notes names the Notes of a Deck with their ids.`);
  }
  return { ...row, fields: JSON.parse(row.fields) as Fields, tags: JSON.parse(row.tags) as string[] };
}

/** Each Card of this Note, by ordinal. */
export function cardsOf(store: Store, note: KeptNote): readonly NoteCard[] {
  const noteType = noteTypeOf(note.noteType);
  if (noteType === undefined) throw new Error(`Note ${note.id} has the Note Type "${note.noteType}", which this flashcards does not know.`);
  const rows = store
    .prepare(
      `SELECT cards.id AS id, cards.ordinal AS ordinal, cards.state AS state, cards.due AS due,
              (SELECT COUNT(*) FROM reviews WHERE reviews.card_id = cards.id) AS reviews
         FROM cards WHERE cards.note_id = ? ORDER BY cards.ordinal`,
    )
    .all(note.id) as { id: number; ordinal: number; state: number; due: string; reviews: number }[];
  return rows.map((row) => ({
    id: row.id,
    ordinal: row.ordinal,
    side: noteType.card(note.fields, row.ordinal).side,
    due: row.state === NEW_STATE ? null : row.due,
    reviews: row.reviews,
  }));
}

/** A change to a Note, already checked: its id, then what it should be. */
export type NoteChange = NewNote & { readonly id: number };

/**
 * What changing a Note answers: its id, its Deck as kept, how many Cards it
 * makes now, and the ordinals of the Cards it made and deleted.
 */
export type UpdatedNote = {
  readonly id: number;
  readonly deck: string;
  readonly cards: number;
  readonly added: readonly number[];
  readonly deleted: readonly number[];
};

/** Whether a Note Type is Cloze, which a Note never changes to or from. */
function isCloze(key: string): boolean {
  return key === 'cloze';
}

/**
 * Change a Note by the edit rules, all in one transaction. Its Cards are
 * compared by ordinal, old against new: a Card whose ordinal stays keeps its
 * id, its schedule and its Reviews; one whose ordinal goes is deleted with
 * its Reviews (ON DELETE CASCADE); and a new ordinal makes a New Card. A
 * change to or from Cloze is refused, since a gap number and a side are not
 * the same Card.
 */
export function updateNote(tool: string, store: Store, change: NoteChange, now: Date): UpdatedNote {
  const noteType = noteTypeOf(change.noteType);
  if (noteType === undefined) throw new Error(`There is no Note Type "${change.noteType}".`);
  return within(store, () => {
    const old = existingNote(tool, store, change.id);
    if (isCloze(old.noteType) !== isCloze(change.noteType)) {
      const from = NOTE_TYPES[old.noteType]?.name ?? old.noteType;
      throw badInput(
        `A ${from} Note cannot become a ${noteType.name} Note, because its Cards would not carry over. ` +
          `Add a new ${noteType.name} Note instead.`,
      );
    }
    const ordinals = noteType.ordinals(change.fields);
    if (ordinals.length === 0) throw badInput(noteType.noCard);
    const kept = (store.prepare('SELECT ordinal FROM cards WHERE note_id = ?').all(change.id) as { ordinal: number }[])
      .map((row) => row.ordinal);
    const added = ordinals.filter((ordinal) => !kept.includes(ordinal));
    const deleted = kept.filter((ordinal) => !ordinals.includes(ordinal)).sort((a, b) => a - b);
    const deck = deckNamed(store, change.deck, now);
    store
      .prepare('UPDATE notes SET deck_id = ?, note_type = ?, fields = ?, tags = ?, modified_at = ? WHERE id = ?')
      .run(deck.id, change.noteType, JSON.stringify(change.fields), JSON.stringify(change.tags), now.toISOString(), change.id);
    const remove = store.prepare('DELETE FROM cards WHERE note_id = ? AND ordinal = ?');
    for (const ordinal of deleted) remove.run(change.id, ordinal);
    makeCards(store, change.id, added, now);
    return { id: change.id, deck: deck.name, cards: ordinals.length, added, deleted };
  });
}

/** What deleting a Note answers: its id, its Deck, and how many Cards and Reviews went with it. */
export type DeletedNote = { readonly id: number; readonly deck: string; readonly cards: number; readonly reviews: number };

/**
 * Delete one Note, and answer what went with it. Its Cards and their Reviews
 * go by the schema's ON DELETE CASCADE; its Deck stays, even with no Note
 * left. Run it inside a transaction, so the counts are exactly what was
 * deleted.
 */
export function deleteNote(tool: string, store: Store, id: number): DeletedNote {
  const note = existingNote(tool, store, id);
  const cards = cardsOf(store, note);
  store.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return { id, deck: note.deck, cards: cards.length, reviews: cards.reduce((sum, card) => sum + card.reviews, 0) };
}
