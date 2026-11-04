/**
 * The Plugin Page, as the bytes a browser is served.
 *
 * The Host returns a Plugin's `web/` directory unchanged (FirstMate ADR-0008),
 * so what this test reads off disk is exactly what a browser gets. It asserts
 * the things the Host will not check for you and that break a Page after it is
 * registered: a path that is not relative, an asset that is not there, and an
 * element a script reaches for that the markup does not declare.
 *
 * Every script reaches for an element by `byId('x')`, the one helper app.js
 * defines, so one pattern finds every one of them.
 */
import { strict as assert } from 'node:assert';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));
const WEB = join(REPOSITORY, 'web');

/** Every page in web/, and the scripts of its own that reach for its elements. */
const PAGES = [
  { page: 'index.html', script: 'app.js' },
  { page: 'index.html', script: 'study.js' },
  { page: 'index.html', script: 'settings.js' },
  { page: 'index.html', script: 'note-editor.js' },
  { page: 'popup.html', script: 'popup.js' },
  { page: 'popup.html', script: 'study.js' },
];

/** Every `href` and `src` the page names, in the order it names them. */
function pathsIn(html: string): string[] {
  return [...html.matchAll(/(?:href|src)="([^"]*)"/g)].map((found) => found[1] ?? '');
}

/** The text of a file in web/. */
function served(name: string): Promise<string> {
  return readFile(join(WEB, name), 'utf8');
}

/** The text a piece of markup shows, with its tags taken out and its spaces made single. */
function shown(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

test('the Plugin Page is served as index.html', async () => {
  const page = await stat(join(WEB, 'index.html'));

  assert.ok(page.isFile());
});

for (const { page, script } of PAGES) {
  test(`every path in ${page} is relative, so nothing assumes an address it does not own`, async () => {
    const html = await served(page);

    for (const path of pathsIn(html)) {
      if (path.startsWith('data:')) continue;
      assert.ok(!path.startsWith('/'), `${path} assumes it is served from the root`);
      assert.ok(!/^[a-z]+:/i.test(path), `${path} reaches outside the Plugin`);
    }
  });

  test(`every asset ${page} names is beside it in web/, because there is no build step`, async () => {
    const html = await served(page);

    for (const path of pathsIn(html)) {
      if (path.startsWith('data:') || path.startsWith('#')) continue;
      const asset = await stat(join(WEB, path));
      assert.ok(asset.isFile(), `${path} is named by ${page} and is not in web/`);
    }
  });

  test(`every element ${script} reaches for is one ${page} declares`, async () => {
    // A renamed id leaves the script reading null and the Page blank, and
    // nothing else would say so.
    const html = await served(page);
    const code = await served(script);
    const declared = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((found) => found[1]));

    const reached = [...code.matchAll(/(?:byId|getElementById)\('([^']+)'\)/g)];
    assert.ok(reached.length > 0, `${script} reaches for no element by its id`);
    for (const found of reached) {
      assert.ok(declared.has(found[1]), `${script} reaches for #${found[1]}, which ${page} lacks`);
    }
  });

  test(`${page} calls its tools through rpc.js, loaded before ${script}`, async () => {
    const paths = pathsIn(await served(page));

    assert.ok(paths.includes('rpc.js'), `${page} does not load rpc.js`);
    assert.ok(paths.indexOf('rpc.js') < paths.indexOf(script), 'rpc.js loads too late');
  });

  test(`no name is declared twice across the scripts ${page} loads`, async () => {
    // Classic scripts share one global scope, so a name two of them declare at
    // the top stops the second one dead, and the page is blank with no test
    // to say why.
    const seen = new Map<string, string>();
    for (const each of pathsIn(await served(page)).filter((path) => path.endsWith('.js'))) {
      const code = await served(each);
      for (const found of code.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
        const name = found[1] ?? '';
        assert.ok(!seen.has(name), `${name} is declared by ${seen.get(name)} and by ${each}`);
        seen.set(name, each);
      }
    }
  });
}

test('every tool call goes through the one relative rpc address, and only rpc.js makes it', async () => {
  const rpc = await served('rpc.js');
  assert.match(rpc, /const RPC = 'rpc';/);
  assert.match(rpc, /method: 'tools\/call'/);

  for (const name of await readdir(WEB)) {
    const text = await served(name);
    assert.ok(!text.includes('/p/flashcards'), `${name} names the Plugin's address by hand`);
    if (name.endsWith('.js') && name !== 'rpc.js') {
      assert.ok(!/\bfetch\(/.test(text), `${name} fetches on its own instead of through rpc.js`);
    }
  }
});

test('every url() in the stylesheets is relative or inline', async () => {
  for (const name of (await readdir(WEB)).filter((each) => each.endsWith('.css'))) {
    const css = await served(name);
    for (const found of css.matchAll(/url\(\s*['"]?([^'")]+)/g)) {
      const path = found[1] ?? '';
      if (path.startsWith('data:') || path.startsWith('#')) continue;
      assert.ok(!path.startsWith('/') && !/^[a-z]+:/i.test(path), `${name} names ${path}`);
    }
  }
});

test('the top bar reaches Decks, Notes and Settings, and offers Add Note', async () => {
  const html = await served('index.html');
  const bar = /<header class="bar"[\s\S]*?<\/header>/.exec(html)?.[0] ?? '';

  assert.match(bar, /<span class="mark">flashcards<\/span>/);
  assert.match(bar, /<a href="#decks"[^>]*>Decks<\/a>/);
  assert.match(bar, /<a href="#notes"[^>]*>Notes<\/a>/);
  assert.match(bar, /<a href="#settings"[^>]*>Settings<\/a>/);
  assert.match(bar, /aria-label="Add Note"/);
  assert.match(shown(bar), /Add Note$/);
});

test('with no Decks, the Page says so in the mock’s words', async () => {
  const html = await served('index.html');
  const empty = /<div class="empty" id="decks-empty"[\s\S]*?<\/div>/.exec(html)?.[0] ?? '';

  assert.match(empty, /<h2 id="h-empty">No Decks yet<\/h2>/);
  assert.ok(
    shown(empty).includes(
      'A Deck appears when you add its first Note. Other Plugins and the Mate can add Notes ' +
        'too, through the add_note tool.',
    ),
    `the empty state shows: ${shown(empty)}`,
  );
  assert.match(empty, /<code>add_note<\/code>/);
  assert.match(shown(empty), /Add Note$/);
});

test('the Page follows the system theme, with a dark set of every colour token', async () => {
  const html = await served('index.html');
  const css = await served('app.css');
  const tokens = (block: string): string[] => [...block.matchAll(/(--[\w-]+):/g)].map((found) => found[1] ?? '');
  const light = /:root \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  const dark = /@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';

  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.ok(tokens(light).includes('--band'), 'app.css has no light tokens');
  for (const colour of ['--ground', '--stock', '--sunk', '--ink', '--ink-2', '--ink-3', '--rule', '--rule-2', '--band', '--band-ink', '--danger', '--danger-soft', '--press']) {
    assert.ok(tokens(light).includes(colour), `app.css has no light ${colour}`);
    assert.ok(tokens(dark).includes(colour), `app.css has no dark ${colour}`);
  }
});

test('no mock scaffolding ships: no switcher bar and no sample data markers', async () => {
  for (const name of await readdir(WEB)) {
    const text = await served(name);
    assert.ok(!text.includes('mockbar'), `${name} still has the mock's switcher`);
    assert.ok(!text.includes('tag-sample') && !/sample data/i.test(text), `${name} still marks sample data`);
  }
});

test('the Decks screen is one ruled sheet with the mock’s columns, "Study all Due" and the today line', async () => {
  const html = await served('index.html');
  const view = /<section id="decks-view"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  const sheet = /<div class="sheet" id="decks-sheet"[\s\S]*?<\/table>/.exec(view)?.[0] ?? '';

  assert.match(
    view,
    /<button type="button" class="btn primary" id="study-all" hidden>Study all Due <span class="num" id="study-total">0<\/span> <kbd>S<\/kbd><\/button>/,
  );
  assert.match(sheet, /<caption class="sr">Decks with their New Cards and Due Cards for today<\/caption>/);
  assert.deepEqual(
    [...sheet.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((found) => shown(found[1] ?? '')),
    ['Deck', 'New', 'Due', 'Actions'],
  );
  assert.match(sheet, /<tbody id="deck-rows"><\/tbody>/);
  assert.match(view, /<div class="sheet-foot">\s*<span class="num" id="today-line"><\/span>/);
});

test('decks.js, which draws the Deck rows, is pure, so it runs in node:vm as served', async () => {
  const code = await served('decks.js');

  assert.ok(!/\b(?:document|window|fetch|location)\b/.test(code), 'decks.js reaches for the page');
  assert.ok(pathsIn(await served('index.html')).indexOf('decks.js') < pathsIn(await served('index.html')).indexOf('app.js'));
});

test('review.js and markdown.js, which draw a Review, are pure, and load in the order they need', async () => {
  const paths = pathsIn(await served('index.html'));

  for (const name of ['review.js', 'markdown.js']) {
    assert.ok(!/\b(?:document|window|fetch|location)\b/.test(await served(name)), `${name} reaches for the page`);
  }
  const order = ['rpc.js', 'markdown.js', 'decks.js', 'review.js', 'study.js', 'app.js'];
  assert.deepEqual(paths.filter((path) => order.includes(path)), order);
});

test('the Review view holds the Card, and "Nothing Due" in the mock’s words with the way back', async () => {
  const html = await served('index.html');
  const view = /<section id="review-view"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  const done = /<div class="done-box">[\s\S]*?<\/div>/.exec(view)?.[0] ?? '';

  assert.match(view, /<h1 id="h-review" class="sr">Review<\/h1>/);
  assert.match(view, /<div class="review" id="review-main"><\/div>/);
  assert.match(done, /<h2 id="h-done">Nothing Due<\/h2>/);
  assert.match(done, /<p class="quiet num" id="done-line"><\/p>/);
  assert.match(done, /<a class="btn" href="#decks">.*Back to Decks<\/a>/);
});

test('the Review has no motion, and the page bar goes faint in it', async () => {
  const css = await served('app.css');

  assert.match(css, /\.review \.btn, \.review \.btn:active, \.review \.grade \{ transition: none; transform: none; \}/);
  assert.match(css, /\.page\[data-mode="review"\] \.bar \{ opacity: \.38; \}/);
  assert.match(await served('app.js'), /byId\('page'\)\.dataset\.mode = route === ROUTES\.review \? 'review' : ''/);
});

test('the Popup is popup.html: the Review alone, with no top bar, loading what it needs in order', async () => {
  const html = await served('popup.html');
  const paths = pathsIn(html);

  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.ok(!html.includes('class="bar"'), 'the Popup has a top bar; it has only a small head with the count');
  assert.match(html, /<h1 id="h-review" class="sr">Review<\/h1>/);
  assert.match(html, /<p class="banner" id="banner" role="alert" hidden><\/p>/);
  assert.match(html, /<div class="popup" id="review-main"><\/div>/);
  const order = ['app.css', 'rpc.js', 'markdown.js', 'decks.js', 'review.js', 'study.js', 'popup.js'];
  assert.deepEqual(paths.filter((path) => !path.startsWith('data:') && !path.startsWith('#')), order);
});

test('with nothing Due, the Popup says so in the mock’s words, and how to hide it', async () => {
  const html = await served('popup.html');
  const done = /<div class="popup done" id="review-done" hidden>[\s\S]*?<\/main>/.exec(html)?.[0] ?? '';

  assert.match(done, /<span class="who">flashcards<\/span>/);
  assert.match(done, /<h2 id="h-done">Nothing Due<\/h2>/);
  assert.match(done, /<p class="quiet num" id="done-line"><\/p>/);
  assert.match(done, /<span>Esc closes<\/span>/);
  assert.ok(!done.includes('href='), 'a link in the Popup only hides it, so it offers none');
});

test('every icon the Review draws is a symbol the page that shows it declares', async () => {
  const drawn = [...(await served('review.js')).matchAll(/<use href="#(i-[\w-]+)"/g)].map((found) => found[1] ?? '');
  const index = await served('index.html');
  const popup = await served('popup.html');

  // The Plugin Page draws every one; the compact Review has no way back to the Decks, so only Undo's.
  assert.deepEqual(drawn.sort(), ['i-back', 'i-undo']);
  for (const icon of drawn) assert.match(index, new RegExp(`<symbol id="${icon}"`), `index.html lacks #${icon}`);
  assert.match(popup, /<symbol id="i-undo"/);
});

test('the Popup takes the mock’s compact layout, fluid to the window, with no motion', async () => {
  const css = await served('app.css');

  // The mock draws the Popup as a 420 by 560 window; the Host's window is its own size, so the page fills it.
  assert.match(css, /\.popup \{[^}]*height: 100%;/);
  assert.ok(!/\.popup \{[^}]*(?:420px|560px)/.test(css), 'the Popup is sized by the mock’s frame, not by the window');
  assert.match(css, /\.popup \.ptop \{ display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px 8px; font-size: 13px; \}/);
  assert.match(css, /\.popup \.strip \{ margin: 0 14px; height: 6px; \}/);
  assert.match(css, /\.popup \.card \{[^}]*box-shadow: none;/);
  assert.match(css, /\.popup \.front\.jp \{ font-size: 44px; \}/);
  assert.match(css, /\.popup \.grade \{ min-height: 56px; padding: 8px 4px 7px; \}/);
  assert.match(css, /\.popup \.btn, \.popup \.btn:active, \.popup \.grade \{ transition: none; transform: none; \}/);
});

test('every tool call is kept alive past the page, so a Grade given as the Popup hides still lands', async () => {
  assert.match(await served('rpc.js'), /keepalive: body\.length < KEEP_ALIVE_BYTES,/);
});
