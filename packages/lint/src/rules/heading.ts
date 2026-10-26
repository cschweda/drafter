import type { LintDiagnostic, Rule } from '../types';

// heading-no-time (technical design §2.5 and §9). A scene heading gives its time of day after
// the last ` - `. A forced heading (`.MONTAGE`) is how Fountain writes one with none, so it is
// never reported. A template with no sluglines, such as the stage play, turns the rule off.

export const headingNoTime: Rule = {
  id: 'heading-no-time',
  severity: 'warning',
  run: ({ doc }) => {
    const found: LintDiagnostic[] = [];
    for (const block of doc.blocks) {
      if (block.kind !== 'scene_heading' || block.forced || block.sem.time !== null) continue;
      found.push({
        ruleId: headingNoTime.id,
        severity: headingNoTime.severity,
        span: { ...block.span },
        message: `The scene heading "${block.sem.text}" has no time of day. Add one after a dash, as in "INT. KITCHEN - NIGHT".`,
      });
    }
    return found;
  },
};
