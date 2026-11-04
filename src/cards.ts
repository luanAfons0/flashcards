/**
 * Cards: one row for each question a Note makes, each with its own FSRS
 * schedule.
 *
 * A Card is made New, with the state of an empty FSRS card: state 0, no
 * Review, Due from the time it was made. What counts as New and what counts
 * as Due is said once here, in SQL, so every count and every Review agrees.
 */
import type { Store } from './store.ts';

/** The FSRS state of a Card that has never had a Review. */
export const NEW_STATE = 0;

/** A Card in `cards` that is a New Card. */
export const IS_NEW = `cards.state = ${NEW_STATE}`;

/**
 * A Card in `cards` that is Due at the time bound to `:now`: it has had a
 * Review, and its time to come back has come. A Card scheduled a day or more
 * ahead is stored as Due from 4:00 of its due day, so this one test holds for
 * every Card.
 */
export const IS_DUE = `cards.state <> ${NEW_STATE} AND cards.due <= :now`;

/** Make one New Card for each ordinal of this Note. Run it inside the Note's transaction. */
export function makeCards(store: Store, noteId: number, ordinals: readonly number[], now: Date): void {
  const insert = store.prepare('INSERT INTO cards (note_id, ordinal, due) VALUES (?, ?, ?)');
  for (const ordinal of ordinals) insert.run(noteId, ordinal, now.toISOString());
}
