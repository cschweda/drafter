// Fade In's `.fadein` file, from the public descriptions (docs/DECISIONS.md, Imports and Markdown
// out): a zip archive holding the script as an Open Screenplay Format XML document, which
// `@drafter/fdx`'s `fromOsf` reads with its strict XML reader. No public source names the entry,
// so the document is the archive's one `.xml` entry, at the shallowest depth, outside `__MACOSX/`
// and dot-files. Only that entry is read.
import { type FdxImport, fromOsf, OsfError } from '@drafter/fdx';
import { ArchiveError } from './errors';
import { candidates, pickEntry, scriptText } from './text';
import { listZip, readEntry, ZipError } from './zip';

const XML = /\.xml$/i;

/**
 * The script out of a `.fadein` file, as Fountain: its one `.xml` entry, read as strict UTF-8,
 * through `fromOsf`. A document `fromOsf` refuses is `not-osf`, its reason the detail.
 */
export async function fromFadeIn(bytes: Uint8Array): Promise<FdxImport> {
  try {
    const entries = listZip(bytes);
    const entry = pickEntry(candidates(entries, XML), 'Fade In');
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
