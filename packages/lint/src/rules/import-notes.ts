import type { LintDiagnostic, Rule } from '../types';

// The notes an import leaves on what Drafter has no element for or didn't bring in: `[[fdx: …]]`
// from Final Draft, `[[highland: …]]` from Highland, and `[[osf: …]]` from Fade In. One rule per
// app keeps each app's advice its own and lets a writer turn one off. Each lists every such note,
// as a to-do list with a jump to each. Advice, never counted as a problem.

/**
 * The rule listing every closed note whose content starts with `prefix:`, outside a boneyard.
 * `extra` gives the advice for a label of its own, or null for the general advice: “This came in
 * from `app` as “label”. Check it, then delete the note.”
 */
export function importNote(
  id: string,
  prefix: string,
  app: string,
  extra?: (label: string) => string | null,
): Rule {
  const note = new RegExp(`^\\[\\[${prefix}:\\s*([\\s\\S]*?)\\s*\\]\\]$`);
  const rule: Rule = {
    id,
    severity: 'info',
    run: ({ doc }) => {
      const found: LintDiagnostic[] = [];
      for (const region of doc.regions) {
        if (region.kind !== 'note' || !region.closed) continue;
        const match = note.exec(doc.source.slice(region.span.from, region.span.to));
        if (!match) continue;
        const label = (match[1] ?? '').replace(/\s+/g, ' ');
        found.push({
          ruleId: rule.id,
          severity: rule.severity,
          span: { ...region.span },
          message:
            extra?.(label) ??
            `This came in from ${app} as “${label}”. Check it, then delete the note.`,
        });
      }
      return found;
    },
  };
  return rule;
}

/**
 * highland-note (Imports, Call 19): an import from Highland (`@drafter/archive`'s `fromHighland`)
 * names the file's other entries, which it didn't bring in, in one `[[highland: …]]` note at the
 * script's end.
 */
export const highlandNote: Rule = importNote('highland-note', 'highland', 'Highland');
