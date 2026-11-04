/**
 * The Daily Limit: the most New Cards shown for the first time, and the most
 * other Cards brought into a Review, in one day, across all Decks.
 *
 * Each Card counts once a day, the first time a day shows it, so a Card
 * graded Again comes back the same day for free. `list_decks` shares what is
 * left of the limit out among the Decks in the order a Review of every Deck
 * shows their Cards, so its counts add up to what that Review shows; a Review
 * of one Deck may use all that is left. Every due time is worked from FSRS-6
 * as in review.test.ts: Easy on a New Card is Due from 4:00 eight days on,
 * Good on a New Card ten minutes on, and Again on a Review Card ten minutes on.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { addBasic, listDecks, type Listed } from './helpers/cards.ts';
import { startedAndShaken, type Started } from './helpers/plugin.ts';
import { AGAIN, at, EASY, GOOD, gradeNext, nextCard } from './helpers/review.ts';

/** Each Deck as name: [New, Due, left]. */
function counts(listed: Listed): Record<string, readonly number[]> {
  return Object.fromEntries(listed.decks.map((deck) => [deck.name, [deck.new, deck.due, deck.left]]));
}

async function limited(plugin: Started, newCardsPerDay: number, reviewsPerDay: number): Promise<void> {
  const answer = await plugin.call('update_settings', { newCardsPerDay, reviewsPerDay });
  assert.equal(answer.error, undefined);
}

test('the New Cards per day are shared across Decks, and each Card counts once', async (t) => {
  const plugin = await startedAndShaken(t);
  await limited(plugin, 3, 200);
  await addBasic(plugin, 'AWS', 'a1', 'A1');
  await addBasic(plugin, 'Rust', 'b1', 'B1');
  await addBasic(plugin, 'AWS', 'a2', 'A2');
  await addBasic(plugin, 'Rust', 'b2', 'B2');

  // a1, b1 and a2 come first, in Note creation order; b2 waits.
  assert.deepEqual(counts(await listDecks(plugin)), { AWS: [2, 0, 2], Rust: [1, 0, 2] });
  assert.equal((await nextCard(plugin)).left, 3);
  assert.equal((await nextCard(plugin, 'Rust')).left, 2);

  // Each Good leaves its Card in a learning step, back in ten minutes, free.
  await gradeNext(plugin, GOOD);
  await gradeNext(plugin, GOOD);
  await gradeNext(plugin, GOOD);
  const done = await listDecks(plugin);
  const left = await nextCard(plugin);

  assert.deepEqual(done.today, { reviews: 0, newCards: 3 });
  assert.deepEqual(counts(done), { AWS: [0, 0, 2], Rust: [0, 0, 1] });
  assert.equal(left.left, 3);
  assert.notEqual(left.card?.question, 'b2');
});

test('the next day, the New Cards per day start again from 4:00', async (t) => {
  const plugin = await startedAndShaken(t);
  await limited(plugin, 1, 200);
  await addBasic(plugin, 'Rust', 'b1', 'B1');
  await addBasic(plugin, 'Rust', 'b2', 'B2');
  await gradeNext(plugin, EASY);

  const late = await at(t, plugin, '2026-11-05T03:59:00.000Z');
  const night = counts(await listDecks(late));
  const morning = await at(t, late, '2026-11-05T04:00:00.000Z');

  assert.deepEqual(night, { Rust: [0, 0, 0] });
  assert.deepEqual(counts(await listDecks(morning)), { Rust: [1, 0, 1] });
});

test('the Reviews per day are shared across Decks, and a Card graded Again comes back free', async (t) => {
  const first = await startedAndShaken(t);
  await limited(first, 20, 2);
  await addBasic(first, 'AWS', 'r1', 'R1');
  await addBasic(first, 'Rust', 'r2', 'R2');
  await addBasic(first, 'AWS', 'r3', 'R3');
  for (let card = 0; card < 3; card += 1) await gradeNext(first, EASY);

  // All three are Due from 2026-11-12T04:00; the limit lets two of them in.
  const plugin = await at(t, first, '2026-11-12T10:00:00.000Z');
  assert.deepEqual(counts(await listDecks(plugin)), { AWS: [0, 1, 2], Rust: [0, 1, 1] });
  assert.equal((await nextCard(plugin)).left, 2);

  const again = await gradeNext(plugin, AGAIN);
  await gradeNext(plugin, GOOD);
  const spent = await listDecks(plugin);
  const ahead = await nextCard(plugin);

  assert.equal(again.question, 'r1');
  assert.deepEqual(spent.today, { reviews: 2, newCards: 0 });
  assert.deepEqual(counts(spent), { AWS: [0, 0, 1], Rust: [0, 0, 0] });
  assert.equal(ahead.card?.question, 'r1');
  assert.equal(ahead.left, 1);

  const later = await at(t, plugin, '2026-11-12T10:11:00.000Z');
  assert.deepEqual(counts(await listDecks(later)), { AWS: [0, 1, 1], Rust: [0, 0, 0] });

  const tomorrow = await at(t, later, '2026-11-13T10:00:00.000Z');
  assert.ok((await nextCard(tomorrow, 'AWS')).left >= 1);
  assert.ok((await listDecks(tomorrow)).decks.some((deck) => deck.name === 'AWS' && deck.due >= 1));
});

test('a Daily Limit of 0 shows no New Card, and a Deck with only New Cards has nothing to study', async (t) => {
  const plugin = await startedAndShaken(t);
  await limited(plugin, 0, 200);
  await addBasic(plugin, 'Rust', 'b1', 'B1');

  assert.deepEqual(counts(await listDecks(plugin)), { Rust: [0, 0, 0] });
  assert.deepEqual((await nextCard(plugin)).card, null);
});

test('a limit set below what today has shown shows nothing more, and never a count below 0', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust', 'b1', 'B1');
  await addBasic(plugin, 'Rust', 'b2', 'B2');
  await addBasic(plugin, 'Rust', 'b3', 'B3');
  await gradeNext(plugin, EASY);
  await gradeNext(plugin, EASY);

  await limited(plugin, 1, 200);

  assert.deepEqual(counts(await listDecks(plugin)), { Rust: [0, 0, 0] });
});

test('a Deck whose only Card waits in a short learning step is not Due, yet a Review of it shows that Card', async (t) => {
  // A Review learns ahead: a Card in a learning step Due within 20 minutes
  // shows once nothing else is left. The Deck row's `left` says so, so its
  // Study is offered while its Due stays 0.
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust', 'b1', 'B1');
  await gradeNext(plugin, GOOD);

  const listed = await listDecks(plugin);

  assert.deepEqual(counts(listed), { Rust: [0, 0, 1] });
  assert.equal(listed.decks[0]?.nextDue, '2026-11-04T10:10:00.000Z');
  assert.equal((await nextCard(plugin, 'Rust')).card?.question, 'b1');
});
