/**
 * `add_note`: another Plugin under a Grant, the Mate, or the Plugin Page adds
 * a Note to a Deck, and the Note makes its Cards.
 *
 * A Deck is created by the first Note that names it, and Deck names are one
 * name whatever their letter case. Every mistake in a call is refused with a
 * sentence that says what to change.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { addBasic, listDecks, refusalOf } from './helpers/cards.ts';
import { makeDirectory, startedAndShaken, structureOf } from './helpers/plugin.ts';

test('a Basic Note makes one Card, and answers its id and the Card count', async (t) => {
  const plugin = await startedAndShaken(t);

  const added = await addBasic(plugin, 'Japanese N4 vocabulary', '勉強', 'study');

  assert.ok(Number.isInteger(added.id) && added.id > 0, `the id is ${added.id}`);
  assert.equal(added.cards, 1);
  assert.equal(added.deck, 'Japanese N4 vocabulary');
});

test('each Note has its own id', async (t) => {
  const plugin = await startedAndShaken(t);

  const first = await addBasic(plugin, 'Rust ownership', 'Who frees a Box?', 'Its owner, when it goes out of scope.');
  const second = await addBasic(plugin, 'Rust ownership', 'Can two owners share a value?', 'Not without Rc or Arc.');

  assert.notEqual(first.id, second.id);
});

test('the first Note that names a Deck creates it', async (t) => {
  const plugin = await startedAndShaken(t);

  await addBasic(plugin, 'AWS Solutions Architect', 'Cheapest S3 class for yearly reads?', 'S3 Glacier Deep Archive');

  const listed = await listDecks(plugin);
  assert.deepEqual(
    listed.decks.map((deck) => [deck.name, deck.notes, deck.cards]),
    [['AWS Solutions Architect', 1, 1]],
  );
});

test('a Deck name in another letter case is the same Deck, kept as it was first written', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'Who frees a Box?', 'Its owner.');

  const added = await addBasic(plugin, 'RUST OWNERSHIP', 'What does move do?', 'It hands the value to a new owner.');

  const listed = await listDecks(plugin);
  assert.equal(added.deck, 'Rust ownership');
  assert.deepEqual(listed.decks.map((deck) => [deck.name, deck.notes]), [['Rust ownership', 2]]);
});

test('a Deck name is taken without the spaces around it', async (t) => {
  const plugin = await startedAndShaken(t);

  const added = await addBasic(plugin, '  Portuguese irregular verbs ', 'fazer, eu, pretérito', 'fiz');

  assert.equal(added.deck, 'Portuguese irregular verbs');
});

test('Tags are optional, and may be given', async (t) => {
  const plugin = await startedAndShaken(t);

  const added = await addBasic(plugin, 'Japanese N4 vocabulary', '駅', 'station', ['noun', 'lesson-12']);

  assert.equal(added.cards, 1);
});

test('the Notes survive a restart of the Plugin Server', async (t) => {
  const directory = await makeDirectory(t);
  const first = await startedAndShaken(t, { directory });
  await addBasic(first, 'Rust ownership', 'Who frees a Box?', 'Its owner.');
  first.stop();
  await first.ended();

  const second = await startedAndShaken(t, { directory });

  const listed = await listDecks(second);
  assert.deepEqual(listed.decks.map((deck) => [deck.name, deck.notes, deck.cards]), [['Rust ownership', 1, 1]]);
});

// Refusals: each is one sentence the caller can act on, and nothing is kept.

/** Call `add_note` with these arguments, and hand back the sentence it refused them with. */
async function refused(t: Parameters<typeof startedAndShaken>[0], args: Record<string, unknown>): Promise<string> {
  const plugin = await startedAndShaken(t);
  const sentence = refusalOf(await plugin.call('add_note', args));
  const listed = await listDecks(plugin);
  assert.deepEqual(listed.decks, [], 'a refused Note left a Deck behind');
  return sentence;
}

const FIELDS = { Front: '勉強', Back: 'study' };

test('a Note Type it does not know is refused with a sentence naming the ones it knows', async (t) => {
  const sentence = await refused(t, { deck: 'Japanese', noteType: 'flashcard', fields: FIELDS });

  assert.match(sentence, /"flashcard"/);
  assert.match(sentence, /basic/);
});

test('a missing Note Type is refused with a sentence', async (t) => {
  const sentence = await refused(t, { deck: 'Japanese', fields: FIELDS });

  assert.match(sentence, /noteType/);
});

test('a missing Field is refused with a sentence naming it', async (t) => {
  const sentence = await refused(t, { deck: 'Japanese', noteType: 'basic', fields: { Front: '勉強' } });

  assert.match(sentence, /Back/);
});

test('an empty Field is refused with a sentence naming it', async (t) => {
  const sentence = await refused(t, { deck: 'Japanese', noteType: 'basic', fields: { Front: '  ', Back: 'study' } });

  assert.match(sentence, /Front/);
});

test('a Field the Note Type does not have is refused with a sentence naming its Fields', async (t) => {
  const sentence = await refused(t, {
    deck: 'Japanese',
    noteType: 'basic',
    fields: { Front: '勉強', Back: 'study', Reading: 'べんきょう' },
  });

  assert.match(sentence, /Reading/);
  assert.match(sentence, /Front and Back/);
});

test('a Field that is not text is refused with a sentence naming it', async (t) => {
  const sentence = await refused(t, { deck: 'Japanese', noteType: 'basic', fields: { Front: '勉強', Back: 42 } });

  assert.match(sentence, /Back/);
});

test('Fields that are not an object are refused with a sentence', async (t) => {
  const sentence = await refused(t, { deck: 'Japanese', noteType: 'basic', fields: ['勉強', 'study'] });

  assert.match(sentence, /fields/);
});

test('an empty Deck name is refused with a sentence', async (t) => {
  const sentence = await refused(t, { deck: '   ', noteType: 'basic', fields: FIELDS });

  assert.match(sentence, /Deck/);
});

test('a missing Deck name is refused with a sentence', async (t) => {
  const sentence = await refused(t, { noteType: 'basic', fields: FIELDS });

  assert.match(sentence, /Deck/);
});

test('Tags that are not a list of words are refused with a sentence', async (t) => {
  for (const tags of ['noun', [42], ['two words'], ['']]) {
    const sentence = await refused(t, { deck: 'Japanese', noteType: 'basic', fields: FIELDS, tags });
    assert.match(sentence, /Tag/, `for ${JSON.stringify(tags)}`);
  }
});

test('every refusal is an invalid-arguments error, so the caller knows it is theirs to fix', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.call('add_note', { deck: '', noteType: 'basic', fields: FIELDS });

  assert.equal(answer.error?.code, -32602);
});

test('a refused Note leaves the Deck it named as it was', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'Who frees a Box?', 'Its owner.');

  await plugin.call('add_note', { deck: 'Rust ownership', noteType: 'basic', fields: { Front: 'x' } });
  await plugin.call('add_note', { deck: 'Go', noteType: 'basic', fields: { Front: 'x' } });

  const listed = structureOf<{ decks: { name: string; notes: number }[] }>(await plugin.call('list_decks'));
  assert.deepEqual(listed.decks.map((deck) => [deck.name, deck.notes]), [['Rust ownership', 1]]);
});
