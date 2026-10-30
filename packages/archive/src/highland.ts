// Highland's `.highland` file, from the app maker's public description (docs/DECISIONS.md, Imports
// and Markdown out): a zip of a TextBundle, whose `text.fountain` holds the script as Fountain,
// beside `info.json` and other JSON the app keeps (settings, sprints, characters) and an `assets/`
// folder of images. The script comes in exactly as Highland wrote it, since it is already
// Fountain. Every other entry, but the app's own metadata, is named, never read, in one note at
// the script's end, so nothing is dropped silently.
import type { FdxImport } from '@drafter/fdx';
import { ArchiveError } from './errors';
import { candidates, isClutter, pickEntry, scriptText } from './text';
import { listZip, readEntry, type ZipEntry, ZipError } from './zip';

/**
 * The entries the public description names as the app's own: `info.json` and the other JSON files
 * (`sprints.json`, `characters.json`, …), anywhere but under `assets/`. They are never named in
 * the note.
 */
export const HIGHLAND_METADATA = /^(?!(?:.*\/)?assets\/)(?:.*\/)?[^/]+\.json$/i;

/** The script's entry, by its TextBundle name, which is preferred when present. */
const TEXT_FOUNTAIN = /(?:^|\/)text\.fountain$/i;

const FOUNTAIN = /\.fountain$/i;

/** The most entries the note names before saying how many more. */
const MAX_NAMED = 50;

/** The note's type in `mapped`, which the Export toast counts. */
const NOTE_TYPE = 'Also in the file';

/**
 * An entry's name as the note shows it: past the script's own folder when it sits in it, and
 * unable to end or open a note or a boneyard (a space inside `]]`, `[[`, `/*`, and `*\/`, and after
 * a last `]`). The zip reader already refuses a name with a line break or other control.
 */
function shown(entry: ZipEntry, folder: string): string {
  const name = entry.name.startsWith(folder) ? entry.name.slice(folder.length) : entry.name;
  const safe = name
    .replace(/\s+/g, ' ')
    .replace(/\](?=\])/g, '] ')
    .replace(/\[(?=\[)/g, '[ ')
    .replace(/\/(?=\*)/g, '/ ')
    .replace(/\*(?=\/)/g, '* ');
  return safe.endsWith(']') ? `${safe} ` : safe;
}

/** The note naming what else the file holds, or null when there is nothing to name. */
function leftNote(entries: readonly ZipEntry[], script: ZipEntry): string | null {
  const folder = script.name.slice(0, script.name.lastIndexOf('/') + 1);
  const left = entries.filter(
    (e) => e !== script && !e.directory && !isClutter(e) && !HIGHLAND_METADATA.test(e.name),
  );
  if (left.length === 0) return null;
  const names = left.slice(0, MAX_NAMED).map((e) => shown(e, folder));
  const more = left.length - names.length;
  const list = more > 0 ? `${names.join(', ')}, and ${more} more` : names.join(', ');
  return `[[highland: ${NOTE_TYPE}, not brought in: ${list}]]`;
}

/** The script out of a `.highland` file, as Fountain, with a note naming what else it holds. */
export async function fromHighland(bytes: Uint8Array): Promise<FdxImport> {
  try {
    const entries = listZip(bytes);
    const found = candidates(entries, FOUNTAIN);
    const named = found.filter((e) => TEXT_FOUNTAIN.test(e.name));
    const script = pickEntry(named.length > 0 ? named : found, 'Highland');
    const text = scriptText(await readEntry(bytes, script), 'Highland');
    const note = leftNote(entries, script);
    if (note === null) return { text, title: null, mapped: [], ignored: [], ignoredCount: 0 };
    const body = text === '' || text.endsWith('\n') ? text : `${text}\n`;
    return {
      text: `${body}${body === '' ? '' : '\n'}${note}\n`,
      title: null,
      mapped: [{ type: NOTE_TYPE, count: 1 }],
      ignored: [],
      ignoredCount: 0,
    };
  } catch (error) {
    if (error instanceof ZipError)
      throw new ArchiveError('Highland', error.reason, undefined, { cause: error });
    throw error;
  }
}
