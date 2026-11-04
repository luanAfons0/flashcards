/**
 * Decks: named groups of Notes, made by the first Note that names one.
 *
 * A Deck name is unique without regard to letter case, and it keeps the case
 * it was first written in. Decks do not nest: `Languages::Japanese` is one
 * name. `list_decks` reads every Deck here with its counts for today.
 */
import { IS_DUE, IS_NEW } from './cards.ts';
import { badInput } from './mcp.ts';
import type { Store } from './store.ts';

/** One Deck with what it holds and what it has for today. */
export type DeckSummary = {
  readonly name: string;
  /** How many Notes the Deck holds. */
  readonly notes: number;
  /** How many Cards those Notes make. */
  readonly cards: number;
  /** How many New Cards it has. */
  readonly new: number;
  /** How many Cards are Due now. */
  readonly due: number;
  /** When its next Card that is not Due yet becomes Due, or null when none is waiting. */
  readonly nextDue: string | null;
};

/** The Deck name a caller gave, without the spaces around it, or a refusal. */
export function checkDeckName(tool: string, given: unknown): string {
  if (typeof given !== 'string' || given.trim() === '') {
    throw badInput(`${tool} needs "deck" as the name of a Deck, such as "Japanese N4 vocabulary".`);
  }
  return given.trim();
}

/** The Deck with this name in any letter case, made now if there is none. Run it inside a transaction. */
export function deckNamed(store: Store, name: string, now: Date): { readonly id: number; readonly name: string } {
  store
    .prepare('INSERT INTO decks (name, created_at) VALUES (?, ?) ON CONFLICT (name) DO NOTHING')
    .run(name, now.toISOString());
  return store.prepare('SELECT id, name FROM decks WHERE name = ?').get(name) as { id: number; name: string };
}

/** Every Deck, by name, with its counts at this time. */
export function summaries(store: Store, now: Date): readonly DeckSummary[] {
  const rows = store
    .prepare(
      `SELECT decks.name AS name,
              COUNT(DISTINCT notes.id) AS notes,
              COUNT(cards.id) AS cards,
              COUNT(CASE WHEN ${IS_NEW} THEN 1 END) AS new,
              COUNT(CASE WHEN ${IS_DUE} THEN 1 END) AS due,
              MIN(CASE WHEN NOT (${IS_NEW}) AND cards.due > :now THEN cards.due END) AS nextDue
         FROM decks
         LEFT JOIN notes ON notes.deck_id = decks.id
         LEFT JOIN cards ON cards.note_id = notes.id
        GROUP BY decks.id
        ORDER BY decks.name COLLATE NOCASE`,
    )
    .all({ now: now.toISOString() }) as DeckSummary[];
  return rows.map((row) => ({ ...row }));
}
