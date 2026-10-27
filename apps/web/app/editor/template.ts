import type { Doc } from '@drafter/fountain';
import type { DocumentKind } from '../markdown/kind';
import type { SampleKind } from './sample-kinds';

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

/** The longest name of an unknown template that is shown; the rest is cut. */
const NAME_LIMIT = 60;

/** Control characters, and the ones that reorder or hide text (direction overrides, isolates, marks, joiners). */
const UNSHOWN = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;

/**
 * The template `meta.template` asks for when Drafter doesn't have it, as text that is safe to show,
 * else undefined (technical design §8.6). The script is shown as a screenplay then, and the chip and
 * the menus say so. The value is whatever JSON the file held: a string, or a number, a list, or an
 * object (shown as its JSON), all of which are templates Drafter doesn't have; only a missing value,
 * `null`, and an empty string mean no template. The name is the writer's own file's, so it is shown
 * without control characters or direction overrides (which could make the sentence read backward), and
 * is cut to 60 characters with "…".
 */
export function unknownTemplateOf(doc: Doc): string | undefined {
  const id: unknown = doc.meta?.template;
  if (id === undefined || id === null || id === '' || isBuiltIn(id)) return undefined;
  const raw = typeof id === 'string' ? id : (JSON.stringify(id) ?? String(id));
  const shown = raw.replace(UNSHOWN, '');
  if (shown === '') return '(unprintable)';
  const chars = Array.from(shown);
  return chars.length > NAME_LIMIT ? `${chars.slice(0, NAME_LIMIT).join('')}…` : shown;
}

/** What the template menus say about an unknown template, with its name in curly quotes. */
export function unknownTemplateNote(name: string): string {
  return `This script asks for “${name}”, which Drafter doesn't have, so it's shown as a screenplay.`;
}

/**
 * One kind of document the writer can make or switch to. A Fountain entry is a template, chosen
 * through the metadata block. The Markdown entry is not a template: choosing it changes the
 * project's kind (`Project.kind`), so `kind` is the discriminator.
 */
export interface FountainType {
  kind: 'fountain';
  id: TemplateId;
  /** The chip's and the status bar's name for it (`TEMPLATE_NAMES`). */
  name: string;
  /** What New makes: the sample kind `newScript` takes. */
  newKind: Exclude<SampleKind, 'markdown'>;
  /** The Scripts menu's and the palette's wording. */
  newTitle: string;
  newIcon: string;
  /** The key for New, where it has one. */
  newKeys?: string;
}

export interface MarkdownType {
  kind: 'markdown';
  id: 'markdown';
  /** The chip's name for it. */
  name: string;
  newKind: 'markdown';
  newTitle: string;
  newIcon: string;
  newKeys?: undefined;
}

export type DocumentType = FountainType | MarkdownType;

/** What New makes: a sample's kind for a Fountain template, else `markdown`. */
export type NewKind = DocumentType['newKind'];

/** The chip's name for a Markdown document. */
export const MARKDOWN_NAME = 'Markdown (plain text)';

/**
 * The name of the document type a script is: Markdown, else its template's. `fallback` is for a
 * script whose template Drafter doesn't have (`unknownTemplateOf`): "Screenplay (fallback)".
 */
export function typeNameOf(kind: DocumentKind, template: TemplateId, fallback = false): string {
  if (kind === 'markdown') return MARKDOWN_NAME;
  return fallback ? `${TEMPLATE_NAMES[template]} (fallback)` : TEMPLATE_NAMES[template];
}

/**
 * The one list, in the order the maintainer decided (2026-10-26): Screenplay (the default), Stage
 * play, then any other Fountain template (Phase 3 adds TV, radio, and UK ones here), then Markdown
 * (plain text), the one entry of the other `kind`, which stays last. The toolbar chip, the
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
  {
    kind: 'markdown',
    id: 'markdown',
    name: MARKDOWN_NAME,
    newKind: 'markdown',
    newTitle: 'New Markdown document',
    newIcon: 'i-lucide-file-text',
  },
];
