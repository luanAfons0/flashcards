# flashcards

flashcards is a FirstMate Plugin. It keeps your own Decks of Cards and shows
each Card again just before you would forget it, as Anki does, with no Anki
installed.

Read [`CONTEXT.md`](CONTEXT.md) first. It defines every word this repo uses —
Deck, Note, Field, Note Type, Cloze, Card, Tag, Review, Grade, Due, New Card,
Daily Limit — and the synonyms to avoid. It borrows FirstMate's words (Host,
Plugin, Plugin Page, Plugin Server, Popup, Notice, Grant, Stopped) unchanged,
from
[FirstMate's `CONTEXT.md`](https://github.com/luanAfons0/FirstMate/blob/main/CONTEXT.md).
Use those words in code, in comments, in tests, in issues and in commit
messages.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `luanAfons0/flashcards`, driven by the `gh` CLI.
See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

The five canonical triage roles, each label string equal to its name. See
[`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context: one `CONTEXT.md` and one `docs/adr/` at the repo root. See
[`docs/agents/domain.md`](docs/agents/domain.md).
