/**
 * The `mcp` wrapper finds a Node 24 where the Host's service PATH has none.
 *
 * The Host runs under systemd with a PATH that holds only the distribution's
 * Node, which is too old to run TypeScript or to have node:sqlite. These tests
 * build that PATH in a temporary directory, with an old `node` and the one
 * tool the wrapper needs, and give it a home directory with no nvm in it, so
 * the only Node 24 it can find is the one a test names. The real service PATH
 * is no use here: a machine such as a CI runner may keep a Node 24 in
 * /usr/local/bin.
 */
import { strict as assert } from 'node:assert';
import { constants } from 'node:fs';
import { access, chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { makeDirectory, startPluginServer } from './helpers/plugin.ts';

/** `mcp` is `sh`, which Windows has no use for: the Host runs `mcp.ts` there. */
const NO_SH = {
  skip: process.platform === 'win32' ? 'the sh wrapper `mcp` is for a wsl Place' : false,
};

/** The distribution's Node: it answers, but it is older than 24. */
const OLD_NODE = '#!/bin/sh\necho 22\n';

/** Find `name` on this machine's PATH, or stop the test with a sentence. */
async function found(name: string): Promise<string> {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const path = join(directory, name);
    try {
      await access(path, constants.X_OK);
      return path;
    } catch {
      // Not in this directory; try the next one.
    }
  }
  throw new Error(`The wrapper needs \`${name}\`, and this machine's PATH has none.`);
}

/**
 * A service PATH that holds nothing but an old `node` and `dirname`, which is
 * the one program the wrapper runs that `sh` does not build in.
 */
async function servicePath(t: TestContext): Promise<string> {
  const bin = join(await makeDirectory(t), 'bin');
  await mkdir(bin);
  await symlink(await found('dirname'), join(bin, 'dirname'));
  await writeFile(join(bin, 'node'), OLD_NODE);
  await chmod(join(bin, 'node'), 0o755);
  return bin;
}

test(
  'the wrapper runs the Node that FLASHCARDS_NODE names when PATH has none new enough',
  NO_SH,
  async (t) => {
    const home = await makeDirectory(t);
    const plugin = await startPluginServer(t, {
      wrapper: true,
      env: { PATH: await servicePath(t), HOME: home, FLASHCARDS_NODE: process.execPath },
    });

    const answer = await plugin.handshake();

    assert.equal(answer.error, undefined, plugin.output());
  },
);

test(
  'with no Node 24 anywhere, the wrapper says so in one sentence that names FLASHCARDS_NODE',
  NO_SH,
  async (t) => {
    const home = await makeDirectory(t);
    const plugin = await startPluginServer(t, {
      wrapper: true,
      env: { PATH: await servicePath(t), HOME: home, FLASHCARDS_NODE: '' },
    });

    const ending = await plugin.ended();

    assert.notEqual(ending.code, 0);
    const said = plugin.output().trim();
    assert.ok(said.includes('FLASHCARDS_NODE'), `stderr said: ${said}`);
    assert.ok(said.startsWith('flashcards: '), `stderr said: ${said}`);
    assert.equal(said.split('\n').length, 1, `stderr said more than one line: ${said}`);
    assert.equal(plugin.lines().length, 0, 'something reached stdout');
  },
);
