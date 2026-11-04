/* The Notes view's words and rows, from what list_notes answers.

   Pure: nothing here reads the page or the network, so a test runs these
   bytes in node:vm exactly as the browser gets them. notes-view.js puts what
   they make on the page. It needs decks.js (escapeHtml, counted, dayNumber)
   and editor.js (fieldsOf) loaded before it.

   A Field shows as written, on one line, escaped: the list is for finding a
   Note, and the editor's preview is where Markdown is rendered. */
'use strict';

/** Each Note Type's name, as the operator reads it, by the key the tools use. */
const NOTE_TYPE_NAMES = { basic: 'Basic', reversed: 'Basic and reversed', cloze: 'Cloze' };

/** A Field's text on one line. */
function oneLine(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** When a Note is next Due, as its row says it: "today", "tomorrow", "in 3 d", or "New" when it has had no Review. */
function noteDueText(due, now) {
  if (due === null) return 'New';
  const days = dayNumber(new Date(due)) - dayNumber(new Date(now));
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return 'in ' + days + ' d';
}

/** The two lines that name a Note: its first Field, then its second; a Cloze's second is its Extra, when it has one. */
function noteLines(note) {
  const [first, second] = fieldsOf(note.noteType).map((name) => oneLine(note.fields[name]));
  if (note.noteType === 'cloze') return [first || '', second ? 'Extra: ' + second : ''];
  return [first || '', second || ''];
}

/** One ruled Note row, which opens the Note in the editor by click or Enter. */
function noteRow(note, now) {
  const [first, second] = noteLines(note);
  const sub = second === '' ? '' : '<div class="note-sub">' + escapeHtml(second) + '</div>';
  return '<tr tabindex="0" data-note="' + note.id + '">' +
    '<td><div class="note-first">' + escapeHtml(first) + '</div>' + sub + '</td>' +
    '<td class="col-type quiet small">' + escapeHtml(NOTE_TYPE_NAMES[note.noteType] || note.noteType) + '</td>' +
    '<td><div class="tags">' + note.tags.map((tag) => '<span class="tag">' + escapeHtml(tag) + '</span>').join('') + '</div></td>' +
    '<td class="when">' + escapeHtml(noteDueText(note.nextDue, now)) + '</td></tr>';
}

/** The count by the heading: "486 Notes, 6 shown". */
function notesCountText(total, shown) {
  return counted(total, 'Note', 'Notes') + ', ' + shown + ' shown';
}

/** The Tag filter: one chip for each Tag in the Deck, pressed when chosen. No Tags, no filter. */
function tagChipsMarkup(tags, chosen) {
  if (tags.length === 0) return '';
  return '<span class="quiet small">Tags</span>' + tags.map((tag) => {
    const name = escapeHtml(tag);
    return '<button type="button" class="chip" aria-pressed="' + (chosen.indexOf(tag) !== -1) + '" data-chip="' + name + '">' + name + '</button>';
  }).join('');
}

/** The heading when no Note matches: it names the search, or the Tags chosen when there is no search. */
function noMatchHeading(search, chosen) {
  const named = oneLine(search) || chosen.join(' ');
  return 'No Notes match “' + named + '”';
}

/** The Deck choice: every Deck by name, the one shown selected. */
function deckChoices(decks, chosen) {
  return decks.map((deck) => {
    const name = escapeHtml(deck.name);
    return '<option value="' + name + '"' + (deck.name === chosen ? ' selected' : '') + '>' + name + '</option>';
  }).join('');
}
