/**
 * The Notes view: one ruled row for each Note of a Deck with its first Field,
 * Note Type, Tags and next Due, the Tag filter, and "no match" with Clear
 * search, in the mock's words. Then the way from a row into the Note editor,
 * which keeps a Note from changing to or from Cloze.
 *
 * `web/notes.js` runs here in node:vm from the bytes a browser is served,
 * after what it needs, and is fed what `list_notes` answers. Times are read
 * in UTC, as the Plugin Server's tests read them.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

process.env['TZ'] = 'UTC';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));

type Note = { id: number; noteType: string; fields: Record<string, string>; tags: string[]; nextDue: string | null };

const page = createContext({});
for (const script of ['markdown.js', 'cloze.js', 'decks.js', 'editor.js', 'notes.js']) {
  runInContext(await readFile(join(REPOSITORY, 'web', script), 'utf8'), page);
}
const noteRow = page['noteRow'] as (note: Note, now: string) => string;
const noteDueText = page['noteDueText'] as (due: string | null, now: string) => string;
const notesCountText = page['notesCountText'] as (total: number, shown: number) => string;
const tagChipsMarkup = page['tagChipsMarkup'] as (tags: string[], chosen: string[]) => string;
const noMatchHeading = page['noMatchHeading'] as (search: string, chosen: string[]) => string;
const deckChoices = page['deckChoices'] as (decks: { name: string }[], chosen: string) => string;
const lockedNoteTypes = page['lockedNoteTypes'] as (note: { noteType: string } | null) => string[];

const NOW = '2026-11-04T10:00:00.000Z';

/** The text of a file in web/. */
function served(name: string): Promise<string> {
  return readFile(join(REPOSITORY, 'web', name), 'utf8');
}

/** The text a piece of markup shows, with its tags taken out and its spaces made single. */
function shown(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** The cells of one row, as markup. */
function cells(html: string): string[] {
  return [...html.matchAll(/<td[\s\S]*?<\/td>/g)].map((found) => found[0]);
}

/** A value from the vm, in this realm, so deepEqual compares only its data. */
function here<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const study: Note = { id: 7, noteType: 'reversed', fields: { Front: '勉強', Back: 'study' }, tags: ['noun', 'lesson-12'], nextDue: '2026-11-07T04:00:00.000Z' };

test('a Note row shows its first Field over its second, its Note Type, its Tags and its next Due, as the mock does', () => {
  const row = noteRow(study, NOW);
  const [note, type, tags, when] = cells(row);

  assert.match(row, /^<tr tabindex="0" data-note="7">/);
  assert.equal(note, '<td><div class="note-first">勉強</div><div class="note-sub">study</div></td>');
  assert.equal(type, '<td class="col-type quiet small">Basic and reversed</td>');
  assert.equal(tags, '<td><div class="tags"><span class="tag">noun</span><span class="tag">lesson-12</span></div></td>');
  assert.equal(when, '<td class="when">in 3 d</td>');
});

test('a Cloze row shows its Text as written, and its Extra under it', () => {
  const cloze: Note = { id: 9, noteType: 'cloze', fields: { Text: '{{c1::行きます}} means to go, polite form.', Extra: '行く' }, tags: ['verb'], nextDue: null };
  const [note, type] = cells(noteRow(cloze, NOW));

  assert.equal(note, '<td><div class="note-first">{{c1::行きます}} means to go, polite form.</div><div class="note-sub">Extra: 行く</div></td>');
  assert.equal(shown(type ?? ''), 'Cloze');
  assert.ok(!(noteRow({ ...cloze, fields: { Text: '{{c1::a}}', Extra: '' } }, NOW)).includes('Extra:'), 'an empty Extra is shown');
});

test('a Field shows on one line, escaped, so a Note can never become markup', () => {
  const row = noteRow({ ...study, fields: { Front: '<img src=x onerror=alert(1)>\n\nline two', Back: '**bold**' }, tags: ['<b>'] }, NOW);

  assert.ok(!row.includes('<img'), 'a Field became markup');
  assert.match(row, /<div class="note-first">&lt;img src=x onerror=alert\(1\)&gt; line two<\/div>/);
  assert.match(row, /<div class="note-sub">\*\*bold\*\*<\/div>/);
  assert.match(row, /<span class="tag">&lt;b&gt;<\/span>/);
});

test('next Due reads today, tomorrow, or in days, and New for a Note with no Review yet', () => {
  assert.equal(noteDueText('2026-11-04T09:00:00.000Z', NOW), 'today');
  assert.equal(noteDueText('2026-11-04T10:10:00.000Z', NOW), 'today');
  assert.equal(noteDueText('2026-11-01T04:00:00.000Z', NOW), 'today');
  assert.equal(noteDueText('2026-11-05T04:00:00.000Z', NOW), 'tomorrow');
  assert.equal(noteDueText('2026-11-16T04:00:00.000Z', NOW), 'in 12 d');
  assert.equal(noteDueText(null, NOW), 'New');
});

test('the count says how many Notes the Deck holds and how many are shown', () => {
  assert.equal(notesCountText(486, 6), '486 Notes, 6 shown');
  assert.equal(notesCountText(1, 0), '1 Note, 0 shown');
});

test('the Tag filter is one chip per Tag in the Deck, pressed when chosen', () => {
  const chips = tagChipsMarkup(['lesson-12', 'noun', '<b>'], ['lesson-12']);

  assert.ok(chips.startsWith('<span class="quiet small">Tags</span>'));
  assert.match(chips, /<button type="button" class="chip" aria-pressed="true" data-chip="lesson-12">lesson-12<\/button>/);
  assert.match(chips, /<button type="button" class="chip" aria-pressed="false" data-chip="noun">noun<\/button>/);
  assert.match(chips, /data-chip="&lt;b&gt;">&lt;b&gt;<\/button>/);
  assert.equal(tagChipsMarkup([], []), '');
});

test('"no match" names the search, or the Tags chosen when there is no search', () => {
  assert.equal(noMatchHeading('kaisha', []), 'No Notes match “kaisha”');
  assert.equal(noMatchHeading('  kaisha  ', ['noun']), 'No Notes match “kaisha”');
  assert.equal(noMatchHeading('', ['noun', 'lesson-12']), 'No Notes match “noun lesson-12”');
});

test('the Deck choice lists every Deck, with the one shown selected', () => {
  const choices = deckChoices([{ name: 'AWS Solutions Architect' }, { name: 'Rust & C' }], 'Rust & C');

  assert.equal(
    choices,
    '<option value="AWS Solutions Architect">AWS Solutions Architect</option><option value="Rust &amp; C" selected>Rust &amp; C</option>',
  );
});

test('editing a Note keeps it from changing to or from Cloze; adding one keeps every Note Type', () => {
  assert.deepEqual(here(lockedNoteTypes(null)), []);
  assert.deepEqual(here(lockedNoteTypes({ noteType: 'basic' })), ['cloze']);
  assert.deepEqual(here(lockedNoteTypes({ noteType: 'reversed' })), ['cloze']);
  assert.deepEqual(here(lockedNoteTypes({ noteType: 'cloze' })), ['basic', 'reversed']);
});

// The page around them.

test('the Notes view is the mock’s: count, search, Deck, Tag filter, the ruled sheet and "no match"', async () => {
  const html = await served('index.html');
  const view = /<section id="notes-view"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  const sheet = /<div class="sheet notes" id="notes-sheet"[\s\S]*?<\/table>/.exec(view)?.[0] ?? '';
  const none = /<div class="empty" id="notes-none" hidden>[\s\S]*?<\/div>/.exec(view)?.[0] ?? '';

  assert.match(view, /<h1 id="h-notes">Notes<\/h1>\s*<span class="quiet small num" id="notes-count"><\/span>/);
  assert.match(view, /<label for="note-search">Search Notes<\/label>/);
  assert.match(view, /<input id="note-search" type="search" placeholder="Words in any Field" autocomplete="off">/);
  assert.match(view, /<label for="note-deck">Deck<\/label>\s*<select id="note-deck"><\/select>/);
  assert.match(view, /<div class="chips" id="tag-chips" role="group" aria-label="Filter by Tag" hidden><\/div>/);
  assert.match(sheet, /<caption class="sr">Notes in the Deck<\/caption>/);
  assert.deepEqual(
    [...sheet.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((found) => shown(found[1] ?? '')),
    ['Note', 'Note Type', 'Tags', 'Next Due'],
  );
  assert.match(sheet, /<tbody id="note-rows"><\/tbody>/);
  assert.match(view, /<div class="sheet-foot"><span>Select a Note to edit it\.<\/span><\/div>/);
  assert.match(none, /<h2 id="notes-none-h"><\/h2>/);
  assert.ok(shown(none).includes('Search looks in every Field and Tag of this Deck. Try fewer words, or another Deck.'));
  assert.match(none, /<button type="button" class="btn" id="clear-search">Clear search<\/button>/);
});

test('notes.js is pure and loads after what it needs; notes-view.js puts it on the page before app.js', async () => {
  const paths = [...(await served('index.html')).matchAll(/src="([^"]*)"/g)].map((found) => found[1] ?? '');

  assert.ok(!/\b(?:document|window|fetch|location)\b/.test(await served('notes.js')), 'notes.js reaches for the page');
  const order = ['decks.js', 'editor.js', 'notes.js', 'notes-view.js', 'app.js'];
  assert.deepEqual(paths.filter((path) => order.includes(path)), order);
});

test('#notes/<Deck> shows the Notes of a Deck, and #edit/<id> opens the editor on one Note', async () => {
  const app = await served('app.js');
  const decks = await served('decks.js');

  assert.match(app, /notes: \{ view: 'notes-view', tab: 'notes', draw: drawNotes \}/);
  assert.match(app, /edit: \{ view: 'editor-view', tab: 'notes', draw: drawEdit \}/);
  assert.match(decks, /href="#notes\/' \+ escapeHtml\(encodeURIComponent\(deck\.name\)\) \+ '"/);
});
