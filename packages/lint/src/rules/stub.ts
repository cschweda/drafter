import { resolveRole } from '@drafter/templates';
import type { LintDiagnostic, Rule } from '../types';

// stub-heading (Phase 2 design §6.5): Expand outline gives each new scene a stand-in heading,
// `INT. LOCATION - DAY` (in a play, `## New scene`), for the writer to replace. This lists the
// scenes still holding one, as a to-do list with a jump to each. Advice, never counted as a
// problem. `@drafter/outline` writes the same two stand-ins.

const STUB_HEADING = 'INT. LOCATION - DAY';
const STAGE_STUB = 'New scene';

const same = (a: string, b: string) =>
  a.replace(/\s+/g, ' ').trim().toUpperCase() === b.toUpperCase();

export const stubHeading: Rule = {
  id: 'stub-heading',
  severity: 'info',
  run: ({ doc, template }) => {
    const found: LintDiagnostic[] = [];
    for (const block of doc.blocks) {
      if (block.kind === 'scene_heading' && same(block.sem.text, STUB_HEADING)) {
        found.push({
          ruleId: stubHeading.id,
          severity: stubHeading.severity,
          span: { ...block.span },
          message: `This scene still has the stand-in heading “${STUB_HEADING}”. Write where and when it happens.`,
        });
      } else if (
        block.kind === 'section' &&
        same(block.sem.text, STAGE_STUB) &&
        resolveRole(template, block, null) === 'scene_heading_play'
      ) {
        found.push({
          ruleId: stubHeading.id,
          severity: stubHeading.severity,
          span: { ...block.span },
          message: `This scene still has the stand-in title “${STAGE_STUB}”. Give it a title of its own.`,
        });
      }
    }
    return found;
  },
};
