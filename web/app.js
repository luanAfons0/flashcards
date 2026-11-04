/* The Plugin Page: the top bar and its views, chosen by the address fragment.

   #decks (or no fragment) is the Decks view, #review a Review of every Deck
   and #review/<Deck> of one, #notes the Notes, #add the Note editor, and
   #settings the Plugin Settings (FirstMate ADR-0029). The Host's
   "Open settings" changes only the fragment of a page already open, so the
   view follows every hashchange as well as the address it loads with.

   Every element is reached by byId, the one helper here, so the page test
   can check that each id a script names is in the markup. */
'use strict';

/** The element with this id, which the markup declares. */
function byId(id) {
  return document.getElementById(id);
}

/** Each view by its fragment, and the tab of the top bar it belongs to. */
const ROUTES = {
  decks: { view: 'decks-view', tab: 'decks', draw: drawDecks },
  review: { view: 'review-view', tab: null, draw: drawStudy },
  notes: { view: 'notes-view', tab: 'notes', draw: null },
  add: { view: 'editor-view', tab: 'notes', draw: () => drawEditor(null) },
  settings: { view: 'settings-view', tab: 'settings', draw: drawSettings },
};

/** The route the address names; an address that names none is the Decks view. */
function routeOf(hash) {
  const name = hash.replace(/^#/, '').split('/')[0];
  return Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : ROUTES.decks;
}

/** Show the view the address names, mark its tab, and draw it. */
async function show() {
  const route = routeOf(location.hash);
  for (const name of Object.keys(ROUTES)) {
    byId(ROUTES[name].view).hidden = ROUTES[name].view !== route.view;
  }
  for (const tab of document.querySelectorAll('[data-tab]')) {
    if (tab.dataset.tab === route.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  // The page bar goes faint in a Review, and a Review left by any way ends.
  byId('page').dataset.mode = route === ROUTES.review ? 'review' : '';
  if (route !== ROUTES.review) endReview();
  if (route !== ROUTES.settings) leaveSettings();
  if (route.view !== ROUTES.add.view) leaveEditor();
  say('');
  if (route.draw === null) return;
  try {
    await route.draw();
  } catch (fault) {
    say(fault.message || String(fault));
  }
}

/**
 * The Decks view: one ruled row for each Deck, "Study all Due" with the
 * total, and the today line. With no Deck yet, it says how one appears.
 */
async function drawDecks() {
  const listed = await call('list_decks');
  const some = listed.decks.length > 0;
  byId('decks-empty').hidden = some;
  byId('decks-sheet').hidden = !some;
  byId('study-all').hidden = !some;
  byId('study-total').textContent = String(totalDue(listed.decks));
  byId('deck-rows').innerHTML = listed.decks.map((deck) => deckRow(deck, listed.now)).join('');
  byId('today-line').textContent = todayLine(listed.today, listed.limit);
  confirming = null;
}

/* Deleting a Deck. Its row's Delete button asks count_deck what the Deck
   holds, and the confirm takes the row's place, with "Keep the Deck" focused
   so Enter keeps. Keep the Deck, or Esc, puts the row back as it was; Delete
   Deck calls delete_deck and draws the Decks without it. One confirm is open
   at a time. */

/** The open confirm and the Deck row it took the place of, or null. */
let confirming = null;

/** Put the confirm's Deck row back, focused on its Delete button. */
function keepDeck() {
  if (confirming === null) return;
  const row = confirming.row;
  confirming.confirm.replaceWith(row);
  confirming = null;
  row.querySelector('[data-delete]').focus();
}

/** Put the confirm for this Delete button's Deck in its row's place. */
async function askToDelete(button) {
  const contents = await call('count_deck', { deck: button.dataset.delete });
  keepDeck();
  const row = button.closest('tr');
  row.insertAdjacentHTML('afterend', confirmRow(contents));
  confirming = { row: row, confirm: row.nextElementSibling };
  row.remove();
  confirming.confirm.querySelector('[data-keep]').focus();
}

byId('deck-rows').addEventListener('click', async (event) => {
  const target = event.target.closest('[data-delete], [data-keep], [data-confirm-delete]');
  if (target === null) return;
  try {
    if (target.hasAttribute('data-delete')) await askToDelete(target);
    else if (target.hasAttribute('data-keep')) keepDeck();
    else {
      await call('delete_deck', { deck: target.dataset.confirmDelete });
      await drawDecks();
    }
  } catch (fault) {
    say(fault.message || String(fault));
  }
});
byId('deck-rows').addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && confirming !== null) {
    event.preventDefault();
    keepDeck();
  }
});

/* Starting a Review. "Study all Due" and the key S on the Decks open
   #review, a Deck row's Study opens #review/<Deck>, and study.js runs the
   Review. Esc there comes back to the Decks. */

/** The Deck a Review address names, or null for a Review of every Deck. */
function deckOf(hash) {
  const at = hash.indexOf('/');
  if (at < 0) return null;
  try {
    return decodeURIComponent(hash.slice(at + 1));
  } catch {
    return hash.slice(at + 1);
  }
}

/** The Review view: the Review the address names, started or carried on. */
function drawStudy() {
  return startReview(deckOf(location.hash), {
    leave: () => {
      location.hash = '#decks';
    },
    say: say,
    compact: false,
  });
}

byId('study-all').addEventListener('click', () => {
  location.hash = '#review';
});
byId('deck-rows').addEventListener('click', (event) => {
  const study = event.target.closest('[data-study]');
  if (study !== null) location.hash = '#review/' + encodeURIComponent(study.dataset.study);
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 's' && event.key !== 'S') return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, textarea, select')) return;
  if (byId('decks-view').hidden || byId('study-all').hidden || confirming !== null) return;
  event.preventDefault();
  location.hash = '#review';
});

// The Settings: settings.js saves the form; a change to a field takes Saved away.
byId('settings-form').addEventListener('submit', saveSettings);
byId('settings-form').addEventListener('input', () => {
  byId('saved').hidden = true;
});

// The Note editor: note-editor.js wires its form, Fields and Tags.
wireEditor();

/** Say one sentence in the banner, or clear it with none. */
function say(sentence) {
  byId('banner').textContent = sentence;
  byId('banner').hidden = sentence === '';
}

window.addEventListener('hashchange', show);
// The Page and the Popup can both be open. Coming back to one draws it again,
// so it never shows what the other has since changed.
window.addEventListener('focus', show);
show();
