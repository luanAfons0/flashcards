/**
 * The reminder: one Notice through the Host when Cards are Due, and none when
 * nothing is (FirstMate ADR-0014). flashcards keeps no timer of its own; the
 * scheduler Plugin, or any caller, calls `remind_due` when it wants one.
 *
 * The Due counts are the ones `list_decks` answers, read through the same
 * function, so the Notice and the Plugin Page it opens never disagree. A
 * click on the Notice opens the Plugin Page's root, the Decks. The Host never
 * cuts a text that is too long, it refuses it, so flashcards cuts its own.
 * A refusal from the Host, such as its one Notice every 5 s, is the caller's
 * to hear: it is thrown as it was said, and not tried again.
 */
import { summaries } from './decks.ts';
import { askHost } from './host.ts';
import type { Store } from './store.ts';

/** The method a Notice is sent with. */
const NOTICE_METHOD = 'firstmate/notice';

/** The Host answers a Notice at once; this much is a Host that is not there. */
const ANSWER_WAIT_MS = 10_000;

/** The most Decks the body names. */
const NAMED_DECKS = 3;

/** The longest body the Host takes, in characters. */
const BODY_LIMIT = 200;

/** The longest Deck name the body keeps, so three of them always fit. */
const NAME_LIMIT = 48;

/** What marks a name flashcards cut. */
const SHORTENED = '…';

/** One Notice, as flashcards asks the Host to show it. It has no path: a click opens the Plugin Page. */
export type Notice = { readonly title: string; readonly body: string };

/** What `remind_due` answers: the Cards Due, the Notice sent or null, and that in one sentence. */
export type Reminded = {
  readonly due: number;
  readonly notice: Notice | null;
  readonly said: string;
};

/** Send one Notice when Cards are Due at this time, and none when nothing is. */
export async function remindDue(store: Store, now: Date): Promise<Reminded> {
  const decks = summaries(store, now)
    .filter((deck) => deck.due > 0)
    .toSorted((a, b) => b.due - a.due);
  const due = decks.reduce((sum, deck) => sum + deck.due, 0);
  if (due === 0) return { due, notice: null, said: 'No Card is Due, so no Notice was sent.' };

  const notice = noticeFor(due, decks);
  const answer = await askHost(NOTICE_METHOD, notice, ANSWER_WAIT_MS);
  if (answer.kind === 'refused') throw new Error(answer.said);
  if (answer.kind === 'timed-out') {
    throw new Error('The Host did not answer the Notice. Check that FirstMate is running, and call remind_due again.');
  }
  return { due, notice, said: `Sent the Notice "${notice.title}".` };
}

/** The Notice of this many Due Cards: `12 Cards are Due`, and the Decks with the most. */
function noticeFor(due: number, decks: readonly { readonly name: string; readonly due: number }[]): Notice {
  const named = decks.slice(0, NAMED_DECKS).map((deck) => `${shorten(oneLine(deck.name), NAME_LIMIT)} ${deck.due}`);
  const others = decks.length - named.length;
  if (others > 0) named.push(`and ${others} more ${others === 1 ? 'Deck' : 'Decks'}`);
  return {
    title: due === 1 ? '1 Card is Due' : `${due} Cards are Due`,
    body: shorten(named.join(', '), BODY_LIMIT),
  };
}

/** A text on one line, as a Notice shows it. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A text cut to at most this many characters, with a mark that says so. It
 * counts and cuts by code point, as the Host counts, so a letter outside the
 * Basic Multilingual Plane is never cut in half.
 */
function shorten(text: string, most: number): string {
  const points = [...text];
  if (points.length <= most) return text;
  return `${points.slice(0, most - 1).join('').trimEnd()}${SHORTENED}`;
}
