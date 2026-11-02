import {
  ChangeSet,
  EditorState,
  type Extension,
  type Line,
  type Transaction,
  type TransactionSpec,
} from '@codemirror/state';
import { type Block, blockAt, type Doc, parse, reparse, type Span } from '@drafter/fountain';
import {
  blocked,
  type ElementStructure,
  elementStructure,
  HEADING_START,
  isBlank,
} from '../elements';
import { inNote, upperFix } from '../input';
import { BOM } from '../keymap';
import { appChange, parsedDoc } from '../state';
import {
  type ClassicKind,
  classicLine,
  lineKindAt,
  mapSpan,
  pendingAt,
  type StoredLine,
  setStored,
} from './line';

// Classic Mode's marks (design §4.2). After every keystroke, in the transaction that types it, the
// parser is asked whether the line reads as the element the writer is in. If it doesn't, the mark
// goes on, and one this stay added comes off when it stops being needed. So the file is right at
// every moment, and one undo takes the letter and its mark together.

/**
 * The most of a paragraph a keystroke asks the parser about. A paragraph past this keeps the marks
 * it has and gets no new one, as a keystroke's cost mustn't follow the paragraph.
 */
export const MAX_RUN = { lines: 64, chars: 8192 } as const;

/** The elements typed in capitals. */
const CAPITALS: ReadonlySet<ClassicKind> = new Set<ClassicKind>([
  'scene_heading',
  'character',
  'transition',
  'act',
]);

/** A line starting with one of a mark's characters, which the writer means as words. */
const MARK_START = /^\s*[!@~>.#=]/;
const HAS_UPPER = /\p{Lu}/u;
const HAS_LOWER = /\p{Ll}/u;

/** The paragraph around a line, with the line left out, or null past the cap. */
function runAround(
  state: EditorState,
  line: Line,
  length: number,
): { above: string; below: string } | null {
  const { doc } = state;
  let count = 1;
  let chars = length;
  if (chars > MAX_RUN.chars) return null;
  const reach = (from: number, step: 1 | -1) => {
    let edge = from;
    for (;;) {
      const next = edge + step;
      if (next < 1 || next > doc.lines) return edge;
      const other = doc.line(next);
      if (other.length <= MAX_RUN.chars && isBlank(other.text)) return edge;
      chars += other.length + 1;
      if (++count > MAX_RUN.lines || chars > MAX_RUN.chars) return null;
      edge = next;
    }
  };
  const first = reach(line.number, -1);
  const last = first === null ? null : reach(line.number, 1);
  if (first === null || last === null) return null;
  return {
    above: first < line.number ? doc.sliceString(doc.line(first).from, line.from) : '',
    below: last > line.number ? doc.sliceString(line.to, doc.line(last).to) : '',
  };
}

/** Whether a block is what the template calls `kind`, as the parser reads it. */
function blockIs(block: Block, kind: ClassicKind, structure: ElementStructure): boolean {
  const { actDepth, sceneDepth, headings } = structure;
  if (block.kind === 'section') {
    const { depth } = block.sem;
    if (kind === 'act') return depth === actDepth;
    if (kind === 'scene_heading') return !headings && depth === sceneDepth;
    return kind === 'section' && depth !== actDepth && depth !== sceneDepth;
  }
  if (kind === 'scene_heading') return headings && block.kind === 'scene_heading';
  return block.kind === kind;
}

/** The words a line of a block prints: its text without the mark that made it the block's kind. */
function printed(block: Block, at: number): string {
  const found = block.lines.find((line) => line.span.from === at);
  const text = (found?.raw ?? '').trim();
  switch (block.kind) {
    case 'lyric':
      return text.slice(1);
    case 'centered':
      return text.slice(1, -1).trim();
    case 'section':
      return text.replace(/^#+/, '').trimStart();
    case 'synopsis':
      return text.slice(1).trimStart();
    default:
      return block.forced && found === block.lines[0] ? text.slice(1) : text;
  }
}

/** The last full parse of line 1, by the parse it was made from, as one key asks twice. */
const lastFirstLine = new WeakMap<Doc, { text: string; doc: Doc }>();

/** The parse of the script with `text` as line 1, for what only a full parse can see. */
function withFirstLine(state: EditorState, line: Line, text: string): Doc {
  const parsed = state.field(parsedDoc);
  const known = lastFirstLine.get(parsed);
  if (known?.text === text) return known.doc;
  const doc = reparse(parsed, [{ from: line.from, to: line.to, insert: text }]);
  lastFirstLine.set(parsed, { text, doc });
  return doc;
}

/**
 * Would the parser read `text` at this line as `kind`, printing `words`? A mark's character the
 * writer typed would otherwise vanish from the page. Character and Scene heading don't compare
 * words: a typed `@` and `.` are the same mark (§4.2), and those lines print what the parser makes
 * of them. It parses `\n` and the run, as a paragraph on its own
 * would read as a title page; line 1 with a colon can be one, so it asks the full parse. Past the
 * cap the answer is yes, so no new mark is written.
 */
export function readsAs(
  state: EditorState,
  line: Line,
  text: string,
  kind: ClassicKind,
  words: string,
): boolean {
  const run = runAround(state, line, text.length);
  if (!run) return true;
  // A name is a cue only with a line under it, and a name just typed may not have one yet.
  const under = kind === 'character' && !run.below ? '\nx' : '';
  const whole = line.number === 1 && text.includes(':');
  const doc = whole
    ? withFirstLine(state, line, text + under)
    : parse(`\n${run.above}${text}${run.below}${under}`);
  const at = whole ? line.from : 1 + run.above.length;
  const block = blockAt(doc, at)?.block;
  if (!block) return false;
  // A line that's all note or boneyard is no element, and a mark would make it one.
  if (block.kind === 'note' || block.kind === 'boneyard') return true;
  if (!blockIs(block, kind, state.facet(elementStructure)())) return false;
  if (kind === 'character' || block.kind === 'scene_heading') return true;
  return printed(block, at) === words.trim();
}

/** The worked-out element of a line typed in this stay, not one chosen. */
const isWorkedOut = (own: StoredLine) => own.beganEmpty && !own.chosen;

/** Whether the line is soft Action: an element named on a soft line ends that. */
const isSoft = (own: StoredLine) => own.soft && own.arrivedAs === 'action';

/** Whether a line starts its paragraph, where alone a shape can read as one to the parser. */
const opensParagraph = (state: EditorState, line: Line) =>
  line.number === 1 || isBlank(state.doc.line(line.number - 1).text);

/** A heading's or a transition's shape, for a line typed on in this stay (§4.2). */
function headingOrTransition(
  state: EditorState,
  line: Line,
  text: string,
  own: StoredLine,
): 'scene_heading' | 'transition' | null {
  if (!isWorkedOut(own) || MARK_START.test(text) || !opensParagraph(state, line)) return null;
  const words = text.trimStart();
  // The maintainer's ruling: a prefix is no plausible name, so after a speech it starts a scene.
  if (
    state.facet(elementStructure)().headings &&
    HEADING_START.test(words) &&
    (isSoft(own) || own.arrivedAs === 'character')
  ) {
    return 'scene_heading';
  }
  const transition = isSoft(own) && text.endsWith('TO:') && HAS_UPPER.test(text);
  return transition && !HAS_LOWER.test(text) ? 'transition' : null;
}

/** As `shapeOf`, for a stored line given. */
function shapeWith(
  state: EditorState,
  line: Line,
  text: string,
  own: StoredLine,
): 'scene_heading' | 'transition' | 'title_page' | null {
  const body = text.startsWith(BOM) ? text.slice(1) : text;
  const shape = headingOrTransition(state, line, body, own);
  if (shape || !isSoft(own) || line.number !== 1 || !body.includes(':')) return shape;
  if (MARK_START.test(body) || !runAround(state, line, text.length)) return null;
  return withFirstLine(state, line, text).titlePage ? 'title_page' : null;
}

const NO_LINE: Omit<StoredLine, 'from' | 'kind' | 'arrivedAs'> = {
  soft: false,
  chosen: false,
  added: [],
  made: null,
  dismissed: false,
  beganEmpty: false,
};

/**
 * A heading's or a transition's shape, or a title page's on line 1 (§4.2), on a line the cursor is
 * on and that's soft. A heading's prefix counts on a worked-out Character too.
 */
export function shapeOf(
  state: EditorState,
  line: Line,
  text: string,
): 'scene_heading' | 'transition' | 'title_page' | null {
  const own = state.field(classicLine, false);
  return own?.from === line.from ? shapeWith(state, line, text, own) : null;
}

/** What the mark is for each element: what goes before the words, and after. */
function markOf(
  kind: ClassicKind,
  { actDepth, sceneDepth, headings }: ElementStructure,
): readonly [string, string] | null {
  const section = (depth: number | null) => (depth ? `${'#'.repeat(depth)} ` : null);
  const lead = (open: string | null) => (open ? ([open, ''] as const) : null);
  switch (kind) {
    case 'action':
      return ['!', ''];
    case 'scene_heading':
      return lead(headings ? '.' : section(sceneDepth));
    case 'act':
      return lead(section(actDepth));
    case 'character':
      return ['@', ''];
    case 'transition':
      return ['>', ''];
    case 'lyric':
      return ['~', ''];
    case 'centered':
      return ['>', '<'];
    case 'section':
      return ['# ', ''];
    case 'synopsis':
      return ['= ', ''];
    default:
      return null;
  }
}

/** The text without the spans, which are in positions of a line starting at `from`. */
function without(text: string, from: number, spans: readonly Span[]): string {
  let out = '';
  let at = 0;
  for (const span of spans) {
    out += text.slice(at, span.from - from);
    at = span.to - from;
  }
  return out + text.slice(at);
}

/** The heading's prefix in capitals, and nothing else. */
function upperPrefix(body: string): string {
  const lead = body.length - body.trimStart().length;
  const prefix = HEADING_START.exec(body.slice(lead));
  if (!prefix) return body;
  const end = lead + prefix[0].length;
  return body.slice(0, end).toUpperCase() + body.slice(end);
}

/**
 * The line's text with the mark it needs for its element, and the marks it had that this stay
 * added taken off. `stored.added` is in the positions of `text`, on a line starting at `line.from`,
 * and so is what comes back. `line` is the line in `state`, which gives what's around it.
 */
export function settleLine(
  state: EditorState,
  line: Line,
  text: string,
  stored: StoredLine,
): { text: string; kind: ClassicKind; added: readonly Span[] } {
  const bare = without(text, line.from, stored.added);
  const bom = bare.startsWith(BOM) ? BOM : '';
  const shape = shapeWith(state, line, bare, stored);
  const kind = shape === 'title_page' ? 'action' : (shape ?? stored.arrivedAs);
  const body = shape === 'scene_heading' ? bom + upperPrefix(bare.slice(bom.length)) : bare;
  const words = body.slice(bom.length);
  const asTyped = { text: body, kind, added: [] };
  if (shape || /^\s*$/.test(words)) return asTyped;
  if (!runAround(state, line, text.length)) return { text, kind, added: stored.added };
  const structure = state.facet(elementStructure)();
  const mark = markOf(kind, structure);
  if (!mark) return asTyped;
  const [open, close] = mark;
  // A mark that was there before this keystroke and isn't ours came with the file.
  if (!stored.added.length && line.text.trimStart().startsWith(open.trimEnd())) return asTyped;
  const heading = kind === 'scene_heading' && structure.headings;
  // A typed `.` is the same mark.
  if (heading && words.trimStart().startsWith('.')) return asTyped;
  // Some lines no mark can make the element: `.` needs a letter or number after it, and `>…<` is
  // Centered. They stay the writer's words, as Action.
  if (
    (heading && !/^\s*[\p{L}\p{N}]/u.test(words)) ||
    (kind === 'transition' && words.trimEnd().endsWith('<'))
  ) {
    return readsAs(state, line, body, 'action', body) ? asTyped : marked('!', '');
  }
  return readsAs(state, line, body, kind, body) ? asTyped : marked(open, close);

  function marked(lead: string, tail: string) {
    const start = line.from + bom.length;
    const end = start + lead.length + words.length;
    return {
      text: bom + lead + words + tail,
      kind,
      added: [
        { from: start, to: start + lead.length },
        ...(tail ? [{ from: end, to: end + tail.length }] : []),
      ],
    };
  }
}

/** The one change that turns `from` into `to`, in a text where they start at `at`. */
function difference(from: string, to: string, at: number) {
  const most = Math.min(from.length, to.length);
  let start = 0;
  while (start < most && from[start] === to[start]) start++;
  let end = 0;
  while (end < most - start && from[from.length - 1 - end] === to[to.length - 1 - end]) end++;
  return {
    from: at + start,
    to: at + from.length - end,
    insert: to.slice(start, to.length - end),
  };
}

/**
 * The line a transaction's changes are on, if it's one line: where they start in the old text
 * (`at`), and the range they make in the new.
 */
function typedOnLine(tr: Transaction): { line: Line; at: number; from: number; to: number } | null {
  const { doc } = tr.startState;
  let first = -1;
  let last = -1;
  let start = -1;
  let end = -1;
  let single = true;
  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    if (first < 0) {
      first = fromA;
      start = fromB;
    }
    last = toA;
    end = toB;
    if (inserted.lines > 1) single = false;
  });
  if (first < 0 || !single) return null;
  const line = doc.lineAt(first);
  return last > line.to ? null : { line, at: first, from: start, to: end };
}

const kindsOf = (kind: ClassicKind) => ({ kind, arrivedAs: kind });

const sameSpans = (a: readonly Span[], b: readonly Span[]) =>
  a.length === b.length && a.every((span, i) => span.from === b[i]?.from && span.to === b[i]?.to);

/**
 * Writes the marks and the capitals, on the writer's typing on the cursor's line. Everything else
 * passes: a change the app makes, text still being composed, a replace-all, undo and redo, and a
 * paste, which isn't typing. It runs after `upperCaseTyping`, so it sees what that made.
 */
export const classicMarks: Extension = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent('input.type') || tr.isUserEvent('input.type.compose')) {
    return tr;
  }
  if (tr.annotation(appChange)) return tr;
  const state = tr.startState;
  if (state.selection.ranges.length > 1 || tr.newSelection.ranges.length > 1) return tr;
  const typed = typedOnLine(tr);
  const head = state.selection.main.head;
  if (!typed || head < typed.line.from || head > typed.line.to) return tr;
  const { line } = typed;
  if (blocked(state, line.from)) return tr;

  const held = state.field(classicLine, false);
  const own: StoredLine =
    held?.from === line.from
      ? held
      : {
          ...NO_LINE,
          from: line.from,
          ...kindsOf(lineKindAt(state, line) ?? pendingAt(state, line.from)),
        };
  const added = own.added.flatMap((span) => mapSpan(span, tr.changes) ?? []);

  // The capitals, on the typed text alone, then the mark for the text they make.
  const rawText = tr.newDoc.sliceString(
    line.from,
    line.to + tr.changes.newLength - tr.changes.length,
  );
  const bare = without(rawText, line.from, added);
  const element = headingOrTransition(state, line, bare, own) ?? own.arrivedAs;
  const fix =
    CAPITALS.has(element) && !inNote(state, line, typed.at)
      ? upperFix(tr.newDoc, typed.from, tr.newDoc.sliceString(typed.from, typed.to))
      : null;
  return applySettled(tr, line, own, added, fix, rawText);
});

/** What the filter adds to the typing: the capitals, the mark, the cursor, and what's stored. */
function applySettled(
  tr: Transaction,
  line: Line,
  own: StoredLine,
  added: readonly Span[],
  fix: { from: number; to: number; insert: string } | null,
  rawText: string,
) {
  const state = tr.startState;
  const capitals = fix ? ChangeSet.of(fix, tr.newDoc.length) : null;
  const text = fix
    ? rawText.slice(0, fix.from - line.from) + fix.insert + rawText.slice(fix.to - line.from)
    : rawText;
  const spans = capitals ? added.flatMap((span) => mapSpan(span, capitals) ?? []) : added;
  const settled = settleLine(state, line, text, { ...own, added: spans });

  const head = capitals ? capitals.mapPos(tr.newSelection.main.head, 1) : tr.newSelection.main.head;
  const [lead] = settled.added;
  const gone = spans.reduce((sum, span) => sum + (span.to <= head ? span.to - span.from : 0), 0);
  const changed = settled.text !== text;
  const noted = settled.kind !== own.kind || !sameSpans(settled.added, spans);
  const specs: TransactionSpec[] = [];
  if (fix) specs.push({ changes: fix, sequential: true });
  if (changed || noted) {
    specs.push({
      ...(changed ? { changes: difference(text, settled.text, line.from) } : null),
      ...(changed
        ? { selection: { anchor: head - gone + (lead ? lead.to - lead.from : 0) } }
        : null),
      effects: noted
        ? setStored.of({
            from: line.from,
            kind: settled.kind,
            added: settled.added,
            arrivedAs: own.arrivedAs,
          })
        : [],
      sequential: true,
    });
  }
  return specs.length ? [tr, ...specs] : tr;
}
