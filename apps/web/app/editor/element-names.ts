import type { ClassicElement, CursorElement, ElementStructure } from '@drafter/cm-fountain';

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

/** An element's name in Classic Mode, by the template: a stage play has acts, scenes, and stage directions. */
export function classicKindName(kind: ClassicElement['kind'], structure: ElementStructure): string {
  if (kind === 'act') return 'Act';
  if (kind === 'scene_heading' && !structure.headings) return 'Scene';
  if (kind === 'action' && structure.stageDirections) return 'Stage direction';
  return ELEMENT_NAMES[kind];
}

/** What the cursor's element is called in Classic Mode, a pending one included. */
export const classicElementName = (element: ClassicElement, structure: ElementStructure): string =>
  classicKindName(element.kind, structure);
