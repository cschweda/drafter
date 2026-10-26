import type { LayoutLine, LayoutRun, Page } from '@drafter/layout';
import type { Role, RoleStyle, Template } from '@drafter/templates';
import { type SpeechRoles, speechRoles } from './roles';

/** A line to draw, and the row of the page's body it stands on. */
interface Part {
  line: LayoutLine;
  row: number;
}

const textOf = (line: LayoutLine) => line.runs.map((run) => run.text).join('');

/** A line with nothing to see or read. The layout leaves these in as spacing; the page doesn't draw them. */
const isBlank = (line: LayoutLine) => textOf(line).trim() === '';

/**
 * Text as the page prints it. A browser draws a control character at the wrong
 * width, which would shift the rest of its line off the grid, so each prints as
 * a space, and so does a line or paragraph separator, as in the PDF and the
 * text export.
 */
function printable(text: string): string {
  if (!/[^\x20-\x7e]/.test(text)) return text;
  let out = '';
  for (const char of text) {
    const c = char.charCodeAt(0);
    out += c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 ? ' ' : char;
  }
  return out;
}

/** A role as a class name. A template's role names are free text, and a space would make two classes. */
const roleClass = (role: Role) => `role-${role.replace(/\s+/g, '-')}`;

function place(el: HTMLElement, row: number, col: number) {
  el.style.setProperty('--row', String(row));
  el.style.setProperty('--col', String(col));
}

/**
 * A title page's lines in the order of their fields in the source, each field's
 * lines together. The layout puts the contact block bottom left and the draft
 * date bottom right, level with the contact block's last line, so the date
 * shares rows with the contact block, as the right part of a row, or as the
 * row's only line when it is the longer. Every line of a title page is from no
 * block, so there is nothing to tell the two columns apart as dual dialogue's
 * are, and reading by rows would weave a wrapped date into the contact block.
 * A field's lines have rising spans and no two fields' spans meet, so sorting
 * by where a line starts in the source keeps each field whole.
 */
function titleOrder(lines: readonly LayoutLine[]): Part[] {
  const order: Part[] = [];
  lines.forEach((line, row) => {
    if (!isBlank(line)) order.push({ line, row });
    if (line.right && !isBlank(line.right)) order.push({ line: line.right, row });
  });
  // A sort is stable, so lines that share a span (a field with no source text) keep their places.
  return order.sort((a, b) => a.line.span.from - b.line.span.from);
}

/**
 * The page's lines in the order they should be read. That is the order they
 * stand in, except that the right part of a row goes after the left lines of
 * the run it belongs to, so the left speech of dual dialogue reads before the
 * right one. A run goes on while the next line is from a block before the
 * right part's, which is how the longer left column's last lines, standing
 * alone on their rows, stay with the rest of it. A title page is read by
 * field instead (`titleOrder`).
 */
function readingOrder(lines: readonly LayoutLine[]): Part[] {
  if (lines.some((line) => line.synthetic === 'title' || line.right?.synthetic === 'title')) {
    return titleOrder(lines);
  }
  const order: Part[] = [];
  let right: Part[] = [];
  // The first block of the right column, which the left column's blocks come before.
  let rightBlock: number | null = null;
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

function runElement(doc: Document, run: LayoutRun): HTMLElement {
  const el = doc.createElement('span');
  const classes = [
    run.bold && 'b',
    run.italic && 'i',
    run.underline && 'u',
    run.synthetic && 'added',
  ];
  const names = classes.filter(Boolean).join(' ');
  if (names) el.className = names;
  el.textContent = printable(run.text);
  return el;
}

function lineElement(doc: Document, part: Part, template: Template): HTMLElement {
  const { line, row } = part;
  const { top, left } = template.page.margin;
  const el = doc.createElement('div');
  el.className = `drafter-line ${roleClass(line.role)}`;
  place(el, top + row, left + line.col);
  el.dataset.from = String(line.span.from);
  el.dataset.to = String(line.span.to);
  if (line.synthetic === 'more') el.setAttribute('aria-hidden', 'true');
  for (const run of line.runs) {
    if (run.text !== '') el.append(runElement(doc, run));
  }
  return el;
}

/** Two lines are of one unit when they print one block, or, with no block, one kind of synthetic line. */
const sameUnit = (a: LayoutLine, b: LayoutLine) =>
  a.blockIndex === b.blockIndex && a.role === b.role && a.synthetic === b.synthetic;

/** A speech's cue while its lines are drawn: the group it names, and the ids of its lines. */
interface Cue {
  group: HTMLElement;
  ids: string[];
}

function speechElement(doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'drafter-speech';
  el.setAttribute('role', 'group');
  return el;
}

function blockElement(doc: Document, line: LayoutLine, template: Template): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'drafter-block';
  el.dataset.block = String(line.blockIndex);
  const style: RoleStyle | undefined = template.roles[line.role];
  if (style?.heading !== undefined) {
    el.setAttribute('role', 'heading');
    el.setAttribute('aria-level', String(style.heading));
  }
  return el;
}

/**
 * The page's text: blocks of lines, with each speech's blocks in a group
 * labelled by its cue. A synthetic line has no block, so it stands in a speech
 * or on the page by itself.
 */
function drawBody(
  doc: Document,
  root: HTMLElement,
  page: Page,
  template: Template,
  roles: SpeechRoles,
) {
  let speech: HTMLElement | null = null; // the group the next line of speech joins
  let cue: Cue | null = null; // the cue being drawn
  let cueLines = 0;
  let unit: LayoutLine | null = null;
  let into: HTMLElement = root; // where the unit's lines go

  // A speech is named by every line of its cue, since a long name wraps. The names are
  // joined once, when the cue is done: joining at each line would be quadratic in a cue's lines.
  const name = ({ group, ids }: Cue) => group.setAttribute('aria-labelledby', ids.join(' '));

  for (const part of readingOrder(page.lines)) {
    const { line } = part;
    if (unit === null || !sameUnit(unit, line)) {
      if (cue) name(cue);
      cue = null;
      unit = line;
      let parent = root;
      if (roles.cue.has(line.role)) {
        speech = speechElement(doc);
        root.append(speech);
        cue = { group: speech, ids: [] };
        parent = speech;
      } else if (speech && (line.synthetic === 'more' || roles.speech.has(line.role))) {
        parent = speech;
      } else {
        speech = null;
      }
      // (MORE) is the last line of its speech; the speech goes on in a group of its own.
      if (line.synthetic === 'more') speech = null;

      if (line.blockIndex >= 0) {
        into = blockElement(doc, line, template);
        parent.append(into);
      } else {
        into = parent;
      }
    }
    const el = lineElement(doc, part, template);
    if (cue) {
      // Dual dialogue's two cues share a row, so the ids count lines rather than rows.
      el.id = `drafter-cue-${page.number}-${cueLines++}`;
      cue.ids.push(el.id);
    }
    into.append(el);
  }
  if (cue) name(cue);
}

/**
 * Page numbers, scene numbers, the header, and the footer: lines of their own,
 * hidden from screen readers, at the positions the text export uses.
 */
function drawFurniture(doc: Document, root: HTMLElement, page: Page, template: Template) {
  const { height, margin, numbering } = template.page;
  const add = (kind: string, row: number, col: number, text: string) => {
    const el = doc.createElement('div');
    el.className = `drafter-line drafter-furniture drafter-${kind}`;
    el.setAttribute('aria-hidden', 'true');
    place(el, row, col);
    el.textContent = printable(text);
    root.append(el);
  };
  if (page.pageNumber) {
    add(
      'page-number',
      page.pageNumber.line,
      margin.left + page.pageNumber.col,
      page.pageNumber.text,
    );
  }
  for (const { line, text } of page.sceneNumbersLeft) {
    add('scene-number', margin.top + line, margin.left + template.sceneNumbers.left, text);
  }
  for (const { line, text } of page.sceneNumbersRight) {
    add('scene-number', margin.top + line, margin.left + template.sceneNumbers.right, text);
  }
  if (page.header) add('header', numbering.line, margin.left, page.header);
  if (page.footer) add('footer', height - 1 - numbering.line, margin.left, page.footer);
}

/**
 * One page as DOM (technical design §6.1 and §13): a `div.drafter-page` with a
 * visually hidden marker, then the page's lines, each absolutely positioned by
 * its row and column, and then the furniture. Text reaches the page only
 * through `textContent`.
 */
export function buildPage(
  doc: Document,
  page: Page,
  template: Template,
  roles: SpeechRoles = speechRoles(template),
): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'drafter-page';
  el.dataset.page = String(page.number);
  el.style.setProperty('--cols', String(template.page.width));
  el.style.setProperty('--rows', String(template.page.height));

  const marker = doc.createElement('span');
  marker.className = 'drafter-sr-only';
  marker.textContent = page.number === 0 ? 'Title page' : `Page ${page.number}`;
  el.append(marker);

  drawBody(doc, el, page, template, roles);
  drawFurniture(doc, el, page, template);
  return el;
}
