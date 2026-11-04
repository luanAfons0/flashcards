/* A Review under way: which Card shows, whether its answer shows, and the
   Grades given so far, with the keys and clicks that move it on.

   It asks next_card for each Card, grade_card for each Grade and undo_grade
   to take one back, and saves nothing of its own: every Grade is saved by the
   Plugin Server the moment it is given, so leaving, closing the window or
   hiding the Popup loses none. Undo takes back only this Review's Grades,
   last first.
   What it shows comes from review.js; it draws into #review-main, and into
   #review-done with #done-line for "Nothing Due".

   Keys: Space shows the answer, 1 to 4 give Again, Hard, Good or Easy, Esc
   leaves, Z undoes. After the answer shows, focus is on Good, so Enter never
   gives Again by accident, and Space is taken and does nothing, so it never
   presses Good; a held Space shows one answer only.

   Each Review has its own number, `round`. An answer that lands after its
   Review ended, as a Grade sent just before Esc, changes nothing in the
   Review shown now. */
'use strict';

/**
 * This Review so far. `hooks` is null while no Review is under way; while
 * one is, it says how to leave, how to say a fault, and whether to draw the
 * compact Review of the Popup. `reviews` holds the id of each Review it made,
 * beside its Grade in `marks`, for Undo.
 */
const studying = { deck: null, next: null, shown: false, marks: [], reviews: [], busy: false, hooks: null, round: 0 };

/** Whether the Review numbered `round` is still the one under way. */
function stillOn(round) {
  return studying.hooks !== null && studying.round === round;
}

/**
 * Start a Review of every Deck (deck null) or of the one named, or carry on
 * with the one under way for that Deck, as when the window gains focus again.
 * hooks: { leave(), say(sentence), compact }.
 */
async function startReview(deck, hooks) {
  if (studying.hooks === null || studying.deck !== deck) {
    studying.marks = [];
    studying.reviews = [];
    studying.shown = false;
    studying.next = null;
    studying.busy = false;
    studying.round += 1;
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
  studying.reviews = [];
  studying.busy = false;
  studying.round += 1;
  byId('review-main').innerHTML = '';
}

/** Leave the Review: end it, and go where the page goes back to. */
function leaveReview() {
  const hooks = studying.hooks;
  endReview();
  if (hooks !== null) hooks.leave();
}

/** Ask for the Card that comes next, and show it. The same Card keeps its answer shown. */
async function showNext() {
  const round = studying.round;
  const before = studying.next !== null && studying.next.card !== null ? studying.next.card.id : null;
  const next = await call('next_card', studying.deck === null ? {} : { deck: studying.deck });
  if (!stillOn(round)) return;
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
    { shown: studying.shown, marks: studying.marks, undoable: studying.reviews.length > 0 },
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
  const round = studying.round;
  studying.busy = true;
  try {
    const graded = await call('grade_card', { card: studying.next.card.id, grade: grade });
    if (!stillOn(round)) return;
    studying.marks.push(grade);
    studying.reviews.push(graded.review);
    studying.shown = false;
    await showNext();
  } catch (fault) {
    if (stillOn(round)) studying.hooks.say(fault.message || String(fault));
  } finally {
    if (studying.round === round) studying.busy = false;
  }
}

/**
 * Take back the last Grade of this Review: its Card comes back as it was,
 * with its answer shown and focus on Good, and the count left and the strip
 * move back. With nothing to undo, it does nothing.
 */
async function undoLast() {
  if (studying.busy || studying.reviews.length === 0) return;
  const round = studying.round;
  studying.busy = true;
  try {
    const review = studying.reviews[studying.reviews.length - 1];
    const next = await call('undo_grade', studying.deck === null ? { review: review } : { review: review, deck: studying.deck });
    if (!stillOn(round)) return;
    studying.reviews.pop();
    studying.marks.pop();
    studying.next = next;
    studying.shown = true;
    drawReview();
    focusOn('[data-grade="3"]');
  } catch (fault) {
    if (stillOn(round)) studying.hooks.say(fault.message || String(fault));
  } finally {
    if (studying.round === round) studying.busy = false;
  }
}

// On the document, because app.js, which defines byId, loads after this file.
document.addEventListener('click', (event) => {
  if (studying.hooks === null) return;
  const target = event.target.closest(
    '#review-main [data-reveal], #review-main [data-grade], #review-main [data-undo], #review-main [data-leave]',
  );
  if (target === null) return;
  if (target.hasAttribute('data-reveal')) revealAnswer();
  else if (target.hasAttribute('data-grade')) gradeShown(Number(target.dataset.grade));
  else if (target.hasAttribute('data-undo')) undoLast();
  else leaveReview();
});

document.addEventListener('keydown', (event) => {
  if (studying.hooks === null) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest('input, textarea, select')) return;
  // Esc leaves even when no Card came, as when next_card failed.
  if (event.key === 'Escape') {
    event.preventDefault();
    leaveReview();
    return;
  }
  if (studying.next === null) return;
  if (event.key === ' ') {
    event.preventDefault();
    if (!event.repeat) revealAnswer();
  } else if (/^[1-4]$/.test(event.key)) {
    event.preventDefault();
    gradeShown(Number(event.key));
  } else if (event.key === 'z' || event.key === 'Z') {
    event.preventDefault();
    undoLast();
  }
});
