/**
 * The Decks screen: ruled Deck rows, the band on Due, when the next Card is
 * Due, the "Study all Due" total and the today line, in the mock's words.
 *
 * `web/decks.js` runs here in node:vm from the bytes a browser is served, with
 * no page around it, and is fed what `list_decks` answers. Times are read in
 * UTC, as the Plugin Server's tests read them.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

process.env['TZ'] = 'UTC';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));

type Deck = { name: string; notes: number; cards: number; new: number; due: number; nextDue: string | null; left: number };

const page = createContext({});
runInContext(await readFile(join(REPOSITORY, 'web', 'decks.js'), 'utf8'), page);
const deckRow = page['deckRow'] as (deck: Deck, now: string) => string;
const nextDueText = page['nextDueText'] as (due: string, now: string) => string;
const todayLine = page['todayLine'] as (today: object, limit: object) => string;
const totalDue = page['totalDue'] as (decks: Deck[]) => number;
const confirmRow = page['confirmRow'] as (contents: object) => string;

const NOW = '2026-11-04T10:00:00.000Z';

/** The text a piece of markup shows, with its tags taken out and its spaces made single. */
function shown(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** The cells of one row, as markup. */
function cells(html: string): string[] {
  return [...html.matchAll(/<td[\s\S]*?<\/td>/g)].map((found) => found[0]);
}

const japanese: Deck = { name: 'Japanese N4 vocabulary', notes: 486, cards: 960, new: 10, due: 34, nextDue: null, left: 44 };
const rust: Deck = { name: 'Rust ownership', notes: 41, cards: 58, new: 5, due: 0, nextDue: '2026-11-05T04:00:00.000Z', left: 5 };

test('a Deck row has the Deck name, its Notes and Cards, and its New and Due cells', () => {
  const [name, fresh, due] = cells(deckRow(japanese, NOW));

  assert.match(name ?? '', /<div class="deck-name">Japanese N4 vocabulary<\/div>/);
  assert.equal(shown(name ?? ''), 'Japanese N4 vocabulary486 Notes, 960 Cards');
  assert.match(fresh ?? '', /^<td class="n"><span class="fig">10<\/span><\/td>$/);
  assert.match(due ?? '', /^<td class="n band">34<\/td>$/);
});

test('Due above 0 fills its cell with the band; 0 shows a faint 0 in a plain cell', () => {
  const [, fresh, due] = cells(deckRow({ ...rust, new: 0 }, NOW));

  assert.equal(due, '<td class="n"><span class="fig zero">0</span></td>');
  assert.equal(fresh, '<td class="n"><span class="fig zero">0</span></td>');
  assert.ok(!deckRow(rust, NOW).includes('band'), 'the band marks a Deck with nothing Due');
});

test('a Deck with nothing Due says when its next Card is Due instead of its counts', () => {
  const [name] = cells(deckRow(rust, NOW));

  assert.equal(shown(name ?? ''), 'Rust ownershipNext Card Due tomorrow at 4:00');
});

test('a Deck with nothing Due and nothing waiting shows its counts, in the singular for one', () => {
  const [name] = cells(deckRow({ name: 'Go', notes: 1, cards: 1, new: 1, due: 0, nextDue: null, left: 1 }, NOW));

  assert.equal(shown(name ?? ''), 'Go1 Note, 1 Card');
});

test('the next Due is said by the day it falls on', () => {
  assert.equal(nextDueText('2026-11-04T10:10:00.000Z', NOW), 'Next Card Due today at 10:10');
  assert.equal(nextDueText('2026-11-05T04:00:00.000Z', NOW), 'Next Card Due tomorrow at 4:00');
  assert.equal(nextDueText('2026-11-09T04:00:00.000Z', NOW), 'Next Card Due on Monday at 4:00');
  assert.equal(nextDueText('2026-11-12T04:00:00.000Z', NOW), 'Next Card Due on 12 November at 4:00');
  assert.equal(nextDueText('2027-01-03T04:00:00.000Z', NOW), 'Next Card Due on 3 January 2027 at 4:00');
});

test('a Deck name is text, never markup', () => {
  const row = deckRow({ ...japanese, name: '<img src=x onerror=alert(1)> "A"' }, NOW);

  assert.ok(!row.includes('<img'), row);
  assert.match(row, /&lt;img src=x onerror=alert\(1\)&gt; &quot;A&quot;/);
});

test('a Deck with anything to study offers Study; one with nothing has it disabled', () => {
  assert.match(deckRow(japanese, NOW), /<button type="button" class="btn ghost" data-study="Japanese N4 vocabulary">Study<\/button>/);
  assert.match(
    deckRow({ ...rust, new: 0, left: 0 }, NOW),
    /<button type="button" class="btn ghost" disabled>Study<\/button>/,
  );
});

test('Study follows what a Review of the Deck shows, not its counts', () => {
  // A Card in a short learning step is not Due yet, and a Review learns it
  // ahead; New Cards over the Daily Limit wait for the next day.
  const waiting = { ...rust, new: 0, due: 0, nextDue: '2026-11-04T10:10:00.000Z', left: 1 };
  assert.match(deckRow(waiting, NOW), /data-study="Rust ownership">Study<\/button>/);
  assert.match(deckRow({ ...rust, new: 0, left: 0 }, NOW), /disabled>Study<\/button>/);
});

test('each row reaches the Notes of its Deck and offers Delete Deck, named for the Deck', () => {
  const row = deckRow(rust, NOW);

  assert.match(row, /href="#notes\/Rust%20ownership" aria-label="Notes of Rust ownership"/);
  assert.match(row, /aria-label="Delete Rust ownership" title="Delete Deck"/);
});

test('the Delete Deck button of a row names its Deck for the confirm, escaped', () => {
  assert.match(deckRow(rust, NOW), /data-delete="Rust ownership"/);
  assert.match(deckRow({ ...rust, name: 'A "B" <c>' }, NOW), /data-delete="A &quot;B&quot; &lt;c&gt;"/);
});

test('the confirm fills the whole row, names the Deck and counts its Notes, Cards and Reviews', () => {
  const row = confirmRow({ deck: 'Japanese N4 vocabulary', notes: 486, cards: 960, reviews: 3120 });

  assert.match(row, /^<tr class="confirm"><td colspan="4">/);
  assert.match(row, /<div class="confirm-box" role="group" aria-labelledby="del-h">/);
  assert.match(row, /<h2 id="del-h">Delete Japanese N4 vocabulary\?<\/h2>/);
  assert.match(row, /<p class="num">This deletes 486 Notes, 960 Cards and 3120 Reviews\. You cannot undo it\.<\/p>/);
});

test('the confirm counts in the singular for one', () => {
  const row = confirmRow({ deck: 'Go', notes: 1, cards: 1, reviews: 1 });

  assert.match(row, /This deletes 1 Note, 1 Card and 1 Review\. You cannot undo it\./);
});

test('the confirm offers "Keep the Deck" first and "Delete Deck" in the danger colour', () => {
  const row = confirmRow({ deck: 'Rust ownership', notes: 41, cards: 58, reviews: 0 });

  assert.match(
    row,
    /<button type="button" class="btn" id="keep" data-keep>Keep the Deck<\/button>\s*<button type="button" class="btn danger" data-confirm-delete="Rust ownership"><svg class="i" aria-hidden="true"><use href="#i-trash"\/><\/svg>Delete Deck<\/button>/,
  );
});

test('the confirm keeps a Deck name as text, never markup', () => {
  const row = confirmRow({ deck: '<img src=x onerror=alert(1)>', notes: 1, cards: 1, reviews: 0 });

  assert.ok(!row.includes('<img'), row);
  assert.match(row, /Delete &lt;img src=x onerror=alert\(1\)&gt;\?/);
});

test('"Study all Due" totals the Due of every Deck', () => {
  assert.equal(totalDue([japanese, rust, { ...japanese, due: 13 }]), 47);
  assert.equal(totalDue([]), 0);
});

test('the today line says what today has shown and the Daily Limit, in the mock’s words', () => {
  assert.equal(
    todayLine({ reviews: 13, newCards: 7 }, { newCards: 20, reviews: 200 }),
    'Today: 13 Reviews and 7 New Cards. Daily Limit: 20 New, 200 Reviews.',
  );
  assert.equal(
    todayLine({ reviews: 1, newCards: 1 }, { newCards: 20, reviews: 200 }),
    'Today: 1 Review and 1 New Card. Daily Limit: 20 New, 200 Reviews.',
  );
});

test('at phone width the Delete Deck button and the confirm stay: only the Notes button is hidden', async () => {
  const css = await readFile(join(REPOSITORY, 'web', 'app.css'), 'utf8');
  const phone = css.slice(css.indexOf('@media (max-width: 600px)'));
  const block = phone.slice(0, phone.indexOf('\n}\n'));
  const hidden = [...block.matchAll(/([^{}\n]+)\{[^}]*display:\s*none/g)].map((found) => (found[1] ?? '').trim());

  assert.ok(hidden.includes('td.acts .tool-notes'), 'the Notes button is the one row tool hidden at phone width');
  for (const selector of hidden) {
    assert.ok(!/\.tool(?!-)|confirm|row-tools|td\.acts\s*$|\.danger/.test(selector), `${selector} hides the delete path`);
  }
});
