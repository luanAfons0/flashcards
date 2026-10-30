# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The Plugin Page is plain static HTML, CSS and JS in `web/`, with no framework and no build: the FirstMate Host serves those bytes unchanged. The Plugin Server is TypeScript (`mcp.ts`), bundled with `ts-fsrs` into `mcp.js` by tsdown at release time only.

## Users

One operator: the person who runs FirstMate on their own machine. They study every day, mostly with the keyboard, in the FirstMate window or in a small Popup a Shortcut opens. Their job: see what is Due, review it fast, and write Notes.

## Product Purpose

flashcards keeps the operator's own Decks and shows each Card again just before they would forget it, as Anki does, with no Anki installed. Scheduling is FSRS. Success is a daily Review that takes little effort and no management.

## Positioning

It lives inside FirstMate. A Shortcut opens a Popup review from anywhere on the desktop. Other Plugins and the Mate add Notes through the `add_note` tool under a Grant. The scheduler Plugin calls `remind_due`, which sends a Notice only when Cards are Due. A standalone flashcard app cannot do these things.

## Operating Context

- The Plugin Page runs at `/p/flashcards/` in the FirstMate window, beside other Plugins. Plugin Settings are at `/p/flashcards/#settings`.
- The Popup is a small frameless window (about 420×560) that hides when it loses focus.
- The Review runs on the keyboard: Space shows the answer, 1–4 give the Grade (Again, Hard, Good, Easy), Z undoes the last Grade.
- A day starts at 4:00 local time.

## Capabilities and Constraints

- The words come from `CONTEXT.md` exactly: Deck, Note, Field, Note Type, Cloze, Card, Tag, Review, Grade, Due, New Card, Daily Limit.
- Note Types: Basic, Basic and reversed, Cloze (Anki syntax `{{c1::text::hint}}`). Fields are Markdown. Decks are flat.
- Daily Limit: one for the whole Plugin, default 20 New Cards and 200 Reviews.
- Deleting a Deck deletes its Notes, Cards and Reviews, after an in-page confirm with the counts.
- Labels are in English. No web fonts. Light and dark themes.
- Out of v0.1.0: images and audio, `.apkg` import and export, statistics, Sampling, nested Decks, a Daily Limit for each Deck, sync.
- Open: whether flashcards becomes an Official Plugin later.

## Evidence on Hand

No real user data yet. Every Deck, Note and count in mocks is sample data and must be marked as such.

## Product Principles

- The Card first: during a Review, nothing but the Card, the Grades and a small count.
- Review fast: every Review action has one key.
- Nothing to manage: no dashboards, no statistics, no goals to tend.
- No game: no streaks, no confetti, no XP, no celebration screens.
- Its own Plugin: it has its own look, and it does not copy FirstMate's own pages.

## Accessibility & Inclusion

The whole Review works from the keyboard, focus is always visible, and motion respects `prefers-reduced-motion`.
