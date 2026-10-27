// The samples' kinds and names, apart from their text (`samples.ts`), so a page that lists them (the
// command data, which the prerendered Keyboard shortcuts page reads) doesn't carry the scripts.
export type SampleKind = 'screenplay' | 'stage-play' | 'markdown';

/** The samples, in the order the menus list them: the document types' order. */
export const SAMPLES: readonly { kind: SampleKind; name: string }[] = [
  { kind: 'screenplay', name: 'Screenplay' },
  { kind: 'stage-play', name: 'Stage play' },
  { kind: 'markdown', name: 'Markdown' },
];
