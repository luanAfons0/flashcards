/**
 * The Host's own Node runs `mcp.ts` (FirstMate ADR-0028), so the Plugin Server
 * checks that Node itself. One older than 24 is one sentence and a non-zero
 * exit, before the Store opens anything.
 *
 * No test machine has an older Node to hand, so the test gives the running
 * Node an older version number, the one thing the check reads.
 */
import { strict as assert } from 'node:assert';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { startPluginServer } from './helpers/plugin.ts';

/** Loaded before `mcp.ts`: the running Node says it is Node 22. */
const OLD_NODE =
  "--import=data:text/javascript,Object.defineProperty(process.versions,'node',{value:'22.21.1'})";

test('on a Node older than 24, it says so in one sentence and opens no flashcards.db', async (t) => {
  const plugin = await startPluginServer(t, { env: { NODE_OPTIONS: OLD_NODE } });

  const ending = await plugin.ended();

  assert.notEqual(ending.code, 0);
  const said = plugin.output().trim();
  assert.ok(said.startsWith('flashcards: '), `stderr said: ${said}`);
  assert.ok(said.includes('Node 22.21.1') && said.includes('Node 24'), `stderr said: ${said}`);
  assert.equal(said.split('\n').length, 1, `stderr said more than one line: ${said}`);
  assert.equal(plugin.lines().length, 0, 'something reached stdout');
  assert.deepEqual(await readdir(plugin.directory), []);
});
