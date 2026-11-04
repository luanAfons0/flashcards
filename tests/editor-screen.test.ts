/**
 * The Note editor: its Fields for each Note Type, the live preview of the
 * Cards a Note makes, its Tags, and what Save sends, in the mock's words.
 *
 * `web/markdown.js`, `web/cloze.js`, `web/decks.js` and `web/editor.js` run
 * here in node:vm from the bytes a browser is served, in the order the page
 * loads them.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));

type Fields = Record<string, string>;
type Draft = { deck: string; noteType: string; fields: Fields; tags: string[] };
type Note = Draft & { id: number };
type Call = { name: string; args: Record<string, unknown> };

const page = createContext({});
for (const script of ['markdown.js', 'cloze.js', 'decks.js', 'editor.js']) {
  runInContext(await readFile(join(REPOSITORY, 'web', script), 'utf8'), page);
}
const fieldsOf = page['fieldsOf'] as (noteType: string) => string[];
const fieldsMarkup = page['fieldsMarkup'] as (noteType: string, values: Fields, faulty: boolean) => string;
const clozeNoteMarkup = page['clozeNoteMarkup'] as (faulty: boolean) => string;
const previewMarkup = page['previewMarkup'] as (noteType: string, values: Fields) => string;
const cardCountText = page['cardCountText'] as (noteType: string, values: Fields) => string;
const noteProblem = page['noteProblem'] as (noteType: string, values: Fields) => string;
const tagsAdded = page['tagsAdded'] as (tags: string[], typed: string) => string[];
const tagsMarkup = page['tagsMarkup'] as (tags: string[]) => string;
const saveCall = page['saveCall'] as (note: Note | null, draft: Draft) => Call;
const editorHeading = page['editorHeading'] as (note: Note | null) => string;
const deckOptions = page['deckOptions'] as (decks: { name: string }[]) => string;
const noteConfirmMarkup = page['noteConfirmMarkup'] as (note: { cards: { reviews: number }[] }) => string;

/** A value from the vm, in this realm, so deepEqual compares only its data. */
function here<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The text a piece of markup shows, with its tags taken out and its spaces made single. */
function shown(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Each preview Card's head, question and answer, as markup. */
function previewCards(html: string): { head: string; question: string; answer: string }[] {
  return [...html.matchAll(/<div class="pcard"><div class="ph">([\s\S]*?)<\/div><div class="pq">([\s\S]*?)<\/div><div class="pa">([\s\S]*?)<\/div><\/div>(?=<div class="pcard">|<p class="help)/g)]
    .map((found) => ({ head: shown(found[1] ?? ''), question: found[2] ?? '', answer: found[3] ?? '' }));
}

const CLOZE = 'Ontem eu {{c1::fiz::fazer}} o jantar e {{c2::pus::pôr}} a mesa.';

test('Basic and Basic and reversed have the Fields Front and Back; Cloze has Text and Extra', () => {
  assert.deepEqual(here(fieldsOf('basic')), ['Front', 'Back']);
  assert.deepEqual(here(fieldsOf('reversed')), ['Front', 'Back']);
  assert.deepEqual(here(fieldsOf('cloze')), ['Text', 'Extra']);
});

test('a Basic Note shows its Front and Back Fields, each with its value', () => {
  const html = fieldsMarkup('basic', { Front: '勉強', Back: 'study' }, false);

  assert.match(html, /<label for="f-front">Front<\/label><textarea id="f-front" data-field="Front">勉強<\/textarea>/);
  assert.match(html, /<label for="f-back">Back<\/label><textarea id="f-back" data-field="Back">study<\/textarea>/);
  assert.ok(!html.includes('f-text'), 'a Basic Note shows the Cloze Text');
});

test('a Cloze Note shows Text with the gap help, and Extra with its own, in the mock’s words', () => {
  const html = fieldsMarkup('cloze', { Text: CLOZE, Extra: 'pretérito perfeito, eu' }, false);

  assert.match(html, /<textarea id="f-text" class="code" data-field="Text" aria-describedby="f-text-help">Ontem eu \{\{c1::fiz::fazer\}\}/);
  assert.match(
    html,
    /<p class="help" id="f-text-help">Mark each gap as \{\{c1::answer\}\}\. Add a hint after a second ::, as in \{\{c1::fiz::fazer\}\}\. Gaps with the same number hide together\.<\/p>/,
  );
  assert.match(html, /<textarea id="f-extra" data-field="Extra" style="min-height:64px">pretérito perfeito, eu<\/textarea>/);
  assert.match(html, /<p class="help">Shown under the answer on every Card\.<\/p>/);
});

test('a Field’s value is escaped, so what is typed never becomes markup', () => {
  const html = fieldsMarkup('basic', { Front: '</textarea><script>x()</script>', Back: '' }, false);

  assert.ok(!html.includes('<script>'), 'the Front became markup');
  assert.match(html, /&lt;\/textarea&gt;&lt;script&gt;/);
});

test('a Cloze with no gap marks its Text invalid and shows the Plugin’s one sentence for it', () => {
  // The mock wrote {{c1::fiz}} here; the Plugin Server refuses with {{c1::answer}},
  // and the Page shows that same sentence, from cloze.js.
  const html = fieldsMarkup('cloze', { Text: 'Ontem eu fiz o jantar e pus a mesa.', Extra: '' }, true);

  assert.match(html, /<textarea id="f-text" class="code" data-field="Text" aria-invalid="true" aria-describedby="f-text-err">/);
  assert.match(
    html,
    /<p class="err" id="f-text-err"><svg class="i" aria-hidden="true"><use href="#i-warn"\/><\/svg><span>A Cloze Note needs at least one gap, like \{\{c1::answer\}\}\. Add one, or pick Basic\.<\/span><\/p>/,
  );
  assert.ok(!html.includes('f-text-help'), 'the help shows beside the error');
  assert.equal(clozeNoteMarkup(true), /<p class="err"[\s\S]*?<\/p>/.exec(html)?.[0]);
  assert.match(clozeNoteMarkup(false), /^<p class="help" id="f-text-help">/);
});

test('only a Cloze with no gap is a problem, and the problem is the one sentence the Plugin Server refuses with', () => {
  assert.equal(noteProblem('cloze', { Text: 'no gap here', Extra: '' }), page['CLOZE_NO_GAP']);
  assert.equal(noteProblem('cloze', { Text: CLOZE, Extra: '' }), '');
  assert.equal(noteProblem('basic', { Front: '', Back: '' }), '');
});

test('a Basic Note previews one Card, front to back, and counts it', () => {
  const html = previewMarkup('basic', { Front: '勉強', Back: 'study\n\nべんきょう, benkyō' });

  assert.deepEqual(previewCards(html), [
    { head: 'Card 1Front to Back', question: '<p>勉強</p>', answer: '<p>study</p><p>べんきょう, benkyō</p>' },
  ]);
  assert.match(html, /<p class="help num">This Note makes 1 Card\.<\/p>$/);
});

test('a Basic and reversed Note previews two Cards, each way, and says each has its own schedule', () => {
  const html = previewMarkup('reversed', { Front: '駅', Back: 'station' });

  assert.deepEqual(
    previewCards(html).map((card) => [card.head, card.question, card.answer]),
    [
      ['Card 1Front to Back', '<p>駅</p>', '<p>station</p>'],
      ['Card 2Back to Front', '<p>station</p>', '<p>駅</p>'],
    ],
  );
  assert.match(html, /<p class="help num">This Note makes 2 Cards\. Each one has its own schedule\.<\/p>$/);
});

test('a Cloze Note previews one Card per gap, asking and answering as the Review does, Extra under the answer', () => {
  const html = previewMarkup('cloze', { Text: CLOZE, Extra: 'pretérito perfeito, eu' });

  assert.deepEqual(previewCards(html), [
    {
      head: 'Card 1Cloze 1',
      question: '<p>Ontem eu [fazer] o jantar e pus a mesa.</p>',
      answer: '<p>Ontem eu <strong>fiz</strong> o jantar e pus a mesa.</p><div class="quiet"><p>pretérito perfeito, eu</p></div>',
    },
    {
      head: 'Card 2Cloze 2',
      question: '<p>Ontem eu fiz o jantar e [pôr] a mesa.</p>',
      answer: '<p>Ontem eu fiz o jantar e <strong>pus</strong> a mesa.</p><div class="quiet"><p>pretérito perfeito, eu</p></div>',
    },
  ]);
  assert.equal(cardCountText('cloze', { Text: CLOZE, Extra: '' }), 'This Note makes 2 Cards. Each one has its own schedule.');
});

test('gaps with the same number make one Card, and a Card with no Extra has nothing under its answer', () => {
  const cards = previewCards(previewMarkup('cloze', { Text: '{{c1::a}} and {{c1::b}} then {{c3::c}}', Extra: ' ' }));

  assert.deepEqual(cards.map((card) => card.head), ['Card 1Cloze 1', 'Card 2Cloze 3']);
  assert.equal(cards[0]?.question, '<p>[...] and [...] then c</p>');
  assert.ok(!cards[0]?.answer.includes('quiet'), 'an empty Extra shows under the answer');
});

test('a Cloze with Text but no gap previews no Card, and says so', () => {
  const html = previewMarkup('cloze', { Text: 'Ontem eu fiz o jantar.', Extra: '' });

  assert.equal(html, '<p class="help">No gap, so no Card yet.</p>');
});

test('with nothing written, the preview asks for the Fields', () => {
  assert.equal(previewMarkup('cloze', { Text: '', Extra: '' }), '<p class="help">Write the Fields to see the Cards.</p>');
  assert.equal(previewMarkup('basic', { Front: ' ', Back: '' }), '<p class="help">Write the Fields to see the Cards.</p>');
  assert.equal(previewMarkup('reversed', {}), '<p class="help">Write the Fields to see the Cards.</p>');
});

test('the preview renders Fields as Markdown with all HTML escaped', () => {
  const html = previewMarkup('basic', { Front: '**bold** <img src=x onerror=alert(1)>', Back: 'x' });

  assert.match(html, /<strong>bold<\/strong> &lt;img src=x onerror=alert\(1\)&gt;/);
});

test('typing a Tag adds each word once, in order, and drops the separators', () => {
  assert.deepEqual(here(tagsAdded(['verb'], 'past-tense')), ['verb', 'past-tense']);
  assert.deepEqual(here(tagsAdded(['verb'], ' noun, lesson-12  verb ')), ['verb', 'noun', 'lesson-12']);
  assert.deepEqual(here(tagsAdded([], '  ,  ')), []);
});

test('each Tag shows with a button that removes it', () => {
  const html = tagsMarkup(['verb', '<b>']);

  assert.equal(
    html,
    '<span class="tag">verb<button type="button" aria-label="Remove Tag verb" data-untag="verb"><svg class="i" aria-hidden="true"><use href="#i-x"/></svg></button></span>' +
      '<span class="tag">&lt;b&gt;<button type="button" aria-label="Remove Tag &lt;b&gt;" data-untag="&lt;b&gt;"><svg class="i" aria-hidden="true"><use href="#i-x"/></svg></button></span>',
  );
});

test('Save adds a new Note with add_note, sending only the Fields of its Note Type', () => {
  const draft = { deck: 'Portuguese irregular verbs', noteType: 'cloze', fields: { Text: CLOZE, Extra: '', Front: 'left over' }, tags: ['verb'] };

  assert.deepEqual(here(saveCall(null, draft)), {
    name: 'add_note',
    args: { deck: 'Portuguese irregular verbs', noteType: 'cloze', fields: { Text: CLOZE, Extra: '' }, tags: ['verb'] },
  });
});

test('Save on a Note that is there changes it with update_note, by its id', () => {
  const note = { id: 12, deck: 'Rust ownership', noteType: 'basic', fields: { Front: 'a', Back: 'b' }, tags: [] };
  const draft = { deck: 'Rust ownership', noteType: 'reversed', fields: { Front: 'a', Back: 'c' }, tags: ['lesson-1'] };

  assert.deepEqual(here(saveCall(note, draft)), {
    name: 'update_note',
    args: { id: 12, deck: 'Rust ownership', noteType: 'reversed', fields: { Front: 'a', Back: 'c' }, tags: ['lesson-1'] },
  });
});

test('the Delete Note confirm counts the Cards and Reviews that go with the Note, and offers Keep the Note first', () => {
  const html = noteConfirmMarkup({ cards: [{ reviews: 3 }, { reviews: 2 }] });

  assert.equal(
    html,
    '<div class="confirm-box" role="group" aria-labelledby="del-note-h">' +
      '<div><h2 id="del-note-h">Delete this Note?</h2>' +
      '<p class="num">This deletes 2 Cards and 5 Reviews. You cannot undo it.</p></div>' +
      '<div class="row-tools"><button type="button" class="btn" id="note-keep" data-keep-note>Keep the Note</button>' +
      '<button type="button" class="btn danger" data-confirm-delete-note><svg class="i" aria-hidden="true"><use href="#i-trash"/></svg>Delete Note</button>' +
      '</div></div>',
  );
});

test('the Delete Note confirm says one Card and one Review in the singular', () => {
  assert.match(shown(noteConfirmMarkup({ cards: [{ reviews: 1 }] })), /This deletes 1 Card and 1 Review\. You cannot undo it\./);
});

test('the editor is "Add Note" for a new Note and "Edit Note" for one that is there', () => {
  assert.equal(editorHeading(null), 'Add Note');
  assert.equal(editorHeading({ id: 1, deck: 'd', noteType: 'basic', fields: {}, tags: [] }), 'Edit Note');
});

test('the Deck field offers every Deck by name, escaped, and a new name is typed in the same field', () => {
  assert.equal(
    deckOptions([{ name: 'Rust ownership' }, { name: 'a "quoted" <Deck>' }]),
    '<option value="Rust ownership"></option><option value="a &quot;quoted&quot; &lt;Deck&gt;"></option>',
  );
});

/** The text of a file in web/. */
function served(name: string): Promise<string> {
  return readFile(join(REPOSITORY, 'web', name), 'utf8');
}

test('the Note editor view holds the mock’s form: Deck, Note Type, Fields, Tags, Cancel and Save Note, and the preview', async () => {
  const html = await served('index.html');
  const view = /<section id="editor-view"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';

  assert.match(view, /<h1 id="h-editor">Add Note<\/h1>\s*<span class="quiet small">Ctrl\+Enter saves<\/span>/);
  assert.match(view, /<label for="ed-deck">Deck<\/label>[\s\S]*?<input id="ed-deck" type="text" list="deck-names"/);
  assert.match(view, /<datalist id="deck-names"><\/datalist>/);
  assert.deepEqual(
    [...view.matchAll(/<label><input type="radio" name="ntype" value="(\w+)">([^<]+)<\/label>/g)].map((found) => [found[1], found[2]]),
    [['basic', 'Basic'], ['reversed', 'Basic and reversed'], ['cloze', 'Cloze']],
  );
  assert.match(view, /<div id="fields"><\/div>/);
  assert.match(view, /<label for="tag-new">Tags<\/label>\s*<div class="taginput">[\s\S]*?<input id="tag-new" type="text" placeholder="Add a Tag" autocomplete="off">/);
  assert.match(view, /<span class="help">Fields take Markdown\.<\/span>/);
  assert.match(view, /<button type="button" class="btn ghost" id="editor-cancel">Cancel<\/button>\s*<button type="submit" class="btn primary">Save Note<\/button>/);
  assert.match(view, /<div class="form-foot" id="editor-foot">/);
  assert.match(
    view,
    /<button type="button" class="btn ghost" id="editor-delete" hidden><svg class="i" aria-hidden="true"><use href="#i-trash"\/><\/svg>Delete Note<\/button>\s*<button type="button" class="btn ghost" id="editor-cancel">/,
  );
  assert.match(view, /<div class="note-confirm" id="note-confirm" hidden><\/div>/);
  assert.match(view, /<h2 id="h-preview">Cards this Note makes<\/h2>\s*<div id="preview-cards" class="preview" style="position:static"><\/div>/);
});

test('editor.js is pure and loads after what it needs; note-editor.js puts it on the page before app.js', async () => {
  const paths = [...(await served('index.html')).matchAll(/src="([^"]*)"/g)].map((found) => found[1] ?? '');

  assert.ok(!/\b(?:document|window|fetch|location)\b/.test(await served('editor.js')), 'editor.js reaches for the page');
  const order = ['markdown.js', 'cloze.js', 'decks.js', 'editor.js', 'note-editor.js', 'app.js'];
  assert.deepEqual(paths.filter((path) => order.includes(path)), order);
});

test('#add opens the editor for a new Note, and leaving its view closes it', async () => {
  const app = await served('app.js');

  assert.match(app, /add: \{ view: 'editor-view', tab: 'notes', draw: \(\) => drawEditor\(null\) \}/);
  assert.match(app, /if \(route\.view !== ROUTES\.add\.view\) leaveEditor\(\);/);
});
