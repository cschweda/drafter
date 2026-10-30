import type { Layout, LayoutLine, LayoutRun, Page } from '@drafter/layout';
import { PAPER_POINTS, type Template } from '@drafter/templates';
import { el, escapeHtml } from './escape';
import { colClass, gridRules, pageClass, pageRules, paperRule, rowClass } from './rules';

/**
 * The Pages view: its markup, and the generated rules for the rows, columns, and page sizes it
 * uses, which go into the file's one `<style>` (`ShellInput.rules`), since the CSP allows no style
 * attribute.
 */
export interface PagesHtml {
  html: string;
  rules: string;
}

const textOf = (line: LayoutLine) => line.runs.map((run) => run.text).join('');

/** A line with nothing to see or read. The layout leaves these in as spacing; the page doesn't draw them. */
const isBlank = (line: LayoutLine) => textOf(line).trim() === '';

/** The characters `escapeHtml` keeps that a line can't: each would move the rest of it off the grid. */
const OFF_GRID = /[\t\n\u2028\u2029]/g;

/**
 * Text as the page prints it, before escaping: a tab, a line feed, and a line or paragraph
 * separator each print as one space, as on the Script tab and in the PDF, since each takes one
 * column in the layout. (`escapeHtml` turns the other control characters into spaces.)
 */
const printable = (text: string) => text.replace(OFF_GRID, ' ');

/** A line to draw, and the row of the page's body it stands on. */
interface Part {
  line: LayoutLine;
  row: number;
}

/**
 * A title page's lines in the order of their fields in the source, each field's lines together,
 * as the Script tab reads them (`@drafter/render-html`'s page.ts, which says why): the draft date
 * shares rows with the contact block, and every line of a title page is from no block, so the
 * lines are sorted by where each starts in the source. A sort is stable, so lines that share a
 * span keep their places.
 */
function titleOrder(lines: readonly LayoutLine[]): Part[] {
  const order: Part[] = [];
  lines.forEach((line, row) => {
    if (!isBlank(line)) order.push({ line, row });
    if (line.right && !isBlank(line.right)) order.push({ line: line.right, row });
  });
  return order.sort((a, b) => a.line.span.from - b.line.span.from);
}

/**
 * The page's lines in the order they should be read, as the Script tab reads them: the order they
 * stand in, except that the right part of a row goes after the left lines of its run, so the left
 * speech of dual dialogue reads before the right one. A run goes on while the next line is from a
 * block before the right part's, which keeps the longer left column's last lines with the rest.
 */
function readingOrder(lines: readonly LayoutLine[]): Part[] {
  if (lines.some((line) => line.synthetic === 'title' || line.right?.synthetic === 'title')) {
    return titleOrder(lines);
  }
  const order: Part[] = [];
  let right: Part[] = [];
  let rightBlock: number | null = null; // the right column's first block
  const flush = () => {
    for (const part of right) order.push(part);
    right = [];
    rightBlock = null;
  };
  lines.forEach((line, row) => {
    if (!isBlank(line)) {
      const continues = rightBlock !== null && line.blockIndex >= 0 && line.blockIndex < rightBlock;
      if (right.length > 0 && !continues) flush();
      order.push({ line, row });
    }
    const second = line.right;
    if (second && !isBlank(second)) {
      right.push({ line: second, row });
      if (rightBlock === null && second.blockIndex >= 0) rightBlock = second.blockIndex;
    }
  });
  flush();
  return order;
}

/** The rows and columns the pages use, for `gridRules`, and the classes that place a line. */
class Grid {
  readonly rows = new Set<number>();
  readonly cols = new Set<number>();

  place(row: number, col: number): string {
    this.rows.add(row);
    this.cols.add(col);
    return `ln ${rowClass(row)} ${colClass(col)}`;
  }
}

/**
 * A run as markup: its escaped text, in a span whose classes give its styles when it has any. As
 * the PDF draws only a run's text without the spaces around it, the span holds the trimmed text
 * and the spaces stand outside it, so an underline starts and ends where the PDF's does; the
 * columns are the same either way.
 */
function runHtml(run: LayoutRun): string {
  const text = printable(run.text);
  if (text === '') return '';
  const styles = [run.bold && 'b', run.italic && 'i', run.underline && 'u'].filter(Boolean);
  if (styles.length === 0) return escapeHtml(text);
  const start = text.length - text.trimStart().length;
  const end = text.trimEnd().length;
  if (end <= start) return escapeHtml(text);
  return (
    escapeHtml(text.slice(0, start)) +
    el('span', { class: styles.join(' ') }, escapeHtml(text.slice(start, end))) +
    escapeHtml(text.slice(end))
  );
}

/**
 * The blocks the band links to on one page, by the body row each starts on (`layout.index`):
 * each gets `id="b-<block>"` there, as a link target.
 */
type Marks = Map<number, number[]>;

/**
 * One printed line at its row and column, with a band target's id when the line is the first of
 * a block the band links to. `(MORE)` is the page's, not the script's: it is hidden from a screen
 * reader.
 */
function lineHtml({ line, row }: Part, template: Template, grid: Grid, id?: string): string {
  const { top, left } = template.page.margin;
  return el(
    'div',
    {
      id,
      class: grid.place(top + row, left + line.col),
      'aria-hidden': line.synthetic === 'more' ? 'true' : undefined,
    },
    line.runs.map(runHtml).join(''),
  );
}

/**
 * The page's text in reading order. The lines of a block whose role the template makes a heading
 * (a scene heading; a play's act and scene) are wrapped in one element with the heading role at
 * its level, so a reader can move by headings; the wrapper isn't positioned, so its lines keep
 * their places on the page.
 *
 * A band target goes on the block's own first line. A block that prints nothing there (a
 * screenplay's section, which maps to the next printed line, perhaps another block's) gets an
 * empty marker at that row instead, so every target is there once.
 */
function bodyHtml(page: Page, template: Template, grid: Grid, marks: Marks | undefined): string {
  const out: string[] = [];
  // The heading being gathered: its block, its level, and its lines so far.
  let block = -1;
  let level = 0;
  let lines = '';
  const close = () => {
    if (lines !== '') out.push(el('div', { role: 'heading', 'aria-level': level }, lines));
    lines = '';
    block = -1;
  };
  for (const part of readingOrder(page.lines)) {
    const { line } = part;
    const heading = line.blockIndex >= 0 ? template.roles[line.role]?.heading : undefined;
    let id: string | undefined;
    const here = page.lines[part.row] === line ? marks?.get(part.row) : undefined;
    const own = here?.indexOf(line.blockIndex) ?? -1;
    if (here && own >= 0) {
      id = `b-${line.blockIndex}`;
      here.splice(own, 1);
    }
    const markup = lineHtml(part, template, grid, id);
    if (heading === undefined || line.blockIndex !== block) close();
    if (heading === undefined) {
      out.push(markup);
    } else {
      block = line.blockIndex;
      level = heading;
      lines += markup;
    }
  }
  close();
  const { top, left } = template.page.margin;
  for (const [row, blocks] of marks ?? []) {
    for (const block of blocks) {
      out.push(el('span', { id: `b-${block}`, class: grid.place(top + row, left) }));
    }
  }
  return out.join('');
}

/**
 * The page number, the scene numbers, the header, and the footer, at the rows and columns
 * `renderPdf` draws them: a page number on its own line from the top edge, at its column from the
 * left margin; scene numbers on their heading's row, at the template's columns from the left
 * margin; the header on the page number's line and the footer as far from the bottom edge, both
 * at the left margin. Each is hidden from a screen reader, which has the "Page N" marker instead.
 */
function furnitureHtml(page: Page, template: Template, grid: Grid): string {
  const { height, margin, numbering } = template.page;
  const add = (kind: string, row: number, col: number, text: string) =>
    el(
      'div',
      { class: grid.place(row, col), 'data-furniture': kind, 'aria-hidden': 'true' },
      escapeHtml(printable(text)),
    );
  let out = '';
  if (page.pageNumber) {
    const { text, line, col } = page.pageNumber;
    out += add('number', line, margin.left + col, text);
  }
  for (const { line, text } of page.sceneNumbersLeft) {
    out += add('scene', margin.top + line, margin.left + template.sceneNumbers.left, text);
  }
  for (const { line, text } of page.sceneNumbersRight) {
    out += add('scene', margin.top + line, margin.left + template.sceneNumbers.right, text);
  }
  if (page.header) out += add('header', numbering.line, margin.left, page.header);
  if (page.footer) out += add('footer', height - 1 - numbering.line, margin.left, page.footer);
  return out;
}

/**
 * The exact pages (design §3.1 and §4.2), as the PDF prints them and the Script tab draws them:
 * `<section class="pages">` holding a `div.page` card per layout page, sized by the template's
 * grid, each starting with a visually hidden "Page N" ("Title page" for the title page), then its
 * lines, each at its row and column by the `ln rN cN` classes, then its furniture. A layout with
 * no pages is one blank page, as the PDF is. Every character of text is escaped; nothing is
 * reflowed. The rules for the classes used come back beside the markup.
 *
 * `targets` are the blocks the band links to: each gets `id="b-<block>"` at its first printed line
 * (`layout.index`), which a plain `#b-<block>` link reaches with no script.
 */
export function pagesHtml(
  layout: Layout,
  template: Template,
  targets: Iterable<number> = [],
): PagesHtml {
  const { width, height } = template.page;
  const size = pageClass(width, height);
  const grid = new Grid();
  const pages: readonly Page[] =
    layout.pages.length > 0
      ? layout.pages
      : [{ number: 1, lines: [], sceneNumbersLeft: [], sceneNumbersRight: [] }];
  const marks = new Map<number, Marks>();
  for (const block of new Set(targets)) {
    const at = layout.index[block];
    if (!at) continue;
    const page = marks.get(at.page) ?? new Map<number, number[]>();
    marks.set(at.page, page);
    page.set(at.line, [...(page.get(at.line) ?? []), block]);
  }
  const cards = pages.map((page) =>
    el(
      'div',
      { class: `page ${size}` },
      el('span', { class: 'vh' }, page.number === 0 ? 'Title page' : `Page ${page.number}`) +
        bodyHtml(page, template, grid, marks.get(page.number)) +
        furnitureHtml(page, template, grid),
    ),
  );
  const paper = PAPER_POINTS[template.page.paper];
  const rules = [
    gridRules(grid.rows, grid.cols),
    pageRules([[width, height]]),
    paperRule(paper.width, paper.height),
  ]
    .filter(Boolean)
    .join('\n');
  return { html: el('section', { class: 'pages' }, cards.join('')), rules };
}
