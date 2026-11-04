/**
 * `remind_due`: the scheduler Plugin calls it, and the operator gets one
 * Notice when Cards are Due and none when nothing is. The test plays the
 * Host's side of the Notice: it reads the question the Plugin Server puts on
 * stdout, and answers it, or refuses it as the Host does.
 *
 * A Card is made Due the way a Review makes it: a New Card graded Good comes
 * back at its 10-minute learning step, so the Plugin Server started again 11
 * minutes later finds it Due.
 */
import { strict as assert } from 'node:assert';
import test, { type TestContext } from 'node:test';
import { addBasic, refusalOf } from './helpers/cards.ts';
import { type Answer, type Started, startedAndShaken, structureOf } from './helpers/plugin.ts';
import { at, EASY, GOOD, gradeNext } from './helpers/review.ts';

/** What `remind_due` answers. */
type Reminded = {
  readonly due: number;
  readonly notice: { readonly title: string; readonly body: string } | null;
  readonly said: string;
};

/** Eleven minutes after the fixed clock: past the 10-minute learning step. */
const LATER = '2026-11-04T10:11:00.000Z';

/** The Host's refusal of a second Notice inside its 5 s. */
const TOO_SOON = 'A Plugin may send one Notice every 5 s. Wait 3.2 s and send it again.';

/**
 * A Plugin Server whose Decks hold this many Due Cards each, by Deck name,
 * and one New Card in a Deck of its own that is never Due.
 */
async function withDue(t: TestContext, due: Readonly<Record<string, number>>): Promise<Started> {
  const plugin = await startedAndShaken(t);
  for (const [deck, count] of Object.entries(due)) {
    for (let n = 1; n <= count; n += 1) await addBasic(plugin, deck, `Question ${n}`, `Answer ${n}`);
  }
  for (const [deck, count] of Object.entries(due)) {
    for (let n = 1; n <= count; n += 1) await gradeNext(plugin, GOOD, deck);
  }
  await addBasic(plugin, 'Only New Cards', 'Question', 'Answer');
  return at(t, plugin, LATER);
}

/** Call `remind_due`, play the Host for its one Notice, and hand back both. */
async function remindAnswered(
  plugin: Started,
  host: Answer,
): Promise<{ readonly params: Readonly<Record<string, unknown>>; readonly answer: Answer }> {
  const pending = plugin.call('remind_due');
  const question = await plugin.nextQuestion();
  assert.equal(question.method, 'firstmate/notice');
  plugin.answerAsHost(question.id, host);
  return { params: question.params, answer: await pending };
}

test('Cards Due send one Notice that names the three Decks with the most Due, and opens the Plugin Page', async (t) => {
  const plugin = await withDue(t, {
    'Rust ownership': 1,
    'AWS Solutions Architect': 2,
    'Portuguese irregular verbs': 1,
    'Japanese N4 vocabulary': 3,
  });

  const { params, answer } = await remindAnswered(plugin, { result: {} });

  const notice = {
    title: '7 Cards are Due',
    body: 'Japanese N4 vocabulary 3, AWS Solutions Architect 2, Portuguese irregular verbs 1, and 1 more Deck',
  };
  // No path: a click opens the root of the Plugin Page.
  assert.deepEqual(params, notice);
  assert.deepEqual(structureOf<Reminded>(answer), { due: 7, notice, said: 'Sent the Notice "7 Cards are Due".' });
  assert.equal(plugin.questions().length, 1);
});

test('one Card Due is said in the singular', async (t) => {
  const plugin = await withDue(t, { 'Rust ownership': 1 });

  const { params } = await remindAnswered(plugin, { result: {} });

  assert.deepEqual(params, { title: '1 Card is Due', body: 'Rust ownership 1' });
});

test('with nothing Due there is no Notice, and the result says so', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');

  const answer = await plugin.call('remind_due');

  assert.deepEqual(structureOf<Reminded>(answer), {
    due: 0,
    notice: null,
    said: 'No Card is Due, so no Notice was sent.',
  });
  assert.equal(plugin.questions().length, 0);
});

test('a Card waiting for a later time is not Due yet, and sends no Notice', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  await gradeNext(plugin, GOOD);

  const answer = await plugin.call('remind_due');

  assert.equal(structureOf<Reminded>(answer).due, 0);
  assert.equal(plugin.questions().length, 0);
});

test('the Host refusing the Notice comes back as the error of the tool', async (t) => {
  const plugin = await withDue(t, { 'Rust ownership': 1 });

  const { answer } = await remindAnswered(plugin, { error: { code: -32000, message: TOO_SOON } });

  assert.equal(refusalOf(answer), TOO_SOON);
});

test('long Deck names are cut, so the body stays inside the 200 characters the Host takes', async (t) => {
  const long = (word: string): string => `${word} ${'very long name '.repeat(8)}end`;
  const plugin = await withDue(t, { [long('First')]: 2, [long('Second')]: 1, [long('Third')]: 1 });

  const { params } = await remindAnswered(plugin, { result: {} });

  const body = String(params['body']);
  assert.ok([...body].length <= 200, `the body is ${[...body].length} characters: ${body}`);
  assert.match(body, /^First very long name .*… 2, Second very long .*… 1, Third very long .*… 1$/);
});

test('the Notice counts only the Due Cards the Daily Limit lets in today', async (t) => {
  // Easy on a New Card at the fixed clock makes it Due from 2026-11-12T04:00.
  const first = await startedAndShaken(t);
  assert.equal((await first.call('update_settings', { reviewsPerDay: 2 })).error, undefined);
  await addBasic(first, 'Rust ownership', 'Question 1', 'Answer 1');
  await addBasic(first, 'AWS Solutions Architect', 'Question 1', 'Answer 1');
  await addBasic(first, 'Rust ownership', 'Question 2', 'Answer 2');
  for (let card = 0; card < 3; card += 1) await gradeNext(first, EASY);
  const plugin = await at(t, first, '2026-11-12T10:00:00.000Z');

  const { params, answer } = await remindAnswered(plugin, { result: {} });

  assert.deepEqual(params, { title: '2 Cards are Due', body: 'AWS Solutions Architect 1, Rust ownership 1' });
  assert.equal(structureOf<Reminded>(answer).due, 2);
});
