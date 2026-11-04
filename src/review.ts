/**
 * The Review: which Card comes next, and what a Grade does to it.
 *
 * `reviewQueue` is the one place that decides the order of a Review, for the
 * Plugin Page and the Popup alike. It is made of groups, in this order:
 *
 *   1. Cards Due in a short learning step, by due time;
 *   2. the other Due Cards, by due time;
 *   3. New Cards, in Note creation order;
 *   4. Cards in a learning step that are Due within the next 20 minutes, by
 *      due time, as Anki learns ahead: so a Card graded Again comes back in
 *      the same Review once nothing else is left, rather than ending it.
 *
 * The Daily Limit caps the queue, across Decks: each Card counts once a day,
 * the first time a day shows it, so a Card graded Again today comes back
 * without counting again (see `capped`).
 *
 * Nothing is written until a Grade, so a Card shown but not graded stays
 * Due. A Grade is saved at once, in one transaction, as a Review that keeps
 * the Card's whole state from before it.
 */
import { NEW_STATE } from './cards.ts';
import { capped, reviewsToday } from './daily-limit.ts';
import { badInput } from './mcp.ts';
import { noteTypeOf, type Fields } from './note-types.ts';
import { graded, intervalText, previewed, STATE_COLUMNS, type CardState } from './schedule.ts';
import { within, type Store } from './store.ts';

/** How far ahead a Card in a learning step comes, once nothing else is left. */
export const LEARN_AHEAD_MS = 20 * 60_000;

/** What a Review studies: every Deck, or the one Deck with this id. */
export type Scope = { readonly deckId: number | null };

/** One Card in the queue, with its Note and its Deck. */
export type QueuedCard = CardState & {
  readonly id: number;
  readonly ordinal: number;
  readonly note_type: string;
  readonly fields: string;
  readonly deck: string;
};

/** One Card as a Review shows it: its Deck, its side, its question and answer, and each Grade's interval. */
export type ShownCard = {
  readonly id: number;
  readonly deck: string;
  readonly side: string;
  readonly question: string;
  readonly answer: string;
  /** What each Grade would give, Again first: "<1m", "6m", "10m", "8d". */
  readonly intervals: readonly string[];
};

/** What `next_card` answers. */
export type Next = {
  /** The Card to show now, or null when nothing is left: "Nothing Due". */
  readonly card: ShownCard | null;
  /** How many Cards the Review has left, this one with them. */
  readonly left: number;
  /** How many Reviews today has had, every Grade once. */
  readonly reviewsToday: number;
  /** When the next Card in scope that is not Due yet becomes Due, or null. */
  readonly nextDue: string | null;
  readonly now: string;
};

/** What `grade_card` answers: the Card, its Grade, and when it is Due next. */
export type GradedCard = { readonly card: number; readonly grade: number; readonly due: string };

const LEARNING = `cards.state IN (1, 3)`;

/** Every Card a Review of this scope shows from this time on, in the order it shows them. */
export function reviewQueue(store: Store, scope: Scope, now: Date): readonly QueuedCard[] {
  const at = now.toISOString();
  const ahead = new Date(now.getTime() + LEARN_AHEAD_MS).toISOString();
  return capped(store, [
    ...group(store, scope, `${LEARNING} AND cards.due <= :at`, 'cards.due, cards.id', { at }),
    ...group(store, scope, `cards.state = 2 AND cards.due <= :at`, 'cards.due, cards.id', { at }),
    ...group(store, scope, `cards.state = ${NEW_STATE}`, 'notes.created_at, notes.id, cards.ordinal', {}),
    ...group(store, scope, `${LEARNING} AND cards.due > :at AND cards.due <= :ahead`, 'cards.due, cards.id', { at, ahead }),
  ], now);
}

/** The Card a Review of this scope shows next, and what the Review has left. */
export function nextCard(store: Store, scope: Scope, now: Date): Next {
  const queue = reviewQueue(store, scope, now);
  const first = queue[0];
  return {
    card: first === undefined ? null : shown(first, now),
    left: queue.length,
    reviewsToday: reviewsToday(store, now),
    nextDue: nextDue(store, scope, now),
    now: now.toISOString(),
  };
}

/** Give this Card this Grade now: save the Review and the Card's new state at once. */
export function gradeCard(store: Store, cardId: number, grade: number, now: Date): GradedCard {
  return within(store, () => {
    const before = store.prepare(`SELECT ${STATE_COLUMNS.join(', ')} FROM cards WHERE id = ?`).get(cardId) as
      | CardState
      | undefined;
    if (before === undefined) {
      throw badInput(`There is no Card ${cardId}. Ask next_card for the Card to grade.`);
    }
    const after = graded(cardId, before, grade, now);
    store
      .prepare(
        `INSERT INTO reviews (card_id, grade, reviewed_at, ${STATE_COLUMNS.join(', ')})
         VALUES (?, ?, ?, ${STATE_COLUMNS.map(() => '?').join(', ')})`,
      )
      .run(cardId, grade, now.toISOString(), ...STATE_COLUMNS.map((column) => before[column]));
    store
      .prepare(`UPDATE cards SET ${STATE_COLUMNS.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`)
      .run(...STATE_COLUMNS.map((column) => after[column]), cardId);
    return { card: cardId, grade, due: after.due };
  });
}

function group(
  store: Store,
  scope: Scope,
  where: string,
  order: string,
  bound: Readonly<Record<string, string>>,
): QueuedCard[] {
  return store
    .prepare(
      `SELECT cards.id AS id, cards.ordinal AS ordinal, ${STATE_COLUMNS.map((column) => `cards.${column} AS ${column}`).join(', ')},
              notes.note_type AS note_type, notes.fields AS fields, decks.name AS deck
         FROM cards
         JOIN notes ON notes.id = cards.note_id
         JOIN decks ON decks.id = notes.deck_id
        WHERE ${where} AND (:deck IS NULL OR decks.id = :deck)
        ORDER BY ${order}`,
    )
    .all({ ...bound, deck: scope.deckId }) as QueuedCard[];
}

function shown(card: QueuedCard, now: Date): ShownCard {
  const noteType = noteTypeOf(card.note_type);
  if (noteType === undefined) {
    throw new Error(`Card ${card.id} has the Note Type "${card.note_type}", which this flashcards does not know.`);
  }
  const face = noteType.card(JSON.parse(card.fields) as Fields, card.ordinal);
  return {
    id: card.id,
    deck: card.deck,
    ...face,
    intervals: previewed(card.id, card, now).map((after) => intervalText(after, now)),
  };
}

function nextDue(store: Store, scope: Scope, now: Date): string | null {
  const row = store
    .prepare(
      `SELECT MIN(cards.due) AS due
         FROM cards
         JOIN notes ON notes.id = cards.note_id
        WHERE cards.state <> ${NEW_STATE} AND cards.due > :now AND (:deck IS NULL OR notes.deck_id = :deck)`,
    )
    .get({ now: now.toISOString(), deck: scope.deckId }) as { due: string | null };
  return row.due;
}
