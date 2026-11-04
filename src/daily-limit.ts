/**
 * The Daily Limit and what today has used of it.
 *
 * The limit is the same for every Deck. Until the operator can set it in the
 * Plugin Settings, it is the default: 20 New Cards and 200 Reviews a day.
 * What today has used is counted from the Reviews of today; until Cards can
 * have a Review, none has had one.
 */
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

/** What the day that holds this time has shown so far. */
export function today(_store: Store, _now: Date): Today {
  return { reviews: 0, newCards: 0 };
}
