export interface FeatureOptions {
  /** The line ending, `\n` or `\r\n`. */
  nl?: string;
  /** How many scenes there are. */
  scenes?: number;
  /** A forced page break after each scene, so a scene's pages don't depend on the ones before it. */
  paged?: boolean;
  /** Whether the script has a title page. */
  title?: boolean;
}

/**
 * A feature-length script with every kind of line the pages hold: a title page,
 * scene headings, action with a note and with emphasis, cues with
 * parentheticals, dual dialogue, transitions, and one speech (in scene 7) too
 * long for a page, which splits with (MORE) and carries on as (CONT'D). The
 * text of scene `i` that the tests edit is unique to it: `Scene ${i} begins in a
 * quiet room.` and `Light falls across the floor.` on the line after it.
 */
export function featureScript({
  nl = '\n',
  scenes = 20,
  paged = false,
  title = true,
}: FeatureOptions = {}): string {
  const blocks: string[] = [];
  if (title) {
    blocks.push(
      [
        'Title: Differential',
        'Credit: written by',
        'Author: A. Writer',
        'Contact:',
        '    Jane Writer',
        '    jane@example.com',
        'Draft date: Revised Draft - January 15, 2026',
      ].join(nl),
    );
  }
  for (let i = 0; i < scenes; i++) {
    blocks.push(`INT. ROOM ${i} - DAY`);
    blocks.push(`Scene ${i} begins in a quiet room.${nl}Light falls across the floor.`);
    if (i % 5 === 2) blocks.push(`Dust hangs [[note ${i}]] in the air.`);
    if (i % 3 === 0) blocks.push('She **runs**, *stops*, and _waits_.');
    blocks.push(['MARGARET', '(quietly)', `We should go before they come back, ${i}.`].join(nl));
    blocks.push(['DANNY', 'Not yet.'].join(nl));
    if (i % 6 === 3) blocks.push(['MARGARET', 'Now.'].join(nl), ['DANNY ^', 'Never.'].join(nl));
    if (i % 4 === 1) blocks.push('CUT TO:');
    if (i === 7) {
      const lines = Array.from({ length: 60 }, (_, k) => `Line ${k} of the long speech.`);
      blocks.push(['MARGARET', ...lines].join(nl));
    }
    if (paged) blocks.push('===');
  }
  return `${blocks.join(`${nl}${nl}`)}${nl}`;
}
