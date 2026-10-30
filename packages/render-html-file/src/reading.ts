import type { Block, Doc, InlineRun, Line } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';
import { el, escapeHtml } from './escape';
import { colorRules } from './rules';

/**
 * The Reading view's markup, and the generated rules for the character colors it uses, which go
 * into the file's one `<style>` (`ShellInput.rules`), since the CSP allows no style attribute.
 */
export interface ReadingHtml {
  html: string;
  rules: string;
}

/**
 * The characters' colors (design §3.2, Call): a fixed set of hues told apart easily, each with a
 * light-palette shade, in the order they are handed out. Every color passes AA against both the
 * frame and the panel of its palette (`test/palette.test.ts` measures them); the light one is also
 * the printed one. A color is never the only sign of who speaks: the name is always printed.
 */
export const CHARACTER_COLORS: ReadonlyArray<Readonly<{ dark: string; light: string }>> = [
  { dark: '#6cb8ff', light: '#1f5fbf' }, // blue
  { dark: '#ff8a7a', light: '#b3261e' }, // coral
  { dark: '#5fd08a', light: '#1e7a3c' }, // green
  { dark: '#b49cff', light: '#6b3fc4' }, // violet
  { dark: '#ffa257', light: '#a14a00' }, // orange
  { dark: '#4fd1c5', light: '#08716a' }, // teal
  { dark: '#ff8ccf', light: '#b0256f' }, // pink
  { dark: '#c3d65a', light: '#5c6b00' }, // olive
];

/** A parenthesized part of a cue, with nothing nested: `(V.O.)`, `(CONT'D)`. Linear: no backtracking. */
const PAREN = /\([^()]*\)/g;
const SPACES = /\s+/g;

/**
 * The one name a character goes by, whatever its cue says: in capitals, without its extensions
 * (`(V.O.)`, `(CONT'D)`, any parenthesized part), the forcing `@`, or the dual-dialogue `^`, its
 * spaces collapsed. So Tom, TOM, TOM (V.O.), and TOM (CONT'D) share one color.
 */
export function characterKey(cue: string): string {
  let name = cue.replace(PAREN, ' ').replace(SPACES, ' ').trim();
  if (name.endsWith('^')) name = name.slice(0, -1).trimEnd();
  if (name.startsWith('@')) name = name.slice(1).trimStart();
  return name.toUpperCase();
}

/** Speech parts that follow a cue, with no blank line between, as the layout groups them. */
const SPEECH_PARTS = new Set(['parenthetical', 'dialogue', 'lyric']);
const adjacent = (block: Block) => block.leading.split('\n').length === 2;

/** A source run as markup: its escaped text, in a span whose classes give its styles when it has any. */
function runHtml(run: InlineRun): string {
  const styles = [run.bold && 'b', run.italic && 'i', run.underline && 'u'].filter(Boolean);
  const text = escapeHtml(run.text);
  return styles.length === 0 ? text : el('span', { class: styles.join(' ') }, text);
}

/** A block's printed text as markup: its lines (those that hold more than notes), a break between. */
const textHtml = (block: Block) =>
  block.lines
    .filter((line: Line) => !line.transparent)
    .map((line) => line.inline.map(runHtml).join(''))
    .join(el('br', {}));

/** What Reading draws, in order: one element (or a speech), where it starts in the source, and whether it pairs. */
interface Unit {
  html: string;
  from: number;
  /** A speech, which may take the next speech as its dual partner. */
  speech?: boolean;
  /** A speech whose cue has `^`: the right of a dual pair. */
  right?: boolean;
}

/** The scene number the layout prints beside each heading block, by block index. */
function sceneNumbers(layout: Layout): Map<number, string> {
  const numbers = new Map<number, string>();
  for (const page of layout.pages) {
    for (const { line, text } of [...page.sceneNumbersLeft, ...page.sceneNumbersRight]) {
      const block = page.lines[line]?.blockIndex ?? -1;
      if (block >= 0 && !numbers.has(block)) numbers.set(block, text);
    }
  }
  return numbers;
}

/** The blocks the pages print, from the layout's lines in page order; `(MORE)`, `(CONT'D)`, blanks, and the title page are from none. */
function printedBlocks(layout: Layout): Set<number> {
  const printed = new Set<number>();
  for (const page of layout.pages) {
    for (const line of page.lines) {
      if (line.blockIndex >= 0) printed.add(line.blockIndex);
      if (line.right && line.right.blockIndex >= 0) printed.add(line.right.blockIndex);
    }
  }
  return printed;
}

/** Hands out character colors by first speech, cycling past the palette. */
class Colors {
  readonly #byKey = new Map<string, number>();

  classOf(cue: string): string {
    const key = characterKey(cue);
    let n = this.#byKey.get(key);
    if (n === undefined) {
      n = this.#byKey.size;
      this.#byKey.set(key, n);
    }
    return `k${n % CHARACTER_COLORS.length}`;
  }

  rules(): string {
    return colorRules(
      CHARACTER_COLORS.slice(0, Math.min(this.#byKey.size, CHARACTER_COLORS.length)),
    );
  }
}

/**
 * A speech: the name in the margin, in its character's color, with its extension after it in
 * grey; beside it the parentheticals, dialogue, and lyrics, in order.
 */
function speechHtml(cue: Block & { kind: 'character' }, parts: readonly Block[], colors: Colors) {
  const { name, extension } = cue.sem;
  const who = el(
    'p',
    { class: `who ${colors.classOf(name)}` },
    escapeHtml(name) + (extension ? el('span', { class: 'ext' }, escapeHtml(` ${extension}`)) : ''),
  );
  const said = parts
    .map((part) => {
      const kind =
        part.kind === 'parenthetical' ? 'paren' : part.kind === 'lyric' ? 'ly' : undefined;
      return el('p', { class: kind }, textHtml(part));
    })
    .join('');
  return el('div', { class: 'speech' }, who + el('div', { class: 'said' }, said));
}

/** The class a block of each kind gets as a paragraph; any kind not here is a plain one. */
const PARAGRAPH: Partial<Record<string, string>> = {
  action: undefined,
  transition: 'tr',
  centered: 'ct',
  lyric: 'ly',
};

/** A note as an aside: its text, trimmed, its lines kept. Empty notes say nothing. */
function noteHtml(source: string, from: number, to: number): string {
  const text = source.slice(from + 2, to - 2).trim();
  if (text === '') return '';
  return el(
    'aside',
    { class: 'note' },
    text
      .split(/\r?\n/)
      .map((line) => escapeHtml(line))
      .join(el('br', {})),
  );
}

/**
 * The Reading view (design §3.2): the script reflowed for a screen, in `<section class="reading"
 * hidden="">`, which the script shows when the reader asks.
 *
 * It holds the blocks the pages print (the layout's lines name them, so a template's choices about
 * what prints hold here too), in the layout's order, which is the source's; `(MORE)`, a continued
 * cue's `(CONT'D)`, and blank lines are from no block and add nothing; the title page is left out,
 * since the header carries it. Sections are kept even where the template prints none (a
 * screenplay's acts), since the band links to them.
 *
 * Each block is drawn by its Fountain kind, never by the template's role names: a section is a
 * heading one level under its parent, `r-b-<block>`; a scene heading is an amber heading under the
 * section it is in (`.sh`, with the scene number when the layout prints one); action, a
 * transition, centered text, and a lyric are paragraphs (plain, `.tr`, `.ct`, `.ly`); a cue and
 * the speech after it are one `div.speech`, and a `^` speech and the one before it sit side by
 * side in `div.dual`. Any other kind is a plain paragraph, so no printed text is dropped.
 *
 * With notes included, each `[[note]]` is an `<aside class="note">` at its place: after the
 * element that holds it, or between the elements it stands between. Boneyard never appears.
 */
export function readingHtml(doc: Doc, layout: Layout, notes: 'leave-out' | 'include'): ReadingHtml {
  const printed = printedBlocks(layout);
  const numbers = sceneNumbers(layout);
  const colors = new Colors();
  const units: Unit[] = [];
  let depth = 0; // the depth of the section the walk is in, 0 before any

  const { blocks } = doc;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as Block;
    if (block.kind === 'section') {
      depth = block.sem.depth;
    } else if (!printed.has(i)) {
      continue;
    }
    const { from } = block.span;
    const number = numbers.get(i);
    const numbered = number ? `${el('span', { class: 'sn' }, escapeHtml(number))} ` : '';

    if (block.kind === 'section') {
      const level = Math.min(6, 1 + block.sem.depth);
      units.push({
        html: el(
          `h${level}`,
          { class: 'sec', id: `r-b-${i}` },
          numbered + escapeHtml(block.sem.text.trim()),
        ),
        from,
      });
    } else if (block.kind === 'scene_heading') {
      const level = Math.min(6, 2 + depth);
      units.push({
        html: el(
          `h${level}`,
          { class: 'sh', id: `r-b-${i}` },
          numbered + escapeHtml(block.sem.text.trim()),
        ),
        from,
      });
    } else if (block.kind === 'character') {
      let j = i + 1;
      while (
        j < blocks.length &&
        SPEECH_PARTS.has((blocks[j] as Block).kind) &&
        adjacent(blocks[j] as Block)
      ) {
        j++;
      }
      const parts = blocks.slice(i + 1, j);
      units.push({
        html: speechHtml(block, parts, colors),
        from,
        speech: true,
        right: block.sem.dual,
      });
      i = j - 1;
    } else {
      units.push({ html: el('p', { class: PARAGRAPH[block.kind] }, textHtml(block)), from });
    }
  }

  // A `^` speech and the free speech before it, side by side.
  const paired: Unit[] = [];
  for (const unit of units) {
    const before = paired[paired.length - 1];
    if (unit.right && before?.speech) {
      paired[paired.length - 1] = {
        html: el('div', { class: 'dual' }, before.html + unit.html),
        from: before.from,
      };
    } else {
      paired.push(unit);
    }
  }

  // Each note at its place: before the first unit that starts after it, so a note inside a unit
  // comes just after it, and one between units stands between them.
  const asides =
    notes === 'include'
      ? doc.regions.filter(
          (region) =>
            region.kind === 'note' &&
            region.closed &&
            region.span.from >= (doc.titlePage?.span.to ?? 0),
        )
      : [];
  const out: string[] = [];
  let next = 0;
  const notesBefore = (at: number) => {
    while (next < asides.length && (asides[next]?.span.from ?? 0) < at) {
      const { from, to } = (asides[next] as (typeof asides)[number]).span;
      out.push(noteHtml(doc.source, from, to));
      next++;
    }
  };
  for (const unit of paired) {
    notesBefore(unit.from);
    out.push(unit.html);
  }
  notesBefore(Number.POSITIVE_INFINITY);

  return {
    html: el('section', { class: 'reading', hidden: true }, out.join('')),
    rules: colors.rules(),
  };
}
