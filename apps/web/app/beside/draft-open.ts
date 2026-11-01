// Opening a draft file itself (`Boca – Draft 03.fountain`, drafts-and-cuts design §4.2): it is just
// a file, so it opens as a normal script, read-write, but with its draft facts taken out of its
// metadata block first (`readDraftFile`), so freezing it later starts clean; and a note bar says
// what it is: "This is Draft 03 of Boca. Open Boca instead?". It is recognised by its name and by
// its block's `draft` and `id`, both.
import { readDraftFile, type WorkKind } from '@drafter/history';
import { shallowRef } from 'vue';

/** A draft file's name: the work, its number, another computer's `(2)`, the extension. */
const DRAFT_NAME = /^(.+) – Draft (\d{2,})(?: \(\d+\))?\.(?:fountain|md)$/;

/** What a draft file opened as a script is. */
export interface OpenedDraft {
  /** The script's text: the file's, without its draft facts. */
  text: string;
  /** The work it is a draft of: `Boca`. */
  work: string;
  n: number;
}

/** `text`, from the file `name`, as a draft file of a work, or null when it isn't one. */
export function openedDraft(name: string, text: string, kind: WorkKind): OpenedDraft | null {
  const match = DRAFT_NAME.exec(name);
  if (!match) return null;
  const read = readDraftFile(text, kind);
  if (read.facts === null) return null;
  return { text: read.text, work: match[1] as string, n: read.facts.draft };
}

/** The note bar's draft: the script it was opened as, and what it is a draft of. */
export const draftNotice = shallowRef<{
  projectId: string;
  work: string;
  n: number;
  kind: WorkKind;
} | null>(null);
