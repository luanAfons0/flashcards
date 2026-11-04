/* The Notes view: the Notes of one Deck, found by words in any Field or Tag
   and by Tags, each row opening the Note in the editor. notes.js makes its
   markup and words; this file puts them on the page.

   #notes shows the Deck shown last (the first Deck, the first time), and
   #notes/<Deck> one Deck; the Deck choice changes the address. The search
   and the Tags chosen stay while the page is open, so the way back from the
   editor finds the list as it was left. Each keystroke asks list_notes
   again, and an answer that comes after a newer one is dropped. Its top
   level only declares: app.js calls wireNotes once. */
'use strict';

/** What the Notes view shows: the Deck, the search typed, and the Tags chosen. */
let finding = { deck: null, search: '', chosen: [] };

/** How many times the Notes have been asked for, so only the last answer is drawn. */
let notesAsked = 0;

/** Draw the Notes view for the Deck the address names, or the one shown last. */
async function drawNotes() {
  const listed = await call('list_decks');
  const some = listed.decks.length > 0;
  byId('notes-found').hidden = !some;
  byId('notes-empty').hidden = some;
  byId('notes-count').textContent = '';
  if (!some) return;
  const wanted = deckOf(location.hash) || finding.deck || '';
  const deck = listed.decks.find((each) => each.name.toLowerCase() === wanted.toLowerCase()) || listed.decks[0];
  if (finding.deck === null || finding.deck.toLowerCase() !== deck.name.toLowerCase()) finding.chosen = [];
  finding.deck = deck.name;
  byId('note-deck').innerHTML = deckChoices(listed.decks, deck.name);
  byId('note-search').value = finding.search;
  await findNotes();
}

/** Ask for the Notes as the search and the Tags chosen are now, and draw them. */
async function findNotes() {
  const asked = (notesAsked += 1);
  const found = await call('list_notes', { deck: finding.deck, search: finding.search, tags: finding.chosen });
  if (asked !== notesAsked) return;
  finding.chosen = finding.chosen.filter((tag) => found.tags.indexOf(tag) !== -1);
  const none = found.notes.length === 0 && (finding.search.trim() !== '' || finding.chosen.length > 0);
  byId('notes-count').textContent = notesCountText(found.total, found.notes.length);
  byId('tag-chips').innerHTML = tagChipsMarkup(found.tags, finding.chosen);
  byId('tag-chips').hidden = found.tags.length === 0;
  byId('note-rows').innerHTML = found.notes.map((note) => noteRow(note, found.now)).join('');
  byId('notes-sheet').hidden = none;
  byId('notes-none').hidden = !none;
  byId('notes-none-h').textContent = noMatchHeading(finding.search, finding.chosen);
}

/** Find the Notes again, and say why when that fails. */
function findAgain() {
  findNotes().catch((fault) => say(fault.message || String(fault)));
}

/** Open the Note of this row in the editor. */
function openNote(row) {
  location.hash = '#edit/' + row.dataset.note;
}

/** Wire the search, the Deck choice, the Tag filter, Clear search and the rows. app.js calls it once, after byId exists. */
function wireNotes() {
  byId('note-search').addEventListener('input', () => {
    finding.search = byId('note-search').value;
    findAgain();
  });
  byId('note-deck').addEventListener('change', () => {
    location.hash = '#notes/' + encodeURIComponent(byId('note-deck').value);
  });
  byId('tag-chips').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-chip]');
    if (chip === null) return;
    const tag = chip.dataset.chip;
    finding.chosen = finding.chosen.indexOf(tag) === -1 ? finding.chosen.concat([tag]) : finding.chosen.filter((each) => each !== tag);
    findAgain();
  });
  byId('clear-search').addEventListener('click', () => {
    finding.search = '';
    finding.chosen = [];
    byId('note-search').value = '';
    byId('note-search').focus();
    findAgain();
  });
  byId('note-rows').addEventListener('click', (event) => {
    const row = event.target.closest('[data-note]');
    if (row !== null) openNote(row);
  });
  byId('note-rows').addEventListener('keydown', (event) => {
    const row = event.target.closest('[data-note]');
    if (event.key !== 'Enter' || row === null) return;
    event.preventDefault();
    openNote(row);
  });
}
