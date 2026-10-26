import type { Line, TextChange } from '@drafter/fountain';
import type { LintDiagnostic, Rule } from '../types';

// manual-contd (technical design §9): a speech that continues gets its (CONT'D) from the
// layout (§5.4), so typing one is never needed.

const CONTD = /\(\s*CONT['’]?D\s*\)/i;
const EACH_CONTD = new RegExp(CONTD, 'gi');

const isSpaceOrTab = (ch: string) => ch === ' ' || ch === '\t';

/**
 * The changes that take every (CONT'D) out of a cue line, each with the spaces and tabs before
 * it. Null when they can't be made cleanly:
 * - The cue's printed text isn't one stretch of the source, because a note or a boneyard sits
 *   inside it. Positions in the text no longer match the source, and a cut could take the note.
 * - The cue holds a carriage return of its own. Cutting next to one can join it to a line feed
 *   and change the file's line endings.
 */
function removals(line: Line): TextChange[] | null {
  // A cue line prints as a single run, from its first printed character to its last.
  const [run, ...more] = line.inline;
  if (!run || more.length > 0 || run.span.to - run.span.from !== run.text.length) return null;
  if (run.text.includes('\r')) return null;
  const changes: TextChange[] = [];
  for (const match of run.text.matchAll(EACH_CONTD)) {
    let from = match.index;
    while (from > 0 && isSpaceOrTab(run.text.charAt(from - 1))) from--;
    changes.push({
      from: run.span.from + from,
      to: run.span.from + match.index + match[0].length,
      insert: '',
    });
  }
  return changes.length > 0 ? changes : null;
}

export const manualContd: Rule = {
  id: 'manual-contd',
  severity: 'info',
  run: ({ doc }) => {
    const found: LintDiagnostic[] = [];
    for (const block of doc.blocks) {
      if (block.kind !== 'character') continue;
      const { name, extension } = block.sem;
      if (extension === null || !CONTD.test(extension)) continue;
      const line = block.lines[0] as Line;
      const diagnostic: LintDiagnostic = {
        ruleId: manualContd.id,
        severity: manualContd.severity,
        span: { ...line.span },
        message: `Drafter adds (CONT'D) itself when a speech continues, so there's no need to type it after ${name}.`,
      };
      const changes = removals(line);
      if (changes) diagnostic.fix = { title: "Remove (CONT'D)", changes };
      found.push(diagnostic);
    }
    return found;
  },
};
