/**
 * Undo: `undo_grade` takes back the last Grade of a Review. It restores the
 * Card's FSRS state from before the Grade, deletes that Review, and shows
 * the Card again, so a slip costs nothing.
 *
 * "Identical" is read through the tools alone: what `next_card` and
 * `list_decks` answer, the interval each Grade would give (FSRS reads every
 * part of a Card's state to work them out), and what the same Grade does to
 * the Card again. No tool shows a Card's reps and lapses, and FSRS-6 reads
 * neither, so one test reads the Card's row out of `flashcards.db` too, with
 * the Plugin Server stopped. Time moves only by starting the Plugin Server
 * again at a later testing clock.
 */
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { type TestContext } from 'node:test';
import { addBasic, listDecks, refusalOf } from './helpers/cards.ts';
import { startedAndShaken, type Started } from './helpers/plugin.ts';
import { AGAIN, at, EASY, GOOD, grade, HARD, nextCard, undo } from './helpers/review.ts';

test('a New Card after a Grade and its Undo is identical to before', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  await addBasic(plugin, 'Rust ownership', 'What borrows?', 'A reference.');
  const before = await nextCard(plugin);
  const listed = await listDecks(plugin);

  const graded = await grade(plugin, before.card!.id, GOOD);
  const undone = await undo(plugin, graded.review);
  const after = await nextCard(plugin);

  assert.deepEqual(undone, { ...before, undone: { review: graded.review, card: before.card!.id, grade: GOOD } });
  assert.deepEqual(after, before);
  assert.deepEqual(await listDecks(plugin), listed);
  const again = await grade(plugin, before.card!.id, GOOD);
  assert.deepEqual({ ...again, review: 0 }, { ...graded, review: 0 });
});

/** Stop this Plugin Server, read every column of one Card from its file, and start it again at this time. */
async function storedCard(t: TestContext, plugin: Started, card: number, time: string): Promise<[unknown, Started]> {
  plugin.stop();
  await plugin.ended();
  const file = new DatabaseSync(join(plugin.directory, 'flashcards.db'));
  const row = { ...file.prepare('SELECT * FROM cards WHERE id = ?').get(card) };
  file.close();
  return [row, await at(t, plugin, time)];
}

test('a Card in Review after Again and its Undo is identical to before, after a restart too', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  const { card } = await nextCard(plugin);
  await grade(plugin, card!.id, EASY);
  const [stored, due] = await storedCard(t, plugin, card!.id, '2026-11-12T10:00:00.000Z');
  const before = await nextCard(due);
  const listed = await listDecks(due);
  const hard = await grade(due, before.card!.id, HARD);
  const restarted = await at(t, due, '2026-11-12T10:00:00.000Z');
  const again = await grade(restarted, before.card!.id, AGAIN);

  await undo(restarted, again.review);
  const between = await at(t, restarted, '2026-11-12T10:00:00.000Z');
  await undo(between, hard.review);
  const [restored, after] = await storedCard(t, between, card!.id, '2026-11-12T10:00:00.000Z');

  assert.deepEqual(restored, stored);
  assert.deepEqual(await nextCard(after), before);
  assert.deepEqual(await listDecks(after), listed);
  assert.deepEqual({ ...(await grade(after, before.card!.id, HARD)), review: 0 }, { ...hard, review: 0 });
});

test('repeated Undo walks back through the Grades, last first, with the count left and today', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'a', '1');
  await addBasic(plugin, 'Rust ownership', 'b', '2');
  await addBasic(plugin, 'Rust ownership', 'c', '3');
  const first = await nextCard(plugin);
  const a = await grade(plugin, first.card!.id, EASY);
  const second = await nextCard(plugin);
  const b = await grade(plugin, second.card!.id, AGAIN);
  const third = await nextCard(plugin);
  const c = await grade(plugin, third.card!.id, EASY);

  const backC = await undo(plugin, c.review);
  const backB = await undo(plugin, b.review);
  const backA = await undo(plugin, a.review);

  assert.deepEqual([first, second, third].map((shown) => [shown.card?.question, shown.left, shown.reviewsToday]), [
    ['a', 3, 0],
    ['b', 2, 1],
    ['c', 2, 2],
  ]);
  assert.deepEqual([backC, backB, backA].map((back) => [back.card?.question, back.left, back.reviewsToday]), [
    ['c', 2, 2],
    ['b', 2, 1],
    ['a', 3, 0],
  ]);
  assert.deepEqual((await listDecks(plugin)).today, { reviews: 0, newCards: 0 });
});

test('Undo shows the undone Card first, though another Card has come Due since', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  await addBasic(plugin, 'Rust ownership', 'What borrows?', 'A reference.');
  // "What moves" is Due again at 10:01; "What borrows" is a New Card.
  await grade(plugin, (await nextCard(plugin)).card!.id, AGAIN);
  const later = await at(t, plugin, '2026-11-04T10:00:30.000Z');
  const borrows = await nextCard(later);
  const graded = await grade(later, borrows.card!.id, GOOD);
  const due = await at(t, later, '2026-11-04T10:02:00.000Z');

  const back = await undo(due, graded.review);

  assert.equal(borrows.card?.question, 'What borrows?');
  assert.equal(back.card?.question, 'What borrows?');
  assert.equal(back.left, 2);
  assert.equal((await nextCard(due)).card?.question, 'What moves a String?');
});

test('Undo of a Review of one Deck counts what that Deck has left', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'AWS Solutions Architect', 'S3?', 'Storage.');
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  const shown = await nextCard(plugin, 'rust ownership');
  const graded = await grade(plugin, shown.card!.id, EASY);

  const back = await undo(plugin, graded.review, 'rust ownership');

  assert.deepEqual(back, { ...shown, undone: { review: graded.review, card: shown.card!.id, grade: EASY } });
  assert.equal(back.left, 1);
});

test('only a Card’s last Review can be undone, and only once', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  const { card } = await nextCard(plugin);
  const first = await grade(plugin, card!.id, AGAIN);
  const second = await grade(plugin, card!.id, GOOD);

  const early = refusalOf(await plugin.call('undo_grade', { review: first.review }));
  await undo(plugin, second.review);
  await undo(plugin, first.review);
  const twice = refusalOf(await plugin.call('undo_grade', { review: first.review }));

  assert.equal(early, `Review ${first.review} is not the last Review of Card ${card!.id}. Undo Review ${second.review} first.`);
  assert.match(twice, new RegExp(`^There is no Review ${first.review} to undo`));
  assert.equal((await listDecks(plugin)).decks[0]?.new, 1);
});

test('undo_grade needs the id of a Review, and a Deck there is', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  const graded = await grade(plugin, (await nextCard(plugin)).card!.id, GOOD);

  for (const wrong of [undefined, 'last', 1.5, null]) {
    assert.match(refusalOf(await plugin.call('undo_grade', { review: wrong })), /needs "review" as the id of a Review/);
  }
  assert.match(refusalOf(await plugin.call('undo_grade', { review: graded.review, deck: 'Klingon' })), /no Deck named "Klingon"/);
  assert.equal((await listDecks(plugin)).decks[0]?.new, 0);
});
