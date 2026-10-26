import type { Doc } from '@drafter/fountain';
import type { SampleKind } from './samples';

export type TemplateId = 'us-screenplay' | 'stage-play-standard';

/** The built-in templates' names, as the toolbar's chip and the status bar show them. */
export const TEMPLATE_NAMES: Record<TemplateId, string> = {
  'us-screenplay': 'Screenplay',
  'stage-play-standard': 'Stage play',
};

const DEFAULT_TEMPLATE: TemplateId = 'us-screenplay';

export function isBuiltIn(id: unknown): id is TemplateId {
  return typeof id === 'string' && Object.hasOwn(TEMPLATE_NAMES, id);
}

/** `meta.template` when it names a built-in, otherwise the US screenplay (technical design §8.6). */
export function templateIdOf(doc: Doc): TemplateId {
  const id = doc.meta?.template;
  return isBuiltIn(id) ? id : DEFAULT_TEMPLATE;
}

/**
 * One kind of document the writer can make or switch to. Today every entry is a Fountain template,
 * chosen through the metadata block; `kind` is the discriminator Task 6 uses to add the Markdown
 * document, which is not a template and changes the project's kind instead.
 */
export interface FountainType {
  kind: 'fountain';
  id: TemplateId;
  /** The chip's and the status bar's name for it (`TEMPLATE_NAMES`). */
  name: string;
  /** What New makes: the sample kind `newScript` takes. */
  newKind: SampleKind;
  /** The Scripts menu's and the palette's wording. */
  newTitle: string;
  newIcon: string;
  /** The key for New, where it has one. */
  newKeys?: string;
}

export type DocumentType = FountainType;

/**
 * The one list, in the order the maintainer decided (2026-10-26): Screenplay (the default), Stage
 * play, then any other Fountain template (Phase 3 adds TV, radio, and UK ones here), then Markdown
 * (plain text), which Task 6 appends as one more entry of the other `kind`. The toolbar chip, the
 * Scripts menu's New items, and the palette's New commands all read this array, so they agree.
 */
export const DOCUMENT_TYPES: readonly DocumentType[] = [
  {
    kind: 'fountain',
    id: 'us-screenplay',
    name: TEMPLATE_NAMES['us-screenplay'],
    newKind: 'screenplay',
    newTitle: 'New screenplay',
    newIcon: 'i-lucide-file-plus',
    newKeys: 'Mod-Alt-n',
  },
  {
    kind: 'fountain',
    id: 'stage-play-standard',
    name: TEMPLATE_NAMES['stage-play-standard'],
    newKind: 'stage-play',
    newTitle: 'New stage play',
    newIcon: 'i-lucide-drama',
  },
];
