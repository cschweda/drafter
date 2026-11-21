import type { Layout } from '@drafter/layout';
import type { LockedPage } from './types';

/** How many line breaks come before `at` in `text`: the 0-based line index of `at`. */
function lineIndexOf(text: string, at: number): number {
  let line = 0;
  for (let i = text.indexOf('\n'); i !== -1 && i < at; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

/**
 * The page map a lock records: for each body page, the source line of its first printed line
 * (0-based, in `text`, the text that was laid out), how far into that line the page's first
 * character is, and how many printed lines of the same block, from that source line, came before
 * it on earlier pages. Labelled by page number.
 *
 * The character is where the page starts. The count is for v0.27.1 and earlier, which read
 * nothing else: for a page that starts inside a printed line they start it at the next line.
 */
export function pageMapOf(layout: Layout, text: string): LockedPage[] {
  const out: LockedPage[] = [];
  const seen: Array<{ blockIndex: number; from: number }> = [];
  for (const page of layout.pages) {
    if (page.number === 0) continue;
    const first = page.lines.find((line) => line.blockIndex >= 0);
    if (first) {
      const at = first.span.from === 0 ? 0 : text.lastIndexOf('\n', first.span.from - 1) + 1;
      const printed = seen.filter(
        (s) => s.blockIndex === first.blockIndex && s.from >= at && s.from < first.span.from,
      ).length;
      const char = first.span.from - at;
      out.push({ label: String(page.number), line: lineIndexOf(text, at), printed, char });
    }
    for (const line of page.lines)
      if (line.blockIndex >= 0) seen.push({ blockIndex: line.blockIndex, from: line.span.from });
  }
  return out;
}
