/* The Review screen's markup and words, from what next_card answers.

   Pure: nothing here reads the page or the network, so a test runs these
   bytes in node:vm exactly as the browser gets them, and the Plugin Page and
   the Popup draw the same Review from it. It needs markdown.js (renderMarkdown)
   and decks.js (escapeHtml, counted, nextDueText) loaded before it.

   A Review shows only the Card, its four Grades with their intervals, Undo,
   the count left and the session strip. Fields render from Markdown with all
   HTML escaped; the Deck name and the side are escaped as text. Nothing here
   moves: the next Card replaces the last one at once. */
'use strict';

/** The Grades, by the number next_card's intervals and grade_card count from 1. */
const GRADE_NAMES = ['Again', 'Hard', 'Good', 'Easy'];

/** Any character of Japanese, Chinese or Korean script. */
const CJK = /[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯豈-﫿ｦ-ﾟ]/;

/**
 * The size class of a Card's question: "jp" steps CJK up to the size where
 * kanji read easily, "long" steps a long question down, "" is the plain
 * display size. CJK characters are wide, so a CJK question is long sooner.
 */
function frontClass(question) {
  const text = String(question).replace(/[*_`#>\[\]()~-]/g, '').trim();
  const cjk = CJK.test(text);
  if (text.length > (cjk ? 24 : 60)) return 'long';
  return cjk ? 'jp' : '';
}

/**
 * The session strip: one slot for each Card this Review has graded, then one
 * for each Card it has left. A Grade leaves its mark by height, never by
 * colour (Again hollow, then Hard, Good, Easy taller); the current Card's
 * slot is ink.
 */
function stripMarkup(marks, left) {
  let slots = '';
  for (let k = 0; k < marks.length + left; k += 1) {
    const mark = marks[k];
    const kind = mark !== undefined ? 'g' + (mark - 1) : k === marks.length ? 'now' : '';
    slots += '<i class="' + kind + '"></i>';
  }
  return '<div class="strip" aria-hidden="true">' + slots + '</div>';
}

/** The Card: its Deck and side, its question, and with the answer shown, its answer. */
function cardMarkup(card, shown) {
  const extra = card.extra ? '<div class="extra">' + renderMarkdown(card.extra) + '</div>' : '';
  const answer = shown
    ? '<div class="answer"><div class="main">' + renderMarkdown(card.answer) + '</div>' + extra + '</div>'
    : '';
  const kind = frontClass(card.question);
  return '<div class="stack"><article class="card" aria-live="polite">' +
    '<div class="card-head"><span>' + escapeHtml(card.deck) + '</span><span>' + escapeHtml(card.side) + '</span></div>' +
    '<div class="card-body"><div class="front' + (kind ? ' ' + kind : '') + '">' + renderMarkdown(card.question) + '</div>' +
    answer + '</div></article></div>';
}

/** The four Grade buttons, each with the interval it would give and its key. */
function gradesMarkup(intervals) {
  return '<div class="grades" role="group" aria-label="Grade">' +
    GRADE_NAMES.map((name, k) =>
      '<button type="button" class="grade" data-grade="' + (k + 1) + '"><b>' + name + '</b>' +
      '<span class="ivl">' + escapeHtml(intervals[k]) + '</span><kbd>' + (k + 1) + '</kbd></button>').join('') +
    '</div>';
}

/**
 * Show answer, or the Grades once it shows; then Undo and the key hint. Undo
 * is disabled while there is nothing to undo. The Popup's hint is "Esc closes".
 */
function controlsMarkup(card, review, compact) {
  const main = review.shown
    ? gradesMarkup(card.intervals)
    : '<button type="button" class="btn primary reveal" data-reveal>Show answer <kbd>Space</kbd></button>';
  const undo = '<button type="button" class="btn ghost" data-undo' + (review.undoable ? '' : ' disabled') + '>' +
    '<svg class="i" aria-hidden="true"><use href="#i-undo"/></svg>Undo <kbd>Z</kbd></button>';
  const hint = compact ? '<span>Esc closes</span>' : '<span class="hint">Space shows the answer, 1 to 4 give the Grade</span>';
  return '<div class="controls">' + main + '<div class="under">' + undo + hint + '</div></div>';
}

/** The count of Cards left, the current one with them: "47 left". */
function leftText(left) {
  return left + ' left';
}

/**
 * The Review of one Card, as the Plugin Page shows it, or compact, as the
 * Popup does. `next` is what next_card answered, with a Card; `review` is
 * this Review so far: { shown, marks, undoable }, marks being each Grade
 * given, 1 to 4, in order.
 */
function reviewMarkup(next, review, compact) {
  const strip = stripMarkup(review.marks, next.left);
  if (compact) {
    return '<div class="ptop"><span class="who">flashcards</span><span class="left num">' + leftText(next.left) + '</span></div>' + strip +
      '<div class="pbody">' + cardMarkup(next.card, review.shown).replace('class="stack"', 'class="stack" style="display:grid"') + '</div>' +
      '<div class="pfoot">' + controlsMarkup(next.card, review, true) + '</div>';
  }
  return '<div class="session"><div class="session-top">' +
    '<button type="button" class="btn ghost" data-leave style="margin-left:-10px"><svg class="i" aria-hidden="true"><use href="#i-back"/></svg>Decks <kbd>Esc</kbd></button>' +
    '<span class="left num" aria-live="polite">' + leftText(next.left) + '</span></div>' + strip + '</div>' +
    cardMarkup(next.card, review.shown) + controlsMarkup(next.card, review, false);
}

/** What "Nothing Due" says: the Reviews done today, and when the next Card is Due. */
function nothingDueText(next) {
  const done = 'You did ' + counted(next.reviewsToday, 'Review', 'Reviews') + ' today.';
  return next.nextDue === null ? done : done + ' ' + nextDueText(next.nextDue, next.now) + '.';
}
