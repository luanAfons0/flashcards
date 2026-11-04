/**
 * Every tool flashcards serves: its whole public surface, for its own Plugin
 * Page, for other Plugins under a Grant, and for the Mate.
 *
 * Each tool answers its data twice, as JSON text and as structure, and refuses
 * bad input with one sentence the caller can act on.
 */
import type { Clock } from './clock.ts';
import { told, type Tool } from './mcp.ts';
import type { Store } from './store.ts';

/** What the tools work with: the data, and the time it is now. */
export type Context = {
  readonly store: Store;
  readonly clock: Clock;
};

/** The tools, bound to this Store and this Clock. */
export function toolsFor(context: Context): readonly Tool[] {
  return [listDecks(context)];
}

function listDecks({ store, clock }: Context): Tool {
  return {
    name: 'list_decks',
    description:
      'Every Deck, by name. Answers `now` too: the time this Plugin Server treats as now, ' +
      'which the Plugin Page reads due times against.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    call: () => {
      const decks = store
        .prepare('SELECT name FROM decks ORDER BY name COLLATE NOCASE')
        .all() as { name: string }[];
      return told({ decks: decks.map((deck) => ({ name: deck.name })), now: clock().toISOString() });
    },
  };
}
