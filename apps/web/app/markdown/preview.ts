/** A text this long (in characters) is parsed after a pause in typing, not at each key. */
export const IMMEDIATE_LIMIT = 20_000;
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
