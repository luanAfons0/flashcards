/**
 * The Popup: the same Review as the Plugin Page, compact, started the moment
 * the Host shows it, and hidden by Esc.
 *
 * The Host hides the Popup when its page navigates away from its own address,
 * and every hide unloads the page, so a Grade must be on its way the moment
 * its key is pressed. `web/markdown.js`, `decks.js`, `review.js`, `study.js`
 * and `popup.js` run here in node:vm from the bytes a browser is served, in
 * the order popup.html loads them. The page around them is a stand-in:
 * `document.getElementById` hands out plain elements, `call` answers as the
 * Plugin Server would and keeps every call made, `location.assign` keeps
 * every address the page goes to, and keys reach the scripts as the
 * document's keydown events.
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
  ['markdown.js', 'decks.js', 'review.js', 'study.js', 'popup.js'].map((script) =>
    readFile(join(REPOSITORY, 'web', script), 'utf8'),
  ),
);
const NOW = '2026-11-04T10:00:00.000Z';

type Card = { id: number; deck: string; side: string; question: string; answer: string; intervals: string[] };
type Next = { card: Card | null; left: number; reviewsToday: number; nextDue: string | null; now: string };
type Element = { hidden: boolean; innerHTML: string; textContent: string; querySelector(selector: string): null };
type Listener = (event: unknown) => void;

function card(id: number, question: string): Card {
  return { id, deck: 'Japanese N4 vocabulary', side: 'Basic', question, answer: 'yes', intervals: ['<1m', '6m', '1d', '3d'] };
}

/**
 * The Popup as the Host shows it, with these Cards to study, or with a Plugin
 * Server that cannot be reached when `fault` is given.
 */
async function popup(cards: readonly Card[], fault?: string) {
  const elements = new Map<string, Element>();
  const listeners = new Map<string, Listener[]>();
  const calls: [string, Record<string, unknown>][] = [];
  const assigned: string[] = [];
  const graded: number[] = [];
  const next = (first: Card | undefined): Next => {
    const left = cards.filter((one) => !graded.includes(one.id));
    return { card: first ?? left[0] ?? null, left: left.length, reviewsToday: graded.length, nextDue: null, now: NOW };
  };
  const page = createContext({
    document: {
      addEventListener: (type: string, listener: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
      getElementById: (id: string): Element => {
        if (!elements.has(id)) elements.set(id, { hidden: id === 'banner' || id === 'review-done', innerHTML: '', textContent: '', querySelector: () => null });
        return elements.get(id)!;
      },
    },
    location: { assign: (address: string) => assigned.push(address) },
    call: async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      calls.push([name, JSON.parse(JSON.stringify(args)) as Record<string, unknown>]);
      if (fault !== undefined) throw new Error(fault);
      if (name === 'next_card') return next(undefined);
      if (name === 'grade_card') {
        graded.push(args['card'] as number);
        return { card: args['card'], grade: args['grade'], due: NOW, review: 100 + graded.length };
      }
      if (name === 'undo_grade') {
        const id = graded.pop()!;
        return { ...next(cards.find((one) => one.id === id)), undone: { review: args['review'], card: id, grade: 3 } };
      }
      throw new Error(`no such tool: ${name}`);
    },
  });
  const settled = () => new Promise((done) => setImmediate(done));
  for (const script of SCRIPTS) runInContext(script, page);
  await settled();

  /** Press a key, as the document gets it, and say whether a script took it. */
  const key = (name: string): boolean => {
    let taken = false;
    const event = {
      key: name,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: { closest: () => null },
      get defaultPrevented() {
        return taken;
      },
      preventDefault: () => {
        taken = true;
      },
    };
    for (const listener of listeners.get('keydown') ?? []) listener(event);
    return taken;
  };
  return {
    calls,
    assigned,
    element: (id: string) => elements.get(id)!,
    main: () => elements.get('review-main')!.innerHTML,
    key,
    press: async (name: string) => {
      key(name);
      await settled();
    },
  };
}

/** The classes of each slot of the session strip, in order. */
function strip(html: string): string[] {
  return [...html.matchAll(/<i class="([^"]*)"><\/i>/g)].map((found) => found[1] ?? '');
}

test('the Popup starts a Review of every Deck as it loads, in the compact layout', async () => {
  const shown = await popup([card(1, '勉強'), card(2, '駅')]);

  assert.deepEqual(shown.calls, [['next_card', {}]]);
  assert.match(shown.main(), /^<div class="ptop"><span class="who">flashcards<\/span><span class="left num">2 left<\/span><\/div>/);
  assert.deepEqual(strip(shown.main()), ['now', '']);
  assert.match(shown.main(), /<div class="pbody"><div class="stack" style="display:grid"><article class="card"/);
  assert.match(shown.main(), /<div class="front jp"><p>勉強<\/p><\/div>/);
  assert.match(shown.main(), /<div class="pfoot"><div class="controls"><button type="button" class="btn primary reveal" data-reveal>/);
  assert.match(shown.main(), /<span>Esc closes<\/span>/);
  assert.ok(!shown.main().includes('data-leave'), 'the Popup offers a way back to the Decks it cannot reach');
});

test('the same keys review in the Popup: Space shows the answer, 1 to 4 Grade, Z undoes', async () => {
  const shown = await popup([card(1, 'a'), card(2, 'b')]);

  await shown.press(' ');
  assert.match(shown.main(), /<div class="answer">/);
  assert.match(shown.main(), /<button type="button" class="grade" data-grade="3"><b>Good<\/b><span class="ivl">1d<\/span><kbd>3<\/kbd><\/button>/);

  await shown.press('3');
  assert.deepEqual(shown.calls.slice(1, 3), [['grade_card', { card: 1, grade: 3 }], ['next_card', {}]]);
  assert.match(shown.main(), /<span class="left num">1 left<\/span>/);
  assert.match(shown.main(), /<div class="front"><p>b<\/p><\/div>/);
  assert.deepEqual(strip(shown.main()), ['g2', 'now']);

  await shown.press('z');
  assert.deepEqual(shown.calls.at(-1), ['undo_grade', { review: 101 }]);
  assert.match(shown.main(), /<div class="front"><p>a<\/p><\/div><div class="answer">/);
  assert.deepEqual(strip(shown.main()), ['now', '']);
  assert.deepEqual(shown.assigned, []);
});

test('a Grade is on its way the moment its key is pressed, so Esc right after it loses nothing', async () => {
  const shown = await popup([card(1, 'a'), card(2, 'b')]);
  await shown.press(' ');

  shown.key('4');
  shown.key('Escape');

  assert.deepEqual(shown.calls.slice(1), [['grade_card', { card: 1, grade: 4 }]]);
  assert.deepEqual(shown.assigned, ['./']);
});

test('Esc hides the Popup by leaving its address, once', async () => {
  const shown = await popup([card(1, 'a')]);

  assert.ok(shown.key('Escape'));

  assert.deepEqual(shown.assigned, ['./']);
});

test('with nothing Due, the Popup says so with the Reviews done today, and Esc still hides it', async () => {
  const shown = await popup([]);

  assert.equal(shown.element('review-main').hidden, true);
  assert.equal(shown.element('review-done').hidden, false);
  assert.equal(shown.element('done-line').textContent, 'You did 0 Reviews today.');

  await shown.press('Escape');
  assert.deepEqual(shown.assigned, ['./']);
});

test('when the Plugin Server cannot be reached, the Popup says why, and Esc still hides it', async () => {
  const shown = await popup([card(1, 'a')], 'The Host found no Plugin Server for flashcards, so it has nothing to show.');

  assert.equal(shown.element('banner').hidden, false);
  assert.equal(shown.element('banner').textContent, 'The Host found no Plugin Server for flashcards, so it has nothing to show.');

  await shown.press('Escape');
  assert.deepEqual(shown.assigned, ['./']);
});
