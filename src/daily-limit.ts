/**
 * The Daily Limit and what today has used of it.
 *
 * The limit is the same for every Deck. Until the operator can set it in the
 * Plugin Settings, it is the default: 20 New Cards and 200 Reviews a day.
 * What today has used is counted from the Reviews of today, the day that runs
 * from 4:00 local time, and never kept as a counter of its own, so a Review
 * taken back takes its count with it.
 */
import { dayStart } from './day.ts';
import { NEW_STATE } from './cards.ts';
import type { Store } from './store.ts';

/** The Daily Limit: the most New Cards, and the most Reviews of other Cards, one day shows. */
export type DailyLimit = { readonly newCards: number; readonly reviews: number };

/** What one day has shown so far: Reviews of Cards that were not New, and New Cards. */
export type Today = { readonly reviews: number; readonly newCards: number };

/** The Daily Limit when the operator has set none. */
export const DEFAULT_LIMIT: DailyLimit = { newCards: 20, reviews: 200 };

/** The Daily Limit in force. */
export function dailyLimit(): DailyLimit {
  return DEFAULT_LIMIT;
}

/**
 * What the day that holds this time has shown so far, each Card counted
 * once. A New Card is one whose first Review was today; it does not count as
 * a Review too when it comes back the same day. Every other Card with a
 * Review today counts as one Review, however many Grades it had.
 */
export function today(store: Store, now: Date): Today {
  const row = store
    .prepare(
      `SELECT COUNT(DISTINCT CASE WHEN state = ${NEW_STATE} THEN card_id END) AS newCards,
              COUNT(DISTINCT CASE WHEN card_id NOT IN (
                SELECT card_id FROM reviews
                 WHERE state = ${NEW_STATE} AND reviewed_at >= :start AND reviewed_at < :end
              ) THEN card_id END) AS reviews
         FROM reviews
        WHERE reviewed_at >= :start AND reviewed_at < :end`,
    )
    .get(dayOf(now)) as { newCards: number; reviews: number };
  return { reviews: row.reviews, newCards: row.newCards };
}

/** How many Reviews the day that holds this time has had: every Grade, once each. */
export function reviewsToday(store: Store, now: Date): number {
  const row = store
    .prepare('SELECT COUNT(*) AS reviews FROM reviews WHERE reviewed_at >= :start AND reviewed_at < :end')
    .get(dayOf(now)) as { reviews: number };
  return row.reviews;
}

/** The day that holds this time, as the bounds `reviewed_at` is compared with. */
function dayOf(now: Date): { start: string; end: string } {
  return { start: dayStart(now).toISOString(), end: dayStart(now, 1).toISOString() };
}
