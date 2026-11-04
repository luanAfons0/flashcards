/**
 * The keys and answers of a Review that must never Grade by accident: Space
 * once the answer shows, Esc when no Card came, and a Grade whose answer
 * lands after the Review ended.
 *
 * `web/markdown.js`, `decks.js`, `review.js` and `study.js` run here in
 * node:vm from the bytes a browser is served, in the order the page loads
 * them. The page around them is a stand-in: `byId` hands out plain elements,
 * `call` answers as the Plugin Server would, or fails, or holds its answer
 * until the test lets it go, and keys reach `study.js` as the document's
 * keydown events.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

process.env['TZ'] = 'UTC';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPTS = await Promise.all(
  ['markdown.js', 'decks.js', 'review.js', 'study.js'].map((script) => readFile(join(REPOSITORY, 'web', script), 'utf8')),
);
const NOW = '2026-11-04T10:00:00.000Z';

type Card = { id: number; deck: string; side: string; question: string; answer: string; intervals: string[] };
type Element = { hidden: boolean; innerHTML: string; textContent: string; querySelector(selector: string): null };
type Listener = (event: unknown) => void;
type Options = { fault?: string; hold?: string };

function card(id: number, question: string): Card {
  return { id, deck: 'Rust ownership', side: 'Basic', question, answer: 'yes', intervals: ['<1m', '6m', '10m', '8d'] };
}

/**
 * A Review page with these Cards to study. With `fault`, every call fails
 * with that sentence; with `hold`, each call to that tool waits for `let()`.
 */
function reviewPage(cards: readonly Card[], options: Options = {}) {
  const elements = new Map<string, Element>();
  const listeners = new Map<string, Listener[]>();
  const calls: [string, Record<string, unknown>][] = [];
  const graded: number[] = [];
  const said: string[] = [];
  const left: string[] = [];
  const held: (() => void)[] = [];
  const answer = (name: string, args: Record<string, unknown>): unknown => {
    if (name === 'next_card') {
      const rest = cards.filter((one) => !graded.includes(one.id));
      return { card: rest[0] ?? null, left: rest.length, reviewsToday: graded.length, nextDue: null, now: NOW };
    }
    if (name === 'grade_card') {
      graded.push(args['card'] as number);
      return { card: args['card'], grade: args['grade'], due: NOW, review: 100 + graded.length };
    }
    throw new Error(`no such tool: ${name}`);
  };
  const page = createContext({
    document: {
      addEventListener: (type: string, listener: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    },
    byId: (id: string): Element => {
      if (!elements.has(id)) elements.set(id, { hidden: false, innerHTML: '', textContent: '', querySelector: () => null });
      return elements.get(id)!;
    },
    call: async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      calls.push([name, JSON.parse(JSON.stringify(args)) as Record<string, unknown>]);
      if (options.fault !== undefined) throw new Error(options.fault);
      if (name === options.hold) await new Promise<void>((go) => held.push(go));
      return answer(name, args);
    },
  });
  for (const script of SCRIPTS) runInContext(script, page);
  const settled = () => new Promise((done) => setImmediate(done));
  const hooks = {
    leave: () => left.push('left'),
    say: (sentence: string) => said.push(sentence),
    compact: false,
  };

  /** Press a key, as the document gets it, and say whether a script took it. */
  const key = (name: string, repeat = false): boolean => {
    let taken = false;
    const event = {
      key: name,
      repeat,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: { closest: () => null },
      preventDefault: () => {
        taken = true;
      },
    };
    for (const listener of listeners.get('keydown') ?? []) listener(event);
    return taken;
  };
  return {
    calls,
    said,
    left,
    main: () => elements.get('review-main')?.innerHTML ?? '',
    start: () => (page['startReview'] as (deck: string | null, hooks: object) => Promise<void>)(null, hooks),
    end: () => (page['endReview'] as () => void)(),
    key,
    press: async (name: string, repeat = false): Promise<boolean> => {
      const taken = key(name, repeat);
      await settled();
      return taken;
    },
    /** Let every held call answer. */
    release: async () => {
      for (const go of held.splice(0)) go();
      await settled();
    },
    settled,
  };
}

/** The classes of each slot of the session strip, in order. */
function strip(html: string): string[] {
  return [...html.matchAll(/<i class="([^"]*)"><\/i>/g)].map((found) => found[1] ?? '');
}

const ANSWER = /<div class="answer">/;

test('once the answer shows, Space is taken and Grades nothing, so it never presses the focused Good', async () => {
  const page = reviewPage([card(1, 'a'), card(2, 'b')]);
  await page.start();
  await page.press(' ');

  const taken = await page.press(' ');

  assert.ok(taken, 'Space reached the focused Good button');
  assert.match(page.main(), ANSWER);
  assert.deepEqual(page.calls.map(([name]) => name), ['next_card']);
});

test('Space held down shows the answer once, and its repeats show nothing more and Grade nothing', async () => {
  const page = reviewPage([card(1, 'a'), card(2, 'b')]);
  await page.start();

  await page.press(' ');
  const repeats = [await page.press(' ', true), await page.press(' ', true)];
  await page.press('3');
  const repeatOnNext = await page.press(' ', true);

  assert.deepEqual(repeats, [true, true]);
  assert.ok(repeatOnNext, 'a held Space on the next Card was not taken');
  assert.deepEqual(page.calls.map(([name]) => name), ['next_card', 'grade_card', 'next_card']);
  assert.match(page.main(), /<p>b<\/p>/);
  assert.doesNotMatch(page.main(), ANSWER, 'a held Space showed the next answer');
});

test('when next_card fails, Esc still leaves the Review', async () => {
  const page = reviewPage([card(1, 'a')], { fault: 'The Plugin Server stopped, so no Card can show.' });
  await assert.rejects(page.start(), /The Plugin Server stopped/);

  const taken = await page.press('Escape');

  assert.ok(taken);
  assert.deepEqual(page.left, ['left']);
});

test('a Review that ends leaves no Card behind for the next one to show while it loads', async () => {
  const page = reviewPage([card(1, 'a')]);
  await page.start();
  assert.match(page.main(), /<p>a<\/p>/);

  page.end();

  assert.equal(page.main(), '');
});

test('a Grade whose answer lands after its Review ended counts in no other Review', async () => {
  const page = reviewPage([card(1, 'a'), card(2, 'b')], { hold: 'grade_card' });
  await page.start();
  await page.press(' ');
  await page.press('3');
  page.end();
  await page.start();

  await page.release();
  await page.press('z');

  assert.deepEqual(strip(page.main()), ['now', '']);
  assert.match(page.main(), /<button type="button" class="btn ghost" data-undo disabled>/);
  assert.deepEqual(page.calls.map(([name]) => name), ['next_card', 'grade_card', 'next_card']);
});

test('a new Review can Grade at once, though a Grade of the last one is still on its way', async () => {
  const page = reviewPage([card(1, 'a'), card(2, 'b')], { hold: 'grade_card' });
  await page.start();
  await page.press(' ');
  await page.press('3');
  page.end();
  await page.start();

  await page.press(' ');
  await page.press('4');

  assert.deepEqual(page.calls.map(([name]) => name), ['next_card', 'grade_card', 'next_card', 'grade_card']);
});
