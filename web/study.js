/* A Review under way: which Card shows, whether its answer shows, and the
   Grades given so far, with the keys and clicks that move it on.

   It asks next_card for each Card and grade_card for each Grade, and saves
   nothing of its own: every Grade is saved by the Plugin Server the moment it
   is given, so leaving, closing the window or hiding the Popup loses none.
   What it shows comes from review.js; it draws into #review-main, and into
   #review-done with #done-line for "Nothing Due".

   Keys: Space shows the answer, 1 to 4 give Again, Hard, Good or Easy, Esc
   leaves. Z is Undo's key, and does nothing until Undo exists. After the
   answer shows, focus is on Good, so Enter never gives Again by accident. */
'use strict';

/**
 * This Review so far. `hooks` is null while no Review is under way; while
 * one is, it says how to leave, how to say a fault, and whether to draw the
 * compact Review of the Popup.
 */
const studying = { deck: null, next: null, shown: false, marks: [], busy: false, hooks: null };

/**
 * Start a Review of every Deck (deck null) or of the one named, or carry on
 * with the one under way for that Deck, as when the window gains focus again.
 * hooks: { leave(), say(sentence), compact }.
 */
async function startReview(deck, hooks) {
  if (studying.hooks === null || studying.deck !== deck) {
    studying.marks = [];
    studying.shown = false;
    studying.next = null;
  }
  studying.deck = deck;
  studying.hooks = hooks;
  await showNext();
}

/** End the Review under way, if any, and forget it. */
function endReview() {
  studying.hooks = null;
  studying.next = null;
  studying.shown = false;
  studying.marks = [];
}

/** Leave the Review: end it, and go where the page goes back to. */
function leaveReview() {
  const hooks = studying.hooks;
  endReview();
  if (hooks !== null) hooks.leave();
}

/** Ask for the Card that comes next, and show it. The same Card keeps its answer shown. */
async function showNext() {
  const before = studying.next !== null && studying.next.card !== null ? studying.next.card.id : null;
  const next = await call('next_card', studying.deck === null ? {} : { deck: studying.deck });
  if (studying.hooks === null) return;
  studying.shown = studying.shown && next.card !== null && next.card.id === before;
  studying.next = next;
  drawReview();
  focusOn(studying.shown ? '[data-grade="3"]' : '[data-reveal]');
}

/** Draw the Card and its controls, or "Nothing Due" when no Card is left. */
function drawReview() {
  const next = studying.next;
  const none = next.card === null;
  byId('review-main').hidden = none;
  byId('review-done').hidden = !none;
  if (none) {
    byId('review-main').innerHTML = '';
    byId('done-line').textContent = nothingDueText(next);
    return;
  }
  byId('review-main').innerHTML = reviewMarkup(
    next,
    { shown: studying.shown, marks: studying.marks, undoable: false },
    studying.hooks.compact === true,
  );
}

/** Focus the first element in the Review that matches. */
function focusOn(selector) {
  const found = byId('review-main').querySelector(selector);
  if (found !== null) found.focus({ preventScroll: true });
}

/** Show the answer, and the Grades with it, focused on Good. */
function revealAnswer() {
  if (studying.next === null || studying.next.card === null || studying.shown) return;
  studying.shown = true;
  drawReview();
  focusOn('[data-grade="3"]');
}

/** Give the Card its Grade, 1 to 4, then show the next Card at once. */
async function gradeShown(grade) {
  if (!studying.shown || studying.busy || studying.next === null || studying.next.card === null) return;
  studying.busy = true;
  try {
    await call('grade_card', { card: studying.next.card.id, grade: grade });
    studying.marks.push(grade);
    studying.shown = false;
    await showNext();
  } catch (fault) {
    if (studying.hooks !== null) studying.hooks.say(fault.message || String(fault));
  } finally {
    studying.busy = false;
  }
}

// On the document, because app.js, which defines byId, loads after this file.
document.addEventListener('click', (event) => {
  if (studying.hooks === null) return;
  const target = event.target.closest('#review-main [data-reveal], #review-main [data-grade], #review-main [data-leave]');
  if (target === null) return;
  if (target.hasAttribute('data-reveal')) revealAnswer();
  else if (target.hasAttribute('data-grade')) gradeShown(Number(target.dataset.grade));
  else leaveReview();
});

document.addEventListener('keydown', (event) => {
  if (studying.hooks === null || studying.next === null) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest('input, textarea, select')) return;
  if (event.key === ' ' && !studying.shown) {
    event.preventDefault();
    revealAnswer();
  } else if (/^[1-4]$/.test(event.key)) {
    event.preventDefault();
    gradeShown(Number(event.key));
  } else if (event.key === 'z' || event.key === 'Z') {
    // Undo's key. It does nothing until Undo exists.
    event.preventDefault();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    leaveReview();
  }
});
