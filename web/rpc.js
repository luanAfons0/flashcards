/* One tool call on flashcards' own Plugin Server, for every page in web/. It
   defines one global: call(name, args) → the tool's structured answer. */
'use strict';

// The one address a page talks to: its own Plugin's tools, relative to the
// address the Host serves the page from. FirstMate admits the page with a
// cookie it set on the first navigation, so nothing here carries a token and
// no address is built by hand (FirstMate ADR-0003).
const RPC = 'rpc';

// What the Host answers when it cannot reach the Plugin Server at all. An
// empty page would leave either one a mystery, so each becomes a sentence.
const STOPPED = 503;
const NO_PLUGIN_SERVER = 501;

// A call this small is kept alive past the page that made it, so a Grade
// given as the Popup hides, and so unloads, still reaches the Plugin Server.
// The browser keeps at most 64 KiB of these in flight, so a larger call is
// sent the usual way.
const KEEP_ALIVE_BYTES = 16384;

let calls = 0;

/** One tool call on this Plugin's own Plugin Server. */
async function call(name, args) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: (calls += 1),
    method: 'tools/call',
    params: { name: name, arguments: args || {} },
  });
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body,
    keepalive: body.length < KEEP_ALIVE_BYTES,
  });

  if (response.status === STOPPED) {
    throw new Error(
      'flashcards’s Plugin Server is Stopped. The reason is in firstmate logs. ' +
        'The Host never starts it again on its own, so run firstmate restart flashcards ' +
        'once it is fixed.',
    );
  }
  if (response.status === NO_PLUGIN_SERVER) {
    throw new Error('The Host found no Plugin Server for flashcards, so it has nothing to show.');
  }
  if (!response.ok) {
    throw new Error('The Host answered ' + response.status + ' for this call.');
  }

  const answered = await response.json();
  if (answered.error) throw new Error(answered.error.message);
  return answered.result.structuredContent;
}
