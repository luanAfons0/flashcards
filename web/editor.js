/* The Note editor's markup and words: the Fields of each Note Type, the live
   preview of the Cards a Note makes, its Tags, and the tool call Save makes.

   Pure: nothing here reads the page or the network, so a test runs these
   bytes in node:vm exactly as the browser gets them. app.js puts what they
   make on the page. It needs markdown.js (renderMarkdown), cloze.js
   (clozeGaps, clozeQuestion, clozeAnswer, CLOZE_NO_GAP) and decks.js
   (escapeHtml, counted) loaded before it.

   The preview asks and answers each Card with the same rules the Plugin
   Server gives the Review, from the one Cloze rule in cloze.js, and renders
   every Field from Markdown with all HTML escaped. */
'use strict';

/** Each Note Type's Fields, in order, as the Plugin Server's add_note takes them. */
const EDITOR_FIELDS = {
  basic: ['Front', 'Back'],
  reversed: ['Front', 'Back'],
  cloze: ['Text', 'Extra'],
};

/** The Fields of this Note Type, in order. */
function fieldsOf(noteType) {
  return EDITOR_FIELDS[noteType] || [];
}

/** The help under Cloze Text, or with `faulty`, the error that takes its place. */
function clozeNoteMarkup(faulty) {
  return faulty
    ? '<p class="err" id="f-text-err"><svg class="i" aria-hidden="true"><use href="#i-warn"/></svg><span>' + escapeHtml(CLOZE_NO_GAP) + '</span></p>'
    : '<p class="help" id="f-text-help">Mark each gap as {{c1::answer}}. Add a hint after a second ::, as in {{c1::fiz::fazer}}. Gaps with the same number hide together.</p>';
}

/**
 * The Fields of this Note Type, each a textarea named by `data-field` and
 * holding its value. With `faulty`, a Cloze Text is marked invalid and shows
 * why in place of its help.
 */
function fieldsMarkup(noteType, values, faulty) {
  const value = (name) => escapeHtml(values[name] || '');
  if (noteType === 'cloze') {
    const described = faulty ? ' aria-invalid="true" aria-describedby="f-text-err"' : ' aria-describedby="f-text-help"';
    return '<div class="field"><label for="f-text">Text</label>' +
      '<textarea id="f-text" class="code" data-field="Text"' + described + '>' + value('Text') + '</textarea>' +
      clozeNoteMarkup(faulty) + '</div>' +
      '<div class="field"><label for="f-extra">Extra</label>' +
      '<textarea id="f-extra" data-field="Extra" style="min-height:64px">' + value('Extra') + '</textarea>' +
      '<p class="help">Shown under the answer on every Card.</p></div>';
  }
  return '<div class="field"><label for="f-front">Front</label><textarea id="f-front" data-field="Front">' + value('Front') + '</textarea></div>' +
    '<div class="field"><label for="f-back">Back</label><textarea id="f-back" data-field="Back">' + value('Back') + '</textarea></div>';
}

/** Whether this Field holds nothing but spaces. */
function blank(text) {
  return String(text || '').trim() === '';
}

/**
 * Each Card a Note with these Fields makes, in order: its side, its question
 * and answer in Markdown, and the Extra under a Cloze answer. Nothing is
 * written yet, no Card.
 */
function previewedCards(noteType, values) {
  if (noteType === 'cloze') {
    const text = values.Text || '';
    const extra = blank(values.Extra) ? '' : values.Extra;
    return clozeGaps(text).map((gap) => ({
      side: 'Cloze ' + gap,
      question: clozeQuestion(text, gap),
      answer: clozeAnswer(text, gap),
      extra: extra,
    }));
  }
  const front = values.Front || '';
  const back = values.Back || '';
  if (blank(front) && blank(back)) return [];
  const cards = [{ side: 'Front to Back', question: front, answer: back, extra: '' }];
  if (noteType === 'reversed') cards.push({ side: 'Back to Front', question: back, answer: front, extra: '' });
  return cards;
}

/** What the preview says under its Cards: how many the Note makes, or why it makes none. */
function cardCountText(noteType, values) {
  const count = previewedCards(noteType, values).length;
  if (count === 1) return 'This Note makes 1 Card.';
  if (count > 1) return 'This Note makes ' + count + ' Cards. Each one has its own schedule.';
  return noteType === 'cloze' && !blank(values.Text) ? 'No gap, so no Card yet.' : 'Write the Fields to see the Cards.';
}

/** "Cards this Note makes": each Card with its question over its answer, then the count. */
function previewMarkup(noteType, values) {
  const cards = previewedCards(noteType, values);
  const shown = cards.map((card, k) =>
    '<div class="pcard"><div class="ph"><span>Card ' + (k + 1) + '</span><span>' + escapeHtml(card.side) + '</span></div>' +
    '<div class="pq">' + renderMarkdown(card.question) + '</div>' +
    '<div class="pa">' + renderMarkdown(card.answer) +
    (card.extra ? '<div class="quiet">' + renderMarkdown(card.extra) + '</div>' : '') + '</div></div>').join('');
  return shown + '<p class="help' + (cards.length > 0 ? ' num' : '') + '">' + cardCountText(noteType, values) + '</p>';
}

/** Why Save would be refused before it is sent, or '' when it would not: a Cloze with no gap. */
function noteProblem(noteType, values) {
  return noteType === 'cloze' && clozeGaps(values.Text || '').length === 0 ? CLOZE_NO_GAP : '';
}

/** These Tags with each word typed added once, in order; spaces and commas part the words. */
function tagsAdded(tags, typed) {
  const added = tags.slice();
  for (const word of String(typed).split(/[\s,]+/)) {
    if (word !== '' && added.indexOf(word) === -1) added.push(word);
  }
  return added;
}

/** Each Tag in the Tags field, with the button that removes it. */
function tagsMarkup(tags) {
  return tags.map((tag) => {
    const name = escapeHtml(tag);
    return '<span class="tag">' + name + '<button type="button" aria-label="Remove Tag ' + name + '" data-untag="' + name + '">' +
      '<svg class="i" aria-hidden="true"><use href="#i-x"/></svg></button></span>';
  }).join('');
}

/** The Deck field's choices: every Deck by name. A name that is new makes its Deck on Save. */
function deckOptions(decks) {
  return decks.map((deck) => '<option value="' + escapeHtml(deck.name) + '"></option>').join('');
}

/** The editor's heading: "Add Note" for a new Note, "Edit Note" for one that is there. */
function editorHeading(note) {
  return note ? 'Edit Note' : 'Add Note';
}

/**
 * The tool call Save makes: add_note for a new Note, or update_note with the
 * Note's id for one that is there. Only the Fields of the Note Type go.
 */
function saveCall(note, draft) {
  const fields = {};
  for (const name of fieldsOf(draft.noteType)) fields[name] = draft.fields[name] || '';
  const args = { deck: draft.deck, noteType: draft.noteType, fields: fields, tags: draft.tags.slice() };
  return note ? { name: 'update_note', args: Object.assign({ id: note.id }, args) } : { name: 'add_note', args: args };
}

/**
 * The Note Types the editor does not offer for this Note: editing one never
 * changes it to or from Cloze, which update_note refuses. A new Note may be
 * any Note Type.
 */
function lockedNoteTypes(note) {
  if (!note) return [];
  return note.noteType === 'cloze' ? ['basic', 'reversed'] : ['cloze'];
}

/**
 * The confirm that takes the place of the editor's foot before a Note is
 * deleted, from what get_note answers: the Cards and Reviews that go with it.
 * "Keep the Note" comes first, and note-editor.js focuses it, so Enter keeps.
 */
function noteConfirmMarkup(note) {
  const reviews = note.cards.reduce((sum, card) => sum + card.reviews, 0);
  return '<div class="confirm-box" role="group" aria-labelledby="del-note-h">' +
    '<div><h2 id="del-note-h">Delete this Note?</h2>' +
    '<p class="num">This deletes ' + counted(note.cards.length, 'Card', 'Cards') + ' and ' + counted(reviews, 'Review', 'Reviews') +
    '. You cannot undo it.</p></div>' +
    '<div class="row-tools"><button type="button" class="btn" id="note-keep" data-keep-note>Keep the Note</button>' +
    '<button type="button" class="btn danger" data-confirm-delete-note><svg class="i" aria-hidden="true"><use href="#i-trash"/></svg>Delete Note</button>' +
    '</div></div>';
}
