/**
 * The Plugin Release: what `npm run release` writes, and that it runs as the
 * Host runs it (FirstMate ADR-0033).
 *
 * The build runs for real, once, into a temporary folder, as the release
 * workflow runs it into `release/`. Each test then does what `install` does:
 * it copies the Release Files into a temporary Plugin directory, so that they
 * are all the Plugin Server has, and starts `mcp.js` there with the running
 * Node and no shell. No folder above that directory holds a `node_modules`, so
 * `ts-fsrs` is there only if the build put it inside `mcp.js`.
 *
 * A handshake alone would not prove that: it answers before a Card is ever
 * scheduled. So the release also adds a Note and shows its Card, and must
 * answer exactly as `mcp.ts` does.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeDirectory, startedAndShaken, startPluginServer, structureOf } from './helpers/plugin.ts';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));

/** The temporary folder the one build of this file writes into. */
let parent = '';
/** Where that build writes the Plugin Release. */
let release = '';

before(async () => {
  parent = await mkdtemp(join(tmpdir(), 'flashcards-release-'));
  release = join(parent, 'release');
  const ran = spawnSync(process.execPath, [join(REPOSITORY, 'scripts', 'release.ts'), release], {
    cwd: REPOSITORY,
    encoding: 'utf8',
  });
  assert.equal(ran.status, 0, `the release build failed:\n${ran.stdout}${ran.stderr}`);
});

after(() => rm(parent, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));

/** A Plugin directory that holds the Release Files and nothing else, as `install` leaves it. */
async function installed(t: test.TestContext): Promise<string> {
  const directory = await makeDirectory(t);
  await cp(release, directory, { recursive: true });
  return directory;
}

/** Every file under a folder, as paths relative to it, in one order. */
async function filesUnder(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(folder.length + 1).replaceAll('\\', '/'))
    .sort();
}

test('the Plugin Release holds mcp.js, web/ and mcp, and nothing else', async () => {
  assert.deepEqual((await readdir(release)).sort(), ['mcp', 'mcp.js', 'web']);
});

test('web/ ships as it is in the repository', async () => {
  assert.deepEqual(await filesUnder(join(release, 'web')), await filesUnder(join(REPOSITORY, 'web')));
});

test('the Plugin Release holds no source and none of the Plugin\'s data', async () => {
  const names = await readdir(release);
  // The Host starts mcp.ts before mcp.js, so with both it would run the source.
  for (const kept of ['mcp.ts', 'src', 'node_modules', 'flashcards.db', 'settings.json']) {
    assert.ok(!names.includes(kept), `the Plugin Release holds ${kept}`);
  }
});

test('the Plugin directory of an install has no node_modules above it', async (t) => {
  const directory = await installed(t);

  for (let folder = directory; folder !== dirname(folder); folder = dirname(folder)) {
    assert.ok(!existsSync(join(folder, 'node_modules')), `${folder} holds a node_modules`);
  }
});

test('the released mcp.js answers the handshake and tools/list as mcp.ts does', async (t) => {
  const directory = await installed(t);
  const released = await startPluginServer(t, { directory, entry: join(directory, 'mcp.js') });
  const source = await startPluginServer(t);

  const shaken = await released.handshake();
  assert.equal(shaken.error, undefined, released.output());
  assert.deepEqual(shaken.result, (await source.handshake()).result);

  const listed = await released.ask('tools/list');
  assert.equal(listed.error, undefined, released.output());
  assert.deepEqual(listed.result, (await source.ask('tools/list')).result);
});

test('the released mcp.js schedules a Card with ts-fsrs and no node_modules', async (t) => {
  const directory = await installed(t);
  const released = await startedAndShaken(t, { directory, entry: join(directory, 'mcp.js') });
  const source = await startedAndShaken(t);
  const note = { deck: 'Japanese', noteType: 'basic', fields: { Front: '水', Back: 'water' } };

  for (const plugin of [released, source]) {
    structureOf(await plugin.call('add_note', note));
  }
  const fromRelease = structureOf<{ card: { intervals: string[] } | null }>(
    await released.call('next_card', { deck: 'Japanese' }),
  );
  const fromSource = structureOf(await source.call('next_card', { deck: 'Japanese' }));

  assert.equal(fromRelease.card?.intervals.length, 4, released.output());
  assert.deepEqual(fromRelease, fromSource);
  assert.ok(existsSync(join(directory, 'flashcards.db')), 'the Plugin kept no flashcards.db');
});

test(
  'the mcp wrapper of the Plugin Release runs mcp.js',
  { skip: process.platform === 'win32' ? 'the sh wrapper `mcp` is for a wsl Place' : false },
  async (t) => {
    const directory = await installed(t);
    const plugin = await startPluginServer(t, {
      directory,
      wrapper: true,
      entry: join(directory, 'mcp'),
      env: { FLASHCARDS_NODE: process.execPath },
    });

    const answer = await plugin.handshake();

    assert.equal(answer.error, undefined, plugin.output());
  },
);
