import {
  type ManuscriptDetails,
  type ResolvedDetails,
  readFacts,
  resolveDetails,
} from '@drafter/novel';
import { ref, type WatchStopHandle, watch } from 'vue';

/**
 * Which manuscript the Export manuscript dialog is open for: a PDF or a Word file, or null while
 * it is closed. The two export commands open it (manuscript design, "Where it sits in the app").
 */
export const manuscriptOpen = ref<null | 'pdf' | 'docx'>(null);

/** The details the dialog opens with: what the book keeps, and the book's defaults for the rest. */
export function detailsFor(source: string, fileTitle: string): ResolvedDetails {
  return resolveDetails(source, fileTitle, readFacts(source).manuscript ?? {});
}

/** The Contact box's text as the lines it holds: one each, trimmed, the empty ones left out. */
export function contactLines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * Which of the form's answers are kept in the book: only those that aren't what the book would
 * give anyway, so a default (the title, the short title, the legal name and surname from the
 * byline) keeps following the book. A blank answer is never kept: the comment keeps no empty field.
 */
export function keptFrom(
  form: ResolvedDetails,
  source: string,
  fileTitle: string,
): ManuscriptDetails {
  const title = form.title.trim();
  const byline = form.byline.trim();
  const legalName = form.legalName.trim();
  const surname = form.surname.trim();
  const shortTitle = form.shortTitle.trim();
  // What each default would be, given the answers it follows from.
  const given = resolveDetails(source, fileTitle, { title, byline, legalName });
  const plain = resolveDetails(source, fileTitle, {});
  const out: ManuscriptDetails = {};
  if (title !== '' && title !== plain.title) out.title = title;
  if (byline !== '') out.byline = byline;
  if (legalName !== '' && legalName !== byline) out.legalName = legalName;
  if (form.contact.length > 0) out.contact = [...form.contact];
  if (surname !== '' && surname !== given.surname) out.surname = surname;
  if (shortTitle !== '' && shortTitle !== given.shortTitle) out.shortTitle = shortTitle;
  if (form.font !== 'times') out.font = form.font;
  return out;
}

/**
 * Closes the dialog (`close`) when the open project (`current`) stops being the one it was opened
 * for (`openedFor`) while it is open: the details are one book's, and never land on another's.
 */
export function closeWhenBookChanges(
  current: () => string | undefined,
  openedFor: () => string | undefined,
  isOpen: () => boolean,
  close: () => void,
): WatchStopHandle {
  return watch(current, (id) => {
    if (isOpen() && id !== openedFor()) close();
  });
}
