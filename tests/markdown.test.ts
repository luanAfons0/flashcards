/**
 * The Markdown renderer a Card's Fields are shown with, run as the bytes a
 * browser is served.
 *
 * `web/markdown.js` is read off disk and run in a fresh node:vm context,
 * exactly as a browser runs it. What matters is what the operator sees: a
 * Field reads formatted, and text never becomes markup.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));

const page = createContext({});
runInContext(await readFile(join(REPOSITORY, 'web', 'markdown.js'), 'utf8'), page);
const render = page['renderMarkdown'] as (text: string) => string;

test('a Field reads formatted: bold, emphasis, code, lists and links', () => {
  const html = render(
    'Some **bold**, *soft* and `code`.\n\n- one\n- two\n  - nested\n\n1. first\n\n[the book](https://doc.rust-lang.org/book/)',
  );

  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>soft<\/em>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<ul><li>one<\/li><li>two<ul><li>nested<\/li><\/ul><\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><\/ol>/);
  assert.match(html, /<a href="https:\/\/doc.rust-lang.org\/book\/" target="_blank" rel="noopener noreferrer">the book<\/a>/);
});

test('headings, quotes and fenced code read as themselves', () => {
  const html = render('## Ownership\n\n> each value has one owner\n\n```\nlet s = String::from("a") < b;\n```');

  assert.match(html, /<h2>Ownership<\/h2>/);
  assert.match(html, /<blockquote><p>each value has one owner<\/p><\/blockquote>/);
  assert.match(html, /<pre><code>let s = String::from\(&quot;a&quot;\) &lt; b;<\/code><\/pre>/);
});

test('one line break in a Field is kept, and a blank line starts a new paragraph', () => {
  assert.equal(render('べんきょう\nbenkyō\n\nstudy'), '<p>べんきょう<br>benkyō</p><p>study</p>');
});

test('HTML in a Field shows as text and never becomes markup', () => {
  const html = render('<script>alert(1)</script> and <img src=x onerror=alert(1)> and <b>bold</b>');

  assert.ok(!html.includes('<script'), html);
  assert.ok(!html.includes('<img'), html);
  assert.ok(!html.includes('<b>'), html);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('HTML inside code, a quote or a list is escaped too', () => {
  const html = render('`<i>`\n\n> <script>x</script>\n\n- <svg onload=x>\n\n```\n<style>\n```');

  assert.ok(!/<(?:i|script|svg|style)\b/.test(html), html);
});

test('a link to a script address is kept as text, not as a link', () => {
  const html = render('[click](javascript:alert(1)) and [data](data:text/html,x)');

  assert.ok(!html.includes('<a'), html);
  assert.match(html, /click/);
});

test('a quote in a link address cannot break out of its attribute', () => {
  const html = render('[x](https://example.com/"onmouseover="alert(1))');

  // The quote stays escaped inside the address, so the attribute never ends early.
  assert.match(html, /<a href="https:\/\/example.com\/&quot;onmouseover=&quot;alert\(1" /);
});

test('CJK text passes through unchanged', () => {
  assert.equal(render('勉強'), '<p>勉強</p>');
});
