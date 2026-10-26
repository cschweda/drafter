import type { EditorState, Extension, Range, Text } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type {
  Block,
  BlockKind,
  Doc,
  InlineRun,
  Line,
  Region,
  Span,
  TitleField,
} from '@drafter/fountain';
import { parsedDoc } from './state';

// The decorations are the classes `cm-f-*`, which the app's theme styles. There is no Lezer
// grammar: they are read from the parse in the state (technical design §3.2).

const lineDecorations = new Map<BlockKind, Decoration>();
/** Each line of a block of this kind: `cm-f-scene_heading`, `cm-f-character`, and so on. */
function lineDecoration(kind: BlockKind): Decoration {
  let decoration = lineDecorations.get(kind);
  if (!decoration) {
    decoration = Decoration.line({ class: `cm-f-${kind}` });
    lineDecorations.set(kind, decoration);
  }
  return decoration;
}

const mark = (cls: string) => Decoration.mark({ class: cls });
const TITLE_LINE = Decoration.line({ class: 'cm-f-title' });
const TITLE_KEY = mark('cm-f-title-key');
const BOLD = mark('cm-f-b');
const ITALIC = mark('cm-f-i');
const UNDERLINE = mark('cm-f-u');
const NOTE = mark('cm-f-note');
const BONEYARD = mark('cm-f-boneyard');
const MARKER = mark('cm-f-marker');

/**
 * The highlighting decorations for `ranges`, read from `parsedDoc` (technical design §3.2). The
 * ranges are widened to whole lines, and only the blocks, title page lines, and notes and boneyard
 * that touch them are decorated, so the work follows the size of the range and not the script.
 * They may overlap, repeat, or come in any order, and are clamped to the document. The state
 * must have `parsedDoc`.
 */
export function fountainDecorations(
  state: EditorState,
  ranges: readonly { from: number; to: number }[],
): DecorationSet {
  const doc = state.field(parsedDoc);
  const out: Range<Decoration>[] = [];
  // Notes and boneyard before this index have their mark already, from an earlier range.
  let nextRegion = 0;
  for (const { from, to } of wholeLines(state.doc, ranges)) {
    const regions = doc.regions;
    const first = Math.max(
      nextRegion,
      firstWhere(regions, (region) => region.span.to > from),
    );
    for (let i = first; i < regions.length; i++) {
      const { kind, span } = regions[i] as Region;
      if (span.from > to) break;
      out.push((kind === 'note' ? NOTE : BONEYARD).range(span.from, span.to));
      nextRegion = i + 1;
    }
    const touching = regionWalk(regions, from);
    decorateTitle(out, doc, from, to, touching);
    decorateBlocks(out, doc.blocks, from, to, touching);
  }
  // Nearly in order already: the regions are the only marks that start out of place.
  return Decoration.set(out, true);
}

/**
 * The ranges widened to whole lines, sorted, and merged where they share a line. A range is cut
 * off at the ends of the text, and one that is left with nothing, or runs backwards, is dropped.
 */
function wholeLines(text: Text, ranges: readonly Span[]): Span[] {
  const lines: Span[] = [];
  for (const range of ranges) {
    if (range.from > range.to || range.to < 0 || range.from > text.length) continue;
    const from = Math.max(range.from, 0);
    const to = Math.min(range.to, text.length);
    lines.push({ from: text.lineAt(from).from, to: text.lineAt(to).to });
  }
  lines.sort((a, b) => a.from - b.from);
  const merged: Span[] = [];
  for (const line of lines) {
    const last = merged[merged.length - 1];
    if (last && line.from <= last.to) last.to = Math.max(last.to, line.to);
    else merged.push(line);
  }
  return merged;
}

/** The index of the first item that passes `test`, in a list where an item passes if the one before does. */
function firstWhere<T>(items: readonly T[], test: (item: T) => boolean): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (test(items[middle] as T)) high = middle;
    else low = middle + 1;
  }
  return low;
}

const NO_REGIONS: readonly Region[] = [];

/**
 * Finds the notes and boneyard that touch each line. The lines are asked for in order, so each
 * search carries on from where the last one stopped.
 */
function regionWalk(regions: readonly Region[], from: number) {
  let next = firstWhere(regions, (region) => region.span.to > from);
  return (lineFrom: number, lineTo: number): readonly Region[] => {
    while (next < regions.length && (regions[next] as Region).span.to <= lineFrom) next++;
    let end = next;
    while (end < regions.length && (regions[end] as Region).span.from < lineTo) end++;
    return end === next ? NO_REGIONS : regions.slice(next, end);
  };
}

type Walk = ReturnType<typeof regionWalk>;

/** Each line of the blocks that touch `from` to `to`: its kind's class, then the marks in it. */
function decorateBlocks(
  out: Range<Decoration>[],
  blocks: readonly Block[],
  from: number,
  to: number,
  touching: Walk,
): void {
  for (let i = firstWhere(blocks, (block) => block.span.to >= from); i < blocks.length; i++) {
    const block = blocks[i] as Block;
    if (block.span.from > to) break;
    const decoration = lineDecoration(block.kind);
    const { lines } = block;
    // Most blocks lie inside the range, but a long one can run far past either end.
    const first = block.span.from >= from ? 0 : firstWhere(lines, (line) => line.span.to >= from);
    for (let j = first; j < lines.length; j++) {
      const line = lines[j] as Line;
      if (line.span.from > to) break;
      out.push(decoration.range(line.span.from));
      decorateLine(
        out,
        line.span.from,
        line.raw,
        line.inline,
        touching(line.span.from, line.span.to),
        false,
      );
    }
  }
}

/** Each line of the title page that touches `from` to `to`: `cm-f-title`, each key, and the marks. */
function decorateTitle(
  out: Range<Decoration>[],
  doc: Doc,
  from: number,
  to: number,
  touching: Walk,
): void {
  const title = doc.titlePage;
  if (!title || title.span.to < from) return;
  const { source } = doc;
  const { fields } = title;
  for (let i = firstWhere(fields, (field) => field.span.to >= from); i < fields.length; i++) {
    const field = fields[i] as TitleField;
    if (field.span.from > to) break;
    // The field's runs are one list for each value line, and a line with no value has none, so
    // they are matched to lines by position.
    const runs = field.runs.flat();
    let first = 0;
    for (let start = Math.max(field.span.from, from); start <= Math.min(field.span.to, to); ) {
      const newline = source.indexOf('\n', start);
      const end = newline === -1 ? source.length : newline;
      while (first < runs.length && (runs[first] as InlineRun).span.to <= start) first++;
      let last = first;
      while (last < runs.length && (runs[last] as InlineRun).span.from < end) last++;
      out.push(TITLE_LINE.range(start));
      decorateLine(
        out,
        start,
        source.slice(start, end),
        runs.slice(first, last),
        touching(start, end),
        start === field.span.from,
      );
      start = end + 1;
    }
  }
}

// What each character of a line is, while its marks are worked out.
const UNCLAIMED = 0; // so far nothing: a marker, unless it is whitespace
const PRINTED = 1; // a character of a run
const CLAIMED = 2; // in a note or a boneyard, or in a title field's key

const BYTE_ORDER_MARK = 0xfeff;
const COLON = 58;
const ASTERISK = 42;
const UNDERSCORE = 95;
const BACKSLASH = 92;
const SPACE = /\s/;

/** Whitespace as the parser trims it, so what it leaves out of the text is what stays unmarked. */
function isSpace(raw: string, at: number): boolean {
  const code = raw.charCodeAt(at);
  return (code <= 32 || code >= 127) && SPACE.test(raw.charAt(at));
}

/**
 * The marks in one line that starts at `from`: the key of a title field, the styles of its runs,
 * and `cm-f-marker` on every other character that is neither whitespace nor in a note or boneyard
 * (the forced markers, `#`, `=`, emphasis markers, scene numbers, and escapes). The notes and
 * boneyard get their own marks, once each, from `fountainDecorations`.
 */
function decorateLine(
  out: Range<Decoration>[],
  from: number,
  raw: string,
  runs: readonly InlineRun[],
  regions: readonly Region[],
  hasKey: boolean,
): void {
  const chars = new Uint8Array(raw.length);
  for (const { span } of regions) {
    chars.fill(CLAIMED, Math.max(span.from - from, 0), Math.max(span.to - from, 0));
  }
  if (hasKey) {
    const key = titleKey(raw, chars, from);
    if (key) {
      chars.fill(CLAIMED, key.from - from, key.to - from);
      out.push(TITLE_KEY.range(key.from, key.to));
    }
  }
  for (const run of runs) {
    const { span } = run;
    if (run.bold) out.push(BOLD.range(span.from, span.to));
    if (run.italic) out.push(ITALIC.range(span.from, span.to));
    if (run.underline) out.push(UNDERLINE.range(span.from, span.to));
    let printed = 0;
    for (let at = span.from - from; at < span.to - from; at++) {
      if (chars[at] !== CLAIMED) {
        chars[at] = PRINTED;
        printed++;
      }
    }
    // A run's span runs from its first character to its last, so it holds what the parser left
    // out in between: the backslashes of escapes, and the delimiters of nested emphasis.
    if (printed > run.text.length) {
      releaseUnprinted(chars, raw, span.from - from, span.to - from, run.text);
    }
  }
  for (let at = 0; at < raw.length; ) {
    if (chars[at] !== UNCLAIMED || isSpace(raw, at)) {
      at++;
      continue;
    }
    const start = at;
    while (at < raw.length && chars[at] === UNCLAIMED && !isSpace(raw, at)) at++;
    out.push(MARKER.range(from + start, from + at));
  }
}

/**
 * The `Key:` of a title field, on its first line: from the key's first character, which is the
 * first after a byte-order mark at the start of the text and after any note, through the colon.
 */
function titleKey(raw: string, chars: Uint8Array, from: number): Span | null {
  let start = from === 0 && raw.charCodeAt(0) === BYTE_ORDER_MARK ? 1 : 0;
  while (start < raw.length && chars[start] === CLAIMED) start++;
  let colon = start;
  while (colon < raw.length && (raw.charCodeAt(colon) !== COLON || chars[colon] === CLAIMED)) {
    colon++;
  }
  return colon < raw.length ? { from: from + start, to: from + colon + 1 } : null;
}

/**
 * Takes out of the characters a run prints those that the parser left out of its text, though
 * they lie inside its span: the backslash of an escape, and the delimiters of emphasis inside
 * emphasis of the same style, as in `*a *b* c*`. `chars` holds the run's span as printed, less the
 * notes in it, and `text` is what the run prints of it. If the two don't line up as expected,
 * the run is left as it was.
 */
function releaseUnprinted(
  chars: Uint8Array,
  raw: string,
  start: number,
  end: number,
  text: string,
): void {
  const printed: number[] = [];
  for (let at = start; at < end; at++) if (chars[at] === PRINTED) printed.push(at);
  const codeAt = (i: number) => raw.charCodeAt(printed[i] as number);

  // Escapes, found left to right as the parser reads them: a backslash before `*`, `_`, or
  // another backslash is left out, and the character after it prints, even if it is a backslash.
  // The run's first character prints, so it is never one.
  const isEscape = new Uint8Array(printed.length);
  for (let i = 1; i + 1 < printed.length; i++) {
    const after = codeAt(i + 1);
    if (
      codeAt(i) === BACKSLASH &&
      (after === ASTERISK || after === UNDERSCORE || after === BACKSLASH)
    ) {
      isEscape[i] = 1;
      i++;
    }
  }

  // The rest of the text is matched from the end, keeping its first character for the run's first.
  // A character that isn't the next one of the text is the delimiter of emphasis that the parser
  // took out, or the run isn't as expected.
  const left: number[] = [];
  let next = text.length - 1;
  for (let i = printed.length - 1; i > 0; i--) {
    if (isEscape[i]) {
      left.push(printed[i] as number);
    } else if (next > 0 && codeAt(i) === text.charCodeAt(next)) {
      next--;
    } else if (codeAt(i) === ASTERISK || codeAt(i) === UNDERSCORE) {
      left.push(printed[i] as number);
    } else {
      return;
    }
  }
  if (next !== 0 || codeAt(0) !== text.charCodeAt(0)) return;
  for (const at of left) chars[at] = UNCLAIMED;
}

/**
 * A view plugin that keeps `fountainDecorations` for the visible ranges. It brings `parsedDoc`
 * with it, and rebuilds the decorations when the text changes or the visible ranges do, as they
 * do on scrolling and when a range is folded or unfolded.
 */
export function fountainHighlighting(): Extension {
  return [parsedDoc, highlighter];
}

const highlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = fountainDecorations(view.state, view.visibleRanges);
    }

    update(update: ViewUpdate) {
      // `viewportChanged` is also set when the visible ranges change, as a fold does.
      if (update.docChanged || update.viewportChanged) {
        this.decorations = fountainDecorations(update.state, update.view.visibleRanges);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
