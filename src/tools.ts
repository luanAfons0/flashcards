/**
 * Every tool flashcards serves: its whole public surface, for its own Plugin
 * Page, for other Plugins under a Grant, and for the Mate.
 *
 * Each tool answers its data twice, as JSON text and as structure, and refuses
 * bad input with one sentence the caller can act on.
 */
import type { Clock } from './clock.ts';
import { dailyLimit, today } from './daily-limit.ts';
import { checkDeckName, summaries } from './decks.ts';
import { told, type Tool } from './mcp.ts';
import { noteTypeOf } from './note-types.ts';
import { addNote, checkFields, checkNoteType, checkTags } from './notes.ts';
import type { Store } from './store.ts';

/** What the tools work with: the data, and the time it is now. */
export type Context = {
  readonly store: Store;
  readonly clock: Clock;
};

/** The tools, bound to this Store and this Clock. */
export function toolsFor(context: Context): readonly Tool[] {
  return [addNoteTool(context), listDecks(context)];
}

function addNoteTool({ store, clock }: Context): Tool {
  return {
    name: 'add_note',
    description:
      'Add one Note to a Deck, and make its Cards. The Deck is created when no Deck has this ' +
      'name in any letter case. A "basic" Note has the Fields Front and Back, written in ' +
      'Markdown, and makes one Card. Answers the Note\'s id, its Deck as kept, and how many ' +
      'Cards it made.',
    inputSchema: {
      type: 'object',
      properties: {
        deck: { type: 'string', description: 'The name of the Deck, such as "Japanese N4 vocabulary".' },
        noteType: { type: 'string', enum: ['basic'], description: 'The Note Type.' },
        fields: {
          type: 'object',
          description: 'Each Field of the Note Type by name, in Markdown: for "basic", Front and Back.',
          additionalProperties: { type: 'string' },
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Words to find the Note by, such as ["noun", "lesson-12"]. Optional.',
        },
      },
      required: ['deck', 'noteType', 'fields'],
    },
    call: (given) => {
      const deck = checkDeckName('add_note', given['deck']);
      const key = checkNoteType('add_note', given['noteType']);
      const fields = checkFields('add_note', noteTypeOf(key)!, given['fields']);
      const tags = checkTags('add_note', given['tags']);
      return told(addNote(store, { deck, noteType: key, fields, tags }, clock()));
    },
  };
}

function listDecks({ store, clock }: Context): Tool {
  return {
    name: 'list_decks',
    description:
      'Every Deck, by name, with its Notes, its Cards, its New Cards, the Cards Due now, and ' +
      'when its next Card becomes Due (null when none is waiting). Answers too what today has ' +
      'shown, the Daily Limit, and `now`: the time this Plugin Server treats as now, which the ' +
      'Plugin Page reads due times against.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    call: () => {
      const now = clock();
      return told({
        decks: summaries(store, now),
        today: today(store, now),
        limit: dailyLimit(),
        now: now.toISOString(),
      });
    },
  };
}
