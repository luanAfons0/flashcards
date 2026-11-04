/**
 * Builders for the Notes and Decks a test needs, made through the tools, as
 * any caller of the Plugin Server makes them.
 */
import type { Answer, Started } from './plugin.ts';
import { structureOf } from './plugin.ts';

/** What `add_note` answers. */
export type Added = { readonly id: number; readonly deck: string; readonly cards: number };

/** One Deck as `list_decks` answers it. */
export type ListedDeck = {
  readonly name: string;
  readonly notes: number;
  readonly cards: number;
  readonly new: number;
  readonly due: number;
  readonly nextDue: string | null;
  /** How many Cards a Review of this Deck alone shows now. */
  readonly left: number;
};

/** What `list_decks` answers. */
export type Listed = {
  readonly decks: readonly ListedDeck[];
  readonly today: { readonly reviews: number; readonly newCards: number };
  readonly limit: { readonly newCards: number; readonly reviews: number };
  readonly now: string;
};

/** Add one Basic Note, and hand back what `add_note` answered. */
export async function addBasic(
  plugin: Started,
  deck: string,
  front: string,
  back: string,
  tags?: readonly string[],
): Promise<Added> {
  const args = { deck, noteType: 'basic', fields: { Front: front, Back: back } };
  return structureOf<Added>(await plugin.call('add_note', tags === undefined ? args : { ...args, tags }));
}

/** Every Deck, as `list_decks` answers it. */
export async function listDecks(plugin: Started): Promise<Listed> {
  return structureOf<Listed>(await plugin.call('list_decks'));
}

/** The sentence a refused call answered, or a failure if it was not refused. */
export function refusalOf(answer: Answer): string {
  if (answer.error === undefined) throw new Error(`the call was not refused: ${JSON.stringify(answer.result)}`);
  return answer.error.message;
}
