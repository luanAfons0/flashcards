# flashcards

A FirstMate Plugin that keeps your own Decks of Notes and shows each Card again
just before you would forget it, as Anki does, with no Anki installed.

The words here (Deck, Note, Field, Note Type, Cloze, Card, Tag, Review, Grade,
Due, New Card, Daily Limit) are defined in [`CONTEXT.md`](CONTEXT.md). The
FirstMate words (Host, Plugin, Plugin Page, Plugin Server, Popup, Notice,
Grant, Stopped) are FirstMate's own.

## Install it

One command, from its git URL. The files land in FirstMate's Shelf, the Plugin
is registered in the same step, and nothing it ships is run:

```sh
firstmate install https://github.com/luanAfons0/flashcards.git flashcards
systemctl --user restart firstmate
```

Then open the Index Page, find `flashcards`, and open its Plugin Page.

`install` fetches the newest Plugin Release. It holds one `mcp.js` with
`ts-fsrs` inside it, so there is no `npm install`. To take a newer one:

```sh
firstmate update flashcards
```

`update` replaces the Release Files and keeps every other file, so your Decks
in `flashcards.db` and your `settings.json` stay as they are.

## Let another Plugin add Notes

Other Plugins and the Mate add Notes with the `add_note` tool. The Host lets
a caller do that only under a Grant. A Grant is one way and covers one pair,
and it covers every tool of flashcards. Record one for each caller, then
restart:

```sh
firstmate grant <caller> flashcards
systemctl --user restart firstmate
```

`add_note` takes a Deck name, a Note Type (`basic`, `reversed` or `cloze`), the
Fields as an object, and optional Tags. It makes the Deck if there is none
with that name.

## Get a Notice when Cards are Due

flashcards has no timer of its own: FirstMate's Host runs nothing on a timer
(FirstMate ADR-0004). The `scheduler` Plugin calls `remind_due` at the time you
choose. `remind_due` sends a Notice such as "12 Cards are Due" when one or more
Cards are Due today, and a click on it opens the Plugin Page. When no Card is
Due, it sends nothing.

Record a Grant from `scheduler` to flashcards, and restart:

```sh
firstmate grant scheduler flashcards
systemctl --user restart firstmate
```

Then add a Job on the `scheduler` Plugin Page, or in its `jobs.json`. This one
reminds you every morning:

```json
{
  "name": "flashcards-due",
  "enabled": true,
  "when": { "every": "daily", "at": "09:00", "timezone": "America/Sao_Paulo" },
  "plugin": "flashcards",
  "tool": "remind_due",
  "arguments": {},
  "missedRunGraceMinutes": 120
}
```

## Set the Daily Limit

The Daily Limit is the most New Cards and the most Reviews of other Cards one
day shows, across all Decks: 20 New Cards and 200 Reviews unless you set it.
Set it on the Plugin Page at Settings (`/p/flashcards/#settings`), or with the
`update_settings` tool, `{ "newCardsPerDay": 20, "reviewsPerDay": 200 }`, each
a whole number from 0 to 9999. `get_settings` reads it back. A day starts at
4:00 local time, and a Card counts once a day: a Card you grade Again comes
back the same day without counting again. `list_decks`, the Review and
`remind_due` count with the limit applied.

## Add a Note on the Plugin Page

Add Note, in the top bar, opens the Note editor (`/p/flashcards/#add`). Pick a
Deck, or type a new name and Save makes that Deck. Pick the Note Type: Basic,
Basic and reversed, or Cloze. Write the Fields in Markdown, and the preview
shows every Card the Note makes as the Review will ask it. Write Cloze gaps as
in Anki, `{{c1::answer}}` or `{{c1::answer::hint}}`; gaps with the same number
hide together on one Card, and a Cloze with no gap is not saved. Type a Tag
and press Enter to add it. Ctrl+Enter saves; Cancel goes back with nothing
saved.

## Review from a Popup

`web/popup.html` is the Popup: the same Review as the Plugin Page, in a small
window, over every Deck. A Plugin cannot bind a Shortcut, so bind one to it
yourself with `firstmate bind <keys> flashcards popup.html`, for example:

```sh
firstmate bind Ctrl+Alt+F flashcards popup.html
```

Press the Shortcut anywhere on the desktop to show it. Space shows the answer,
1 to 4 give the Grade, Z undoes, and Esc hides it. It also hides when it loses
focus. Every Grade is saved the moment you give it, so hiding the Popup loses
nothing.

## Find and edit Notes

Notes, in the top bar, lists the Notes of one Deck (`/p/flashcards/#notes`),
each with its first Field, its Note Type, its Tags and when it is next Due. A
Deck row's Notes button opens that Deck's list. Type words to find the Notes
that hold all of them in any Field or Tag, and press Tags to keep only the
Notes with every Tag pressed. Click a Note, or press Enter on it, to edit it in
the Note editor. A change to a Field keeps every Card's schedule. Taking out a
Cloze gap number deletes its Card and that Card's Reviews, and a new gap
number makes a New Card. Basic to Basic and reversed makes the reverse Card,
and the change back deletes it. A Note never changes to or from Cloze.
Delete Note, in the editor, deletes the Note with its Cards and their Reviews,
after a confirm that counts them; Keep the Note, or Esc, keeps it.

Other Plugins and the Mate can do the same with the tools:

- `list_notes({ deck, search?, tags? })` answers `{ deck, total, tags, notes, now }`,
  each Note as `{ id, noteType, fields, tags, nextDue }`.
- `get_note({ id })` answers `{ id, deck, noteType, fields, tags, cards }`,
  each Card as `{ id, ordinal, side, due, reviews }`.
- `update_note({ id, deck, noteType, fields, tags? })` answers
  `{ id, deck, cards, added, deleted }`, the ordinals of the Cards it made and
  deleted.
- `delete_note({ id })` deletes one Note with its Cards and their Reviews, and
  answers `{ id, deck, cards, reviews }`.

## What it needs

Node 24 or newer, for TypeScript with no build step and for `node:sqlite`. The
Host starts `mcp.ts` with its own Node, on Windows and on Linux alike, so the
Plugin needs no Node of its own there. If that Node is older than 24, the
Plugin says so in one sentence and is Stopped.

`mcp` is the `sh` wrapper for a `wsl` Place, where the Host starts `./mcp`. The
Host's service `PATH` often has only an older Node, so `mcp` looks for one in
this order: `FLASHCARDS_NODE`, `node` on `PATH`, then every Node under nvm.
With none, it says so in one sentence and the Plugin is Stopped.

## Develop it

Clone it, install the tools for the checks, and register the directory where
it lives with the Host. Adding a Plugin neither copies nor links it, so the
Host runs this clone as it is:

```sh
git clone https://github.com/luanAfons0/flashcards.git
cd flashcards
npm ci
firstmate add flashcards "$PWD"
```

In a clone of FirstMate, `node apps/cli/src/cli.ts` takes the place of
`firstmate`. The running Host picks the Plugin up with no restart. Open the
Index Page, find `flashcards`, and open its Plugin Page. If it says `Stopped`,
the reason is in `firstmate logs`; after you fix it,
`firstmate restart flashcards` starts it again.

## What it keeps

Everything is in one SQLite file, `flashcards.db`, in the Plugin's own
directory. The Plugin Server makes it on its first start. It is git-ignored,
so a clone that is also the Plugin directory keeps this machine's Decks out of
the repository. The Settings are in `settings.json` beside it, git-ignored too.

## Running it

`mcp.ts` is the Plugin Server, as the Host runs it with its own Node: MCP over
stdio, one JSON-RPC message per line. `./mcp` is the same, for a `wsl` Place.
The Plugin Page is `web/`, served by the Host byte for byte; its tool calls go
through the one relative address `rpc`.

```sh
npm run check       # the type check, then every test
npm test            # every test
npm run typecheck   # the types
```

CI runs `npm run check` on Linux and on Windows.

### The testing clock

`FLASHCARDS_NOW` is for tests only. It fixes the time the Plugin Server treats
as now, as an ISO 8601 time such as `2026-11-04T10:00:00.000Z`, and while it is
set that time never moves. Without it, or empty, the Plugin Server uses the
real clock. A value that is not a time stops the Plugin Server with one
sentence. It is the only test-only setting.

A day turns at 4:00 local time, so the tests also fix `TZ`. Every Plugin Server
a test starts runs at `FLASHCARDS_NOW=2026-11-04T10:00:00.000Z` and `TZ=UTC`
unless the test gives its own. To move the clock, a test stops the Plugin
Server and starts another on the same Plugin directory at a later time. No test
waits for time to pass.

## Publish a Plugin Release

`npm run release` writes the Plugin Release into `release/`, which is
git-ignored:

- `mcp.js`: `mcp.ts`, `src/` and `ts-fsrs` in one ES module, made by tsdown.
  It is not minified, so a stack trace stays readable.
- `package.json`: `{"type":"module"}` only, so Node reads `mcp.js` as an ES
  module even below a folder whose `package.json` says CommonJS.
- `web/`: the Plugin Page, as it is.
- `mcp`: the `sh` wrapper for a `wsl` Place, which runs `mcp.js`.

It holds no `mcp.ts`, because the Host starts `mcp.ts` before `mcp.js`. It
holds no `flashcards.db` and no `settings.json`, because they are the Plugin's
data. The Plugin Server is plain JavaScript, so one archive serves every
platform. `tests/release.test.ts` builds it, starts `mcp.js` in a directory
with no `node_modules`, and adds a Note and shows its Card.

To publish one, push a tag `vMAJOR.MINOR.PATCH` from the main branch:

```sh
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` then calls FirstMate's reusable
`plugin-release.yml`. It runs `npm ci && npm run check`, then
`npm run release`, and uploads the archive of `release/` with its `.sha256` as
a GitHub Release. If a step fails, there is no Plugin Release. Keep the
repository public: `install` cannot fetch a Plugin Release of a private one,
and it clones it instead, with no `node_modules`.
