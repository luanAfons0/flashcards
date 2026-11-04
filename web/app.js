/* The Plugin Page: the top bar and its views, chosen by the address fragment.

   #decks (or no fragment) is the Decks view, #notes the Notes, #add the Note
   editor, and #settings the Plugin Settings (FirstMate ADR-0029). The Host's
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
  notes: { view: 'notes-view', tab: 'notes', draw: null },
  add: { view: 'editor-view', tab: 'notes', draw: null },
  settings: { view: 'settings-view', tab: 'settings', draw: null },
};

/** The route the address names; an address that names none is the Decks view. */
function routeOf(hash) {
  const name = hash.replace(/^#/, '');
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
  say('');
  if (route.draw === null) return;
  try {
    await route.draw();
  } catch (fault) {
    say(fault.message || String(fault));
  }
}

/** The Decks view. With no Deck yet, it says how one appears. */
async function drawDecks() {
  const listed = await call('list_decks');
  byId('decks-empty').hidden = listed.decks.length > 0;
}

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
