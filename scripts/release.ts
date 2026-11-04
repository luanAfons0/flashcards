/**
 * Build the Plugin Release: the files `firstmate install` puts in the Plugin
 * directory (FirstMate ADR-0033).
 *
 *   node scripts/release.ts [out]      (`npm run release`; out is `release`)
 *
 * The repository runs from source with no build step; only the Plugin Release
 * is built. It holds exactly what the Host needs to run the Plugin, at the top
 * of `out`, because the Plugin Server is plain JavaScript and one archive
 * serves every platform:
 *
 * - `mcp.js`: `mcp.ts`, `src/` and `ts-fsrs` bundled into one ES module by
 *   tsdown. ES module, because `src/schedule.ts` awaits at the top level. Not
 *   minified, so that a stack trace stays readable. There is no `mcp.ts`
 *   beside it, because the Host starts `mcp.ts` before `mcp.js` (FirstMate
 *   ADR-0028) and would run the source.
 * - `web/`: the Plugin Page and the Popup, as they are.
 * - `mcp`: the repository's own `sh` wrapper for a `wsl` Place, pointed at
 *   `mcp.js`, so that the search for a Node 24 has one source.
 *
 * It never writes `flashcards.db` or `settings.json`. They are the Plugin's
 * data, and `firstmate update` replaces the Release Files and keeps every other
 * file.
 */
import { chmod, cp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'tsdown';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));
const out = resolve(process.argv[2] ?? join(REPOSITORY, 'release'));

await rm(out, { recursive: true, force: true });

await build({
  cwd: REPOSITORY,
  config: false,
  entry: { mcp: join(REPOSITORY, 'mcp.ts') },
  format: 'esm',
  platform: 'node',
  outDir: out,
  // The Plugin is "type": "module", so .js is already an ES module.
  fixedExtension: false,
  clean: false,
  dts: false,
  minify: false,
  sourcemap: false,
  logLevel: 'warn',
  // tsdown keeps every package in "dependencies" out of the bundle. An install
  // has no node_modules, so ts-fsrs must be inside mcp.js.
  deps: { alwaysBundle: ['ts-fsrs'] },
  // ts-fsrs loads each FSRS version with import(). Inline those modules too,
  // so the Plugin Release is one mcp.js and not a folder of chunks.
  outputOptions: { codeSplitting: false },
});

await cp(join(REPOSITORY, 'web'), join(out, 'web'), { recursive: true });

const source = await readFile(join(REPOSITORY, 'mcp'), 'utf8');
const wrapper = source.replace('"$here/src/main.ts"', '"$here/mcp.js"');
if (wrapper === source) {
  throw new Error('The mcp wrapper no longer runs "$here/src/main.ts"; fix scripts/release.ts to match it.');
}
await writeFile(join(out, 'mcp'), wrapper);
await chmod(join(out, 'mcp'), 0o755);
