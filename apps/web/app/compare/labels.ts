import type { ChangeStop, GapMark } from '@drafter/compare';

// What Compare calls a change (Phase 2 design §11.2): a row of the Changes list and what Next
// change says ("Page 12, INT. HALL: 2 lines changed"), and a removed-lines marker's name.

/**
 * A stop in a document drawn as lines, not pages (a Markdown document, or a script whose layout
 * failed, Call 20): `line` is the newer text's line, counting from 1.
 */
export interface LineStop {
  change: number;
  kind: ChangeStop['kind'];
  line: number;
  lines: number;
}

/** "2 lines changed", "1 line added", "3 lines removed", "1 line changed that doesn’t print". */
function counted(kind: ChangeStop['kind'], lines: number): string {
  const n = `${lines} ${lines === 1 ? 'line' : 'lines'}`;
  if (kind === 'unprinted') return `${n} changed that ${lines === 1 ? 'doesn’t' : 'don’t'} print`;
  return `${n} ${kind}`;
}

/**
 * "Page 12, INT. HALL: 2 lines changed"; "Page 3: 1 line added" with no scene; "Title page: …" for
 * the title page (page 0). A line stop has no page: "INT. HALL: 2 lines changed" in Compare's
 * Changes view, or "Line 40: 2 lines changed" before the first heading.
 */
export function stopLabel(stop: ChangeStop | LineStop, heading: string | null): string {
  const count = counted(stop.kind, stop.lines);
  if ('line' in stop) return heading ? `${heading}: ${count}` : `Line ${stop.line}: ${count}`;
  const page = stop.page === 0 ? 'Title page' : `Page ${stop.page}`;
  return `${heading ? `${page}, ${heading}` : page}: ${count}`;
}

const hasText = (line: string) => line.trim() !== '';

/**
 * A gap's lines as its box shows them: without the blank lines before the first line with text and
 * after the last; one blank line when it holds nothing else.
 */
export function gapLines(lines: readonly string[]): string[] {
  const first = lines.findIndex(hasText);
  if (first < 0) return [''];
  return lines.slice(first, lines.findLastIndex(hasText) + 1);
}

/**
 * A gap's button: "3 lines removed", "1 line changed that doesn’t print", counting the lines with
 * text; a gap of blank lines only is "a blank line removed" ("2 blank lines added" when new).
 */
export function gapName(gap: Pick<GapMark, 'kind' | 'lines'>): string {
  const lines = gap.lines.filter(hasText).length;
  if (lines === 0) {
    const n = gap.lines.length;
    const which = gap.kind === 'removed' ? 'removed' : 'added';
    return n <= 1 ? `a blank line ${which}` : `${n} blank lines ${which}`;
  }
  return counted(gap.kind === 'removed' ? 'removed' : 'unprinted', lines);
}
