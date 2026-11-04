# flashcards

A FirstMate Plugin that keeps your own Decks of Notes and shows each Card again
just before you would forget it, as Anki does, with no Anki installed.

The words here (Deck, Note, Field, Note Type, Cloze, Card, Tag, Review, Grade,
Due, New Card, Daily Limit) are defined in [`CONTEXT.md`](CONTEXT.md). The
FirstMate words (Host, Plugin, Plugin Page, Plugin Server, Popup, Notice,
Grant, Stopped) are FirstMate's own.

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
the repository.

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
