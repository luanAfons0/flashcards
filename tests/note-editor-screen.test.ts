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
  hidden?: boolean;
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

/*
 * Deleting a Note from the Note editor. Editing a Note offers Delete Note; it
 * asks get_note what the Note holds now, and a confirm with the counts takes
 * the place of the form's foot, with Keep the Note focused, as the Delete
 * Deck confirm does on the Decks.
 */

/** A Note as get_note answers it, with two Cards that have had 3 Reviews. */
const NOTE = {
  id: 7,
  deck: 'Rust ownership',
  noteType: 'basic',
  fields: { Front: 'What does move do?', Back: 'It hands the value over.' },
  tags: ['lesson-1'],
  cards: [
    { id: 1, ordinal: 1, side: 'Basic', due: null, reviews: 2 },
    { id: 2, ordinal: 2, side: 'Basic', due: null, reviews: 1 },
  ],
};

/** The Note editor open at #edit/7 on NOTE, opened from the Notes of its Deck. */
async function deletePage(options: { failDelete?: boolean } = {}) {
  const elements = new Map<string, Element>();
  const calls: [string, Record<string, unknown>][] = [];
  const said: string[] = [];
  const held: (() => void)[] = [];
  let focused = '';
  const location = { hash: '#notes/Rust%20ownership' };
  const hashListeners: Listener[] = [];
  const named = (id: string): Element => {
    if (!elements.has(id)) {
      const made = element();
      made.focus = () => (focused = id);
      made.querySelector = (selector: string) => named(`${id} ${selector}`);
      elements.set(id, made);
    }
    return elements.get(id)!;
  };
  const page = createContext({
    location,
    URL,
    window: { addEventListener: (type: string, listener: Listener) => type === 'hashchange' && hashListeners.push(listener) },
    byId: named,
    say: (sentence: string) => said.push(sentence),
    call: async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      calls.push([name, JSON.parse(JSON.stringify(args ?? {})) as Record<string, unknown>]);
      if (name === 'list_decks') return { decks: [{ name: 'Rust ownership' }], today: { reviews: 0, newCards: 0 }, limit: { newCards: 20, reviews: 200 }, now: '' };
      if (name === 'get_note') return NOTE;
      if (name === 'delete_note') {
        await new Promise<void>((go) => held.push(go));
        if (options.failDelete) throw new Error('The Plugin Server stopped, so the Note was not deleted.');
        return { id: 7, deck: 'Rust ownership', cards: 2, reviews: 3 };
      }
      throw new Error(`no such tool: ${name}`);
    },
  });
  for (const script of SCRIPTS) runInContext(script, page);
  (page['wireEditor'] as () => void)();
  const settled = () => new Promise((done) => setImmediate(done));
  const fire = (id: string, type: string, event: unknown) => {
    for (const listener of named(id).listeners.get(type) ?? []) listener(event);
  };
  /** Press a button inside the confirm, found by the attribute it carries. */
  const pressInConfirm = (attribute: string) =>
    fire('note-confirm', 'click', { target: { closest: () => ({ hasAttribute: (name: string) => name === attribute }) } });

  const open = async (note: typeof NOTE | null, at: string) => {
    for (const listener of hashListeners) listener({ oldURL: `http://host/p/flashcards/${location.hash}` });
    location.hash = at;
    await (page['drawEditor'] as (note: unknown) => Promise<void>)(note);
  };
  await open(NOTE, '#edit/7');
  return {
    calls,
    said,
    location,
    element: named,
    focused: () => focused,
    open,
    /** Press Delete Note in the form's foot. */
    askToDelete: async () => {
      fire('editor-delete', 'click', {});
      await settled();
    },
    keep: () => pressInConfirm('data-keep-note'),
    confirm: () => pressInConfirm('data-confirm-delete-note'),
    escape: () => fire('note-confirm', 'keydown', { key: 'Escape', preventDefault: () => {} }),
    save: () => fire('note-form', 'submit', { preventDefault: () => {} }),
    release: async () => {
      for (const go of held.splice(0)) go();
      await settled();
    },
    settled,
  };
}

const deletes = (calls: [string, Record<string, unknown>][]) => calls.filter(([name]) => name === 'delete_note');

test('editing a Note offers Delete Note, and adding one does not', async () => {
  const page = await deletePage();
  assert.equal(page.element('editor-delete').hidden, false);

  await page.open(null, '#add');

  assert.equal(page.element('editor-delete').hidden, true);
});

test('Delete Note asks what the Note holds now, and the confirm with its counts takes the foot’s place, Keep the Note focused', async () => {
  const page = await deletePage();

  await page.askToDelete();

  assert.deepEqual(page.calls.at(-1), ['get_note', { id: 7 }]);
  assert.match(page.element('note-confirm').innerHTML, /This deletes 2 Cards and 3 Reviews\. You cannot undo it\./);
  assert.equal(page.element('note-confirm').hidden, false);
  assert.equal(page.element('editor-foot').hidden, true);
  assert.equal(page.focused(), 'note-confirm [data-keep-note]');
  assert.equal(deletes(page.calls).length, 0);
});

test('Keep the Note, or Esc, puts the foot back, focused on Delete Note, and deletes nothing', async () => {
  for (const leave of ['keep', 'escape'] as const) {
    const page = await deletePage();
    await page.askToDelete();

    page[leave]();

    assert.equal(page.element('note-confirm').hidden, true, leave);
    assert.equal(page.element('note-confirm').innerHTML, '', leave);
    assert.equal(page.element('editor-foot').hidden, false, leave);
    assert.equal(page.focused(), 'editor-delete', leave);
    assert.equal(deletes(page.calls).length, 0, leave);
  }
});

test('Delete Note in the confirm deletes the Note once, however fast it is pressed, and goes back to where the editor was opened from', async () => {
  const page = await deletePage();
  await page.askToDelete();

  page.confirm();
  page.confirm();
  await page.settled();
  await page.release();

  assert.deepEqual(deletes(page.calls), [['delete_note', { id: 7 }]]);
  assert.equal(page.location.hash, '#notes/Rust%20ownership');
});

test('with the confirm open, Ctrl+Enter saves nothing', async () => {
  const page = await deletePage();
  await page.askToDelete();

  page.save();
  await page.settled();

  assert.equal(page.calls.filter(([name]) => name === 'update_note').length, 0);
});

test('a delete that failed says why, stays in the editor, and Delete Note works again', async () => {
  const page = await deletePage({ failDelete: true });
  await page.askToDelete();

  page.confirm();
  await page.settled();
  await page.release();

  assert.deepEqual(page.said, ['The Plugin Server stopped, so the Note was not deleted.']);
  assert.equal(page.location.hash, '#edit/7');
  page.confirm();
  await page.settled();
  assert.equal(deletes(page.calls).length, 2);
});

test('opening the editor again starts with the foot, not a confirm left open', async () => {
  const page = await deletePage();
  await page.askToDelete();

  await page.open(NOTE, '#edit/8');

  assert.equal(page.element('note-confirm').hidden, true);
  assert.equal(page.element('editor-foot').hidden, false);
});
