// The spellchecker (Plan 6, Ruling D5). macOS checks spelling with the system's own checker, which
// needs nothing. On Linux (and Windows, later) Chromium checks with Hunspell, and fetches each
// language's dictionary from Google the first time: a request the desktop app may not make. So the
// app brings its own en-US dictionary (`dictionaries/`, from SCOWL by way of Chromium; see
// docs/DEPENDENCIES.md) and copies it into the profile's `Dictionaries` folder, where Chromium
// looks before it downloads anything. The download address is pointed at the bundled folder too
// (a file: URL, which never reaches the network), so a dictionary that's missing is never fetched
// from anywhere else. If the app has no dictionary, spellcheck is turned off rather than fetched.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Session } from 'electron';

/** The languages there are dictionaries for. */
export const LANGUAGES = ['en-US'];

/**
 * Copies the bundled `.bdic` dictionaries into `<userData>/Dictionaries` (Electron's
 * `chrome::DIR_APP_DICTIONARIES`), unless an identical-sized copy is there. Returns their names.
 */
export function seedDictionaries(bundled: string, userData: string): string[] {
  if (!existsSync(bundled)) return [];
  const names = readdirSync(bundled).filter((name) => name.endsWith('.bdic'));
  if (names.length === 0) return [];
  const target = join(userData, 'Dictionaries');
  mkdirSync(target, { recursive: true });
  for (const name of names) {
    const from = join(bundled, name);
    const to = join(target, name);
    if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
    copyFileSync(from, to);
  }
  return names;
}

/** How spelling is checked: the system's checker, the bundled dictionary, or not at all. */
export type Spellcheck = 'system' | 'bundled' | 'off';

/** Sets the session's spellchecker up. Call on `ready`, before the first window. */
export function setUpSpellcheck(
  session: Session,
  options: {
    platform: NodeJS.Platform;
    dictionaries: string;
    userData: string;
    /** Other profile folders to seed as well (a profile moved after Electron chose its folder). */
    alsoUserData?: string[];
  },
): Spellcheck {
  if (options.platform === 'darwin') return 'system';
  session.setSpellCheckerDictionaryDownloadURL(`${pathToFileURL(options.dictionaries).href}/`);
  for (const other of options.alsoUserData ?? []) seedDictionaries(options.dictionaries, other);
  if (seedDictionaries(options.dictionaries, options.userData).length === 0) {
    session.setSpellCheckerEnabled(false);
    return 'off';
  }
  session.setSpellCheckerLanguages(LANGUAGES);
  session.setSpellCheckerEnabled(true);
  return 'bundled';
}
