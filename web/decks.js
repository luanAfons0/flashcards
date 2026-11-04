/* The Decks screen's words and rows, from what list_decks answers.

   Pure: nothing here reads the page or the network, so a test runs
   these bytes in node:vm exactly as the browser gets them. app.js puts what
   they make on the page.

   Every Deck name is escaped before it goes into markup, so a name can never
   become markup. Times are read in the local time of this browser. */
'use strict';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** This text, safe to put in markup. */
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A count with its noun: "1 Note", "2 Notes". */
function counted(count, one, many) {
  return count + ' ' + (count === 1 ? one : many);
}

/** The local calendar day of a time, as a number of whole days, to count days between. */
function dayNumber(time) {
  return Math.round(Date.UTC(time.getFullYear(), time.getMonth(), time.getDate()) / 86400000);
}

/** When the next Card is Due, as the Deck row says it: "Next Card Due tomorrow at 4:00". */
function nextDueText(due, now) {
  const at = new Date(due);
  const from = new Date(now);
  const clock = at.getHours() + ':' + String(at.getMinutes()).padStart(2, '0');
  const days = dayNumber(at) - dayNumber(from);
  let day;
  if (days <= 0) day = 'today';
  else if (days === 1) day = 'tomorrow';
  else if (days < 7) day = 'on ' + WEEKDAYS[at.getDay()];
  else {
    day = 'on ' + at.getDate() + ' ' + MONTHS[at.getMonth()];
    if (at.getFullYear() !== from.getFullYear()) day += ' ' + at.getFullYear();
  }
  return 'Next Card Due ' + day + ' at ' + clock;
}

/** The line under the Decks: what today has shown, and the Daily Limit. */
function todayLine(today, limit) {
  return 'Today: ' + counted(today.reviews, 'Review', 'Reviews') + ' and ' + counted(today.newCards, 'New Card', 'New Cards') +
    '. Daily Limit: ' + limit.newCards + ' New, ' + limit.reviews + ' Reviews.';
}

/** How many Cards are Due across every Deck. */
function totalDue(decks) {
  return decks.reduce((sum, deck) => sum + deck.due, 0);
}

/**
 * One ruled Deck row. Its meta line counts its Notes and Cards; a Deck with
 * nothing Due says instead when its next Card is Due. The Due cell is the band
 * when Due is above 0, and a faint 0 in a plain cell when it is not.
 */
function deckRow(deck, now) {
  const name = escapeHtml(deck.name);
  const meta = deck.due === 0 && deck.nextDue !== null
    ? escapeHtml(nextDueText(deck.nextDue, now))
    : '<span class="num">' + counted(deck.notes, 'Note', 'Notes') + '</span><span class="opt num">, ' + counted(deck.cards, 'Card', 'Cards') + '</span>';
  const due = deck.due > 0
    ? '<td class="n band">' + deck.due + '</td>'
    : '<td class="n"><span class="fig zero">0</span></td>';
  const study = deck.due > 0 || deck.new > 0
    ? '<button type="button" class="btn ghost">Study</button>'
    : '<button type="button" class="btn ghost" disabled>Study</button>';
  return '<tr>' +
    '<td><div class="deck-name">' + name + '</div><div class="deck-meta">' + meta + '</div></td>' +
    '<td class="n"><span class="fig' + (deck.new > 0 ? '' : ' zero') + '">' + deck.new + '</span></td>' +
    due +
    '<td class="acts"><div class="row-tools">' + study +
    '<a class="btn ghost icon tool tool-notes" href="#notes" aria-label="Notes of ' + name + '" title="Notes"><svg class="i" aria-hidden="true"><use href="#i-notes"/></svg></a>' +
    '<button type="button" class="btn ghost icon tool" aria-label="Delete ' + name + '" title="Delete Deck"><svg class="i" aria-hidden="true"><use href="#i-trash"/></svg></button>' +
    '</div></td></tr>';
}
