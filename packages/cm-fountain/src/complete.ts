import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  insertCompletionText,
  pickedCompletion,
} from '@codemirror/autocomplete';
import type { EditorState, Extension, Line } from '@codemirror/state';
import { type Block, characters, type Doc, locations } from '@drafter/fountain';
import { parsedDoc } from './state';

// Completion for the Source pane (technical design §3.4). What to offer is read from the parse in
// the state. Where to offer it is read from the text of the line: the parse can't say what a line
// is while it is being typed, since a cue with no speech under it yet is action. So the contexts
// follow the classification rules of §2.5 on the text before the cursor.

/** Offered after the ones the script uses: times of day, transitions, and cue extensions. */
const TIMES = ['DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MOMENTS LATER'];
const TRANSITIONS = ['CUT TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'FADE OUT.'];
const EXTENSIONS = ['(V.O.)', '(O.S.)'];

/** A scene heading's prefix and the space after it, as the parser reads a prefix (§2.5, rule 11). */
const HEADING_PREFIX = /^(?:INT\.?\/EXT\.?|INT\.?|EXT\.?|EST\.?|I\/E\.?)\s+/i;

const NONE: readonly string[] = [];

/** Where a completion starts, and what it offers there. */
interface Target {
  /** The start of the text it replaces, which runs to the cursor. */
  from: number;
  /**
   * What to offer, best first, from the parse without the cursor's own line. It reads the parse,
   * so it is called only if a list may open.
   */
  labels: (doc: Doc) => string[];
  /**
   * Where a transition's `>` is: a transition that ends in `TO:` needs no mark, so accepting one
   * replaces the `>` too (the element bar writes it on an empty line, then opens this list).
   */
  mark?: number;
}

/**
 * Completes character names, locations, times, transitions, and section titles (technical design
 * §3.4). Typing opens a list once what is being completed has two characters; asking for one
 * (`context.explicit`) opens it at any length. What is offered is matched against the start of the
 * text between where the completion starts and the cursor, ignoring case, and ranked here, so the
 * list is not filtered or reordered again.
 *
 * When the typed text is already one of the labels, nothing is offered. The list opens with its
 * first option selected, so Enter would accept it: for a name that is a longer one (`DANNY` for the
 * `DAN` typed), and otherwise the same text, to change nothing, instead of going on to the line
 * below. The writer types another letter to reach the longer name (Phase 1 design §5.3).
 *
 * The state must have `parsedDoc`.
 */
export function fountainCompletionSource(context: CompletionContext): CompletionResult | null {
  const { state, pos, explicit } = context;
  const doc = state.field(parsedDoc);
  for (const { from, labels, mark } of targets(state, pos, explicit)) {
    const query = state.sliceDoc(from, pos);
    if (!explicit && query.length < 2) continue;
    let options = optionsAfter(query, labels(withoutLine(doc, state.doc.lineAt(pos))));
    if (mark !== undefined) options = options.map((option) => bare(option, mark));
    if (options.length > 0) {
      // The typed start of each label is the part that matched.
      const matched = query ? [0, query.length] : [];
      return { from, options, filter: false, getMatch: () => matched };
    }
  }
  return null;
}

/** A transition that ends in `TO:`, accepted over its `>` as well, since it needs none. */
function bare(option: Completion, mark: number): Completion {
  if (!option.label.endsWith('TO:')) return option;
  return {
    ...option,
    apply: (view, completion, _from, to) =>
      view.dispatch({
        ...insertCompletionText(view.state, completion.label, mark, to),
        annotations: pickedCompletion.of(completion),
      }),
  };
}

/**
 * `autocompletion` with `fountainCompletionSource` as its only source. It brings `parsedDoc` with
 * it, so a state can have the completion without adding the field first.
 */
export function fountainCompletion(): Extension {
  return [parsedDoc, autocompletion({ override: [fountainCompletionSource] })];
}

/**
 * The parse without the blocks on `line`. The cursor's own line is being typed, and the parser
 * may already read it as a cue, a heading, or a section: it must not be a label, or the text
 * typed would always equal one.
 */
function withoutLine(doc: Doc, line: Line): Doc {
  const blocks = doc.blocks.filter(
    (block) => block.span.to < line.from || block.span.from > line.to,
  );
  return blocks.length === doc.blocks.length ? doc : { ...doc, blocks };
}

/**
 * The labels that go on from `query`, ignoring case, as options. If a label is `query` itself,
 * whatever its case, there are none: the writer has typed a whole name, and the list would open
 * with a longer one selected, so that Enter lengthened the name instead of going on. To reach the
 * longer name the writer types another letter.
 */
function optionsAfter(query: string, labels: readonly string[]): Completion[] {
  const start = query.toLowerCase();
  const options: Completion[] = [];
  for (const label of labels) {
    if (label.length < query.length || label.slice(0, query.length).toLowerCase() !== start) {
      continue;
    }
    if (label.length === query.length) return [];
    options.push({ label });
  }
  return options;
}

/** How many characters of `text` the pattern, anchored at its start, matches. */
const lengthOf = (pattern: RegExp, text: string) => pattern.exec(text)?.[0].length ?? 0;

/** The places where the cursor's line can be completed, best first; most lines have none. */
function targets(state: EditorState, pos: number, explicit: boolean): Target[] {
  const line = state.doc.lineAt(pos);
  // Leading space is no part of the line to the parser, and none to the completion.
  const text = state.sliceDoc(line.from, pos).trimStart();
  const start = pos - text.length;
  if (text.startsWith('#')) {
    return [{ from: start + lengthOf(/^#+\s*/, text), labels: (d) => sectionTitles(d) }];
  }
  if (text.startsWith('>')) {
    return [{ from: start + lengthOf(/^>\s*/, text), labels: (d) => transitions(d), mark: start }];
  }
  const prefix = HEADING_PREFIX.exec(text);
  if (prefix) return headingTargets(text.slice(prefix[0].length), start + prefix[0].length);
  const cue = cueTargets(state, line, text, start, explicit);
  // Asking for a list on a line that is no other context completes the word before the cursor.
  return explicit ? [...cue, anywhereTarget(line, text, start)] : cue;
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;
const WORD_CHARACTER = /^[\p{L}\p{N}'\u2019]$/u;

/**
 * Where the word before the cursor starts in `text`, which ends at the cursor. It steps back
 * one character at a time, since a pattern anchored at the end of a long run of letters costs
 * the square of its length.
 */
function wordStart(text: string): number {
  let at = text.length;
  while (at > 0) {
    const pair =
      at > 1 && isLowSurrogate(text.charCodeAt(at - 1)) && isHighSurrogate(text.charCodeAt(at - 2));
    const size = pair ? 2 : 1;
    if (!WORD_CHARACTER.test(text.slice(at - size, at))) break;
    at -= size;
  }
  return at;
}

/**
 * Ctrl+Space anywhere (Phase 1 design §5.3): every name that goes on from the word before the
 * cursor, as text. It is no cue, so a name that needs an `@` to be one is offered like the rest.
 */
function anywhereTarget(line: Line, text: string, start: number): Target {
  const at = wordStart(text);
  // With no word yet, the cast is listed only where a word may begin: not after `)` or a `,`.
  const none = at === text.length && text !== '' && !/\s$/u.test(text);
  return { from: start + at, labels: (d) => (none ? NONE.slice() : names(d, line.from, true)) };
}

/** After a scene heading's prefix and its space: a location, or after the last ` - `, a time. */
function headingTargets(rest: string, from: number): Target[] {
  // The parser splits a heading on its last hyphen or en dash with a space on each side.
  const dash = Math.max(rest.lastIndexOf(' - '), rest.lastIndexOf(' \u2013 '));
  if (dash === -1) return [{ from, labels: (d) => places(d) }];
  const time = dash + 3;
  const skipped = lengthOf(/^\s*/, rest.slice(time));
  return [{ from: from + time + skipped, labels: (d) => times(d) }];
}

/**
 * On a cue line, a name; or after a name and a space, an extension. A cue line is one that §2.5
 * (rule 12) would read as a cue if a speech followed it: the line before it is blank or there is
 * none, and it starts with `@`, or its name has two letters and none of them lower case. Only the
 * name counts, since an extension may be any case (`HANS (on the radio)`).
 *
 * Asking is more generous than typing: with the line before blank, an empty line or a single
 * letter is a place for a name too, so that Ctrl+Space on a new line lists the cast.
 */
function cueTargets(
  state: EditorState,
  line: Line,
  text: string,
  start: number,
  explicit: boolean,
): Target[] {
  if (line.number > 1 && !isBlankAbove(state.doc.line(line.number - 1).text)) return [];
  const forced = text.startsWith('@');
  const mark = forced ? lengthOf(/^@\s*/, text) : 0;
  const body = text.slice(mark);
  const from = start + mark;
  const name = body.slice(0, /[(^]/.exec(body)?.index ?? body.length);
  if (!forced && (/\p{Ll}/u.test(name) || !(explicit || hasTwoLetters(name)))) return [];

  const paren = body.lastIndexOf('(');
  if (paren === -1) {
    const found: Target[] = [{ from, labels: (d) => names(d, line.from, forced) }];
    // After a name and a space, unless the name goes on (`OLD MAN`).
    if (body.length > body.trimEnd().length) {
      found.push({ from: from + body.length, labels: (d) => extensions(d) });
    }
    return found;
  }
  // From the last parenthesis, if it is still open and a name comes before it.
  const open = name !== '' && !body.includes(')', paren);
  return open ? [{ from: from + paren, labels: (d) => extensions(d) }] : [];
}

/** Blank as the parser reads it: empty or spaces, except exactly two spaces, which join lines. */
function isBlank(line: string): boolean {
  const text = line.endsWith('\r') ? line.slice(0, -1) : line;
  return text !== '  ' && text.trim() === '';
}

/**
 * Whether a cue can follow this line directly. A blank line, and a line that starts a section
 * (`#`), a synopsis (`=`), or a page break (`===`), each end the block above and are a block of
 * their own, so the parser reads a cue right under one as it reads one under a blank line.
 */
function isBlankAbove(line: string): boolean {
  return isBlank(line) || /^\s*[#=]/.test(line);
}

function hasTwoLetters(text: string): boolean {
  const letters = text.matchAll(/\p{L}/gu);
  return !letters.next().done && !letters.next().done;
}

/** The parser's test for a cue's name: a capital, and nothing in lower case (§2.5). */
const isUpper = (name: string) => /\p{Lu}/u.test(name) && !/\p{Ll}/u.test(name);

/**
 * The names of the characters, ranked by the nearest last cue before the cursor's line, then by
 * the number of cues. Without an `@` only the names that read as a cue alone are offered: a name
 * with lower case, or with no case at all, would not make the line a cue.
 */
function names(doc: Doc, lineFrom: number, forced: boolean): string[] {
  // `characters` gives the last cue in the whole script, and the ranking wants the last one
  // before the cursor, so the cues before it are walked once.
  const lastCue = new Map<string, number>();
  for (const block of doc.blocks) {
    if (block.span.to >= lineFrom) break;
    if (block.kind === 'character') lastCue.set(block.sem.name, block.span.from);
  }
  return characters(doc)
    .filter(({ name }) => forced || isUpper(name))
    .sort((a, b) => (lastCue.get(b.name) ?? -1) - (lastCue.get(a.name) ?? -1) || b.count - a.count)
    .map(({ name }) => name);
}

/** The locations of the scene headings, the most used first. */
function places(doc: Doc): string[] {
  return locations(doc)
    .sort((a, b) => b.count - a.count)
    .map(({ text }) => text);
}

/** What `read` takes from each block, with how often each text was taken, in order of first use. */
function tally(doc: Doc, read: (block: Block) => readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const block of doc.blocks) {
    for (const text of read(block)) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return counts;
}

/** The texts the script uses, the most used first, and then those of `stock` that it doesn't. */
function usedThenStock(used: Map<string, number>, stock: readonly string[]): string[] {
  const labels = [...used].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  for (const label of stock) if (!used.has(label)) labels.push(label);
  return labels;
}

const times = (doc: Doc) =>
  usedThenStock(
    tally(doc, (block) =>
      block.kind === 'scene_heading' && block.sem.time ? [block.sem.time] : NONE,
    ),
    TIMES,
  );

const transitions = (doc: Doc) =>
  usedThenStock(
    tally(doc, (block) => (block.kind === 'transition' ? [block.sem.text] : NONE)),
    TRANSITIONS,
  );

/** Each extension on its own, though a cue may have several: `(V.O.) (SUBTITLED)` is two. */
const extensions = (doc: Doc) =>
  usedThenStock(
    tally(doc, (block) =>
      block.kind === 'character' ? (block.sem.extension?.match(/\([^)]*\)/g) ?? NONE) : NONE,
    ),
    EXTENSIONS,
  );

/** The titles of the sections, each once, in the order of the script. */
const sectionTitles = (doc: Doc) => [
  ...tally(doc, (block) => (block.kind === 'section' ? [block.sem.text] : NONE)).keys(),
];
