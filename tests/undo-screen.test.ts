/**
 * Undo on the Review screen: Z or the Undo button takes back the last Grade
 * of this Review, shows that Card again with its answer, and moves the count
 * left and the session strip back. Undo is disabled with nothing to undo.
 *
 * `web/markdown.js`, `decks.js`, `review.js` and `study.js` run here in
 * node:vm from the bytes a browser is served, in the order the page loads
 * them. The page around them is a stand-in: `byId` hands out plain elements,
 * `call` answers as the Plugin Server would and keeps every call made, and
 * keys reach `study.js` as the document's keydown events.
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
type Next = { card: Card | null; left: number; reviewsToday: number; nextDue: string | null; now: string };
type Element = { hidden: boolean; innerHTML: string; textContent: string; querySelector(selector: string): null };
type Listener = (event: unknown) => void;

function card(id: number, question: string): Card {
  return { id, deck: 'Rust ownership', side: 'Basic', question, answer: 'yes', intervals: ['<1m', '6m', '10m', '8d'] };
}

/**
 * A Review page with these Cards to study, and a Plugin Server stand-in that
 * shows them in order, takes Grades and takes them back.
 */
function reviewPage(cards: readonly Card[]) {
  const elements = new Map<string, Element>();
  const listeners = new Map<string, Listener[]>();
  const calls: [string, Record<string, unknown>][] = [];
  const graded: number[] = [];
  const said: string[] = [];
  const next = (first: Card | undefined): Next => {
    const left = cards.filter((one) => !graded.includes(one.id));
    return { card: first ?? left[0] ?? null, left: left.length, reviewsToday: graded.length, nextDue: null, now: NOW };
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
      if (name === 'next_card') return next(undefined);
      if (name === 'grade_card') {
        graded.push(args['card'] as number);
        return { card: args['card'], grade: args['grade'], due: NOW, review: 100 + graded.length };
      }
      if (name === 'undo_grade') {
        const id = graded.pop()!;
        const back = next(cards.find((one) => one.id === id));
        return { ...back, undone: { review: args['review'], card: id, grade: 3 } };
      }
      throw new Error(`no such tool: ${name}`);
    },
  });
  for (const script of SCRIPTS) runInContext(script, page);
  const fire = (type: string, event: object) => {
    for (const listener of listeners.get(type) ?? []) listener(event);
  };
  const settled = () => new Promise((done) => setImmediate(done));
  return {
    calls,
    said,
    main: () => elements.get('review-main')!.innerHTML,
    start: async () => {
      await (page['startReview'] as (deck: string | null, hooks: object) => Promise<void>)(null, {
        leave: () => {},
        say: (sentence: string) => said.push(sentence),
        compact: false,
      });
    },
    press: async (key: string) => {
      fire('keydown', { key, ctrlKey: false, metaKey: false, altKey: false, target: { closest: () => null }, preventDefault: () => {} });
      await settled();
    },
    click: async (attribute: string) => {
      const target = { hasAttribute: (name: string) => name === attribute, dataset: {} };
      fire('click', { target: { closest: () => target } });
      await settled();
    },
  };
}

/** The classes of each slot of the session strip, in order. */
function strip(html: string): string[] {
  return [...html.matchAll(/<i class="([^"]*)"><\/i>/g)].map((found) => found[1] ?? '');
}

const UNDO_OFF = /<button type="button" class="btn ghost" data-undo disabled>/;
const UNDO_ON = /<button type="button" class="btn ghost" data-undo>/;

test('Undo is disabled until a Grade, and Z with nothing to undo asks nothing', async () => {
  const page = reviewPage([card(1, 'a'), card(2, 'b')]);
  await page.start();

  await page.press('z');

  assert.match(page.main(), UNDO_OFF);
  assert.deepEqual(page.calls.map(([name]) => name), ['next_card']);
});

test('Z takes back the last Grade: the Card comes back with its answer, and the count and strip move back', async () => {
  const page = reviewPage([card(1, 'a'), card(2, 'b'), card(3, 'c')]);
  await page.start();
  await page.press(' ');
  await page.press('3');
  const graded = page.main();

  await page.press('z');

  assert.match(graded, UNDO_ON);
  assert.match(graded, /<span class="left num" aria-live="polite">2 left<\/span>/);
  assert.deepEqual(strip(graded), ['g2', 'now', '']);
  assert.deepEqual(page.calls.at(-1), ['undo_grade', { review: 101 }]);
  assert.match(page.main(), /<div class="front"><p>a<\/p><\/div><div class="answer">/);
  assert.match(page.main(), /data-grade="3"/);
  assert.match(page.main(), /<span class="left num" aria-live="polite">3 left<\/span>/);
  assert.deepEqual(strip(page.main()), ['now', '', '']);
  assert.match(page.main(), UNDO_OFF);
});

test('repeated Undo walks back through this Review, last Grade first, with the button too', async () => {
  const page = reviewPage([card(1, 'a'), card(2, 'b'), card(3, 'c')]);
  await page.start();
  for (const grade of ['3', '1']) {
    await page.press(' ');
    await page.press(grade);
  }

  await page.click('data-undo');
  const once = page.main();
  await page.press('Z');

  assert.deepEqual(page.calls.filter(([name]) => name === 'undo_grade'), [
    ['undo_grade', { review: 102 }],
    ['undo_grade', { review: 101 }],
  ]);
  assert.match(once, /<p>b<\/p>/);
  assert.deepEqual(strip(once), ['g2', 'now', '']);
  assert.match(once, UNDO_ON);
  assert.match(page.main(), /<p>a<\/p>/);
  assert.match(page.main(), UNDO_OFF);
});

test('a new Review starts with nothing to undo', async () => {
  const page = reviewPage([card(1, 'a'), card(2, 'b')]);
  await page.start();
  await page.press(' ');
  await page.press('3');
  await page.press('Escape');

  await page.start();

  assert.match(page.main(), UNDO_OFF);
  assert.deepEqual(strip(page.main()), ['now']);
});
