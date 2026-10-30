// Highland's `.highland` file, from the app maker's public description (docs/DECISIONS.md, Imports
// and Markdown out): a zip of a TextBundle, whose `text.*` (`.fountain`, `.markdown`, or `.txt`)
// holds the script as Fountain, beside `info.json` and other JSON the app keeps (settings, sprints,
// characters) and an `assets/` folder of images. The script comes in exactly as Highland wrote it, since it is already
// Fountain. Every other entry, but the app's own metadata, is named, never read, in one note at
// the script's end, so nothing is dropped silently.
import type { FdxImport } from '@drafter/fdx';
import { ArchiveError } from './errors';
import { candidates, depth, isClutter, pickEntry, scriptText } from './text';
import { listZip, readEntry, type ZipEntry, ZipError } from './zip';

/**
 * The entries the public description names as the app's own: `info.json` and the other JSON files
 * (`sprints.json`, `characters.json`, …), anywhere but under `assets/`. They are never named in
 * the note.
 */
export const HIGHLAND_METADATA = /^(?!(?:.*\/)?assets\/)(?:.*\/)?[^/]+\.json$/i;

/** The document's main text, by its TextBundle name: `text.*`, as Fountain, Markdown, or plain text. */
const TEXT_ENTRY = /(?:^|\/)text\.(?:fountain|markdown|md|txt)$/i;

const FOUNTAIN = /\.fountain$/i;

/** The most entries the note names before saying how many more. */
const MAX_NAMED = 50;

/** The most characters (code points) of one name the note shows; a longer one ends in "…". */
const MAX_NAME_CHARS = 255;

/** About how large the list of names may grow, in UTF-8 bytes, before the rest are counted. */
const MAX_LIST_BYTES = 16 * 1024;

/** The note's type in `mapped`, which the Export toast counts. */
const NOTE_TYPE = 'Also in the file';

/**
 * An entry's name as the note shows it: past the script's own folder when it sits in it, and
 * unable to end or open a note or a boneyard (a space inside `]]`, `[[`, `/*`, and `*\/`, and after
 * a last `]`). The zip reader already refuses a name with a line break or other control.
 */
function shown(entry: ZipEntry, folder: string): string {
  const name = entry.name.startsWith(folder) ? entry.name.slice(folder.length) : entry.name;
  let safe = name
    .replace(/\s+/g, ' ')
    .replace(/\](?=\])/g, '] ')
    .replace(/\[(?=\[)/g, '[ ')
    .replace(/\/(?=\*)/g, '/ ')
    .replace(/\*(?=\/)/g, '* ');
  const chars = Array.from(safe);
  if (chars.length > MAX_NAME_CHARS) safe = `${chars.slice(0, MAX_NAME_CHARS - 1).join('')}…`;
  return safe.endsWith(']') ? `${safe} ` : safe;
}

const utf8 = new TextEncoder();

/** The note naming what else the file holds, or null when there is nothing to name. */
function leftNote(entries: readonly ZipEntry[], script: ZipEntry): string | null {
  const folder = script.name.slice(0, script.name.lastIndexOf('/') + 1);
  const left = entries.filter(
    (e) => e !== script && !e.directory && !isClutter(e) && !HIGHLAND_METADATA.test(e.name),
  );
  if (left.length === 0) return null;
  const names: string[] = [];
  let bytes = 0;
  for (const entry of left.slice(0, MAX_NAMED)) {
    const name = shown(entry, folder);
    bytes += utf8.encode(name).byteLength + 2;
    if (names.length > 0 && bytes > MAX_LIST_BYTES) break;
    names.push(name);
  }
  const more = left.length - names.length;
  const list = more > 0 ? `${names.join(', ')}, and ${more} more` : names.join(', ');
  return `[[highland: ${NOTE_TYPE}, not brought in: ${list}]]`;
}

/**
 * The document's main text: the `text.*` entries (Fountain, Markdown, or plain text, any case) at
 * the shallowest depth, since the top-level text is the current document and subfolders hold
 * revisions; of those, `.fountain` is preferred, and two left is `many-scripts`. Only when there is
 * no `text.*` at all is the one `.fountain` entry, or the shallowest, read; never a bare `.txt` or
 * `.md`. Every `text.*` is read as Fountain, as Highland's text is.
 */
function pickScript(entries: readonly ZipEntry[]): ZipEntry {
  const texts = candidates(entries, TEXT_ENTRY);
  if (texts.length === 0) return pickEntry(candidates(entries, FOUNTAIN), 'Highland');
  const least = Math.min(...texts.map(depth));
  const top = texts.filter((e) => depth(e) === least);
  const fountain = top.filter((e) => FOUNTAIN.test(e.name));
  return pickEntry(fountain.length > 0 ? fountain : top, 'Highland');
}

/** The script out of a `.highland` file, as Fountain, with a note naming what else it holds. */
export async function fromHighland(bytes: Uint8Array): Promise<FdxImport> {
  try {
    const entries = listZip(bytes);
    const script = pickScript(entries);
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
