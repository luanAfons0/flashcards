/**
 * Coming back to the Plugin Page window: the Decks show what changed since,
 * as a Grade given in the Popup, and nothing else is drawn again, so the
 * click that brought the window back still lands where it was aimed.
 *
 * `web/decks.js` and `web/app.js` run here in node:vm from the bytes a
 * browser is served. The page around them is a stand-in: `byId` hands out
 * plain elements that count each time their markup is replaced, `call`
 * answers as the Plugin Server would, the other views are stubs that count
 * each time they are drawn, and the window's focus reaches `app.js` as its
 * focus event.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

process.env['TZ'] = 'UTC';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPTS = await Promise.all(['decks.js', 'app.js'].map((script) => readFile(join(REPOSITORY, 'web', script), 'utf8')));
const NOW = '2026-11-04T10:00:00.000Z';

type Listener = (event: unknown) => void;
type Deck = { name: string; notes: number; cards: number; new: number; due: number; left: number; nextDue: string | null };

/** A plain element that counts each time its markup is replaced. */
function element() {
  const listeners = new Map<string, Listener[]>();
  let markup = '';
  const self = {
    hidden: false,
    textContent: '',
    dataset: {} as Record<string, string>,
    drawn: 0,
    listeners,
    get innerHTML() {
      return markup;
    },
    set innerHTML(value: string) {
      markup = value;
      self.drawn += 1;
    },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    setAttribute: () => {},
    removeAttribute: () => {},
    querySelector: () => null,
    focus: () => {},
  };
  return self;
}

/** The Plugin Page at this address, with these Decks. */
async function pluginPage(hash: string, decks: Deck[]) {
  const elements = new Map<string, ReturnType<typeof element>>();
  const windowListeners = new Map<string, Listener[]>();
  const calls: string[] = [];
  const drawn: string[] = [];
  const location = { hash };
  const stub = (name: string) => () => {
    drawn.push(name);
  };
  const page = createContext({
    location,
    document: {
      getElementById: (id: string) => {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id)!;
      },
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    window: {
      addEventListener: (type: string, listener: Listener) =>
        windowListeners.set(type, [...(windowListeners.get(type) ?? []), listener]),
    },
    call: async (name: string, args?: Record<string, string>): Promise<unknown> => {
      calls.push(name);
      if (name === 'list_decks') {
        return { decks, today: { reviews: 0, newCards: 0 }, limit: { newCards: 20, reviews: 200 }, now: NOW };
      }
      if (name === 'count_deck') return { deck: args?.['deck'], notes: 1, cards: 1, reviews: 0 };
      throw new Error(`no such tool: ${name}`);
    },
    startReview: async () => {
      drawn.push('review');
    },
    endReview: () => {},
    leaveSettings: () => {},
    leaveEditor: () => {},
    drawNotes: stub('notes'),
    drawEditor: stub('editor'),
    drawEdit: stub('edit'),
    drawSettings: stub('settings'),
    saveSettings: () => {},
    wireEditor: () => {},
    wireNotes: () => {},
  });
  for (const script of SCRIPTS) runInContext(script, page);
  const settled = () => new Promise((done) => setImmediate(done));
  await settled();
  return {
    calls,
    drawn,
    element: (id: string) => elements.get(id)!,
    say: page['say'] as (sentence: string) => void,
    /** The window gains focus again. */
    focus: async () => {
      for (const listener of windowListeners.get('focus') ?? []) listener({});
      await settled();
    },
    settled,
  };
}

const rust = (due: number): Deck => ({ name: 'Rust ownership', notes: 3, cards: 3, new: 0, due, left: due, nextDue: null });

test('focus with nothing changed draws the Decks nothing new, and keeps the banner', async () => {
  const page = await pluginPage('#decks', [rust(2)]);
  page.say('The Deck was not deleted.');
  const rows = page.element('deck-rows');

  await page.focus();

  assert.equal(rows.drawn, 1, 'the Deck rows were replaced, and the click on them lost');
  assert.deepEqual(page.calls, ['list_decks', 'list_decks']);
  assert.equal(page.element('banner').hidden, false);
  assert.equal(page.element('banner').textContent, 'The Deck was not deleted.');
});

test('focus after a Grade elsewhere draws the Decks again with what changed', async () => {
  const decks = [rust(2)];
  const page = await pluginPage('#decks', decks);

  decks[0] = rust(1);
  await page.focus();

  assert.equal(page.element('deck-rows').drawn, 2);
  assert.match(page.element('deck-rows').innerHTML, /<td class="n band">1<\/td>/);
});

test('focus during a Review, in the Note editor, the Notes or the Settings draws nothing again', async () => {
  for (const [hash, view] of [['#review', 'review'], ['#add', 'editor'], ['#notes', 'notes'], ['#settings', 'settings']] as const) {
    const page = await pluginPage(hash, [rust(2)]);

    await page.focus();

    assert.deepEqual(page.drawn, [view], hash);
    assert.deepEqual(page.calls, [], hash);
  }
});

test('focus while a Deck’s Delete confirm is open leaves the confirm as it is', async () => {
  const page = await pluginPage('#decks', [rust(2)]);
  const confirm = { querySelector: () => ({ focus: () => {} }) };
  const row = {
    nextElementSibling: confirm,
    insertAdjacentHTML: () => {},
    remove: () => {},
    querySelector: () => ({ focus: () => {} }),
  };
  const button = { dataset: { delete: 'Rust ownership' }, hasAttribute: (name: string) => name === 'data-delete', closest: () => row };
  for (const listener of page.element('deck-rows').listeners.get('click') ?? []) {
    listener({ target: { closest: (selector: string) => (selector.includes('data-delete') ? button : null) } });
  }
  await page.settled();

  await page.focus();

  assert.equal(page.element('deck-rows').drawn, 1);
  assert.deepEqual(page.calls, ['list_decks', 'count_deck']);
});
