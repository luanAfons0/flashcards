# flashcards

flashcards is a FirstMate Plugin. It keeps your own Decks of Cards and shows
each Card again just before you would forget it, as Anki does, with no Anki
installed.

It is a Plugin like any other, so it borrows FirstMate's words unchanged —
Host, Plugin, Plugin Page, Plugin Server, Popup, Notice, Grant, Stopped. They
are defined once, in
[FirstMate's `CONTEXT.md`](https://github.com/luanAfons0/FirstMate/blob/main/CONTEXT.md),
and this file never redefines one.

## Language

### What you keep

**Deck**:
A named group of Notes. Decks do not nest: a name such as `Languages::Japanese`
is one Deck with that name.
_Avoid_: collection, folder, set, sub-deck

**Note**:
One thing you want to remember, written once as its Fields. It belongs to one
Deck and has one Note Type.
_Avoid_: fact, entry, item, card

**Field**:
One named part of a Note, such as Front or Back, written in Markdown.
_Avoid_: side, property, attribute

**Note Type**:
What says how many Cards a Note makes and what each one asks: Basic, Basic and
reversed, or Cloze.
_Avoid_: template, model, card type, kind

**Cloze**:
The Note Type whose one Field holds gaps. Each gap makes one Card that hides
that gap.
_Avoid_: fill-in-the-blank, gap note

**Card**:
One question a Note makes. It has a schedule of its own, so the two Cards of a
Basic and reversed Note come back at different times.
_Avoid_: flashcard, question, prompt, note

**Tag**:
A word put on a Note to find it across Decks.
_Avoid_: label, category

### When you study

**Review**:
Showing one Card, then its answer, and your Grade of it. A Card shown with no
Grade is not a Review.
_Avoid_: study session, attempt, repetition

**Grade**:
How well you remembered a Card: Again, Hard, Good or Easy. It decides when the
Card is Due next.
_Avoid_: rating, score, answer, ease

**Due**:
The state of a Card whose time to come back has come. A Card stays Due until it
has a Review.
_Avoid_: pending, overdue, scheduled

**New Card**:
A Card that has never had a Review.
_Avoid_: unseen, fresh, unlearned

**Daily Limit**:
The most New Cards and the most Reviews of the other Cards that one day shows.
It is the same for every Deck.
_Avoid_: quota, cap, maximum
