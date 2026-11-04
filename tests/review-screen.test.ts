/**
 * The Review screen: one Card, its Grades with their intervals, Undo, the
 * count left and the session strip, and "Nothing Due", in the mock's words.
 *
 * `web/markdown.js`, `web/decks.js` and `web/review.js` run here in node:vm
 * from the bytes a browser is served, in the order the page loads them, and
 * are fed what `next_card` answers. Times are read in UTC.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

process.env['TZ'] = 'UTC';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));

type Card = { id: number; deck: string; side: string; question: string; answer: string; intervals: string[]; extra?: string };
type Next = { card: Card | null; left: number; reviewsToday: number; nextDue: string | null; now: string };
type Review = { shown: boolean; marks: number[]; undoable?: boolean };

const page = createContext({});
for (const script of ['markdown.js', 'decks.js', 'review.js']) {
  runInContext(await readFile(join(REPOSITORY, 'web', script), 'utf8'), page);
}
const reviewMarkup = page['reviewMarkup'] as (next: Next, review: Review, compact: boolean) => string;
const stripMarkup = page['stripMarkup'] as (marks: number[], left: number) => string;
const frontClass = page['frontClass'] as (question: string) => string;
const nothingDueText = page['nothingDueText'] as (next: Next) => string;

const NOW = '2026-11-04T10:00:00.000Z';

const benkyou: Card = {
  id: 7,
  deck: 'Japanese N4 vocabulary',
  side: 'Basic',
  question: '勉強',
  answer: 'study',
  intervals: ['<1m', '6m', '1d', '3d'],
};
const next: Next = { card: benkyou, left: 12, reviewsToday: 35, nextDue: null, now: NOW };

/** The classes of each slot of a strip, in order. */
function slots(html: string): string[] {
  return [...html.matchAll(/<i class="([^"]*)"><\/i>/g)].map((found) => found[1] ?? '');
}

test('before the answer, the Card shows its Deck, its side and its question, and Show answer', () => {
  const html = reviewMarkup(next, { shown: false, marks: [] }, false);

  assert.match(html, /<div class="card-head"><span>Japanese N4 vocabulary<\/span><span>Basic<\/span><\/div>/);
  assert.match(html, /<div class="front jp"><p>勉強<\/p><\/div>/);
  assert.ok(!html.includes('class="answer"'), 'the answer shows before Space');
  assert.ok(!html.includes('data-grade'), 'the Grades show before the answer');
  assert.match(html, /<button type="button" class="btn primary reveal" data-reveal>Show answer <kbd>Space<\/kbd><\/button>/);
});

test('with the answer shown, the four Grades show the interval each would give, and their keys', () => {
  const html = reviewMarkup(next, { shown: true, marks: [] }, false);

  assert.match(html, /<div class="answer"><div class="main"><p>study<\/p><\/div><\/div>/);
  assert.deepEqual(
    [
      ...html.matchAll(
        /<button type="button" class="grade" data-grade="(\d)"><b>(\w+)<\/b><span class="ivl">([^<]*)<\/span><kbd>(\d)<\/kbd><\/button>/g,
      ),
    ].map((found) => found.slice(1)),
    [['1', 'Again', '&lt;1m', '1'], ['2', 'Hard', '6m', '2'], ['3', 'Good', '1d', '3'], ['4', 'Easy', '3d', '4']],
  );
  assert.match(html, /<div class="grades" role="group" aria-label="Grade">/);
  assert.ok(!html.includes('data-reveal'));
});

test('the Review shows the count left, the way back to the Decks, Undo disabled and the key hint', () => {
  const html = reviewMarkup(next, { shown: false, marks: [] }, false);

  assert.match(html, /<span class="left num" aria-live="polite">12 left<\/span>/);
  assert.match(html, /<button type="button" class="btn ghost" data-leave[^>]*>.*Decks <kbd>Esc<\/kbd><\/button>/);
  assert.match(html, /<button type="button" class="btn ghost" data-undo disabled><svg class="i" aria-hidden="true"><use href="#i-undo"\/><\/svg>Undo <kbd>Z<\/kbd><\/button>/);
  assert.match(html, /<span class="hint">Space shows the answer, 1 to 4 give the Grade<\/span>/);
});

test('Undo is enabled once there is a Grade to undo', () => {
  const html = reviewMarkup(next, { shown: false, marks: [3], undoable: true }, false);

  assert.match(html, /<button type="button" class="btn ghost" data-undo>/);
});

test('the compact Review, for the Popup, says "Esc closes" and keeps the Card and its Grades', () => {
  const html = reviewMarkup(next, { shown: true, marks: [] }, true);

  assert.match(html, /<div class="ptop"><span class="who">flashcards<\/span><span class="left num">12 left<\/span><\/div>/);
  assert.match(html, /<div class="pbody"><div class="stack" style="display:grid">/);
  assert.match(html, /<div class="pfoot">/);
  assert.match(html, /<span>Esc closes<\/span>/);
  assert.match(html, /data-grade="3"/);
  assert.ok(!html.includes('data-leave'));
});

test('the session strip has one slot per Card, each Grade marks by height, and the current slot is ink', () => {
  const strip = stripMarkup([1, 2, 3, 4], 3);

  assert.match(strip, /^<div class="strip" aria-hidden="true">/);
  assert.deepEqual(slots(strip), ['g0', 'g1', 'g2', 'g3', 'now', '', '']);
  assert.deepEqual(slots(stripMarkup([], 2)), ['now', '']);
  assert.deepEqual(slots(stripMarkup([3], 0)), ['g2']);
});

test('the strip of a Review follows its Grades and the count left', () => {
  const html = reviewMarkup({ ...next, left: 2 }, { shown: false, marks: [1, 3] }, false);

  assert.deepEqual(slots(html), ['g0', 'g2', 'now', '']);
});

test('Fields render from Markdown, and HTML in a Field or a Deck name never becomes markup', () => {
  const card: Card = {
    ...benkyou,
    deck: '<b>Deck</b>',
    side: '<i>side</i>',
    question: 'What does **move** do? <script>alert(1)</script>',
    answer: '- one\n- `two`',
  };

  const html = reviewMarkup({ ...next, card }, { shown: true, marks: [] }, false);

  assert.match(html, /<strong>move<\/strong>/);
  assert.match(html, /<ul><li>one<\/li><li><code>two<\/code><\/li><\/ul>/);
  assert.ok(!/<script|<b>Deck|<i>side/.test(html), html);
  assert.match(html, /&lt;b&gt;Deck&lt;\/b&gt;/);
});

test('an Extra Field shows under the answer', () => {
  const html = reviewMarkup({ ...next, card: { ...benkyou, extra: 'べんきょう, benkyō' } }, { shown: true, marks: [] }, false);

  assert.match(html, /<div class="extra"><p>べんきょう, benkyō<\/p><\/div>/);
});

test('a CJK question reads at the mock’s CJK size; a long question steps down', () => {
  assert.equal(frontClass('勉強'), 'jp');
  assert.equal(frontClass('駅まで歩きます。'), 'jp');
  assert.equal(frontClass('station'), '');
  assert.equal(
    frontClass('Which S3 storage class costs least for data you read once a year and can wait 12 hours for?'),
    'long',
  );
  assert.equal(frontClass('毎日日本語を勉強しますが、漢字はまだ難しいと思っています。'), 'long');
});

test('"Nothing Due" says how many Reviews today had, and when the next Card is Due', () => {
  assert.equal(
    nothingDueText({ card: null, left: 0, reviewsToday: 47, nextDue: '2026-11-05T04:00:00.000Z', now: NOW }),
    'You did 47 Reviews today. Next Card Due tomorrow at 4:00.',
  );
  assert.equal(nothingDueText({ card: null, left: 0, reviewsToday: 1, nextDue: null, now: NOW }), 'You did 1 Review today.');
});
