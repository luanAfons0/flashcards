/* The Note editor view: a Deck, a Note Type, its Fields, its Tags, and the
   live preview of every Card the Note makes. editor.js makes its markup and
   words; this file puts them on the page and saves.

   drawEditor(note) opens it: with no Note, to add one (the #add address);
   with a Note { id, deck, noteType, fields, tags }, to edit that Note, which
   Save sends to update_note. It is filled once each time it opens, so
   drawing it again when the window gains focus never overwrites what is
   being typed. Its top level only declares: app.js calls wireEditor once,
   and leaveEditor when another view shows.

   #edit/<id> opens it on a Note through drawEdit. Editing a Note never
   offers the Note Types that would change it to or from Cloze, and should
   update_note still refuse one, the banner says why.

   Save refuses a Cloze with no gap here, inline, before any call. A Deck
   name no Deck has makes that Deck on Save. Ctrl+Enter saves from any field;
   Cancel, and a Save that went through, go back to the view the editor was
   opened from (the Notes, when there is none).

   Editing a Note also offers Delete Note. It asks get_note what the Note
   holds now, and the confirm takes the foot's place with "Keep the Note"
   focused, so Enter keeps, as the Delete Deck confirm does on the Decks.
   Keep the Note, or Esc, puts the foot back; Delete Note in the confirm calls
   delete_note and goes back as a Save does. */
'use strict';

/**
 * The open editor, or null: the address it opened at, the Note it edits (null
 * for a new one), its Note Type, every Field typed so far by name (so
 * switching Note Type keeps Front and Back), its Tags, whether its Cloze
 * error shows, where Cancel goes, whether a Save or a delete is on its way,
 * so a second press before it answers does it no second time, and whether
 * the Delete Note confirm is open.
 */
let editor = null;

/** The address shown before the current one, or null when the page opened at it. */
let addressBefore = null;

/** The Deck and Note Type the last saved Note had, so the next one starts there. */
let lastSaved = { deck: '', noteType: 'basic' };

/** Whether this address opens the Note editor. */
function isEditorAddress(hash) {
  return /^#(add|edit)\b/.test(hash);
}

/** Open the Note editor: empty to add a Note, or filled with this Note to edit it. */
async function drawEditor(note) {
  const listed = await call('list_decks');
  byId('deck-names').innerHTML = deckOptions(listed.decks);
  if (editor !== null && editor.at === location.hash) return;
  const known = listed.decks.some((deck) => deck.name.toLowerCase() === lastSaved.deck.toLowerCase());
  editor = {
    at: location.hash,
    note: note || null,
    noteType: note ? note.noteType : lastSaved.noteType,
    values: note ? Object.assign({}, note.fields) : {},
    tags: note ? note.tags.slice() : [],
    faulty: false,
    saving: false,
    confirming: false,
    back: addressBefore !== null && !isEditorAddress(addressBefore) ? addressBefore || '#decks' : '#notes',
  };
  byId('h-editor').textContent = editorHeading(editor.note);
  byId('editor-delete').hidden = editor.note === null;
  closeNoteConfirm();
  byId('ed-deck').value = note ? note.deck : known ? lastSaved.deck : listed.decks.length > 0 ? listed.decks[0].name : '';
  const locked = lockedNoteTypes(editor.note);
  for (const radio of byId('note-form').querySelectorAll('input[name="ntype"]')) {
    radio.checked = radio.value === editor.noteType;
    radio.disabled = locked.indexOf(radio.value) !== -1;
  }
  byId('tag-new').value = '';
  drawFields();
  drawTags();
  (byId('ed-deck').value === '' ? byId('ed-deck') : byId('fields').querySelector('[data-field]')).focus();
}

/** The id of the Note an #edit/<id> address names. */
function noteIdOf(hash) {
  return Number(hash.slice(hash.indexOf('/') + 1));
}

/** Open the Note editor on the Note #edit/<id> names, as get_note answers it. */
async function drawEdit() {
  const note = await call('get_note', { id: noteIdOf(location.hash) });
  return drawEditor(note);
}

/** Close the Note editor, so the next one opens fresh. */
function leaveEditor() {
  editor = null;
}

/** Keep what each Field holds now. */
function keepFields() {
  for (const field of byId('fields').querySelectorAll('[data-field]')) editor.values[field.dataset.field] = field.value;
}

/** Draw the Fields of the Note Type, then the preview. */
function drawFields() {
  byId('fields').innerHTML = fieldsMarkup(editor.noteType, editor.values, editor.faulty);
  drawPreview();
}

/** Draw the preview of the Cards from the Fields as they are. */
function drawPreview() {
  byId('preview-cards').innerHTML = previewMarkup(editor.noteType, editor.values);
}

/** Draw the Tags before the field that adds one. */
function drawTags() {
  byId('tag-list').innerHTML = tagsMarkup(editor.tags);
}

/** Add each word typed in the Tags field as a Tag, and empty the field. */
function addTypedTags() {
  editor.tags = tagsAdded(editor.tags, byId('tag-new').value);
  byId('tag-new').value = '';
  drawTags();
}

/** Take the Cloze error away once the Text has a gap, without drawing the Fields again. */
function clearClozeError() {
  if (!editor.faulty || noteProblem(editor.noteType, editor.values) !== '') return;
  editor.faulty = false;
  const text = byId('fields').querySelector('[data-field="Text"]');
  text.removeAttribute('aria-invalid');
  text.setAttribute('aria-describedby', 'f-text-help');
  text.parentElement.querySelector('.err').outerHTML = clozeNoteMarkup(false);
}

/** Save the Note, or show why it cannot be; a saved Note goes back to where the editor was opened from. */
async function saveNote(event) {
  event.preventDefault();
  if (editor === null || editor.saving || editor.confirming) return;
  keepFields();
  addTypedTags();
  if (noteProblem(editor.noteType, editor.values) !== '') {
    editor.faulty = true;
    drawFields();
    byId('fields').querySelector('[data-field="Text"]').focus();
    return;
  }
  const draft = { deck: byId('ed-deck').value, noteType: editor.noteType, fields: editor.values, tags: editor.tags };
  const save = saveCall(editor.note, draft);
  const open = editor;
  open.saving = true;
  try {
    const saved = await call(save.name, save.args);
    lastSaved = { deck: saved.deck || draft.deck, noteType: draft.noteType };
    const back = editor.back;
    leaveEditor();
    location.hash = back;
  } catch (fault) {
    say(fault.message || String(fault));
  } finally {
    open.saving = false;
  }
}

/** Leave the Note editor with nothing saved. */
function cancelEditor() {
  const back = editor === null ? '#notes' : editor.back;
  leaveEditor();
  location.hash = back;
}

/** Take the Delete Note confirm away and show the foot again. */
function closeNoteConfirm() {
  byId('note-confirm').hidden = true;
  byId('note-confirm').innerHTML = '';
  byId('editor-foot').hidden = false;
  if (editor !== null) editor.confirming = false;
}

/** Put the Delete Note confirm in the foot's place, with what the Note holds now. */
async function askToDeleteNote() {
  if (editor === null || editor.note === null) return;
  const open = editor;
  const note = await call('get_note', { id: open.note.id });
  if (editor !== open) return;
  byId('note-confirm').innerHTML = noteConfirmMarkup(note);
  byId('note-confirm').hidden = false;
  byId('editor-foot').hidden = true;
  open.confirming = true;
  byId('note-confirm').querySelector('[data-keep-note]').focus();
}

/** Keep the Note: the foot comes back, focused on Delete Note. */
function keepNote() {
  closeNoteConfirm();
  byId('editor-delete').focus();
}

/** Delete the Note the editor edits, and go back to where the editor was opened from. */
async function deleteEditedNote() {
  if (editor === null || editor.note === null || editor.saving) return;
  const open = editor;
  open.saving = true;
  try {
    await call('delete_note', { id: open.note.id });
    const back = open.back;
    leaveEditor();
    location.hash = back;
  } catch (fault) {
    say(fault.message || String(fault));
  } finally {
    open.saving = false;
  }
}

/** Wire the editor's form, Fields and Tags to what they do. app.js calls it once, after byId exists. */
function wireEditor() {
  byId('note-form').addEventListener('submit', saveNote);
  byId('editor-cancel').addEventListener('click', cancelEditor);
  byId('editor-delete').addEventListener('click', () => {
    askToDeleteNote().catch((fault) => say(fault.message || String(fault)));
  });
  byId('note-confirm').addEventListener('click', (event) => {
    const target = event.target.closest('[data-keep-note], [data-confirm-delete-note]');
    if (target === null) return;
    if (target.hasAttribute('data-keep-note')) keepNote();
    else deleteEditedNote();
  });
  byId('note-confirm').addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || editor === null || !editor.confirming) return;
    event.preventDefault();
    keepNote();
  });
  byId('note-form').addEventListener('change', (event) => {
    if (event.target.name !== 'ntype' || editor === null) return;
    keepFields();
    editor.noteType = event.target.value;
    editor.faulty = false;
    drawFields();
  });
  byId('fields').addEventListener('input', () => {
    if (editor === null) return;
    keepFields();
    clearClozeError();
    drawPreview();
  });
  byId('tag-list').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-untag]');
    if (remove === null || editor === null) return;
    editor.tags = editor.tags.filter((tag) => tag !== remove.dataset.untag);
    drawTags();
    byId('tag-new').focus();
  });
  byId('note-form').addEventListener('keydown', (event) => {
    if (event.isComposing || event.key !== 'Enter' && event.key !== 'Backspace' && event.key !== ',') return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      byId('note-form').requestSubmit();
      return;
    }
    const inTags = event.target === byId('tag-new');
    if (event.key === 'Enter' && event.target === byId('ed-deck')) {
      event.preventDefault(); // Enter picks a Deck; only Ctrl+Enter saves.
    } else if (inTags && (event.key === 'Enter' || event.key === ',')) {
      event.preventDefault();
      addTypedTags();
    } else if (inTags && event.key === 'Backspace' && byId('tag-new').value === '' && editor !== null && editor.tags.length > 0) {
      editor.tags = editor.tags.slice(0, -1);
      drawTags();
    }
  });
  byId('tag-new').addEventListener('blur', () => {
    if (editor !== null && byId('tag-new').value.trim() !== '') addTypedTags();
  });
  // Before app.js draws the new view, note the address it replaces, so the
  // editor knows where Cancel goes.
  window.addEventListener('hashchange', (event) => {
    addressBefore = new URL(event.oldURL).hash;
  });
}
