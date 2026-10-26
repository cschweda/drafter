import type { CursorElement } from '@drafter/cm-fountain';

/** What a screen reader says for each kind of element (technical design §13). */
export const ELEMENT_NAMES: Record<CursorElement['kind'], string> = {
  scene_heading: 'Scene heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  centered: 'Centered',
  lyric: 'Lyric',
  section: 'Section',
  synopsis: 'Synopsis',
  note: 'Note',
  boneyard: 'Boneyard',
  page_break: 'Page break',
  title_page: 'Title page',
};
