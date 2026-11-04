/**
 * Notes: what you want to remember, written once as Fields, in one Deck, with
 * one Note Type and any Tags.
 *
 * Adding a Note makes its Deck when the name is new, and makes one New Card
 * for each ordinal its Note Type gives. Each check refuses with a sentence
 * that names what to change, and a refused Note leaves nothing behind.
 */
import { makeCards } from './cards.ts';
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
