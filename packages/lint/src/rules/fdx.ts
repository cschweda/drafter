import type { LintDiagnostic, Rule } from '../types';

// fdx-note (Phase 2 Plan FD): an import from Final Draft (`@drafter/fdx`'s `fromFdx`) keeps what
// Drafter has no element for as action with a `[[fdx: Type]]` note (a `Cast List` paragraph, a
// scene number Fountain can't hold, an unknown element). This lists every such note, as a to-do
// list with a jump to each. Advice, never counted as a problem.

/** `[[fdx: Cast List]]`: the note's content starts with `fdx:`, which the import writes. */
const FDX_NOTE = /^\[\[fdx:\s*([\s\S]*?)\s*\]\]$/;

export const fdxNote: Rule = {
  id: 'fdx-note',
  severity: 'info',
  run: ({ doc }) => {
    const found: LintDiagnostic[] = [];
    for (const region of doc.regions) {
      if (region.kind !== 'note' || !region.closed) continue;
      const match = FDX_NOTE.exec(doc.source.slice(region.span.from, region.span.to));
      if (!match) continue;
      const label = (match[1] ?? '').replace(/\s+/g, ' ');
      found.push({
        ruleId: fdxNote.id,
        severity: fdxNote.severity,
        span: { ...region.span },
        message: `This came in from Final Draft as “${label}”, which Drafter has no element for. Check it, then delete the note.`,
      });
    }
    return found;
  },
};
