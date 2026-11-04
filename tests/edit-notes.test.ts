/**
 * Finding and editing Notes: `list_notes`, `get_note`, `update_note` and
 * `delete_note`, through the Plugin Server as the Host runs it.
 *
 * The edit rules are the spec's. A change to a Field keeps every Card's
 * schedule. A Cloze gap number that goes deletes its Card and that Card's
 * Reviews, and a new one makes a New Card. Basic to Basic and reversed makes
 * the reverse Card, and back deletes it. A change to or from Cloze is
 * refused. What a Card keeps is read through the tools alone: its id, its due
 * time and its Reviews in `get_note`, and the Reviews of its Deck in
 * `count_deck`.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { addBasic, refusalOf, type Added } from './helpers/cards.ts';
import { NOW, startedAndShaken, structureOf, type Started } from './helpers/plugin.ts';
import { at, GOOD, gradeNext, nextCard } from './helpers/review.ts';

type Fields = Record<string, string>;

/** One Card of a Note, as `get_note` answers it. */
type NoteCard = { id: number; ordinal: number; side: string; due: string | null; reviews: number };

/** What `get_note` answers. */
type Note = { id: number; deck: string; noteType: string; fields: Fields; tags: string[]; cards: NoteCard[] };

/** One Note as `list_notes` lists it. */
type ListedNote = { id: number; noteType: string; fields: Fields; tags: string[]; nextDue: string | null };

/** What `list_notes` answers. */
type Notes = { deck: string; total: number; tags: string[]; notes: ListedNote[]; now: string };

/** What `update_note` answers. */
type Updated = { id: number; deck: string; cards: number; added: number[]; deleted: number[] };

/** What `delete_note` answers. */
type Deleted = { id: number; deck: string; cards: number; reviews: number };

/** Add one Note of any Note Type, and hand back what `add_note` answered. */
async function added(plugin: Started, deck: string, noteType: string, fields: Fields, tags: string[] = []): Promise<Added> {
  return structureOf<Added>(await plugin.call('add_note', { deck, noteType, fields, tags }));
}

/** One Note, as `get_note` answers it. */
async function noteOf(plugin: Started, id: number): Promise<Note> {
  return structureOf<Note>(await plugin.call('get_note', { id }));
}

/** Change one Note, and hand back what `update_note` answered. */
async function updated(plugin: Started, id: number, deck: string, noteType: string, fields: Fields, tags: string[] = []): Promise<Updated> {
  return structureOf<Updated>(await plugin.call('update_note', { id, deck, noteType, fields, tags }));
}

/** How many Reviews the Cards of this Deck have had. */
async function reviewsIn(plugin: Started, deck: string): Promise<number> {
  return structureOf<{ reviews: number }>(await plugin.call('count_deck', { deck })).reviews;
}

// get_note.

test('get_note answers a Note as the editor opens it, with each of its Cards', async (t) => {
  const plugin = await startedAndShaken(t);
  const note = await added(plugin, 'Japanese N4 vocabulary', 'reversed', { Front: '勉強', Back: 'study' }, ['noun']);

  const got = await noteOf(plugin, note.id);

  assert.deepEqual(got, {
    id: note.id,
    deck: 'Japanese N4 vocabulary',
    noteType: 'reversed',
    fields: { Front: '勉強', Back: 'study' },
    tags: ['noun'],
    cards: [
      { id: got.cards[0]!.id, ordinal: 1, side: 'Front to Back', due: null, reviews: 0 },
      { id: got.cards[1]!.id, ordinal: 2, side: 'Back to Front', due: null, reviews: 0 },
    ],
  });
});

test('get_note refuses an id no Note has, and names where the ids come from', async (t) => {
  const plugin = await startedAndShaken(t);

  assert.equal(refusalOf(await plugin.call('get_note', { id: 7 })), 'get_note found no Note with the id 7. list_notes names the Notes of a Deck with their ids.');
  assert.equal(refusalOf(await plugin.call('get_note', { id: 'seven' })), 'get_note needs "id" as the id of a Note, as list_notes answers it.');
});

// update_note: the edit rules.

test('a change to a Field keeps every Card, its schedule and its Reviews', async (t) => {
  let plugin = await startedAndShaken(t);
  const note = await added(plugin, 'Japanese N4 vocabulary', 'reversed', { Front: '勉強', Back: 'studdy' });
  await gradeNext(plugin, GOOD);
  const before = await noteOf(plugin, note.id);

  const answer = await updated(plugin, note.id, 'Japanese N4 vocabulary', 'reversed', { Front: '勉強', Back: 'study' }, ['noun']);
  const after = await noteOf(plugin, note.id);

  assert.deepEqual(answer, { id: note.id, deck: 'Japanese N4 vocabulary', cards: 2, added: [], deleted: [] });
  assert.deepEqual(after.cards, before.cards);
  assert.equal(after.cards[0]!.reviews, 1);
  assert.notEqual(after.cards[0]!.due, null);
  assert.deepEqual(after.fields, { Front: '勉強', Back: 'study' });
  assert.deepEqual(after.tags, ['noun']);
  // The Card that had its Review comes back when it was due to, asking the new words.
  plugin = await at(t, plugin, after.cards[0]!.due!);
  const shown = await nextCard(plugin);
  assert.equal(shown.card?.id, after.cards[0]!.id);
  assert.equal(shown.card?.answer, 'study');
});

test('a Cloze gap number that goes deletes its Card and that Card\'s Reviews; a new one makes a New Card', async (t) => {
  const plugin = await startedAndShaken(t);
  const note = await added(plugin, 'Portuguese irregular verbs', 'cloze', { Text: 'Ontem eu {{c1::fiz}} o jantar e {{c2::pus}} a mesa.' });
  await gradeNext(plugin, GOOD);
  await gradeNext(plugin, GOOD);
  const before = await noteOf(plugin, note.id);
  assert.equal(await reviewsIn(plugin, 'Portuguese irregular verbs'), 2);

  const answer = await updated(plugin, note.id, 'Portuguese irregular verbs', 'cloze', {
    Text: 'Ontem eu {{c1::fiz}} o jantar e {{c3::lavei}} a louça.',
    Extra: 'pretérito perfeito',
  });
  const after = await noteOf(plugin, note.id);

  assert.deepEqual(answer, { id: note.id, deck: 'Portuguese irregular verbs', cards: 2, added: [3], deleted: [2] });
  assert.deepEqual(after.cards.map(({ ordinal, side, reviews }) => ({ ordinal, side, reviews })), [
    { ordinal: 1, side: 'Cloze 1', reviews: 1 },
    { ordinal: 3, side: 'Cloze 3', reviews: 0 },
  ]);
  assert.deepEqual(after.cards[0], before.cards[0]);
  assert.equal(after.cards[1]!.due, null);
  assert.equal(await reviewsIn(plugin, 'Portuguese irregular verbs'), 1);
  // The new gap is a New Card, so a Review shows it now.
  assert.equal((await nextCard(plugin)).card?.side, 'Cloze 3');
});

test('Basic to Basic and reversed makes the reverse Card, and the change back deletes it with its Reviews', async (t) => {
  const plugin = await startedAndShaken(t);
  const note = await addBasic(plugin, 'Japanese N4 vocabulary', '駅', 'station');
  await gradeNext(plugin, GOOD);
  const front = (await noteOf(plugin, note.id)).cards[0]!;

  const reversed = await updated(plugin, note.id, 'Japanese N4 vocabulary', 'reversed', { Front: '駅', Back: 'station' });
  const back = (await noteOf(plugin, note.id)).cards[1]!;
  assert.deepEqual(reversed, { id: note.id, deck: 'Japanese N4 vocabulary', cards: 2, added: [2], deleted: [] });
  assert.deepEqual((await noteOf(plugin, note.id)).cards[0], { ...front, side: 'Front to Back' });
  assert.deepEqual({ ...back, id: 0 }, { id: 0, ordinal: 2, side: 'Back to Front', due: null, reviews: 0 });
  await gradeNext(plugin, GOOD);
  assert.equal(await reviewsIn(plugin, 'Japanese N4 vocabulary'), 2);

  const basic = await updated(plugin, note.id, 'Japanese N4 vocabulary', 'basic', { Front: '駅', Back: 'station' });

  assert.deepEqual(basic, { id: note.id, deck: 'Japanese N4 vocabulary', cards: 1, added: [], deleted: [2] });
  assert.deepEqual((await noteOf(plugin, note.id)).cards, [{ ...front, side: 'Basic' }]);
  assert.equal(await reviewsIn(plugin, 'Japanese N4 vocabulary'), 1);
});

test('a change to or from Cloze is refused with a sentence, and the Note stays as it was', async (t) => {
  const plugin = await startedAndShaken(t);
  const basic = await addBasic(plugin, 'Japanese N4 vocabulary', '駅', 'station');
  const cloze = await added(plugin, 'Portuguese irregular verbs', 'cloze', { Text: 'Ontem eu {{c1::fiz}} o jantar.' });
  const before = [await noteOf(plugin, basic.id), await noteOf(plugin, cloze.id)];

  const toCloze = await plugin.call('update_note', {
    id: basic.id, deck: 'Japanese N4 vocabulary', noteType: 'cloze', fields: { Text: '{{c1::駅}} is station.' }, tags: [],
  });
  const fromCloze = await plugin.call('update_note', {
    id: cloze.id, deck: 'Portuguese irregular verbs', noteType: 'reversed', fields: { Front: 'fiz', Back: 'fazer' }, tags: [],
  });

  assert.equal(
    refusalOf(toCloze),
    'A Basic Note cannot become a Cloze Note, because its Cards would not carry over. Add a new Cloze Note instead.',
  );
  assert.equal(
    refusalOf(fromCloze),
    'A Cloze Note cannot become a Basic and reversed Note, because its Cards would not carry over. Add a new Basic and reversed Note instead.',
  );
  assert.deepEqual([await noteOf(plugin, basic.id), await noteOf(plugin, cloze.id)], before);
});

test('update_note refuses what add_note refuses, and changes nothing', async (t) => {
  const plugin = await startedAndShaken(t);
  const note = await added(plugin, 'Portuguese irregular verbs', 'cloze', { Text: 'Ontem eu {{c1::fiz}} o jantar.' });
  const before = await noteOf(plugin, note.id);

  const noGap = await plugin.call('update_note', { id: note.id, deck: 'Portuguese irregular verbs', noteType: 'cloze', fields: { Text: 'Ontem eu fiz o jantar.' } });
  const noDeck = await plugin.call('update_note', { id: note.id, deck: ' ', noteType: 'cloze', fields: { Text: '{{c1::fiz}}' } });
  const noNote = await plugin.call('update_note', { id: note.id + 1, deck: 'Go', noteType: 'basic', fields: { Front: 'a', Back: 'b' } });

  assert.equal(refusalOf(noGap), 'A Cloze Note needs at least one gap, like {{c1::answer}}. Add one, or pick Basic.');
  assert.equal(refusalOf(noDeck), 'update_note needs "deck" as the name of a Deck, such as "Japanese N4 vocabulary".');
  assert.equal(refusalOf(noNote), `update_note found no Note with the id ${note.id + 1}. list_notes names the Notes of a Deck with their ids.`);
  assert.deepEqual(await noteOf(plugin, note.id), before);
});

test('update_note moves a Note to the Deck it names, made if it is new, with its Cards and their schedules', async (t) => {
  const plugin = await startedAndShaken(t);
  const note = await addBasic(plugin, 'Japanese N4 vocabulary', '駅', 'station');
  await gradeNext(plugin, GOOD);
  const before = await noteOf(plugin, note.id);

  const answer = await updated(plugin, note.id, 'japanese n5 VOCABULARY', 'basic', { Front: '駅', Back: 'station' });

  assert.equal(answer.deck, 'japanese n5 VOCABULARY');
  assert.deepEqual(await noteOf(plugin, note.id), { ...before, deck: 'japanese n5 VOCABULARY' });
  assert.equal(await reviewsIn(plugin, 'Japanese N5 vocabulary'), 1);
  assert.equal(await reviewsIn(plugin, 'Japanese N4 vocabulary'), 0);
});

// delete_note.

test('delete_note deletes one Note with its Cards and their Reviews, and keeps its Deck and every other Note', async (t) => {
  const plugin = await startedAndShaken(t);
  const station = await added(plugin, 'Japanese N4 vocabulary', 'reversed', { Front: '駅', Back: 'station' });
  const study = await addBasic(plugin, 'Japanese N4 vocabulary', '勉強', 'study');
  await gradeNext(plugin, GOOD);
  await gradeNext(plugin, GOOD);
  await gradeNext(plugin, GOOD);
  const kept = await noteOf(plugin, study.id);

  const answer = structureOf<Deleted>(await plugin.call('delete_note', { id: station.id }));

  assert.deepEqual(answer, { id: station.id, deck: 'Japanese N4 vocabulary', cards: 2, reviews: 2 });
  assert.equal(refusalOf(await plugin.call('get_note', { id: station.id })), `get_note found no Note with the id ${station.id}. list_notes names the Notes of a Deck with their ids.`);
  assert.deepEqual(await noteOf(plugin, study.id), kept);
  assert.deepEqual(structureOf(await plugin.call('count_deck', { deck: 'Japanese N4 vocabulary' })), {
    deck: 'Japanese N4 vocabulary', notes: 1, cards: 1, reviews: 1,
  });
});

test('delete_note refuses an id no Note has', async (t) => {
  const plugin = await startedAndShaken(t);

  assert.equal(refusalOf(await plugin.call('delete_note', { id: 3 })), 'delete_note found no Note with the id 3. list_notes names the Notes of a Deck with their ids.');
  assert.equal(refusalOf(await plugin.call('delete_note', {})), 'delete_note needs "id" as the id of a Note, as list_notes answers it.');
});

// list_notes.

/** The Notes of a Deck, as `list_notes` answers them for this search and these Tags. */
async function notesOf(plugin: Started, deck: string, search?: string, tags?: string[]): Promise<Notes> {
  const args: Record<string, unknown> = { deck };
  if (search !== undefined) args['search'] = search;
  if (tags !== undefined) args['tags'] = tags;
  return structureOf<Notes>(await plugin.call('list_notes', args));
}

/** Each Note's first Field, to see which Notes a list holds. */
function firsts(listed: Notes): string[] {
  return listed.notes.map((note) => note.fields['Front'] ?? note.fields['Text'] ?? '');
}

/** Four Notes in one Deck and one in another, as the Notes view finds them. */
async function japanese(plugin: Started): Promise<void> {
  await added(plugin, 'Japanese N4 vocabulary', 'reversed', { Front: '勉強', Back: 'study' }, ['noun', 'lesson-12']);
  await added(plugin, 'Japanese N4 vocabulary', 'reversed', { Front: '会社', Back: 'company' }, ['noun', 'lesson-13']);
  await added(plugin, 'Japanese N4 vocabulary', 'cloze', { Text: '{{c1::行きます}} means to go, polite form.', Extra: '行く' }, ['verb', 'lesson-12']);
  await added(plugin, 'Japanese N4 vocabulary', 'basic', { Front: '質問', Back: 'Question' }, ['noun', 'lesson-12', 'leech']);
  await added(plugin, 'Rust ownership', 'basic', { Front: 'What moves a String?', Back: 'Assignment.' }, ['noun']);
}

test('list_notes lists the Notes of one Deck in the order they were added, with their Note Type, Tags and next Due', async (t) => {
  const plugin = await startedAndShaken(t);
  await japanese(plugin);
  const graded = await gradeNext(plugin, GOOD, 'Japanese N4 vocabulary');

  const listed = await notesOf(plugin, 'japanese n4 vocabulary');

  assert.equal(listed.deck, 'Japanese N4 vocabulary');
  assert.equal(listed.total, 4);
  assert.equal(listed.now, NOW);
  assert.deepEqual(listed.tags, ['leech', 'lesson-12', 'lesson-13', 'noun', 'verb']);
  assert.deepEqual(listed.notes.map(({ id, ...note }) => note), [
    { noteType: 'reversed', fields: { Front: '勉強', Back: 'study' }, tags: ['noun', 'lesson-12'], nextDue: '2026-11-04T10:10:00.000Z' },
    { noteType: 'reversed', fields: { Front: '会社', Back: 'company' }, tags: ['noun', 'lesson-13'], nextDue: null },
    { noteType: 'cloze', fields: { Text: '{{c1::行きます}} means to go, polite form.', Extra: '行く' }, tags: ['verb', 'lesson-12'], nextDue: null },
    { noteType: 'basic', fields: { Front: '質問', Back: 'Question' }, tags: ['noun', 'lesson-12', 'leech'], nextDue: null },
  ]);
  assert.equal(graded.question, '勉強');
  // The id is the one get_note and update_note take.
  assert.equal((await noteOf(plugin, listed.notes[0]!.id)).fields['Front'], '勉強');
});

test('list_notes finds Notes by every word searched, in any Field or Tag, in any letter case', async (t) => {
  const plugin = await startedAndShaken(t);
  await japanese(plugin);

  assert.deepEqual(firsts(await notesOf(plugin, 'Japanese N4 vocabulary', 'QUESTION')), ['質問']);
  assert.deepEqual(firsts(await notesOf(plugin, 'Japanese N4 vocabulary', '行く')), ['{{c1::行きます}} means to go, polite form.']);
  assert.deepEqual(firsts(await notesOf(plugin, 'Japanese N4 vocabulary', 'lesson-13')), ['会社']);
  assert.deepEqual(firsts(await notesOf(plugin, 'Japanese N4 vocabulary', '  noun   lesson-12 ')), ['勉強', '質問']);
  assert.deepEqual(firsts(await notesOf(plugin, 'Japanese N4 vocabulary', 'kaisha')), []);
  assert.deepEqual(firsts(await notesOf(plugin, 'Japanese N4 vocabulary', 'String')), []);
  assert.equal((await notesOf(plugin, 'Japanese N4 vocabulary', 'kaisha')).total, 4);
});

test('list_notes keeps the Notes with every Tag chosen, and the Tags and the search combine', async (t) => {
  const plugin = await startedAndShaken(t);
  await japanese(plugin);

  assert.deepEqual(firsts(await notesOf(plugin, 'Japanese N4 vocabulary', '', ['lesson-12'])), ['勉強', '{{c1::行きます}} means to go, polite form.', '質問']);
  assert.deepEqual(firsts(await notesOf(plugin, 'Japanese N4 vocabulary', '', ['lesson-12', 'noun'])), ['勉強', '質問']);
  assert.deepEqual(firsts(await notesOf(plugin, 'Japanese N4 vocabulary', 'study', ['lesson-12', 'noun'])), ['勉強']);
  assert.deepEqual(firsts(await notesOf(plugin, 'Japanese N4 vocabulary', 'company', ['lesson-12'])), []);
  // A Tag is matched whole, as it was written.
  assert.deepEqual(firsts(await notesOf(plugin, 'Japanese N4 vocabulary', undefined, ['lesson'])), []);
});

test('list_notes refuses a Deck there is not, and a search or Tags it cannot read', async (t) => {
  const plugin = await startedAndShaken(t);
  await japanese(plugin);

  assert.equal(refusalOf(await plugin.call('list_notes', { deck: 'Go' })), 'list_notes found no Deck named "Go". list_decks names every Deck.');
  assert.equal(refusalOf(await plugin.call('list_notes', {})), 'list_notes needs "deck" as the name of a Deck, such as "Japanese N4 vocabulary".');
  assert.equal(refusalOf(await plugin.call('list_notes', { deck: 'Rust ownership', search: 3 })), 'list_notes takes "search" as words to find in any Field or Tag, such as "kaisha".');
  assert.equal(
    refusalOf(await plugin.call('list_notes', { deck: 'Rust ownership', tags: 'noun' })),
    'list_notes takes "tags" as a list of Tags, each one word, such as ["noun", "lesson-12"].',
  );
});
