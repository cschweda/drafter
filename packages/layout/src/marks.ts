import type { Layout, LayoutLine, Page } from './types';

/** What changed, in source offsets: spans of changed text, and gaps where text was cut. */
export interface Marks {
  spans: Array<{ from: number; to: number; set: string }>;
  gaps: Array<{ at: number; set: string }>;
}

/** The part of a row that can carry a mark: it prints source text. */
const prints = (line: LayoutLine) => line.span.to > line.span.from;

/**
 * Returns a layout whose printed lines carry `mark` where a span meets them (they share a
 * character) or where a gap lands (the first printed line at or after its offset, else the last
 * printed line). The input is not changed; pages nothing touched are shared.
 */
export function applyMarks(layout: Layout, marks: Marks): Layout {
  // Where each gap lands, by "page:line" of the row that holds the printed line.
  const gapSets = new Map<string, string>();
  const rows: Array<{ page: number; line: number; span: LayoutLine['span'] }> = [];
  layout.pages.forEach((page, pi) => {
    page.lines.forEach((line, li) => {
      if (prints(line)) rows.push({ page: pi, line: li, span: line.span });
    });
  });
  for (const gap of marks.gaps) {
    const hit = rows.find((row) => row.span.from >= gap.at) ?? rows[rows.length - 1];
    if (hit) gapSets.set(`${hit.page}:${hit.line}`, gap.set);
  }
  const meets = (line: LayoutLine): string | undefined => {
    if (!prints(line)) return undefined;
    return marks.spans.find((s) => line.span.from < s.to && s.from < line.span.to)?.set;
  };
  const pages = layout.pages.map((page, pi): Page => {
    let lines: LayoutLine[] | undefined;
    page.lines.forEach((line, li) => {
      const left = meets(line) ?? gapSets.get(`${pi}:${li}`);
      const right = line.right ? meets(line.right) : undefined;
      if (left === undefined && right === undefined) return;
      const next: LayoutLine = { ...line };
      if (left !== undefined) next.mark = { set: left };
      if (right !== undefined && line.right) next.right = { ...line.right, mark: { set: right } };
      lines ??= page.lines.slice();
      lines[li] = next;
    });
    return lines ? { ...page, lines } : page;
  });
  return { ...layout, pages };
}
