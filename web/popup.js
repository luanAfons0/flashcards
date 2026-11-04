/* The Popup: a Review of every Deck, the moment the Host shows it.

   It is the Plugin Page's Review, drawn compact: study.js runs it and
   review.js draws it, so the rules, keys, intervals, strip and Undo are the
   same. The operator binds it with firstmate bind <keys> flashcards popup.html.

   Hiding is the Host's job. It hides the Popup on Esc, when it loses focus,
   when its Shortcut is pressed again, and when its page goes to another
   address; every hide unloads the page, so every show starts afresh from what
   the Plugin Server holds. Each Grade is sent the moment its key is pressed,
   kept alive past the page by rpc.js, so hiding loses none. Esc leaves the
   Review here by going to the Plugin Page's address, which hides the Popup,
   and in a plain browser tab lands on the Plugin Page.

   Every element is reached by byId, the one helper here, so the page test
   can check that each id a script names is in the markup. */
'use strict';

/** The element with this id, which the markup declares. */
function byId(id) {
  return document.getElementById(id);
}

/** Say one sentence in the banner, or clear it with none. */
function say(sentence) {
  byId('banner').textContent = sentence;
  byId('banner').hidden = sentence === '';
}

/** Hide the Popup: the Host hides it as its page leaves its own address. */
function hide() {
  location.assign('./');
}

// study.js takes Esc while a Review shows. Before one does, as when the
// Plugin Server cannot be reached, Esc still hides the Popup.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  event.preventDefault();
  hide();
});

startReview(null, { leave: hide, say: say, compact: true }).catch((fault) => {
  say(fault.message || String(fault));
});
