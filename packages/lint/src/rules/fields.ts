import { bodyEnd, readNote } from '@drafter/notes';
import { resolveRole } from '@drafter/templates';
import type { LintDiagnostic, Rule } from '../types';

// duplicate-field (Phase 2 design §21): a scene's Goal, Conflict, Outcome, Shift, Storyline, or
// Color is read from the first such note in the scene, so a second one does nothing. This lists
// each second (and later) note, as advice. Setup, Payoff, and Card notes may repeat, and an empty
// field (`[[Goal:]]`) is no field. `@drafter/outline` reads the same scenes (a scene starts at a
// scene heading, or at a play's `##`, and runs to the next heading or section); its tests keep
// the two in step.

const SCENE_ROLES = new Set(['scene_heading', 'scene_heading_play']);

export const duplicateField: Rule = {
  id: 'duplicate-field',
  severity: 'info',
  run: ({ doc, template }) => {
    const found: LintDiagnostic[] = [];
    const end = bodyEnd(doc);
    // The scene starts and the places a scene ends (any section), as offsets.
    const stops: Array<{ from: number; scene: boolean }> = [];
    for (let i = 0; i < end; i++) {
      const block = doc.blocks[i];
      if (!block) continue;
      if (block.kind === 'section' || block.kind === 'scene_heading') {
        const scene = SCENE_ROLES.has(resolveRole(template, block, null));
        stops.push({ from: block.span.from, scene });
      }
    }
    let at = -1;
    let seen = new Set<string>();
    for (const region of doc.regions) {
      if (region.kind !== 'note' || !region.closed) continue;
      const { from, to } = region.span;
      if (from >= (doc.blocks[end - 1]?.span.to ?? 0)) break;
      let next = at;
      while (stops[next + 1] && (stops[next + 1]?.from ?? 0) <= from) next++;
      if (next !== at) {
        at = next;
        seen = new Set();
      }
      if (at < 0 || !stops[at]?.scene) continue;
      const note = readNote(doc.source.slice(from + 2, to - 2));
      if (note.head?.kind !== 'field' || note.body === '') continue;
      // Storyline notes add up (Scene details lists them all), so a second is no duplicate.
      if (note.head.key === 'storyline') continue;
      if (!seen.has(note.head.key)) {
        seen.add(note.head.key);
        continue;
      }
      found.push({
        ruleId: duplicateField.id,
        severity: duplicateField.severity,
        span: { from, to },
        message: `This scene already has a ${LABELS[note.head.key]}; Drafter reads the first one.`,
      });
    }
    return found;
  },
};

const LABELS = {
  color: 'Color',
  storyline: 'Storyline',
  goal: 'Goal',
  conflict: 'Conflict',
  outcome: 'Outcome',
  shift: 'Shift',
} as const;
