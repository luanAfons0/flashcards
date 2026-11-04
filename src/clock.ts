/**
 * The one place flashcards reads the time.
 *
 * Every Due, every day boundary and every Review time comes from a Clock, so
 * a test can fix "now" with one environment variable and never wait for the
 * real time to pass. `FLASHCARDS_NOW` is for tests only: it is an ISO 8601
 * time, and while it is set the Clock never moves. Without it, the Clock is
 * the real clock.
 */

/** The test-only environment variable that fixes the time this Plugin Server treats as now. */
export const NOW_VARIABLE = 'FLASHCARDS_NOW';

/** Now, as this Plugin Server sees it. Each call answers a new Date. */
export type Clock = () => Date;

/**
 * The Clock this environment asks for. A `FLASHCARDS_NOW` that is not a time
 * is refused with a sentence, because a test that meant a time and got the
 * real clock would pass or fail by the hour it ran at.
 */
export function clockFrom(env: NodeJS.ProcessEnv = process.env): Clock {
  const fixed = env[NOW_VARIABLE];
  if (fixed === undefined || fixed === '') return () => new Date();
  const time = Date.parse(fixed);
  if (Number.isNaN(time)) {
    throw new Error(
      `${NOW_VARIABLE} is "${fixed}", which is not a time. Give an ISO 8601 time, such as ` +
        `2026-11-04T10:00:00.000Z, or unset it to use the real clock.`,
    );
  }
  return () => new Date(time);
}
