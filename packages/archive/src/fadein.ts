// Fade In's `.fadein` file, from the public descriptions (docs/DECISIONS.md, Imports and Markdown
// out): a zip archive holding the script as an Open Screenplay Format XML document, which
// `@drafter/fdx`'s `fromOsf` reads with its strict XML reader. No public source names the entry,
// so the document is the archive's one `.xml` entry at the shallowest depth, outside `__MACOSX/`
// and dot-files; when several sit there, the one whose root element is `document` (OSF's root).
// Only that entry is parsed; the others' first bytes are looked at, nothing more.
import { type FdxImport, fromOsf, OsfError } from '@drafter/fdx';
import { ArchiveError } from './errors';
import { candidates, scriptText, shallowest } from './text';
import { listZip, readEntry, type ZipEntry, ZipError } from './zip';

const XML = /\.xml$/i;

/** How far into an entry to look for its root element. */
const PEEK = 1024;

/** OSF's root element, after what may come before it: a BOM, white space, the declaration, comments. */
const OSF_ROOT = /^\uFEFF?\s*(?:<\?[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<document[\s/>]/;

/** The most candidate names a `many-scripts` refusal lists. */
const MAX_NAMED = 5;

/** The candidate names for a `many-scripts` refusal: the first few, then how many more. */
function named(entries: readonly ZipEntry[]): string {
  const names = entries.slice(0, MAX_NAMED).map((e) => e.name);
  const more = entries.length - names.length;
  return more > 0 ? `${names.join(', ')}, and ${more} more` : names.join(', ');
}

/** The entry to read: the one `.xml` at the shallowest depth, else the one there whose root is OSF's. */
async function pickDocument(bytes: Uint8Array, entries: readonly ZipEntry[]): Promise<ZipEntry> {
  const top = shallowest(candidates(entries, XML), 'Fade In');
  if (top.length === 1) return top[0] as ZipEntry;
  const osf: ZipEntry[] = [];
  for (const entry of top) {
    let head: string;
    try {
      head = new TextDecoder().decode((await readEntry(bytes, entry)).subarray(0, PEEK));
    } catch (error) {
      // An entry that can't be unpacked isn't the document; the one that is gets read in full.
      if (error instanceof ZipError) continue;
      throw error;
    }
    if (OSF_ROOT.test(head)) osf.push(entry);
  }
  if (osf.length === 1) return osf[0] as ZipEntry;
  throw new ArchiveError('Fade In', 'many-scripts', named(osf.length > 1 ? osf : top));
}

/**
 * The script out of a `.fadein` file, as Fountain: its one `.xml` entry (or, of several at the top,
 * the one whose root is OSF's), read as strict UTF-8, through `fromOsf`. A document `fromOsf` refuses is `not-osf`, its reason the detail.
 */
export async function fromFadeIn(bytes: Uint8Array): Promise<FdxImport> {
  try {
    const entries = listZip(bytes);
    const entry = await pickDocument(bytes, entries);
    return fromOsf(scriptText(await readEntry(bytes, entry), 'Fade In'));
  } catch (error) {
    if (error instanceof ZipError)
      throw new ArchiveError('Fade In', error.reason, undefined, { cause: error });
    if (error instanceof OsfError)
      throw new ArchiveError('Fade In', 'not-osf', error.reason.replace(/\.$/, ''), {
        cause: error,
      });
    throw error;
  }
}
