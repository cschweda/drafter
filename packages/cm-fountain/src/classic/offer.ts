import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  completionStatus,
  currentCompletions,
  insertCompletionText,
  pickedCompletion,
  selectedCompletion,
  setSelectedCompletion,
  startCompletion,
} from '@codemirror/autocomplete';
import {
  ChangeSet,
  type EditorState,
  type Extension,
  Facet,
  type Line,
  Transaction,
  type TransactionSpec,
} from '@codemirror/state';
import { type Command, type EditorView, ViewPlugin } from '@codemirror/view';
import { type Doc, locations } from '@drafter/fountain';
import { markLabels } from '@drafter/notes';
import {
  anywhereTarget,
  HEADING_PREFIX,
  headingTargets,
  lengthOf,
  nameTargets,
  OPEN_MARK,
  optionsAfter,
  sectionTitles,
  type Target,
  times,
  transitions,
  withoutLine,
} from '../complete';
import { blocked, elementStructure } from '../elements';
import { insideRegion, parsedDoc } from '../state';
import { visibleEnd } from './hidden';
import { hereIn, onward } from './keys';
import {
  type ClassicElement,
  type ClassicKind,
  classicEdit,
  classicLine,
  elementAt,
  mapSpan,
  offersMore,
  setDismissed,
  setStored,
  showChooser,
  typedLine,
} from './line';
import { difference, ownLine, settleLine } from './marks';

// Autofill in Classic Mode (design §7). It's the existing list, told which element the line is. The
// source is synchronous, so a key can ask it for the same ranked answer the list would show, inside
// CodeMirror's typing delay and its 75 ms after a list opens, and take the top one itself.

export interface Offer {
  from: number;
  options: Completion[];
}

/** Told what to say to a screen reader. */
export const classicSay: Facet<(text: string) => void, ((text: string) => void) | null> =
  Facet.define<(text: string) => void, ((text: string) => void) | null>({
    combine: (values) => values[0] ?? null,
  });

const PREFIXES = ['INT.', 'EXT.', 'INT./EXT.', 'EST.', 'I/E'];

/** The layout adds this for a speaker who continues, so it's never a suggestion (§7.1). */
const CONTINUED = /^\(CONT['’]D\)$/i;

/** The most of a label a reader hears: a name can be any length, and a live region reads it all. */
const MOST_SAID = 60;

/** A label for the live region, cut at a whole character. */
function spoken(label: string): string {
  const points = [...label];
  return points.length > MOST_SAID ? `${points.slice(0, MOST_SAID).join('')}…` : label;
}

/** An extension offered on nothing typed: it waits for Down, and Enter and Tab pass it by. */
const WAITING = new WeakSet<Completion>();

/** What an option does after writing: stays, goes on to the next element, or offers what comes next on the line. */
type After = 'stay' | 'go on' | 'offer more';

interface Spot extends Target {
  after: After;
  /** How much must be typed for a list to open without being asked for. */
  least: number;
  /** What's written for a label, if it isn't the label. */
  write?: (label: string) => string;
}

/**
 * The places of the scene headings, by the nearest last use above `lineFrom`, then by use: the walk
 * `names` makes. Fountain Mode's list keeps the most used first.
 */
export function placesRecent(doc: Doc, lineFrom: number): string[] {
  const last = new Map<string, number>();
  for (const block of doc.blocks) {
    if (block.span.to >= lineFrom) break;
    if (block.kind === 'scene_heading' && block.sem.location) {
      last.set(block.sem.location, block.span.from);
    }
  }
  return locations(doc)
    .sort((a, b) => (last.get(b.text) ?? -1) - (last.get(a.text) ?? -1) || b.count - a.count)
    .map(({ text }) => text);
}

/** A cue's spots: its name, which goes on to Dialogue, and an extension, which stays. */
function cueSpots(line: Line, text: string, start: number): Spot[] {
  const mark = lengthOf(/^@\s*/, text);
  return nameTargets(line, text.slice(mark), start + mark, true).map((target) => {
    if (target.role !== 'extension') return { ...target, after: 'go on', least: 1 };
    const labels = (doc: Doc) => target.labels(doc).filter((label) => !CONTINUED.test(label));
    return { ...target, labels, after: 'stay', least: 0 };
  });
}

/** A heading's spots: a prefix if it was chosen, a place, and a time. */
function headingSpots(
  line: Line,
  text: string,
  start: number,
  chosen: boolean,
  pos: number,
): Spot[] {
  const mark = text.startsWith('.') ? 1 : 0;
  const body = text.slice(mark);
  const from = start + mark;
  const prefix = HEADING_PREFIX.exec(body);
  if (!prefix) {
    if (!chosen) return [];
    const write = (label: string) => `${label} `;
    return [{ from, labels: () => PREFIXES, after: 'offer more', least: 1, write }];
  }
  const rest = body.slice(prefix[0].length);
  const placesIn = (doc: Doc) => placesRecent(doc, line.from);
  const found = headingTargets(rest, from + prefix[0].length, placesIn).map(
    (target): Spot =>
      target.role === 'time'
        ? { ...target, after: 'go on', least: 1 }
        : { ...target, after: 'offer more', least: 1 },
  );
  // Past an exact place the times are offered, and the dash isn't written until one is accepted.
  const place = rest.toLowerCase();
  const exact = (doc: Doc) => placesIn(doc).some((label) => label.toLowerCase() === place);
  found.push({
    from: pos,
    labels: (doc) => (exact(doc) ? times(doc) : []),
    after: 'go on',
    least: Number.POSITIVE_INFINITY,
    write: (label) => ` - ${label}`,
  });
  return found;
}

/** What the element at the end of a line offers (§7.1). */
function elementSpots(
  state: EditorState,
  element: ClassicElement,
  line: Line,
  text: string,
  start: number,
  pos: number,
): Spot[] {
  switch (element.kind) {
    case 'character':
      return cueSpots(line, text, start);
    case 'transition':
      return [
        {
          from: start + lengthOf(/^>\s*/, text),
          labels: (doc) => transitions(doc),
          after: 'go on',
          least: 1,
        },
      ];
    case 'scene_heading': {
      if (state.facet(elementStructure)().headings) {
        const chosen = state.field(classicLine, false)?.chosen ?? false;
        return headingSpots(line, text, start, chosen, pos);
      }
      const from = start + lengthOf(/^#+\s*/, text);
      return [{ from, labels: (doc) => sectionTitles(doc), after: 'stay', least: 1 }];
    }
    default:
      return [];
  }
}

/** Where the cursor's line can be completed, best first. */
function spotsAt(
  state: EditorState,
  element: ClassicElement,
  line: Line,
  pos: number,
  explicit: boolean,
): Spot[] {
  const text = state.sliceDoc(line.from, pos).trimStart();
  const start = pos - text.length;
  const open = OPEN_MARK.exec(text);
  if (open) {
    const from = pos - (open[1] ?? '').length;
    return [{ from, labels: (doc) => markLabels(doc), after: 'stay', least: 2 }];
  }
  if (element.tab === null || insideRegion(state.field(parsedDoc), pos)) return [];
  const own =
    pos >= visibleEnd(state, line) ? elementSpots(state, element, line, text, start, pos) : [];
  // A heading and a transition have their own lists, and nothing else belongs on them.
  if (!explicit || (own.length && element.kind !== 'character')) return own;
  return [...own, { ...anywhereTarget(line, text, start), after: 'stay', least: 0 }];
}

/**
 * What §7.1 offers at `pos`, ranked; null where nothing is, or autofill was dismissed. Asking is
 * the writer's own act, so `explicit` goes past a dismissal.
 */
export function offerAt(state: EditorState, pos: number, explicit: boolean): Offer | null {
  const element = elementAt(state);
  if (!element) return null;
  if (!explicit && state.field(classicLine, false)?.dismissed) return null;
  const line = state.doc.lineAt(pos);
  const spots = spotsAt(state, element, line, pos, explicit);
  if (!spots.length) return null;
  const doc = withoutLine(state.field(parsedDoc), line);
  for (const spot of spots) {
    const query = state.sliceDoc(spot.from, pos);
    if (!explicit && query.length < spot.least) continue;
    const options = optionsAfter(query, spot.labels(doc)).map(({ label }) =>
      optionFor(label, spot),
    );
    if (!options.length) continue;
    if (spot.role === 'extension' && !query) for (const option of options) WAITING.add(option);
    return { from: spot.from, options };
  }
  return null;
}

/** `offerAt` as a completion source, through `completionOverride`. */
export function classicSource(context: CompletionContext): CompletionResult | null {
  const { state, pos, explicit } = context;
  const offer = offerAt(state, pos, explicit);
  if (!offer) return null;
  const query = state.sliceDoc(offer.from, pos);
  const matched = query ? [0, query.length] : [];
  return { ...offer, filter: false, getMatch: () => matched };
}

/** The line with `insert` at the range, settled: its mark, and the transaction that writes them. */
function written(
  state: EditorState,
  line: Line,
  from: number,
  to: number,
  insert: string,
  completion: Completion,
): TransactionSpec {
  const own = ownLine(state, line);
  const text = state.sliceDoc(line.from, from) + insert + state.sliceDoc(to, line.to);
  const change = ChangeSet.of({ from, to, insert }, state.doc.length);
  const added = own.added.flatMap((span) => mapSpan(span, change) ?? []);
  const head = from + insert.length;
  const settled = blocked(state, line.from)
    ? { text, kind: own.kind, added }
    : settleLine(state, line, text, { ...own, added });
  const gone = added.reduce((sum, span) => sum + (span.to <= head ? span.to - span.from : 0), 0);
  const lead = settled.added[0];
  const within = settled.added.some((span) => span.to <= head);
  const anchor = head - gone + (lead && within ? lead.to - lead.from : 0);
  const { from: start, to: end, insert: inserted } = difference(line.text, settled.text, line.from);
  return {
    ...insertCompletionText(state, inserted, start, end),
    selection: { anchor },
    annotations: [pickedCompletion.of(completion), classicEdit.of(true)],
    effects: setStored.of({
      from: line.from,
      kind: settled.kind,
      added: settled.added,
      arrivedAs: own.arrivedAs,
    }),
  };
}

/** The element's own word for where accepting went. */
const WORDS: Partial<Record<ClassicKind, string>> = { dialogue: 'Dialogue', action: 'Action' };

/** Writes an option, and does what follows it (§7.3), in one transaction. */
function accept(
  view: EditorView,
  completion: Completion,
  from: number,
  to: number,
  { after, write }: Spot,
) {
  const { state } = view;
  const { label } = completion;
  const first = written(
    state,
    state.doc.lineAt(from),
    from,
    to,
    write?.(label) ?? label,
    completion,
  );
  const say = state.facet(classicSay);
  const words = spoken(label);
  const sentence = /[.:?!…]$/.test(words) ? words : `${words}.`;
  const here = after === 'go on' ? hereIn(state.update({ ...first, filter: false }).state) : null;
  if (here) {
    const kind = here.element.enter as ClassicKind;
    view.dispatch(first, { ...onward(here, kind, 'enter'), sequential: true });
    say?.(`${sentence} ${WORDS[kind]}.`);
    return;
  }
  if (after === 'offer more') view.dispatch(first, { effects: offersMore.of(null) });
  else view.dispatch(first);
  say?.(sentence);
  if (after === 'offer more') startCompletion(view);
}

/**
 * How a transaction moved the writer on, for an announcer: by one of Classic Mode's keys, or by an
 * accepted offer, which says where it went itself. The chooser opening says itself too, and stays.
 */
export function classicMoveBy(tr: Transaction): 'key' | 'offer' | null {
  if (tr.annotation(pickedCompletion)) return 'offer';
  if (!tr.annotation(classicEdit) || tr.annotation(Transaction.userEvent) !== 'input') return null;
  return tr.effects.some((effect) => effect.is(showChooser)) ? null : 'key';
}

function optionFor(label: string, spot: Spot): Completion {
  return { label, apply: (view, completion, from, to) => accept(view, completion, from, to, spot) };
}

type Apply = (view: EditorView, completion: Completion, from: number, to: number) => void;

/** The top of what's offered, if a key may take it: only what the writer is typing (§7.3). */
function topOffer(state: EditorState, head: number) {
  const typed = state.field(typedLine, false);
  if (!typed) return null;
  // Offered more and not sent away: the list is on its way, and the key is its.
  const more = typed.more && !state.field(classicLine, false)?.dismissed;
  const offer = offerAt(state, head, more);
  const top = offer?.options[0];
  return offer && top && !WAITING.has(top) ? { from: offer.from, option: top } : null;
}

/** The highlighted option, wherever the list came from. */
function highlightedOffer(state: EditorState, head: number, label: string) {
  for (const explicit of [false, true]) {
    const offer = offerAt(state, head, explicit);
    const option = offer?.options.find((listed) => listed.label === label);
    if (offer && option) return { from: offer.from, option };
  }
  return null;
}

/**
 * The highlighted option of an open list, or the top of `offerAt` on a line being typed; applies it
 * in one transaction. False with nothing to accept. It never hands over to `acceptCompletion`,
 * which refuses for 75 ms after a list opens, and a setting all modes share can't change.
 */
export const acceptOffer: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  const { head } = state.selection.main;
  const highlighted = selectedCompletion(state)?.label;
  const found =
    highlighted === undefined ? topOffer(state, head) : highlightedOffer(state, head, highlighted);
  if (!found) return false;
  (found.option.apply as Apply)(view, found.option, found.from, head);
  return true;
};

/**
 * Escape: autofill stays away until the next letter (§7.3). It returns false, so CodeMirror's
 * `closeCompletion` takes the key with a list open, and the view arms Tab without one.
 */
export const dismissOffer: Command = (view) => {
  const { state } = view;
  const element = elementAt(state);
  if (!element || element.tab === null) return false;
  const stored = state.field(classicLine, false);
  if (stored?.dismissed) return false;
  // A line with text the cursor came back to has nothing stored to carry the dismissal.
  const store = stored ? [] : [setStored.of({ kind: element.kind as ClassicKind })];
  view.dispatch({ effects: [...store, setDismissed.of(true)] });
  return false;
};

/**
 * Says the list to a reader that doesn't follow an active descendant (§7.4), and takes the highlight
 * off a list that waits, as the highlighted row is the one Enter and Tab write. A list opens in
 * CodeMirror's own update, so that goes in a microtask.
 */
export const offerWords: Extension = ViewPlugin.define((view) => {
  let last: string | null = null;
  let seen: readonly Completion[] | null = null;
  let live = true;
  const say = (text: string) => view.state.facet(classicSay)?.(text);
  const counted = (count: number) => `${count} suggestion${count === 1 ? '' : 's'}`;
  return {
    update({ state }) {
      if (!completionStatus(state)) {
        last = null;
        seen = null;
        return;
      }
      const options = currentCompletions(state);
      const [top] = options;
      if (top && options !== seen && WAITING.has(top)) {
        seen = options;
        queueMicrotask(() => {
          if (live) view.dispatch({ effects: setSelectedCompletion(-1) });
        });
        if (last === null) say(counted(options.length));
        last = '';
        return;
      }
      const label = selectedCompletion(state)?.label ?? null;
      // While a list narrows it's away for a moment, and coming back isn't opening.
      if (label === null || label === last) return;
      const row = spoken(label);
      say(last === null ? `${counted(options.length)}: ${row}` : row);
      last = label;
    },
    destroy() {
      live = false;
    },
  };
});
