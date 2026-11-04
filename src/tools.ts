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
import { remindDue } from './reminder.ts';
import { gradeCard, nextCard, undoGrade } from './review.ts';
import { within, type Store } from './store.ts';

/** What the tools work with: the data, and the time it is now. */
export type Context = {
  readonly store: Store;
  readonly clock: Clock;
};

/** The tools, bound to this Store and this Clock. */
export function toolsFor(context: Context): readonly Tool[] {
  return [
    addNoteTool(context),
    listDecks(context),
    countDeck(context),
    deleteDeckTool(context),
    ...reviewTools(context),
    undoGradeTool(context),
    remindDueTool(context),
  ];
}

function addNoteTool({ store, clock }: Context): Tool {
  return {
    name: 'add_note',
    description:
      'Add one Note to a Deck, and make its Cards. The Deck is created when no Deck has this ' +
      'name in any letter case. Fields are written in Markdown. A "basic" Note has the Fields ' +
      'Front and Back and makes one Card. A "reversed" (Basic and reversed) Note has the same ' +
      'Fields and makes two: Front to Back and Back to Front. A "cloze" Note has the Fields ' +
      'Text and Extra (optional); Text holds gaps written as in Anki, {{c1::answer}} or ' +
      '{{c1::answer::hint}}, and it makes one Card for each gap number. Answers the Note\'s id, ' +
      'its Deck as kept, and how many Cards it made.',
    inputSchema: {
      type: 'object',
      properties: {
        deck: { type: 'string', description: 'The name of the Deck, such as "Japanese N4 vocabulary".' },
        noteType: { type: 'string', enum: ['basic', 'reversed', 'cloze'], description: 'The Note Type.' },
        fields: {
          type: 'object',
          description:
            'Each Field of the Note Type by name, in Markdown: Front and Back for "basic" and ' +
            '"reversed", Text and Extra for "cloze".',
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
        'or gap it asks ("Basic", "Front to Back", "Back to Front", "Cloze 1"), its question and ' +
        'answer in Markdown, `extra` when a Cloze Card has Extra to show under the answer, and ' +
        'the interval each Grade would give, ' +
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
        'is saved at once as a Review, and FSRS schedules the Card. Answers the Card, its Grade, ' +
        'when it is Due next, and the id of the Review, which undo_grade takes back.',
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

// Undo: the Plugin Page and the Popup keep the id of each Review they made,
// and take them back last first.
function undoGradeTool({ store, clock }: Context): Tool {
  return {
    name: 'undo_grade',
    description:
      'Take back one Grade: the Card gets back its FSRS state from before it, exactly, and the ' +
      'Review is deleted. Only a Card\'s last Review can be taken back, so undo the Reviews of a ' +
      'Review last first. Answers the Grade taken back as `undone` ({ review, card, grade }), ' +
      'then the undone Card as next_card shows it, with what a Review of every Deck, or of the ' +
      'one Deck named, has left.',
    inputSchema: {
      type: 'object',
      properties: {
        review: { type: 'integer', description: 'The id of the Review, as grade_card answered it.' },
        deck: { type: 'string', description: 'The name of the Deck under study. Leave it out when studying every Deck.' },
      },
      required: ['review'],
    },
    call: (given) => {
      const review = given['review'];
      if (!Number.isInteger(review)) {
        throw badInput('undo_grade needs "review" as the id of a Review, as grade_card answered it.');
      }
      const deck = given['deck'] === undefined
        ? null
        : existingDeck('undo_grade', store, checkDeckName('undo_grade', given['deck'])).id;
      return told(undoGrade(store, review as number, { deckId: deck }, clock()));
    },
  };
}

// The reminder: the scheduler Plugin, or any caller, asks for one Notice
// when Cards are Due.
function remindDueTool({ store, clock }: Context): Tool {
  return {
    name: 'remind_due',
    description:
      'Send the operator one Notice when Cards are Due, such as "12 Cards are Due", naming up ' +
      'to three Decks with their counts; a click on it opens the Plugin Page. With nothing Due ' +
      'it sends nothing. Answers how many Cards are Due, the Notice sent (null when none was), ' +
      'and that in one sentence. A refusal from the Host, such as its one Notice every 5 s, ' +
      'comes back as the error.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    call: async () => told(await remindDue(store, clock())),
  };
}
