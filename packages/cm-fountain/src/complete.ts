import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
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
  /** What to offer, best first. It reads the parse, so it is called only if a list may open. */
  labels: () => string[];
}

/**
 * Completes character names, locations, times, transitions, and section titles (technical design
 * §3.4). Typing opens a list once what is being completed has two characters; asking for one
 * (`context.explicit`) opens it at any length. What is offered is matched against the start of the
 * text between where the completion starts and the cursor, ignoring case, and ranked here, so the
 * list is not filtered or reordered again.
 *
 * A label that is the typed text itself is left out. The list opens with its first option
 * selected, so Enter would accept it, to change nothing, instead of going on to the line below.
 * With nothing else left, no list opens (Phase 1 design §5.3).
 *
 * The state must have `parsedDoc`.
 */
export function fountainCompletionSource(context: CompletionContext): CompletionResult | null {
  const { state, pos, explicit } = context;
  const doc = state.field(parsedDoc);
  for (const { from, labels } of targets(state, doc, pos, explicit)) {
    const query = state.sliceDoc(from, pos);
    if (!explicit && query.length < 2) continue;
    const options = optionsAfter(query, labels());
    if (options.length > 0) {
      // The typed start of each label is the part that matched.
      const matched = query ? [0, query.length] : [];
      return { from, options, filter: false, getMatch: () => matched };
    }
  }
  return null;
}

/**
 * `autocompletion` with `fountainCompletionSource` as its only source. It brings `parsedDoc` with
 * it, so a state can have the completion without adding the field first.
 */
export function fountainCompletion(): Extension {
  return [parsedDoc, autocompletion({ override: [fountainCompletionSource] })];
}

/**
 * The labels that go on from `query`, ignoring case, as options. A label as long as `query` is
 * `query` itself, whatever its case, and is left out.
 */
function optionsAfter(query: string, labels: readonly string[]): Completion[] {
  const start = query.toLowerCase();
  const options: Completion[] = [];
  for (const label of labels) {
    if (label.length > query.length && label.slice(0, query.length).toLowerCase() === start) {
      options.push({ label });
    }
  }
  return options;
}

/** How many characters of `text` the pattern, anchored at its start, matches. */
const lengthOf = (pattern: RegExp, text: string) => pattern.exec(text)?.[0].length ?? 0;

/** The places where the cursor's line can be completed, best first; most lines have none. */
function targets(state: EditorState, doc: Doc, pos: number, explicit: boolean): Target[] {
  const line = state.doc.lineAt(pos);
  // Leading space is no part of the line to the parser, and none to the completion.
  const text = state.sliceDoc(line.from, pos).trimStart();
  const start = pos - text.length;
  if (text.startsWith('#')) {
    return [{ from: start + lengthOf(/^#+\s*/, text), labels: () => sectionTitles(doc) }];
  }
  if (text.startsWith('>')) {
    return [{ from: start + lengthOf(/^>\s*/, text), labels: () => transitions(doc) }];
  }
  const prefix = HEADING_PREFIX.exec(text);
  if (prefix) return headingTargets(doc, text.slice(prefix[0].length), start + prefix[0].length);
  return cueTargets(state, doc, line, text, start, explicit);
}

/** After a scene heading's prefix and its space: a location, or after the last ` - `, a time. */
function headingTargets(doc: Doc, rest: string, from: number): Target[] {
  // The parser splits a heading on its last hyphen or en dash with a space on each side.
  const dash = Math.max(rest.lastIndexOf(' - '), rest.lastIndexOf(' \u2013 '));
  if (dash === -1) return [{ from, labels: () => places(doc) }];
  const time = dash + 3;
  const skipped = lengthOf(/^\s*/, rest.slice(time));
  return [{ from: from + time + skipped, labels: () => times(doc) }];
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
  doc: Doc,
  line: Line,
  text: string,
  start: number,
  explicit: boolean,
): Target[] {
  if (line.number > 1 && !isBlank(state.doc.line(line.number - 1).text)) return [];
  const forced = text.startsWith('@');
  const mark = forced ? lengthOf(/^@\s*/, text) : 0;
  const body = text.slice(mark);
  const from = start + mark;
  const name = body.slice(0, /[(^]/.exec(body)?.index ?? body.length);
  if (!forced && (/\p{Ll}/u.test(name) || !(explicit || hasTwoLetters(name)))) return [];

  const paren = body.lastIndexOf('(');
  if (paren === -1) {
    const found: Target[] = [{ from, labels: () => names(doc, line.from, forced) }];
    // After a name and a space, unless the name goes on (`OLD MAN`).
    if (body.length > body.trimEnd().length) {
      found.push({ from: from + body.length, labels: () => extensions(doc) });
    }
    return found;
  }
  // From the last parenthesis, if it is still open and a name comes before it.
  const open = name !== '' && !body.includes(')', paren);
  return open ? [{ from: from + paren, labels: () => extensions(doc) }] : [];
}

/** Blank as the parser reads it: empty or spaces, except exactly two spaces, which join lines. */
function isBlank(line: string): boolean {
  const text = line.endsWith('\r') ? line.slice(0, -1) : line;
  return text !== '  ' && text.trim() === '';
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
