import { cleanWorkName } from './draft-file';

/** What a work's drafts and cuts are called beside it. */
export interface BesideNames {
  /** The work's file name: `Boca.fountain`. */
  file: string;
  /** Its name without the extension, as a file name holds it: `Boca`. */
  work: string;
  /** `Boca drafts`. */
  folder: string;
  /** `Boca.fountain.cuts.md`. */
  cuts: string;
}

/**
 * The names beside a work whose file is `fileName` (`cleanWorkName`, as the desktop app works
 * them out on its side), or null when the name has nothing a file name can hold.
 */
export function besideNames(fileName: string): BesideNames | null {
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  try {
    const work = cleanWorkName(stem);
    return {
      file: fileName,
      work,
      folder: `${work} drafts`,
      cuts: `${cleanWorkName(fileName)}.cuts.md`,
    };
  } catch {
    return null;
  }
}
