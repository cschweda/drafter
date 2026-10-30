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
  // Read by slicing, not a regex: a lazy match beside `\s*` backtracks on a long run of spaces.
  const open = `[[${prefix}:`;
  const rule: Rule = {
    id,
    severity: 'info',
    run: ({ doc }) => {
      const found: LintDiagnostic[] = [];
      for (const region of doc.regions) {
        if (region.kind !== 'note' || !region.closed) continue;
        const text = doc.source.slice(region.span.from, region.span.to);
        if (!text.startsWith(open) || !text.endsWith(']]')) continue;
        const label = text
          .slice(open.length, -2)
          .split(/\s+/)
          .filter((word) => word !== '')
          .join(' ');
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

/**
 * osf-note (Imports, Call 20): an import from Fade In (`@drafter/archive`'s `fromFadeIn`, through
 * `@drafter/fdx`'s `fromOsf`) keeps a paragraph style or element Drafter has no element for as
 * action with an `[[osf: Name]]` note, and a scene number Fountain can't hold as one.
 */
export const osfNote: Rule = importNote(
  'osf-note',
  'osf',
  'Fade In',
  (label) =>
    `This came in from Fade In as “${label}”, which Drafter has no element for. Check it, then delete the note.`,
);
