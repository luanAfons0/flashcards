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
const PAGES = [{ page: 'index.html', script: 'app.js' }];

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
