---
version: 1
slug: "impeccable-mocks-ui-studio-flashcards-html"
primary_target: ".impeccable/mocks/ui-studio/flashcards.html"
related_targets: []
---

# flashcards Plugin Page (mock)

Scope: the whole Plugin Page `/p/flashcards/` (Decks, Review, Notes, Note editor, Plugin Settings, delete confirm) and the Popup review. Mode: Operate. Mock only; a build agent ports it to `web/`.

Audience and task: one operator, daily, keyboard-first. See what is Due, review fast, write Notes. Constraints: CONTEXT.md words, English labels, system fonts, light and dark, no dashboard, no game, not FirstMate's look.

## Direction contract

THESIS: Spaced repetition is a dosage schedule. Each Card is a dose and its Grade sets the next one. Refuses the Deck table with red-to-green buttons and the card-grid dashboard.

OWN-WORLD: Printed label stock. Cool white ground, near-black ink, hairline rules, tabular figures in ruled cells. One teal band that marks Due and nothing else. Rank by weight and case, not size.

STORY: The operator sees what is Due today, starts a Review, gives four quick Grades by key, and leaves.

FIRST VIEWPORT: Decks as ruled label rows. Each row: Deck name, New and Due in fixed cells on the right, the band only on Due. One Study action for all Due. Review: one Card centred, Grades below with their next interval and key; chrome faint.

FORM: Dispensing Label, candidate 7 of 7, seed 4b866cb2. Raises: only the next decision in a Review; rank by weight not size; chrome drops faint during a Review; a Grade leaves its mark in a fixed slot of the session strip.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
