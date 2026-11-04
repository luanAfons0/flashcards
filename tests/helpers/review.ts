/**
 * Builders for a Review, driven through the tools as the Plugin Page drives
 * them: ask for the next Card, Grade it, and move the clock by starting the
 * Plugin Server again on the same directory at a later time.
 */
import type { TestContext } from 'node:test';
import type { Started } from './plugin.ts';
import { startedAndShaken, structureOf } from './plugin.ts';

/** One Card as `next_card` shows it. */
export type ShownCard = {
  readonly id: number;
  readonly deck: string;
  readonly side: string;
  readonly question: string;
  readonly answer: string;
  readonly intervals: readonly string[];
};

/** What `next_card` answers. */
export type Next = {
  readonly card: ShownCard | null;
  readonly left: number;
  readonly reviewsToday: number;
  readonly nextDue: string | null;
  readonly now: string;
};

/** What `grade_card` answers. */
export type Graded = { readonly card: number; readonly grade: number; readonly due: string };

/** The Grades by name, as `grade_card` takes them. */
export const AGAIN = 1;
export const HARD = 2;
export const GOOD = 3;
export const EASY = 4;

/** The next Card of a Review of every Deck, or of the one Deck named. */
export async function nextCard(plugin: Started, deck?: string): Promise<Next> {
  return structureOf<Next>(await plugin.call('next_card', deck === undefined ? {} : { deck }));
}

/** Grade one Card, and hand back what `grade_card` answered. */
export async function grade(plugin: Started, card: number, given: number): Promise<Graded> {
  return structureOf<Graded>(await plugin.call('grade_card', { card, grade: given }));
}

/** Grade whatever Card comes next, and hand back that Card. */
export async function gradeNext(plugin: Started, given: number, deck?: string): Promise<ShownCard> {
  const { card } = await nextCard(plugin, deck);
  if (card === null) throw new Error('there was no Card to grade');
  await grade(plugin, card.id, given);
  return card;
}

/** Stop this Plugin Server, and start another on its directory at this time. */
export async function at(t: TestContext, plugin: Started, time: string, tz = 'UTC'): Promise<Started> {
  plugin.stop();
  await plugin.ended();
  return startedAndShaken(t, { directory: plugin.directory, env: { FLASHCARDS_NOW: time, TZ: tz } });
}
