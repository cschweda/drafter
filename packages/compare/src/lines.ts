/** A text's lines, without their line breaks, and where each starts. */
export interface SourceLines {
  lines: string[];
  /** `starts[i]` is the offset of line `i`; a text ending in a line break has a final `''` line. */
  starts: number[];
}

/** Splits a text into lines. `\n` and `\r\n` both end a line, and the break is in neither line. */
export function splitLines(text: string): SourceLines {
  const lines: string[] = [];
  const starts: number[] = [];
  let start = 0;
  for (;;) {
    const lf = text.indexOf('\n', start);
    starts.push(start);
    if (lf < 0) {
      lines.push(text.slice(start));
      return { lines, starts };
    }
    lines.push(text.slice(start, lf > start && text[lf - 1] === '\r' ? lf - 1 : lf));
    start = lf + 1;
  }
}
