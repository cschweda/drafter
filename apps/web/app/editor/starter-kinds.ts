// The guided starters' kinds, commands, and names, apart from their text (`starters.ts`), so a page
// that lists them (the command data, which the prerendered Keyboard shortcuts page reads) doesn't
// carry the scripts.
export type StarterKind = 'screenplay' | 'stage-play';

export interface StarterData {
  kind: StarterKind;
  /** The id of the command that opens it. */
  command: string;
  /** What the palette, the Keyboard shortcuts page, and File's New items call it. */
  title: string;
  /** What Help → Sample scripts calls it. */
  menuLabel: string;
}

/** The starters, in the order the menus list them: the document types' order. */
export const STARTER_KINDS: readonly StarterData[] = [
  {
    kind: 'screenplay',
    command: 'new-guided-screenplay',
    title: 'New guided screenplay',
    menuLabel: 'Guided first screenplay',
  },
  {
    kind: 'stage-play',
    command: 'new-guided-stage-play',
    title: 'New guided stage play',
    menuLabel: 'Guided first stage play',
  },
];
