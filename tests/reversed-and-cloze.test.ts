/**
 * Basic and reversed and Cloze Notes: the Cards each one makes through
 * `add_note`, and what each Card asks and answers in a Review.
 *
 * A Basic and reversed Note makes two Cards, front to back and back to
 * front, each with a schedule of its own. A Cloze Note makes one Card for
 * each gap number in its Text; the Cloze cases are the ones the Plugin Page's
 * parser is tested with, so the two can never ask a Cloze two ways.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { listDecks, refusalOf, type Added } from './helpers/cards.ts';
import { CLOZE_CASES } from './helpers/cloze-cases.ts';
import { startedAndShaken, structureOf, type Started } from './helpers/plugin.ts';
import { EASY, AGAIN, grade, nextCard, type ShownCard } from './helpers/review.ts';

/** Add one Note of this Note Type, and hand back what `add_note` answered. */
async function added(plugin: Started, deck: string, noteType: string, fields: Record<string, string>): Promise<Added> {
  return structureOf<Added>(await plugin.call('add_note', { deck, noteType, fields }));
}

/** Every Card a Review shows now, each graded Easy so the next one comes. */
async function everyCard(plugin: Started): Promise<ShownCard[]> {
  const shown: ShownCard[] = [];
  for (let next = await nextCard(plugin); next.card !== null; next = await nextCard(plugin)) {
    shown.push(next.card);
    await grade(plugin, next.card.id, EASY);
  }
  return shown;
}

// Basic and reversed.

test('a Basic and reversed Note makes two Cards: Front to Back, then Back to Front', async (t) => {
  const plugin = await startedAndShaken(t);

  const note = await added(plugin, 'Japanese N4 vocabulary', 'reversed', { Front: '勉強', Back: 'study' });
  const cards = await everyCard(plugin);

  assert.equal(note.cards, 2);
  assert.deepEqual(
    cards.map(({ deck, side, question, answer }) => ({ deck, side, question, answer })),
    [
      { deck: 'Japanese N4 vocabulary', side: 'Front to Back', question: '勉強', answer: 'study' },
      { deck: 'Japanese N4 vocabulary', side: 'Back to Front', question: 'study', answer: '勉強' },
    ],
  );
  assert.deepEqual((await listDecks(plugin)).decks.map((deck) => [deck.notes, deck.cards]), [[1, 2]]);
});

test('the two Cards of a Basic and reversed Note keep schedules of their own', async (t) => {
  const plugin = await startedAndShaken(t);
  await added(plugin, 'Japanese N4 vocabulary', 'reversed', { Front: '駅', Back: 'station' });

  const front = (await nextCard(plugin)).card!;
  const easy = await grade(plugin, front.id, EASY);
  const back = (await nextCard(plugin)).card!;
  const again = await grade(plugin, back.id, AGAIN);
  const then = await nextCard(plugin);

  assert.notEqual(front.id, back.id);
  // Easy puts the first Card days away; Again keeps the second a minute away,
  // so it is the one the Review shows again.
  assert.equal(easy.due, '2026-11-12T04:00:00.000Z');
  assert.equal(again.due, '2026-11-04T10:01:00.000Z');
  assert.equal(then.card?.id, back.id);
  assert.equal(then.left, 1);
});

// Cloze.

for (const { about, text, faces } of CLOZE_CASES.filter((each) => each.faces.length > 0)) {
  test(`a Cloze Note: ${about}`, async (t) => {
    const plugin = await startedAndShaken(t);

    const note = await added(plugin, 'Portuguese irregular verbs', 'cloze', { Text: text, Extra: '' });
    const cards = await everyCard(plugin);

    assert.equal(note.cards, faces.length);
    assert.deepEqual(
      cards.map(({ side, question, answer }) => ({ side, question, answer })),
      faces.map(({ gap, question, answer }) => ({ side: `Cloze ${gap}`, question, answer })),
    );
  });
}

test('a Cloze Card names its Deck and its gap, and answers Extra after the Text', async (t) => {
  const plugin = await startedAndShaken(t);
  await added(plugin, 'Portuguese irregular verbs', 'cloze', {
    Text: 'Ontem eu {{c1::fiz::fazer}} o jantar.',
    Extra: 'fazer, pretérito perfeito, eu',
  });

  const { card } = await nextCard(plugin);

  assert.deepEqual({ ...card, id: 0, intervals: [] }, {
    id: 0,
    deck: 'Portuguese irregular verbs',
    side: 'Cloze 1',
    question: 'Ontem eu [fazer] o jantar.',
    answer: 'Ontem eu **fiz** o jantar.',
    extra: 'fazer, pretérito perfeito, eu',
    intervals: [],
  });
});

test('Extra may be left out of a Cloze Note, and then the Card has none', async (t) => {
  const plugin = await startedAndShaken(t);

  const note = await added(plugin, 'Rust ownership', 'cloze', { Text: 'A {{c1::Box}} has one owner.' });
  const { card } = await nextCard(plugin);

  assert.equal(note.cards, 1);
  assert.equal(card?.answer, 'A **Box** has one owner.');
  assert.ok(!('extra' in card!), 'a Card with no Extra answered one');
});

test('a Cloze Note with no gap is refused with a sentence that says how to add one, and nothing is kept', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.call('add_note', {
    deck: 'Portuguese irregular verbs',
    noteType: 'cloze',
    fields: { Text: 'Ontem eu fiz o jantar.', Extra: '' },
  });

  assert.equal(answer.error?.code, -32602);
  assert.equal(refusalOf(answer), 'A Cloze Note needs at least one gap, like {{c1::answer}}. Add one, or pick Basic.');
  assert.deepEqual((await listDecks(plugin)).decks, []);
});

test('the Fields of a Cloze Note are Text and Extra', async (t) => {
  const plugin = await startedAndShaken(t);

  const other = refusalOf(await plugin.call('add_note', {
    deck: 'Rust ownership',
    noteType: 'cloze',
    fields: { Front: 'A {{c1::Box}} has one owner.', Back: 'Box' },
  }));
  const missing = refusalOf(await plugin.call('add_note', { deck: 'Rust ownership', noteType: 'cloze', fields: { Extra: 'Box' } }));

  assert.match(other, /no Field "Front"\. Its Fields are Text and Extra\./);
  assert.match(missing, /needs its Text Field/);
});

test('a Note Type it does not know is refused with a sentence naming all three', async (t) => {
  const plugin = await startedAndShaken(t);

  const sentence = refusalOf(await plugin.call('add_note', { deck: 'Go', noteType: 'flashcard', fields: { Front: 'a', Back: 'b' } }));

  assert.match(sentence, /"basic", "reversed" and "cloze"/);
});
