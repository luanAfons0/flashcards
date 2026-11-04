/**
 * The Settings view: the Daily Limit form in the mock's words, the fact that
 * a day starts at 4:00 local time, Saved, and the error line a refused value
 * shows.
 *
 * The markup is read from the bytes a browser is served. `web/settings.js`
 * runs here in node:vm as served: its top level only declares, so its pure
 * part runs with no page around it.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const WEB = join(dirname(dirname(fileURLToPath(import.meta.url))), 'web');
const html = await readFile(join(WEB, 'index.html'), 'utf8');
const view = /<section id="settings-view"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';

const page = createContext({});
runInContext(await readFile(join(WEB, 'settings.js'), 'utf8'), page);
const limitGiven = page['limitGiven'] as (text: string) => unknown;
const isLimit = page['isLimit'] as (value: unknown) => boolean;

/** The text a piece of markup shows, with its tags taken out and its spaces made single. */
function shown(markup: string): string {
  return markup.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Each `.setting` row of the form, as markup. */
function rows(): string[] {
  return [...view.matchAll(/<div class="setting"[\s\S]*?\n {10}<\/div>/g)].map((found) => found[0]);
}

test('the Settings hold the Daily Limit form, in the mock’s words', () => {
  const [fresh, reviews] = rows();

  assert.match(view, /<h1 id="h-settings">Settings<\/h1>/);
  assert.match(view, /<form class="group" id="settings-form" novalidate>\s*<h2>Daily Limit<\/h2>/);
  assert.match(fresh ?? '', /<label for="lim-new">New Cards per day<\/label>/);
  assert.match(fresh ?? '', /<input id="lim-new" type="number" min="0" max="9999" inputmode="numeric">/);
  assert.match(fresh ?? '', /<p class="help">The most New Cards one day shows, across all Decks\.<\/p>/);
  assert.match(reviews ?? '', /<label for="lim-rev">Reviews per day<\/label>/);
  assert.match(reviews ?? '', /<input id="lim-rev" type="number" min="0" max="9999" inputmode="numeric">/);
  assert.match(
    reviews ?? '',
    /<p class="help">The most Reviews of other Cards one day shows\. Cards over the limit wait for the next day\.<\/p>/,
  );
});

test('the Settings state that a day starts at 4:00 local time', () => {
  const day = rows()[2] ?? '';

  assert.equal(shown(day), 'A day starts at 4:00 Local time. A Review at 1:00 still counts for the day before.');
  assert.match(day, /<span class="fact">4:00<\/span>/);
});

test('a save shows Saved, and a refused value has an error line under its field', () => {
  const save = rows()[3] ?? '';

  assert.match(save, /<span class="saved" id="saved" hidden><svg class="i" aria-hidden="true"><use href="#i-check"\/><\/svg>Saved<\/span>/);
  assert.match(save, /<button type="submit" class="btn primary"[^>]*>Save<\/button>/);
  for (const field of ['lim-new', 'lim-rev']) {
    assert.match(
      view,
      new RegExp(`<p class="err" id="${field}-err" hidden><svg class="i" aria-hidden="true"><use href="#i-warn"/></svg><span></span></p>`),
    );
  }
});

test('index.html loads settings.js before app.js', () => {
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((found) => found[1]);

  assert.ok(scripts.includes('settings.js'));
  assert.ok(scripts.indexOf('settings.js') < scripts.indexOf('app.js'));
});

test('a field gives a whole number as a number, and anything else as the text it is', () => {
  assert.equal(limitGiven('20'), 20);
  assert.equal(limitGiven(' 0 '), 0);
  assert.equal(limitGiven('10000'), 10000);
  assert.equal(limitGiven(''), '');
  assert.equal(limitGiven('1.5'), '1.5');
  assert.equal(limitGiven('-3'), '-3');
});

test('a limit is a whole number from 0 to 9999', () => {
  for (const good of [0, 20, 9999]) assert.ok(isLimit(good), `${good} is a limit`);
  for (const bad of [-1, 10000, 1.5, '20', '']) assert.ok(!isLimit(bad), `${String(bad)} is not a limit`);
});
