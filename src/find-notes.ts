/**
 * Finding Notes: the Notes of one Deck that hold every word searched, in any
 * Field or Tag, and every Tag chosen, as the Notes view lists them.
 *
 * Words are matched as text inside a Field or a Tag, in any letter case, so
 * part of a word finds it too. A Tag chosen is matched whole, as it was
 * written. The search runs here, not in SQL, so a word is never read as a
 * pattern.
 */
import { IS_NEW } from './cards.ts';
import { badInput } from './mcp.ts';
import type { Fields } from './note-types.ts';
import type { Store } from './store.ts';

/** One Note as the Notes view lists it: its Note Type, Fields and Tags, and when it is next Due. */
export type ListedNote = {
  readonly id: number;
  readonly noteType: string;
  readonly fields: Fields;
  readonly tags: readonly string[];
  /** When its first Card that has had a Review is Due, or null when every Card is a New Card. */
  readonly nextDue: string | null;
};

/** What finding Notes answers: the Deck as kept, how many Notes it holds, every Tag in it, and the Notes found. */
export type FoundNotes = {
  readonly deck: string;
  readonly total: number;
  readonly tags: readonly string[];
  readonly notes: readonly ListedNote[];
};

/** The search a caller gave, as its words, or a refusal. No search is no words. */
export function checkSearch(tool: string, given: unknown): readonly string[] {
  if (given === undefined || given === null) return [];
  if (typeof given !== 'string') throw badInput(`${tool} takes "search" as words to find in any Field or Tag, such as "kaisha".`);
  return given.toLowerCase().split(/\s+/).filter((word) => word !== '');
}

/** Whether a Note holds every word, in a Field or a Tag. */
function holds(note: ListedNote, words: readonly string[]): boolean {
  const texts = [...Object.values(note.fields), ...note.tags].map((text) => text.toLowerCase());
  return words.every((word) => texts.some((text) => text.includes(word)));
}

/** The Notes of this Deck, in the order they were added, that hold every word and every Tag. */
export function findNotes(
  store: Store,
  deck: { readonly id: number; readonly name: string },
  words: readonly string[],
  tags: readonly string[],
): FoundNotes {
  const rows = store
    .prepare(
      `SELECT notes.id AS id, notes.note_type AS noteType, notes.fields AS fields, notes.tags AS tags,
              MIN(CASE WHEN NOT (${IS_NEW}) THEN cards.due END) AS nextDue
         FROM notes LEFT JOIN cards ON cards.note_id = notes.id
        WHERE notes.deck_id = ?
        GROUP BY notes.id
        ORDER BY notes.id`,
    )
    .all(deck.id) as { id: number; noteType: string; fields: string; tags: string; nextDue: string | null }[];
  const every: ListedNote[] = rows.map((row) => ({
    ...row,
    fields: JSON.parse(row.fields) as Fields,
    tags: JSON.parse(row.tags) as string[],
  }));
  const kept = [...new Set(every.flatMap((note) => note.tags))].sort((a, b) => a.localeCompare(b));
  return {
    deck: deck.name,
    total: every.length,
    tags: kept,
    notes: every.filter((note) => tags.every((tag) => note.tags.includes(tag)) && holds(note, words)),
  };
}
