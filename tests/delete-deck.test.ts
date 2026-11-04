/**
 * Deleting a Deck: the Plugin Page first asks `count_deck` what the Deck
 * holds, to name it in the confirm, and then `delete_deck` deletes it with
 * its Notes, its Cards and their Reviews.
 *
 * Nothing else changes: the other Decks keep every Note and Card they had.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { addBasic, listDecks, refusalOf } from './helpers/cards.ts';
import { makeDirectory, startedAndShaken, structureOf } from './helpers/plugin.ts';

/** What `count_deck` and `delete_deck` answer. */
type Counted = { readonly deck: string; readonly notes: number; readonly cards: number; readonly reviews: number };

test('count_deck names the Deck and counts its Notes, Cards and Reviews', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'Who frees a Box?', 'Its owner.');
  await addBasic(plugin, 'Rust ownership', 'What does move do?', 'It hands the value to a new owner.');
  await addBasic(plugin, 'Japanese N4 vocabulary', '駅', 'station');

  const counted = structureOf<Counted>(await plugin.call('count_deck', { deck: 'Rust ownership' }));

  assert.deepEqual(counted, { deck: 'Rust ownership', notes: 2, cards: 2, reviews: 0 });
});

test('count_deck finds a Deck by its name in any letter case, and answers it as kept', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'Who frees a Box?', 'Its owner.');

  const counted = structureOf<Counted>(await plugin.call('count_deck', { deck: '  RUST OWNERSHIP ' }));

  assert.equal(counted.deck, 'Rust ownership');
});

test('count_deck changes nothing', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'Who frees a Box?', 'Its owner.');
  const before = await listDecks(plugin);

  await plugin.call('count_deck', { deck: 'Rust ownership' });

  assert.deepEqual(await listDecks(plugin), before);
});

test('delete_deck deletes the Deck with its Notes and Cards, and answers what it deleted', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'Who frees a Box?', 'Its owner.');
  await addBasic(plugin, 'Rust ownership', 'What does move do?', 'It hands the value to a new owner.');

  const counted = structureOf<Counted>(await plugin.call('count_deck', { deck: 'Rust ownership' }));
  const deleted = structureOf<Counted>(await plugin.call('delete_deck', { deck: 'Rust ownership' }));

  assert.deepEqual(deleted, counted);
  assert.deepEqual((await listDecks(plugin)).decks, []);
});

test('deleting a Deck changes no other Deck', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'Who frees a Box?', 'Its owner.');
  await addBasic(plugin, 'Japanese N4 vocabulary', '駅', 'station');
  await addBasic(plugin, 'Japanese N4 vocabulary', '勉強', 'study');
  const before = await listDecks(plugin);

  await plugin.call('delete_deck', { deck: 'rust ownership' });

  const after = await listDecks(plugin);
  assert.deepEqual(after.decks, before.decks.filter((deck) => deck.name !== 'Rust ownership'));
  assert.deepEqual(after.today, before.today);
});

test('a deleted Deck is gone after a restart, and its name makes a new, empty Deck', async (t) => {
  const directory = await makeDirectory(t);
  const first = await startedAndShaken(t, { directory });
  await addBasic(first, 'Rust ownership', 'Who frees a Box?', 'Its owner.');
  await addBasic(first, 'Rust ownership', 'What does move do?', 'It hands the value to a new owner.');
  await first.call('delete_deck', { deck: 'Rust ownership' });
  first.stop();
  await first.ended();

  const second = await startedAndShaken(t, { directory });
  assert.deepEqual((await listDecks(second)).decks, []);
  await addBasic(second, 'rust ownership', 'Can two owners share a value?', 'Not without Rc or Arc.');

  const listed = await listDecks(second);
  assert.deepEqual(listed.decks.map((deck) => [deck.name, deck.notes, deck.cards]), [['rust ownership', 1, 1]]);
});

test('a Deck that is not there is refused with a sentence, by both tools', async (t) => {
  const plugin = await startedAndShaken(t);
  await addBasic(plugin, 'Rust ownership', 'Who frees a Box?', 'Its owner.');

  for (const tool of ['count_deck', 'delete_deck']) {
    const refused = refusalOf(await plugin.call(tool, { deck: 'Go concurrency' }));
    assert.equal(refused, `${tool} found no Deck named "Go concurrency". list_decks names every Deck.`);
  }
  assert.equal((await listDecks(plugin)).decks.length, 1);
});

test('a call with no Deck name is refused with a sentence, by both tools', async (t) => {
  const plugin = await startedAndShaken(t);

  for (const tool of ['count_deck', 'delete_deck']) {
    for (const deck of [undefined, '', '   ', 42]) {
      const refused = refusalOf(await plugin.call(tool, deck === undefined ? {} : { deck }));
      assert.equal(refused, `${tool} needs "deck" as the name of a Deck, such as "Japanese N4 vocabulary".`);
    }
  }
});

test('both tools are listed with the Deck name as their one argument', async (t) => {
  const plugin = await startedAndShaken(t);

  const listed = (await plugin.ask('tools/list')).result as {
    tools: { name: string; inputSchema: { properties: object; required: string[] } }[];
  };

  for (const name of ['count_deck', 'delete_deck']) {
    const tool = listed.tools.find((each) => each.name === name);
    assert.ok(tool !== undefined, `${name} is not listed`);
    assert.deepEqual(Object.keys(tool.inputSchema.properties), ['deck']);
    assert.deepEqual(tool.inputSchema.required, ['deck']);
  }
});
