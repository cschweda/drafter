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
 * the title page (page 0); "Line 40: 2 lines changed" for a line stop, which has no scene.
 */
export function stopLabel(stop: ChangeStop | LineStop, heading: string | null): string {
  const count = counted(stop.kind, stop.lines);
  if ('line' in stop) return `Line ${stop.line}: ${count}`;
  const page = stop.page === 0 ? 'Title page' : `Page ${stop.page}`;
  return `${heading ? `${page}, ${heading}` : page}: ${count}`;
}

/** A gap's button: "3 lines removed", "1 line changed that doesn’t print". */
export function gapName(gap: Pick<GapMark, 'kind' | 'lines'>): string {
  return counted(gap.kind === 'removed' ? 'removed' : 'unprinted', gap.lines.length);
}
