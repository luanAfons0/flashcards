/**
 * The Plugin Settings: the Daily Limit the operator chose, kept in
 * `settings.json` in the Plugin's own directory, beside `flashcards.db`.
 *
 * The file is the Plugin's alone; the Host neither reads nor keeps it
 * (FirstMate ADR-0005), and an update of the Plugin keeps it. It is read at
 * every call, so a save is used at once, with no restart. It is written whole
 * to a file beside it and then renamed over it, so a Plugin Server that stops
 * halfway leaves the old file or the new one, never half of either. A key
 * this flashcards does not know is kept as it is. A setting the file does not
 * hold is its default.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { badInput } from './mcp.ts';

/** The name of the settings file in the Plugin directory. */
export const SETTINGS_FILE = 'settings.json';

/** The Settings, as `get_settings` answers them. */
export type Settings = { readonly newCardsPerDay: number; readonly reviewsPerDay: number };

/** Each setting by its key, with the words the Plugin Page shows for it and its default. */
const SETTINGS = [
  { key: 'newCardsPerDay', label: 'New Cards per day', fallback: 20 },
  { key: 'reviewsPerDay', label: 'Reviews per day', fallback: 200 },
] as const;

/** The largest value a setting takes. */
const MOST = 9999;

/** The Settings in force: what settings.json holds, or the default of each it does not hold. */
export function readSettings(): Settings {
  const file = readFile();
  const settings: Record<string, number> = {};
  for (const { key, label, fallback } of SETTINGS) {
    const value = file[key];
    if (value === undefined) {
      settings[key] = fallback;
      continue;
    }
    if (!isSetting(value)) {
      throw new Error(
        `${pathOf()} holds a ${key} of ${JSON.stringify(value)}, and ${refusal(label)} ` +
          'Save the Settings on the Plugin Page to write it again.',
      );
    }
    settings[key] = value;
  }
  return settings as Settings;
}

/**
 * Save the settings given: a key left out keeps its value, and a key given
 * as null goes back to its default. A value that is not a whole number from
 * 0 to 9999 is refused, and nothing is saved. A settings.json that cannot be
 * read is written again from what is given.
 */
export function updateSettings(given: Readonly<Record<string, unknown>>): Settings {
  for (const { key, label } of SETTINGS) {
    const value = given[key];
    if (value !== undefined && value !== null && !isSetting(value)) throw badInput(refusal(label));
  }
  let whole: Record<string, unknown>;
  try {
    whole = readFile();
  } catch {
    whole = {};
  }
  for (const { key } of SETTINGS) {
    if (given[key] === null) delete whole[key];
    else if (given[key] !== undefined) whole[key] = given[key];
  }
  const path = pathOf();
  writeFileSync(`${path}.next`, `${JSON.stringify(whole, null, 2)}\n`);
  renameSync(`${path}.next`, path);
  return readSettings();
}

function isSetting(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MOST;
}

function refusal(label: string): string {
  return `${label} must be a whole number from 0 to ${MOST}.`;
}

/** settings.json as an object of whatever it holds, or an empty one when there is none. */
function readFile(): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(pathOf(), 'utf8');
  } catch (fault) {
    if ((fault as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw fault;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${pathOf()} is not a JSON object; save the Settings on the Plugin Page to write it again.`);
  }
  return parsed as Record<string, unknown>;
}

/** The absolute path of settings.json, for a sentence that names it. */
function pathOf(): string {
  return resolve(SETTINGS_FILE);
}
