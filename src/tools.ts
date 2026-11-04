/**
 * Every tool flashcards serves: its whole public surface, for its own Plugin
 * Page, for other Plugins under a Grant, and for the Mate.
 *
 * Each tool answers its data twice, as JSON text and as structure, and refuses
 * bad input with one sentence the caller can act on.
 */
import type { Clock } from './clock.ts';
import { dailyLimit, today } from './daily-limit.ts';
import { checkDeckName, contentsOf, deleteDeck, existingDeck, summaries } from './decks.ts';
import { badInput, told, type Tool } from './mcp.ts';
import { noteTypeOf } from './note-types.ts';
import { addNote, checkFields, checkNoteType, checkTags } from './notes.ts';
import { gradeCard, nextCard } from './review.ts';
import { within, type Store } from './store.ts';

/** What the tools work with: the data, and the time it is now. */
export type Context = {
  readonly store: Store;
  readonly clock: Clock;
};

/** The tools, bound to this Store and this Clock. */
export function toolsFor(context: Context): readonly Tool[] {
  return [addNoteTool(context), listDecks(context), countDeck(context), deleteDeckTool(context), ...reviewTools(context)];
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

/** The one argument of the Deck tools: the name of a Deck that is there. */
const DECK_ONLY = {
  type: 'object',
  properties: {
    deck: { type: 'string', description: 'The name of the Deck, in any letter case, such as "Japanese N4 vocabulary".' },
  },
  required: ['deck'],
} as const;

function countDeck({ store }: Context): Tool {
  return {
    name: 'count_deck',
    description:
      'What one Deck holds, before you delete it: its name as kept, and how many Notes, Cards ' +
      'and Reviews delete_deck would delete with it. Changes nothing.',
    inputSchema: DECK_ONLY,
    call: (given) => {
      const deck = existingDeck('count_deck', store, checkDeckName('count_deck', given['deck']));
      return told(contentsOf(store, deck));
    },
  };
}

function deleteDeckTool({ store }: Context): Tool {
  return {
    name: 'delete_deck',
    description:
      'Delete one Deck with its Notes, their Cards and the Cards\' Reviews. It cannot be undone, ' +
      'and no other Deck changes. Answers the Deck\'s name and how many Notes, Cards and Reviews ' +
      'it deleted, as count_deck counts them.',
    inputSchema: DECK_ONLY,
    call: (given) => {
      const deck = checkDeckName('delete_deck', given['deck']);
      return told(within(store, () => deleteDeck('delete_deck', store, deck)));
    },
  };
}

// The Review: the Plugin Page and the Popup ask for the next Card, then
// grade it, one Card at a time.
function reviewTools({ store, clock }: Context): readonly Tool[] {
  return [
    {
      name: 'next_card',
      description:
        'The next Card of a Review of every Deck, or of the one Deck named: its Deck, which side ' +
        'it asks, its question and answer in Markdown, and the interval each Grade would give, ' +
        'Again first. Answers too how many Cards are left, how many Reviews today has had, and ' +
        'when the next Card is Due. With nothing left, the Card is null. Nothing is saved: a ' +
        'Card shown but not graded stays Due.',
      inputSchema: {
        type: 'object',
        properties: {
          deck: { type: 'string', description: 'The name of one Deck to study. Leave it out to study every Deck.' },
        },
        required: [],
      },
      call: (given) => {
        const deck = given['deck'] === undefined
          ? null
          : existingDeck('next_card', store, checkDeckName('next_card', given['deck'])).id;
        return told(nextCard(store, { deckId: deck }, clock()));
      },
    },
    {
      name: 'grade_card',
      description:
        'Grade one Card, as next_card showed it: 1 Again, 2 Hard, 3 Good or 4 Easy. The Grade ' +
        'is saved at once as a Review, and FSRS schedules the Card. Answers the Card, its Grade ' +
        'and when it is Due next.',
      inputSchema: {
        type: 'object',
        properties: {
          card: { type: 'integer', description: 'The id of the Card, as next_card answered it.' },
          grade: { type: 'integer', enum: [1, 2, 3, 4], description: '1 Again, 2 Hard, 3 Good or 4 Easy.' },
        },
        required: ['card', 'grade'],
      },
      call: (given) => {
        const card = given['card'];
        if (!Number.isInteger(card)) throw badInput('grade_card needs "card" as the id of a Card, as next_card answered it.');
        const grade = given['grade'];
        if (!Number.isInteger(grade) || (grade as number) < 1 || (grade as number) > 4) {
          throw badInput('grade_card needs "grade" as 1 (Again), 2 (Hard), 3 (Good) or 4 (Easy).');
        }
        return told(gradeCard(store, card as number, grade as number, clock()));
      },
    },
  ];
}
