/**
 * The Plugin Server starts, answers the Host, and says what it can do.
 *
 * Everything here goes through the one seam: the real `mcp.ts` against a
 * temporary Plugin directory, spoken to as the Host speaks to it.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PROTOCOL_VERSION, startedAndShaken, startPluginServer } from './helpers/plugin.ts';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));

/** Every tool flashcards ships. The names are the contract with the Page and its callers. */
const TOOLS = [
  'add_note', 'count_deck', 'delete_deck', 'grade_card', 'list_decks', 'next_card', 'remind_due', 'undo_grade',
  'get_settings', 'update_settings',
  'list_notes', 'get_note', 'update_note', 'delete_note',
];

test('the Plugin Server answers the handshake', async (t) => {
  const plugin = await startPluginServer(t);

  const answer = await plugin.handshake();

  const result = answer.result as {
    protocolVersion: string;
    capabilities: { tools?: unknown };
    serverInfo: { name: string };
  };
  assert.equal(answer.error, undefined, plugin.output());
  assert.equal(result.protocolVersion, PROTOCOL_VERSION);
  assert.deepEqual(result.capabilities.tools, {});
  assert.equal(result.serverInfo.name, 'flashcards');
});

test('the Plugin Server gives the Host the version package.json names', async (t) => {
  const plugin = await startPluginServer(t);
  const { version } = JSON.parse(await readFile(join(REPOSITORY, 'package.json'), 'utf8')) as { version: string };

  const answer = await plugin.handshake();

  assert.equal((answer.result as { serverInfo: { version: string } }).serverInfo.version, version);
});

test('it names every tool it ships, each with a schema for its arguments', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.ask('tools/list');

  const { tools } = answer.result as {
    tools: { name: string; description: string; inputSchema: { type: string } }[];
  };
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [...TOOLS].sort());
  for (const tool of tools) {
    assert.ok(tool.description.length > 0, `${tool.name} says nothing about itself`);
    assert.equal(tool.inputSchema.type, 'object');
  }
});

test('nothing but JSON-RPC goes to stdout', async (t) => {
  const plugin = await startedAndShaken(t);
  await plugin.ask('tools/list');
  await plugin.call('list_decks');
  await plugin.call('no_such_tool', {});
  await plugin.ask('no/such/method');

  for (const line of plugin.lines()) {
    const message = JSON.parse(line) as { jsonrpc?: string };
    assert.equal(message.jsonrpc, '2.0', `this line on stdout is not JSON-RPC: ${line}`);
  }
});

test('a line on stdin that is not JSON is one sentence on stderr, and the pipe survives it', async (t) => {
  const plugin = await startedAndShaken(t);
  const said = plugin.lines().length;

  plugin.raw('this is not JSON');
  const answer = await plugin.ask('tools/list');
  // stderr and stdout are two pipes, so the sentence may land a moment after
  // the answer that was written later.
  for (let waited = 0; !plugin.output().includes('was not JSON') && waited < 2000; waited += 20) {
    await new Promise((done) => setTimeout(done, 20));
  }

  assert.ok(plugin.output().includes('was not JSON'), `stderr said: ${plugin.output()}`);
  assert.ok(plugin.output().startsWith('flashcards: '), `stderr said: ${plugin.output()}`);
  assert.equal(plugin.lines().length, said + 1, 'the bad line was answered on stdout');
  assert.equal(answer.error, undefined);
});

test('a line on stdin that is JSON but not an object is one sentence on stderr, and the pipe survives it', async (t) => {
  const plugin = await startedAndShaken(t);
  const said = plugin.lines().length;

  for (const line of ['null', '3', '"x"', '[]', 'true']) plugin.raw(line);
  const answer = await plugin.ask('tools/list');
  for (let waited = 0; plugin.output().split('not a JSON-RPC message').length < 6 && waited < 2000; waited += 20) {
    await new Promise((done) => setTimeout(done, 20));
  }

  assert.equal(answer.error, undefined, plugin.output());
  assert.equal(plugin.output().split('\n').filter((line) => line.startsWith('flashcards: ')).length, 5, plugin.output());
  assert.ok(plugin.output().includes('not a JSON-RPC message'), `stderr said: ${plugin.output()}`);
  assert.equal(plugin.lines().length, said + 1, 'a bad line was answered on stdout');
});

test('a notification is never answered', async (t) => {
  const plugin = await startedAndShaken(t);
  const said = plugin.lines().length;

  plugin.notify('notifications/cancelled', { requestId: 'test-1' });
  await plugin.ask('tools/list');

  assert.equal(plugin.lines().length, said + 1, 'the notification was answered');
});

test('a method it does not have is refused with a sentence naming it', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.ask('tools/nonsense');

  assert.equal(answer.error?.code, -32601);
  assert.ok(answer.error?.message.includes('tools/nonsense'), answer.error?.message);
});

test('a tool it does not have is refused with a sentence naming it', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.call('polish_boots');

  assert.equal(answer.error?.code, -32602);
  assert.ok(answer.error?.message.includes('polish_boots'), answer.error?.message);
});

test('arguments that are not an object are refused with a sentence naming the tool', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.ask('tools/call', { name: 'list_decks', arguments: 'all of them' });

  assert.equal(answer.error?.code, -32602);
  assert.ok(answer.error?.message.includes('list_decks'), answer.error?.message);
});

test('closing stdin is how the Host stops it, and it goes quietly', async (t) => {
  const plugin = await startedAndShaken(t);
  await plugin.call('list_decks');

  plugin.stop();

  const ending = await plugin.ended();
  assert.equal(ending.code, 0);
  assert.equal(plugin.output(), '');
});

test('an answer from the Host to a question nobody asked is dropped without a word', async (t) => {
  const plugin = await startedAndShaken(t);
  const said = plugin.lines().length;

  plugin.answerAsHost('flashcards-404', { result: {} });
  plugin.answerAsHost('flashcards-405', { error: { code: -32000, message: 'No.' } });
  const answer = await plugin.ask('tools/list');

  assert.equal(answer.error, undefined);
  assert.equal(plugin.lines().length, said + 1, 'the stray answer was answered');
  assert.equal(plugin.output(), '');
});
