import type { Doc } from '@drafter/fountain';

export type TemplateId = 'us-screenplay' | 'stage-play-standard';

/** The built-in templates' names, as the toolbar's chip and the status bar show them. */
export const TEMPLATE_NAMES: Record<TemplateId, string> = {
  'us-screenplay': 'Screenplay',
  'stage-play-standard': 'Stage play',
};

const DEFAULT_TEMPLATE: TemplateId = 'us-screenplay';

function isBuiltIn(id: unknown): id is TemplateId {
  return typeof id === 'string' && Object.hasOwn(TEMPLATE_NAMES, id);
}

/** `meta.template` when it names a built-in, otherwise the US screenplay (technical design §8.6). */
export function templateIdOf(doc: Doc): TemplateId {
  const id = doc.meta?.template;
  return isBuiltIn(id) ? id : DEFAULT_TEMPLATE;
}
