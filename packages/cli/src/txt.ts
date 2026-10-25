import type { Layout, LayoutLine } from '@drafter/layout';
import type { Template } from '@drafter/templates';

/** One page as rows of cells, one code point per cell; columns count from the paper's left edge. */
class Grid {
  readonly #rows: string[][];

  constructor(height: number) {
    this.#rows = Array.from({ length: height }, () => []);
  }

  put(row: number, col: number, text: string) {
    const cells = this.#rows[row];
    if (!cells) return;
    let at = col;
    for (const char of text) {
      if (at >= 0) {
        while (cells.length < at) cells.push(' ');
        cells[at] = printable(char);
      }
      at++;
    }
  }

  /** The rows with trailing spaces trimmed, and the blank rows at the bottom left off. */
  toString(): string {
    const lines = this.#rows.map((cells) => cells.join('').trimEnd());
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines.map((line) => `${line}\n`).join('');
  }
}

/** A control character would break the grid, so it prints as a space, keeping its column. */
const printable = (char: string) => {
  const c = char.charCodeAt(0);
  return c < 0x20 || c === 0x7f || c === 0x85 || c === 0x2028 || c === 0x2029 ? ' ' : char;
};

const textOf = (line: LayoutLine) => line.runs.map((run) => run.text).join('');

/**
 * A layout as fixed-width text (technical design §6.4): each page the full
 * width and height of the template's grid, margins included, with lines,
 * page numbers, scene numbers, header, and footer at their columns. Pages are
 * separated by form feeds; type styles are dropped.
 */
export function renderText(layout: Layout, template: Template): string {
  const { page: spec } = template;
  const { left, top } = spec.margin;
  return layout.pages
    .map((page) => {
      const grid = new Grid(spec.height);
      page.lines.forEach((row, k) => {
        for (const part of row.right ? [row, row.right] : [row]) {
          grid.put(top + k, left + part.col, textOf(part));
        }
      });
      if (page.pageNumber) {
        grid.put(page.pageNumber.line, left + page.pageNumber.col, page.pageNumber.text);
      }
      for (const { line, text } of page.sceneNumbersLeft) {
        grid.put(top + line, left + template.sceneNumbers.left, text);
      }
      for (const { line, text } of page.sceneNumbersRight) {
        grid.put(top + line, left + template.sceneNumbers.right, text);
      }
      if (page.header) grid.put(spec.numbering.line, left, page.header);
      if (page.footer) grid.put(spec.height - 1 - spec.numbering.line, left, page.footer);
      return grid.toString();
    })
    .join('\f');
}
