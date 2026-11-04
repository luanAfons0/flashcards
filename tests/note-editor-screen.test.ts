/**
 * Saving in the Note editor: one Save makes one Note, however fast Save is
 * pressed again (two Ctrl+Enter, a held key, a double click).
 *
 * `web/markdown.js`, `cloze.js`, `decks.js`, `editor.js` and
 * `note-editor.js` run here in node:vm from the bytes a browser is served,
 * in the order the page loads them. The page around them is a stand-in:
 * `byId` hands out plain elements, `call` answers as the Plugin Server would
 * and holds add_note until the test lets it go, and Save reaches
 * `note-editor.js` as the form's submit event.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPTS = await Promise.all(
  ['markdown.js', 'cloze.js', 'decks.js', 'editor.js', 'note-editor.js'].map((script) =>
    readFile(join(REPOSITORY, 'web', script), 'utf8'),
  ),
);

type Listener = (event: unknown) => void;
type Element = {
  value: string;
  innerHTML: string;
  textContent: string;
  listeners: Map<string, Listener[]>;
  addEventListener(type: string, listener: Listener): void;
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): Element[];
  focus(): void;
};

function element(): Element {
  const listeners = new Map<string, Listener[]>();
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    listeners,
    addEventListener: (type, listener) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    querySelector: () => null,
    querySelectorAll: () => [],
    focus: () => {},
  };
}

/** The Note editor open at #add, with add_note failing once when `failFirst`. */
async function editorPage(failFirst = false) {
  const elements = new Map<string, Element>();
  const calls: [string, Record<string, unknown>][] = [];
  const said: string[] = [];
  const held: (() => void)[] = [];
  let failures = failFirst ? 1 : 0;
  const location = { hash: '#add' };
  const page = createContext({
    location,
    URL,
    window: { addEventListener: () => {} },
    byId: (id: string): Element => {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id)!;
    },
    say: (sentence: string) => said.push(sentence),
    call: async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      calls.push([name, JSON.parse(JSON.stringify(args ?? {})) as Record<string, unknown>]);
      if (name === 'list_decks') return { decks: [], today: { reviews: 0, newCards: 0 }, limit: { newCards: 20, reviews: 200 }, now: '' };
      if (name === 'add_note') {
        await new Promise<void>((go) => held.push(go));
        if (failures-- > 0) throw new Error('The Plugin Server stopped, so the Note was not saved.');
        return { id: 1, deck: args['deck'], cards: 1 };
      }
      throw new Error(`no such tool: ${name}`);
    },
  });
  for (const script of SCRIPTS) runInContext(script, page);
  (page['wireEditor'] as () => void)();
  await (page['drawEditor'] as (note: null) => Promise<void>)(null);
  const settled = () => new Promise((done) => setImmediate(done));
  elements.get('ed-deck')!.value = 'Rust ownership';
  return {
    calls,
    said,
    location,
    /** Press Save, as the form's submit event. */
    save: () => {
      for (const listener of elements.get('note-form')!.listeners.get('submit') ?? []) listener({ preventDefault: () => {} });
    },
    /** Let every held call answer. */
    release: async () => {
      for (const go of held.splice(0)) go();
      await settled();
    },
    settled,
  };
}

const saves = (calls: [string, Record<string, unknown>][]) => calls.filter(([name]) => name === 'add_note').length;

test('Save pressed twice before the first answers saves the Note once', async () => {
  const page = await editorPage();

  page.save();
  page.save();
  await page.settled();
  await page.release();
  page.save();
  await page.settled();

  assert.equal(saves(page.calls), 1);
  assert.equal(page.location.hash, '#notes');
});

test('after a Save that failed, Save works again', async () => {
  const page = await editorPage(true);

  page.save();
  await page.settled();
  await page.release();
  page.save();
  await page.settled();
  await page.release();

  assert.deepEqual(page.said, ['The Plugin Server stopped, so the Note was not saved.']);
  assert.equal(saves(page.calls), 2);
  assert.equal(page.location.hash, '#notes');
});
