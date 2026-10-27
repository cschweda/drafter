import type { SampleKind } from '../editor/sample-kinds';
import { db } from './db';
import { kindOf, type Project } from './projects';

// The first New of each kind opens with that kind's annotated sample (decided 2026-10-27). Whether
// the writer has met a kind's sample is one row of the settings table per kind, `sample-seen:<kind>`,
// whose value is `true`; the `Settings` store ignores these rows, as it does the goals'.

/** The settings row that says the writer has met `kind`'s sample. */
export const sampleSeenKey = (kind: SampleKind): string => `sample-seen:${kind}`;

/** What a project is, as New counts it: a Markdown document, a stage play, or a screenplay. */
function newKindOf(p: Project): SampleKind {
  if (kindOf(p) === 'markdown') return 'markdown';
  return p.templateId === 'stage-play-standard' ? 'stage-play' : 'screenplay';
}

/**
 * Whether the writer has met `kind`'s sample already, so a New of that kind starts blank: the
 * settings row says so, or this browser holds that sample (the first visit's screenplay, or one
 * opened from Samples) or a document of that kind (a writer from before this existed, or one whose
 * row couldn't be written). A row that can't be read counts as met: a returning writer whose
 * storage is failing gets the usual blank document, never a sample forced on them. A damaged row
 * (any value but `true`) is no answer, and the projects decide.
 */
export async function metSample(kind: SampleKind, projects: readonly Project[]): Promise<boolean> {
  try {
    const row = await db.settings.get(sampleSeenKey(kind));
    if (row?.value === true) return true;
  } catch {
    return true;
  }
  return projects.some((p) => (p.sample ? p.sample === kind : newKindOf(p) === kind));
}

/** Keeps that the writer has met `kind`'s sample. A failed write is let go: the document made from it says so too. */
export async function rememberSample(kind: SampleKind): Promise<void> {
  try {
    await db.settings.put({ key: sampleSeenKey(kind), value: true });
  } catch {
    // The document the sample opened in is in the projects, which `metSample` reads as well.
  }
}
