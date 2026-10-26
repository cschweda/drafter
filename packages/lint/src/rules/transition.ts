import type { Block, BlockKind } from '@drafter/fountain';
import type { LintDiagnostic, Rule } from '../types';

// transition-not-last (technical design §9): a transition ends a scene, so what follows it is a
// new one.

type Transition = Extract<Block, { kind: 'transition' }>;

/** Blocks that print nothing. A transition's next block is the first one that isn't of these. */
const SKIPPED: ReadonlySet<BlockKind> = new Set(['note', 'boneyard', 'synopsis']);

/** What a transition may go on to. */
const LEADS_INTO: ReadonlySet<BlockKind> = new Set(['scene_heading', 'section', 'page_break']);

export const transitionNotLast: Rule = {
  id: 'transition-not-last',
  severity: 'warning',
  run: ({ doc }) => {
    const found: LintDiagnostic[] = [];
    // The latest transition, which is waiting for the block after it. One still waiting at the
    // end of the script ends it, so it passes.
    let waiting: Transition | null = null;
    for (const block of doc.blocks) {
      if (SKIPPED.has(block.kind)) continue;
      if (waiting && !LEADS_INTO.has(block.kind)) {
        found.push({
          ruleId: transitionNotLast.id,
          severity: transitionNotLast.severity,
          span: { ...waiting.span },
          message: `The transition "${waiting.sem.text}" isn't followed by a scene heading, a section, or a page break.`,
        });
      }
      waiting = block.kind === 'transition' ? block : null;
    }
    return found;
  },
};
