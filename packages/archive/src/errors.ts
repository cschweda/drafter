// Why an archive from another app was refused, in Drafter's own words: the zip reader's reasons,
// and the ones that come from looking for the script inside.
import type { ZipReason } from './zip';

/** The apps whose files come packed as a zip. */
export type ArchiveFormat = 'Highland' | 'Fade In';

export type ArchiveReason =
  | ZipReason
  | 'no-script'
  | 'many-scripts'
  | 'not-utf8'
  | 'not-text'
  | 'not-osf';

const WORDS: Record<ArchiveReason, string> = {
  'not-zip': 'it isn’t a zip archive.',
  'too-big': 'it is larger than 32 MB.',
  'too-many-entries': 'it holds more than 1,000 files.',
  'too-big-unpacked': 'it unpacks to more than 256 MB.',
  zip64: 'it is stored in a form Drafter doesn’t read.',
  split: 'it is stored in a form Drafter doesn’t read.',
  encrypted: 'it is encrypted.',
  'unsafe-name': 'it holds a file with an unsafe name.',
  'duplicate-name': 'it holds two files with the same name.',
  damaged: 'it is damaged.',
  method: 'its script is compressed in a way Drafter doesn’t read.',
  'entry-too-big': 'its script is larger than 5 MB.',
  'no-inflate': 'this browser can’t unpack it. Try a current browser, or the Drafter app.',
  'no-script': 'it holds no script.',
  'many-scripts': 'it holds more than one script.',
  'not-utf8': 'its script isn’t UTF-8 text.',
  'not-text': 'its script holds more than text.',
  'not-osf': 'its script isn’t in a form Drafter reads.',
};

/** The reason in words, with the detail (Fade In's candidate names, or `fromOsf`'s reason) in brackets. */
function words(reason: ArchiveReason, detail: string | undefined): string {
  if ((reason === 'not-osf' || reason === 'many-scripts') && detail)
    return `${WORDS[reason].replace(/\.$/, '')} (${detail}).`;
  return WORDS[reason];
}

/** A file from another app that Drafter can't read, and why. */
export class ArchiveError extends Error {
  constructor(
    readonly format: ArchiveFormat,
    readonly reason: ArchiveReason,
    readonly detail?: string,
    options?: ErrorOptions,
  ) {
    super(`This isn’t a ${format} file Drafter can read: ${words(reason, detail)}`, options);
    this.name = 'ArchiveError';
  }
}
