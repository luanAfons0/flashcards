/**
 * A Review: `next_card` shows one Card at a time, with the interval each
 * Grade would give and how many Cards are left, and `grade_card` saves each
 * Grade at once, scheduled with FSRS.
 *
 * Every expected interval and due time here is worked from FSRS-6 with its
 * default parameters (learning steps 1m and 10m, no fuzz), and from the rule
 * that a day runs from 4:00 local time: a Card scheduled a day or more ahead
 * is Due from 4:00 of its due day. Time moves only by starting the Plugin
 * Server again at a later testing clock.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { addBasic, listDecks, refusalOf } from './helpers/cards.ts';
import { NOW, startedAndShaken } from './helpers/plugin.ts';
import { AGAIN, at, EASY, GOOD, grade, gradeNext, HARD, nextCard } from './helpers/review.ts';

test('with nothing to study, there is no Card, nothing left and nothing done today', async (t) => {
  const plugin = await startedAndShaken(t);

  const next = await nextCard(plugin);

  assert.deepEqual(next, { card: null, left: 0, reviewsToday: 0, nextDue: null, now: NOW });
});

test('a New Card shows its Deck, its question and answer, and the interval of each Grade', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Japanese N4 vocabulary', '勉強', 'study');

  const next = await nextCard(plugin);

  assert.equal(next.left, 1);
  assert.deepEqual({ ...next.card, id: 0 }, {
    id: 0,
    deck: 'Japanese N4 vocabulary',
    side: 'Basic',
    question: '勉強',
    answer: 'study',
    // Again 1m, Hard 5m30s (the mean of the two steps), Good 10m, Easy 8 days.
    intervals: ['<1m', '6m', '10m', '8d'],
  });
});

test('a Card shown but not graded stays Due, after a restart too', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');

  const first = await nextCard(plugin);
  const again = await nextCard(plugin);
  const later = await at(t, plugin, '2026-11-04T18:00:00.000Z');
  const after = await nextCard(later);

  assert.equal(again.card?.id, first.card?.id);
  assert.equal(after.card?.id, first.card?.id);
  assert.equal((await listDecks(later)).decks[0]?.new, 1);
});

test('each Grade is saved at once: Easy schedules the Card from 4:00 of its due day', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  const { card } = await nextCard(plugin);

  const graded = await grade(plugin, card!.id, EASY);
  const later = await at(t, plugin, '2026-11-05T10:00:00.000Z');
  const deck = (await listDecks(later)).decks[0];

  assert.deepEqual(graded, { card: card!.id, grade: EASY, due: '2026-11-12T04:00:00.000Z' });
  assert.equal(deck?.new, 0);
  assert.equal(deck?.due, 0);
  assert.equal(deck?.nextDue, '2026-11-12T04:00:00.000Z');
  assert.deepEqual(await nextCard(later), {
    card: null,
    left: 0,
    reviewsToday: 0,
    nextDue: '2026-11-12T04:00:00.000Z',
    now: '2026-11-05T10:00:00.000Z',
  });
});

test('a Card due on a day is not Due at 3:59 of that day, and is Due from 4:00', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  await gradeNext(plugin, EASY);

  const before = await at(t, plugin, '2026-11-12T03:59:00.000Z');
  const waiting = await nextCard(before);
  const from = await at(t, before, '2026-11-12T04:00:00.000Z');
  const due = await nextCard(from);

  assert.equal(waiting.card, null);
  assert.equal((await listDecks(from)).decks[0]?.due, 1);
  assert.equal(due.card?.question, 'What moves a String?');
  assert.equal(due.left, 1);
});

test('the day turns at 4:00 local time: a Review at 1:30 counts for the day before', async (t) => {
  // In São Paulo (UTC-3), 1:30 on 5 November is 04:30 UTC, and still the day
  // of 4 November, which ends at 4:00 local, 07:00 UTC.
  const plugin = await startedAndShaken(t, {
    env: { FLASHCARDS_NOW: '2026-11-04T12:00:00.000Z', TZ: 'America/Sao_Paulo' },
  });
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  await addBasic(plugin, 'Rust ownership', 'What borrows?', 'A reference.');
  await gradeNext(plugin, GOOD);
  const late = await at(t, plugin, '2026-11-05T04:30:00.000Z', 'America/Sao_Paulo');

  await gradeNext(late, EASY);
  const lateNext = await nextCard(late);
  const lateToday = (await listDecks(late)).today;
  const turned = await at(t, late, '2026-11-05T07:00:00.000Z', 'America/Sao_Paulo');

  assert.equal(lateNext.reviewsToday, 2);
  assert.deepEqual(lateToday, { reviews: 0, newCards: 1 });
  assert.deepEqual((await listDecks(turned)).today, { reviews: 0, newCards: 0 });
  assert.equal((await nextCard(turned)).reviewsToday, 0);
});

test('Easy late at night is Due from 4:00 of the day it counts from, plus its days', async (t) => {
  const plugin = await startedAndShaken(t, {
    env: { FLASHCARDS_NOW: '2026-11-05T04:30:00.000Z', TZ: 'America/Sao_Paulo' },
  });
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  const { card } = await nextCard(plugin);

  const graded = await grade(plugin, card!.id, EASY);

  assert.equal(graded.due, '2026-11-12T07:00:00.000Z');
});

test('Review order: learning steps by due time, then other Due Cards by due time, then New Cards', async (t) => {
  // Created in this order. Each Deck is studied on its own first, to put its
  // Cards where the test wants them.
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'a', '1');
  await addBasic(plugin, 'Go', 'b', '2');
  await addBasic(plugin, 'AWS Solutions Architect', 'c', '3');
  await addBasic(plugin, 'AWS Solutions Architect', 'd', '4');
  await addBasic(plugin, 'Rust ownership', 'e', '5');
  await addBasic(plugin, 'Rust ownership', 'f', '6');
  // "b" is Due from 12 November, "a" from 13 November.
  assert.equal((await gradeNext(plugin, EASY, 'Go')).question, 'b');
  const day2 = await at(t, plugin, '2026-11-05T10:00:00.000Z');
  assert.equal((await gradeNext(day2, EASY, 'Rust ownership')).question, 'a');
  // On 13 November at 10:00, "c" is in a learning step Due at 10:05:30, "d" at 10:01.
  const day13 = await at(t, day2, '2026-11-13T10:00:00.000Z');
  assert.equal((await gradeNext(day13, HARD, 'AWS Solutions Architect')).question, 'c');
  assert.equal((await gradeNext(day13, AGAIN, 'AWS Solutions Architect')).question, 'd');
  const later = await at(t, day13, '2026-11-13T10:30:00.000Z');

  const shown: string[] = [];
  for (;;) {
    const next = await nextCard(later);
    if (next.card === null) break;
    shown.push(next.card.question);
    await grade(later, next.card.id, EASY);
  }

  assert.deepEqual(shown, ['d', 'c', 'b', 'a', 'e', 'f']);
});

test('Review Cards come in due order, before New Cards in Note creation order', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'early', '1');
  await addBasic(plugin, 'Rust ownership', 'late', '2');
  await addBasic(plugin, 'Rust ownership', 'new one', '3');
  await addBasic(plugin, 'Rust ownership', 'new two', '4');
  // "early" Due from 12 November, "late" from 13 November.
  await gradeNext(plugin, EASY);
  const day2 = await at(t, plugin, '2026-11-05T10:00:00.000Z');
  await gradeNext(day2, EASY);
  const day20 = await at(t, day2, '2026-11-20T10:00:00.000Z');

  const shown: string[] = [];
  for (;;) {
    const next = await nextCard(day20);
    if (next.card === null) break;
    shown.push(next.card.question);
    await grade(day20, next.card.id, EASY);
  }

  assert.deepEqual(shown, ['early', 'late', 'new one', 'new two']);
});

test('a Card graded Again comes back the same day, after the other Cards, and counts as left', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  await addBasic(plugin, 'Rust ownership', 'What borrows?', 'A reference.');

  const first = await gradeNext(plugin, AGAIN);
  const between = await nextCard(plugin);
  await grade(plugin, between.card!.id, EASY);
  const back = await nextCard(plugin);

  assert.equal(first.question, 'What moves a String?');
  assert.equal(between.card?.question, 'What borrows?');
  assert.equal(between.left, 2);
  assert.equal(back.card?.id, first.id);
  assert.equal(back.left, 1);
  assert.deepEqual(back.card?.intervals.slice(0, 3), ['<1m', '6m', '10m']);
});

test('a Review Card graded Again is Due again ten minutes later, the same day', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  await gradeNext(plugin, EASY);
  const due = await at(t, plugin, '2026-11-12T10:00:00.000Z');
  const { card } = await nextCard(due);

  const graded = await grade(due, card!.id, AGAIN);
  const later = await at(t, due, '2026-11-12T10:10:00.000Z');

  assert.equal(graded.due, '2026-11-12T10:10:00.000Z');
  assert.equal((await listDecks(later)).decks[0]?.due, 1);
  assert.equal((await nextCard(later)).card?.id, card!.id);
});

test('Good twice graduates a New Card, Due from 4:00 two days later', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  const { card } = await nextCard(plugin);

  const first = await grade(plugin, card!.id, GOOD);
  const ten = await at(t, plugin, '2026-11-04T10:10:00.000Z');
  const shown = await nextCard(ten);
  const second = await grade(ten, card!.id, GOOD);

  assert.equal(first.due, '2026-11-04T10:10:00.000Z');
  // On its last learning step, Good graduates it with 2 days.
  assert.equal(shown.card?.intervals[2], '2d');
  assert.equal(second.due, '2026-11-06T04:00:00.000Z');
});

test('today counts each Card once: New Cards first graded today, and Reviews of other Cards', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  await addBasic(plugin, 'Rust ownership', 'What borrows?', 'A reference.');
  await gradeNext(plugin, AGAIN);
  await gradeNext(plugin, EASY);
  await gradeNext(plugin, GOOD);
  const due = await at(t, plugin, '2026-11-12T10:00:00.000Z');
  await gradeNext(due, HARD);

  const listed = await listDecks(due);
  const next = await nextCard(due);

  assert.deepEqual(listed.today, { reviews: 1, newCards: 0 });
  assert.equal(next.reviewsToday, 1);
});

test('three Grades of New Cards today are two New Cards and three Reviews done', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  await addBasic(plugin, 'Rust ownership', 'What borrows?', 'A reference.');

  await gradeNext(plugin, AGAIN);
  await gradeNext(plugin, EASY);
  await gradeNext(plugin, GOOD);

  assert.deepEqual((await listDecks(plugin)).today, { reviews: 0, newCards: 2 });
  assert.equal((await nextCard(plugin)).reviewsToday, 3);
});

test('a Review of one Deck shows only its Cards, named in any letter case', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'AWS Solutions Architect', 'S3?', 'Storage.');
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');

  const next = await nextCard(plugin, 'rust OWNERSHIP');

  assert.equal(next.card?.deck, 'Rust ownership');
  assert.equal(next.left, 1);
  assert.equal((await nextCard(plugin)).left, 2);
});

test('a Review of a Deck there is not is refused with a sentence', async (t) => {
  const plugin = await startedAndShaken(t);

  const said = refusalOf(await plugin.call('next_card', { deck: 'Klingon' }));

  assert.match(said, /no Deck named "Klingon"/);
});

test('a Grade must be 1 to 4 for a Card there is', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'What moves a String?', 'Assignment.');
  const { card } = await nextCard(plugin);

  for (const wrong of [0, 5, 2.5, 'good', null]) {
    const said = refusalOf(await plugin.call('grade_card', { card: card!.id, grade: wrong }));
    assert.match(said, /1 \(Again\), 2 \(Hard\), 3 \(Good\) or 4 \(Easy\)/);
  }
  assert.match(refusalOf(await plugin.call('grade_card', { grade: GOOD })), /"card"/);
  assert.match(refusalOf(await plugin.call('grade_card', { card: 999, grade: GOOD })), /There is no Card 999\./);
  assert.equal((await listDecks(plugin)).decks[0]?.new, 1);
});
