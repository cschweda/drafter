import {
  type Block,
  type Doc,
  type InlineRun,
  inlineRuns,
  type TitlePage,
} from '@drafter/fountain';
import { type SceneNumbering, sceneNumbersFor, titleKeyPrints } from '@drafter/layout';
import { type KeyedNote, readNote } from '@drafter/notes';
import { type Role, resolveRole, type Template } from '@drafter/templates';
import { escapeInline, guardLine, joinLines, markdownText, textEnd, textStart } from './escape';
import type { SceneIndex } from './types';

// Export as Markdown (Calls 25 to 34): the whole script as CommonMark, for any Markdown viewer, a
// notes app, or a chat. The title page's title as `#`, sections and scene headings as headings,
// a speech as a bold name and its lines, and the rest as paragraphs, numbered as the PDF numbers
// it. One pass over the blocks, so linear in the script.

export interface ScriptMarkdownOptions {
  /** Which scene headings get a number, as the PDF numbers them (Call 26). */
  sceneNumbers: SceneNumbering;
  /**
   * Notes and synopses as quotes where they stand, or left out as the PDF leaves them (Call 28).
   * The title page is cut before, with `titlePageFor` (Call 27).
   */
  notes: 'leave-out' | 'include';
}

/** The deepest Markdown heading; a deeper one is written as a bold paragraph. */
const MAX_LEVEL = 6;

/** What the second speech of dual dialogue says it is (Call 31). */
const AT_THE_SAME_TIME = ' *(at the same time)*';

/** The blocks a speech holds after its name, as `paginate` groups them. */
const SPEECH_PARTS = new Set(['parenthetical', 'dialogue', 'lyric']);

/** The roles written in italics: a play's stage directions, parentheticals, and lyrics. */
const ITALIC_ROLES = new Set<Role>(['stage_direction', 'parenthetical', 'lyric']);

/** No blank line between this block and the one before it. */
const adjacent = (block: Block) => block.leading.split('\n').length === 2;

type Style = Pick<InlineRun, 'text' | 'bold' | 'italic' | 'underline'>;

const plainRun = (text: string): Style => ({ text, bold: false, italic: false, underline: false });

// CommonMark's classes for emphasis: Unicode whitespace, and punctuation or symbols. Parsers
// differ on a character outside the BMP: micromark (the app's) reads it as two UTF-16 code units,
// neither one punctuation, while others read the code point. A mark is written only where both
// readings agree that it opens or closes.
const WHITESPACE = /\s/u;
const PUNCTUATION = /[\p{P}\p{S}]/u;

/** The code unit and the code point at one edge of a string, or null at a line's edge. */
type Edge = { unit: string; point: string } | null;

function firstOf(s: string): Edge {
  const point = s.codePointAt(0);
  return point === undefined ? null : { unit: s.charAt(0), point: String.fromCodePoint(point) };
}
function lastOf(s: string): Edge {
  if (s === '') return null;
  const unit = s.charAt(s.length - 1);
  const code = unit.charCodeAt(0);
  const pair = code >= 0xdc00 && code <= 0xdfff && s.length > 1;
  return { unit, point: pair ? s.slice(-2) : unit };
}

/** Punctuation in either reading. */
const punctuation = (edge: Edge) =>
  edge !== null && (PUNCTUATION.test(edge.unit) || PUNCTUATION.test(edge.point));
/** Whitespace or punctuation in both readings; a line's edge counts as whitespace. */
const spaceOrPunct = (edge: Edge) =>
  edge === null || [edge.unit, edge.point].every((c) => WHITESPACE.test(c) || PUNCTUATION.test(c));

/** Runs with the same style, one after another, as one; and runs with no text left out. */
function merged(runs: readonly Style[]): Style[] {
  const out: Style[] = [];
  for (const source of runs) {
    // A carriage return alone ends a line in Markdown; within a line it can only be a space.
    const run = source.text.includes('\r')
      ? { ...source, text: source.text.replace(/\r/g, ' ') }
      : source;
    if (run.text === '') continue;
    const last = out.at(-1);
    if (
      last &&
      last.bold === run.bold &&
      last.italic === run.italic &&
      last.underline === run.underline
    ) {
      out[out.length - 1] = { ...last, text: last.text + run.text };
    } else out.push({ ...run });
  }
  return out;
}

/**
 * One line of styled runs as Markdown, its ends trimmed: bold `**`, italic `*`, both `***`, and
 * underline `<u>…</u>` (Call 32). Every run's text is escaped. Emphasis that CommonMark would not
 * read as emphasis where it stands (a mark against the text on one side and punctuation on the
 * other, or two runs' marks touching) is left off that run, so its text still comes through.
 */
function lineMarkdown(runs: readonly Style[], inHeading = false): string {
  const parts = merged(runs);
  // Trim the line's ends across its runs.
  while (parts.length > 0) {
    const first = parts[0] as Style;
    const text = first.text.slice(textStart(first.text));
    if (text !== '') {
      parts[0] = { ...first, text };
      break;
    }
    parts.shift();
  }
  while (parts.length > 0) {
    const last = parts.at(-1) as Style;
    const text = last.text.slice(0, textEnd(last.text));
    if (text !== '') {
      parts[parts.length - 1] = { ...last, text };
      break;
    }
    parts.pop();
  }

  // What a character means can hang on the next one, in this run or the next, so every run is
  // escaped as a stretch of the whole line.
  const line = parts.map((part) => part.text).join('');
  let out = '';
  /** The output so far ends with an emphasis closer of `*`. */
  let closedStars = false;
  let at = 0;
  for (let i = 0; i < parts.length; i++) {
    const run = parts[i] as Style;
    const from = at;
    const to = from + run.text.length;
    at = to;
    const stars = run.bold && run.italic ? '***' : run.bold ? '**' : run.italic ? '*' : '';
    let coreFrom = from;
    while (coreFrom < to && WHITESPACE.test(line[coreFrom] as string)) coreFrom++;
    let coreTo = to;
    while (coreTo > coreFrom && WHITESPACE.test(line[coreTo - 1] as string)) coreTo--;
    if ((stars === '' && !run.underline) || coreFrom === coreTo) {
      out += escapeInline(line, from, to);
      closedStars = false;
      continue;
    }
    const lead = line.slice(from, coreFrom);
    const trail = line.slice(coreTo, to);
    const text = escapeInline(line, coreFrom, coreTo);
    out += escapeInline(line, from, coreFrom);
    if (run.underline) out += '<u>';
    let useStars = stars !== '';
    if (useStars) {
      // Two runs' marks touching would read as one run of marks.
      const touching: boolean = closedStars && lead === '' && !run.underline;
      const opens = !punctuation(firstOf(text)) || spaceOrPunct(lastOf(out));
      // What follows the closer: `</u>`, the trailing space, or the next run's first character,
      // which is never an opener of `*` (that would touch this closer and be left off).
      const next = parts[i + 1];
      const after = run.underline
        ? firstOf('<')
        : trail !== ''
          ? firstOf(trail)
          : next === undefined
            ? null
            : next.underline && !/^\s/u.test(next.text)
              ? firstOf('<')
              : firstOf(escapeInline(line, to, Math.min(to + 2, line.length)));
      const closes = !punctuation(lastOf(text)) || spaceOrPunct(after);
      useStars = !touching && opens && closes;
    }
    out += useStars ? `${stars}${text}${stars}` : text;
    if (run.underline) out += '</u>';
    out += escapeInline(line, coreTo, to);
    closedStars = useStars && !run.underline && trail === '';
  }
  return guardLine(out, inHeading);
}

/** A line's runs as styles, forced bold or italic as its element is written. */
const styled = (runs: readonly InlineRun[], force: { bold?: boolean; italic?: boolean }) =>
  runs.map((run) => ({
    text: run.text,
    bold: run.bold || force.bold === true,
    italic: run.italic || force.italic === true,
    underline: run.underline,
  }));

/** A block's printed lines as Markdown lines: lines that hold only notes or boneyard print nothing. */
function blockLines(
  block: Block,
  force: { bold?: boolean; italic?: boolean } = {},
  wrap?: (runs: Style[]) => Style[],
): string[] {
  const lines: string[] = [];
  for (const line of block.lines) {
    if (line.transparent) continue;
    const runs = styled(line.inline, force);
    lines.push(lineMarkdown(wrap ? wrap(runs) : runs));
  }
  return lines;
}

/** A heading at `level`, or past the deepest level, a bold paragraph (Call 29). */
function heading(level: number, runs: readonly Style[]): string {
  if (level > MAX_LEVEL) return lineMarkdown(runs.map((run) => ({ ...run, bold: true })));
  const text = lineMarkdown(runs, true);
  return text === '' ? '' : `${'#'.repeat(level)} ${text}`;
}

/** Each of a block's lines as one line, joined by spaces: a heading holds one line. */
function oneLine(block: Block): Style[] {
  const runs: Style[] = [];
  for (const line of block.lines) {
    if (line.transparent) continue;
    if (runs.length > 0) runs.push(plainRun(' '));
    runs.push(...line.inline);
  }
  return runs;
}

/** Lines of Markdown as a quote: every line behind `> `. */
const quote = (text: string) =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

/** The title page (Call 27): the title as `#`, then each other key that prints, as a paragraph of its value. */
function titleParts(tp: TitlePage): string[] {
  const parts: string[] = [];
  const title = tp.fields.find((field) => field.key.trim().toLowerCase() === 'title');
  if (title) {
    const runs: Style[] = [];
    for (const line of title.runs) {
      if (line.every((run) => run.text.trim() === '')) continue;
      if (runs.length > 0) runs.push(plainRun(' '));
      runs.push(...line);
    }
    const text = heading(1, runs);
    if (text !== '') parts.push(text);
  }
  for (const field of tp.fields) {
    if (field === title || !titleKeyPrints(field.key)) continue;
    const text = joinLines(field.runs.map((runs) => lineMarkdown(runs)));
    if (text !== '') parts.push(text);
  }
  return parts;
}

/**
 * A note's head as the writer typed it: the text before the colon `readNote` read the head up to.
 * `Sam on "10:30": …` has its colon after the quote, which may hold colons of its own.
 */
function headText(inner: string, note: KeyedNote): string {
  let from = 0;
  if (note.head?.kind === 'person' && note.head.on !== null) {
    // The name holds no quote, so the first quote opens the head's, and the next one closes it.
    const open = inner.search(/["“]/u);
    from = open + 1 + inner.slice(open + 1).search(/["”]/u) + 1;
  }
  return inner.slice(0, inner.indexOf(':', from)).trim();
}

/**
 * A note as a quote, `> **Note:** text`, with its head when it has one (Call 28): read as the app
 * reads notes (Phase 2 design §5.3), so `[[Call at 10:30]]` has no head, and the head as typed.
 */
function noteMarkdown(inner: string): string {
  const note = readNote(inner);
  const body = markdownText(note.body);
  if (body === '') return '';
  if (note.head === null) return quote(`**Note:** ${body}`);
  const head = headText(inner, note);
  return quote(`**Note (${escapeInline(head)}):** ${body}`);
}

/**
 * The whole script as Markdown (Calls 25 to 34). Sections are headings one level below the title,
 * and scene headings one below the deepest section, numbered as `paginate` numbers them for
 * `options.sceneNumbers`. Notes and synopses are left out unless `options.notes` includes them; the
 * boneyard always is. UTF-8 text with LF line breaks, blocks a blank line apart, ending in one
 * line break.
 */
export function scriptMarkdown(
  doc: Doc,
  index: SceneIndex,
  template: Template,
  options: ScriptMarkdownOptions,
): string {
  const { blocks } = doc;
  const parts: string[] = doc.titlePage ? titleParts(doc.titlePage) : [];
  const push = (text: string) => {
    if (text !== '') parts.push(text);
  };

  // The deepest section in use: the index's sections, and a play's scenes, which are sections.
  let deepest = 0;
  for (const item of index.items) {
    const block = blocks[item.block];
    if (block?.kind === 'section') deepest = Math.max(deepest, block.sem.depth);
  }
  const sceneLevel = 2 + deepest;
  const numbers = sceneNumbersFor(doc, template, options.sceneNumbers);

  const roles: Role[] = [];
  for (const block of blocks) roles.push(resolveRole(template, block, roles.at(-1) ?? null));
  /** The role a block prints as: a disabled element prints the way action does, as `paginate` prints it. */
  const printedRole = (i: number): Role => {
    const role = roles[i] as Role;
    if (role !== 'disabled') return role;
    return resolveRole(template, { kind: 'action' } as Block, roles[i - 1] ?? null);
  };
  const paragraph = (block: Block, role: Role) => {
    if (block.kind === 'centered') {
      // Fountain's marks shown as text, so the centering is kept (Call 30).
      // A line with no text prints nothing, as `paginate` prints it, so it gets no marks.
      const wrap = (runs: Style[]) =>
        runs.some((run) => textStart(run.text) < run.text.length)
          ? [plainRun('>'), ...runs, plainRun('<')]
          : runs;
      push(joinLines(blockLines(block, {}, wrap)));
    } else {
      push(joinLines(blockLines(block, { italic: ITALIC_ROLES.has(role) })));
    }
  };

  // Notes, in source order, as they fall in each block; never one inside the boneyard.
  const notes =
    options.notes === 'include'
      ? doc.regions.filter((region) => region.kind === 'note' && region.closed)
      : [];
  const boneyards = doc.regions.filter((region) => region.kind === 'boneyard');
  const bodyFrom = blocks[0]?.span.from ?? Number.POSITIVE_INFINITY;
  let nextNote = 0;
  let nextBoneyard = 0;
  const notesUpTo = (to: number) => {
    for (; nextNote < notes.length; nextNote++) {
      const note = notes[nextNote] as (typeof notes)[number];
      if (note.span.from >= to) break;
      while ((boneyards[nextBoneyard]?.span.to ?? Number.POSITIVE_INFINITY) <= note.span.from) {
        nextBoneyard++;
      }
      const boneyard = boneyards[nextBoneyard];
      if (boneyard && boneyard.span.from <= note.span.from) continue;
      // A title page's notes, whatever is left of the title page, stand before the first block.
      if (note.span.from < bodyFrom) continue;
      push(noteMarkdown(doc.source.slice(note.span.from + 2, note.span.to - 2)));
    }
  };

  /** The last thing printed is a speech that the next dual speech may pair with, as in `paginate`. */
  let free = false;
  for (let i = 0; i < blocks.length; ) {
    const block = blocks[i] as Block;
    if (block.kind === 'character') {
      let j = i + 1;
      while (
        j < blocks.length &&
        SPEECH_PARTS.has((blocks[j] as Block).kind) &&
        adjacent(blocks[j] as Block)
      ) {
        j++;
      }
      const second: boolean = block.sem.dual && free;
      const lines = blockLines(block, { bold: true });
      if (second && lines.length > 0) lines[lines.length - 1] += AT_THE_SAME_TIME;
      for (let k = i + 1; k < j; k++) {
        const role = printedRole(k);
        if (role === 'omit') continue;
        lines.push(...blockLines(blocks[k] as Block, { italic: ITALIC_ROLES.has(role) }));
      }
      push(joinLines(lines));
      free = !second;
      notesUpTo((blocks[j - 1] as Block).span.to);
      i = j;
      continue;
    }

    const role = printedRole(i);
    if (role !== 'omit') free = false;
    if (block.kind === 'page_break') {
      push('* * *');
    } else if (block.kind === 'section') {
      // A section is read for emphasis as the script's other text is.
      push(heading(1 + block.sem.depth, inlineRuns(block.sem.text)));
    } else if (block.kind === 'synopsis') {
      if (options.notes === 'include') {
        const text = markdownText(block.sem.text);
        if (text !== '') push(quote(text));
      }
    } else if (block.kind === 'note' || block.kind === 'boneyard') {
      // Notes come through `notesUpTo`; the boneyard is text the writer cut.
    } else if (block.kind === 'scene_heading' && roles[i] !== 'disabled') {
      if (role !== 'omit') {
        const number = numbers.get(i);
        const runs = oneLine(block);
        push(heading(sceneLevel, number ? [plainRun(`${number}. `), ...runs] : runs));
      }
    } else if (role !== 'omit') {
      paragraph(block, role);
    }
    notesUpTo(block.span.to);
    i++;
  }
  notesUpTo(Number.POSITIVE_INFINITY);
  return `${parts.join('\n\n')}\n`;
}
