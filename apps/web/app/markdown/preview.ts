/** A text this long (in characters) is parsed after a pause in typing, not at each key. */
export const IMMEDIATE_LIMIT = 10_000;
/** How long the pause is. */
export const PREVIEW_DELAY_MS = 250;

/**
 * How long to wait before drawing the preview of a text this long: no wait for a short one, so it
 * follows the typing; a pause for a long one, so a key is never held up by parsing a whole book.
 */
export function previewDelay(length: number): number {
  return length <= IMMEDIATE_LIMIT ? 0 : PREVIEW_DELAY_MS;
}

/** "No words", "1 word", or "N words": the Preview's bar and the status bar read it. */
export function wordsLabel(count: number): string {
  if (count === 0) return 'No words';
  return count === 1 ? '1 word' : `${count.toLocaleString('en-US')} words`;
}

/** Why the Preview can't show a document: nested too deeply for the parser or the drawing, or anything else. */
export type PreviewProblem = 'deep' | 'other';

/**
 * What went wrong, from the error a parse or a drawing threw (or the worker's message for it):
 * running out of stack is a document nested too deeply (a RangeError in Chromium and WebKit, "too
 * much recursion" in Firefox), and so is the parse's own refusal of one (`NestedTooDeeply`).
 */
export function previewProblem(error: unknown): PreviewProblem {
  if (error instanceof RangeError) return 'deep';
  const message = error instanceof Error ? error.message : String(error);
  return /call stack|too much recursion|nested too deeply/i.test(message) ? 'deep' : 'other';
}

/** What the Preview says in place of a document it can't show. */
export const PREVIEW_PROBLEMS: Readonly<Record<PreviewProblem, string>> = {
  deep: 'This document is nested too deeply to preview. Your text is safe in the Source.',
  other: 'The Preview couldn’t show this document. Your text is safe in the Source.',
};
