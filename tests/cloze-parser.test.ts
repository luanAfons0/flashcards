/**
 * The Plugin Page's Cloze parser, run as the bytes a browser is served.
 *
 * `web/cloze.js` is read off disk and run in a fresh node:vm context, as a
 * browser runs it. It is fed the same Cloze cases the Plugin Server's tests
 * use, so the Note editor's preview shows each Card as the Review will.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { CLOZE_CASES } from './helpers/cloze-cases.ts';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));

const page = createContext({});
runInContext(await readFile(join(REPOSITORY, 'web', 'cloze.js'), 'utf8'), page);
const clozeGaps = page['clozeGaps'] as (text: string) => number[];
const clozeQuestion = page['clozeQuestion'] as (text: string, gap: number) => string;
const clozeAnswer = page['clozeAnswer'] as (text: string, gap: number) => string;
const NO_GAP = page['CLOZE_NO_GAP'] as string;

for (const { about, text, faces } of CLOZE_CASES) {
  test(`the parser: ${about}`, () => {
    assert.deepEqual([...clozeGaps(text)], faces.map((face) => face.gap));
    for (const face of faces) {
      assert.equal(clozeQuestion(text, face.gap), face.question, `the question of gap ${face.gap}`);
      assert.equal(clozeAnswer(text, face.gap), face.answer, `the answer of gap ${face.gap}`);
    }
  });
}

test('a Text with no gap has the sentence that says how to add one', () => {
  assert.equal(NO_GAP, 'A Cloze Note needs at least one gap, like {{c1::answer}}. Add one, or pick Basic.');
});
