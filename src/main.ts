/**
 * Start-up: check the Node, read the Clock, open `flashcards.db`, serve the
 * tools.
 *
 * The Host spawned this process, holds both ends of its pipe, and started it
 * in the Plugin's own directory, so the file this Plugin owns is one relative
 * path away (FirstMate ADR-0005).
 *
 * It says nothing on the way up. A Plugin Server that started is what the
 * Index Page shows; the journal is for what went wrong.
 */
import { clockFrom } from './clock.ts';
import { receive } from './host.ts';
import { sentenceFor, serve } from './mcp.ts';
import { openStore } from './store.ts';
import { toolsFor } from './tools.ts';

/** The oldest Node major this Plugin runs on: TypeScript with no build step, and node:sqlite. */
const OLDEST_NODE = 24;

// The Host's own Node runs this file (FirstMate ADR-0028), and that Node can be
// older than this Plugin wants. A Node too old to read TypeScript never gets
// here; one that can, but is older than 24, would run with an experimental
// node:sqlite. So it is one sentence and a non-zero exit, before the Store
// opens anything.
const major = Number(process.versions.node.split('.')[0]);
if (major < OLDEST_NODE) {
  process.stderr.write(
    `flashcards: this is Node ${process.versions.node}, and this Plugin needs Node ${OLDEST_NODE} ` +
      `or newer. Start the Host with a Node ${OLDEST_NODE}.\n`,
  );
  process.exit(1);
}

// A testing clock that is not a time, or a `flashcards.db` that cannot be
// opened, is one sentence and a non-zero exit: the Index Page shows the Plugin
// Stopped and the journal carries the reason. The Host does not start it again.
const { clock, store } = (() => {
  try {
    const clock = clockFrom();
    return { clock, store: openStore() };
  } catch (fault) {
    process.stderr.write(`flashcards: ${sentenceFor(fault)}\n`);
    return process.exit(1);
  }
})();

serve(toolsFor({ store, clock }), receive);

// The Host closes stdin to stop the Plugin Server. Nobody is left to answer
// then, so it goes at once, even while it waits for the Host on a question.
process.stdin.on('end', () => process.exit(0));
