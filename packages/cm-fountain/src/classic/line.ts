import { invertedEffects } from '@codemirror/commands';
import {
  Annotation,
  type AnnotationType,
  type ChangeDesc,
  type EditorState,
  type Extension,
  type Line,
  StateEffect,
  StateField,
  Transaction,
} from '@codemirror/state';
import { type Block, blockAt, type Doc, type Span } from '@drafter/fountain';
import { blocked, type ElementKind, elementStructure, isBlank, underSpeech } from '../elements';
import { cueIndex } from '../keymap';
import { appChange, parsedDoc, regionAt } from '../state';
import { isBlankScript } from './hidden';

// Classic Mode's idea of the element on a line (design §5). A line with text is what the parser
// says it is. An empty line has nothing to say, so what the next thing typed will be is worked out
// from what's around it, and only what can't be worked out is stored: that way a click on an empty
// line, an undo, and a newly opened script all behave the same.

/** `scene_heading` in a play is a Scene (`##`), and `action` a stage direction, as the element commands read them. */
export type ClassicKind = ElementKind | 'page_break';

export interface StoredLine {
  /** The start of the line, mapped through changes. */
  from: number;
  kind: ClassicKind;
  /** §4.2: empty on arrival, not chosen, the cursor hasn't left. */
  soft: boolean;
  /** A pending element the writer chose (Tab, the chooser, a bar button). */
  chosen: boolean;
  /** The marks Classic wrote on this line in this stay, as positions. */
  added: readonly Span[];
  /** The empty line or `()` made in this stay, with the breaks that made it (§4.4). */
  made: Span | null;
  /** The `!` Shift+Enter wrote on the line above for `made`, which goes when it does (§4.4). */
  madeMark?: Span | null;
  /** Autofill dismissed with Escape, until the next letter (§7.3). */
  dismissed: boolean;
  /** The line was empty when it was stored, so what's on it was typed in this stay. */
  beganEmpty: boolean;
  /** What the line was before any shape typed on it (§4.2), which it goes back to when the shape ends. */
  arrivedAs: ClassicKind;
}

export interface ClassicElement {
  kind: ClassicKind | 'note' | 'boneyard' | 'title_page';
  pending: boolean;
  soft: boolean;
  /** What Enter and Tab would do here: an element, or the chooser. */
  enter: ClassicKind | 'chooser' | null;
  tab: ClassicKind | null;
}

/** Marks a transaction as Classic Mode's own, so the stored line goes on through it. */
export const classicEdit: AnnotationType<true> = Annotation.define<true>();

/**
 * Stores the element of the cursor's line, in the state the transaction makes. What it doesn't
 * name stays as it was on that line; on any other line it starts empty. An element chosen isn't soft.
 */
export const setStored = StateEffect.define<Partial<StoredLine> & { kind: ClassicKind }>();

/** The stored line as it was before a change, put back by undo and redo. */
export const restoreLine = StateEffect.define<StoredLine>({
  map: (line, changes) => mapLine(line, changes),
});

/** Autofill dismissed on the stored line, or not. */
export const setDismissed = StateEffect.define<boolean>();

/** Where Enter and Tab go from a place in the script. */
export interface NextPlace {
  enter: ClassicKind | 'chooser';
  tab: ClassicKind;
}

/**
 * Where Enter and Tab go (§6.1, §6.2), for the status line and the keys alike. The same table
 * serves both templates: in a play `action` is a stage direction and `scene_heading` a Scene.
 */
export const NEXT = {
  /** A line with text. */
  line: {
    act: { enter: 'scene_heading', tab: 'scene_heading' },
    scene_heading: { enter: 'action', tab: 'action' },
    action: { enter: 'action', tab: 'character' },
    character: { enter: 'dialogue', tab: 'dialogue' },
    parenthetical: { enter: 'dialogue', tab: 'dialogue' },
    dialogue: { enter: 'character', tab: 'parenthetical' },
    transition: { enter: 'action', tab: 'action' },
    centered: { enter: 'action', tab: 'action' },
    lyric: { enter: 'lyric', tab: 'action' },
    section: { enter: 'action', tab: 'action' },
    synopsis: { enter: 'action', tab: 'action' },
    page_break: { enter: 'action', tab: 'action' },
  } satisfies Record<ClassicKind, NextPlace>,
  /** A line of a speech with more of the speech under it: a blank line here would cut the speech. */
  dialogueMidSpeech: { enter: 'dialogue', tab: 'parenthetical' } satisfies NextPlace,
  /** A lyric under a name. */
  lyricInSpeech: { enter: 'lyric', tab: 'dialogue' } satisfies NextPlace,
  /** The empty line's walk, by whether the template has headings. */
  row: {
    screenplay: ['action', 'character', 'transition', 'scene_heading'],
    play: ['action', 'character', 'act', 'scene_heading'],
  } satisfies Record<string, ClassicKind[]>,
  /** Pending Dialogue steps off the row. */
  pendingDialogue: { enter: 'chooser', tab: 'parenthetical' } satisfies NextPlace,
} as const;

/**
 * What the keys write on the way to an element (§6.1), beside `NEXT`, as what's written follows
 * from where the key goes: a new element gets a blank line, and what's still the speech one break.
 */
export const WRITES = {
  by: {
    act: 'blank',
    scene_heading: 'blank',
    action: 'blank',
    character: 'blank',
    dialogue: 'break',
    parenthetical: 'parens',
    transition: 'blank',
    centered: 'blank',
    lyric: 'break',
    section: 'blank',
    synopsis: 'blank',
    page_break: 'blank',
  } satisfies Record<ClassicKind, 'blank' | 'break' | 'parens'>,
  /** What each key goes to that the writer chose, which can't be worked out from the text. */
  firm: {
    enter: ['act', 'scene_heading', 'lyric'],
    tab: ['act', 'scene_heading', 'lyric', 'character'],
  } satisfies Record<string, ClassicKind[]>,
} as const;

/** What `nextFrom` needs to know about the place. */
interface Place {
  /** Whether the template has headings, which picks the row. */
  headings: boolean;
  empty: boolean;
  /** The cursor at the line's end, with no more of the speech under it. */
  lastOfSpeech: boolean;
  /** Under a name or a line of speech. */
  inSpeech: boolean;
}

/** Where Enter and Tab go from `kind` at a place. An element off the row joins it at its start. */
export function nextFrom(kind: ClassicKind, place: Place): NextPlace {
  if (place.empty) {
    if (kind === 'dialogue' || (kind === 'lyric' && place.inSpeech)) return NEXT.pendingDialogue;
    const row: readonly ClassicKind[] = place.headings ? NEXT.row.screenplay : NEXT.row.play;
    return { enter: 'chooser', tab: row[(row.indexOf(kind) + 1) % row.length] as ClassicKind };
  }
  if (kind === 'dialogue' && !place.lastOfSpeech) return NEXT.dialogueMidSpeech;
  if (kind === 'lyric' && place.inSpeech) return NEXT.lyricInSpeech;
  return NEXT.line[kind];
}

/** The last block that ends above `pos`, and its index, leaving out notes and boneyards. */
function elementAbove(doc: Doc, pos: number): number {
  const { blocks } = doc;
  let low = 0;
  let high = blocks.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((blocks[middle] as Block).span.to < pos) low = middle + 1;
    else high = middle;
  }
  let index = low - 1;
  while (index >= 0) {
    const { kind } = blocks[index] as Block;
    if (kind !== 'note' && kind !== 'boneyard') break;
    index--;
  }
  return index;
}

/**
 * What the next thing typed on the empty line at `pos` will be (§5): Dialogue directly under a
 * name, a parenthetical, or a line of speech, Character after a speech, and otherwise Action.
 */
export function pendingAt(state: EditorState, pos: number): ClassicKind {
  if (underSpeech(state, pos)) return 'dialogue';
  const doc = state.field(parsedDoc);
  const above = elementAbove(doc, state.doc.lineAt(pos).from);
  return above >= 0 && cueIndex(doc.blocks, above) >= 0 ? 'character' : 'action';
}

/** A deliberate blank line of a speech (§4.1): Fountain's two spaces, made with Shift+Enter. */
export const BLANK_SPEECH = '  ';

/** Whether nothing on a line says what it is, so it has a pending element. */
function isEmpty(state: EditorState, line: Line): boolean {
  if (isBlankScript(state, line)) return true;
  return (
    isBlank(line.text) && !blocked(state, line.from) && !blockAt(state.field(parsedDoc), line.from)
  );
}

/** A block as Classic Mode names it: a play's sections are its Acts and Scenes (from the role map), and what the role map disables prints as a stage direction. */
function readKind(state: EditorState, block: Block): ClassicKind {
  const { actDepth, sceneDepth, headings, transitions } = state.facet(elementStructure)();
  switch (block.kind) {
    case 'section':
      if (block.sem.depth === actDepth) return 'act';
      return block.sem.depth === sceneDepth ? 'scene_heading' : 'section';
    case 'scene_heading':
      return headings ? 'scene_heading' : 'action';
    case 'transition':
      return transitions ? 'transition' : 'action';
    case 'note':
    case 'boneyard':
      return 'action';
    default:
      return block.kind;
  }
}

/** A line as the parser reads it, or null for a line with no element. */
export function parsedKindAt(state: EditorState, line: Line): ClassicKind | null {
  const found = blockAt(state.field(parsedDoc), line.from);
  return found ? readKind(state, found.block) : null;
}

const cursorLine = (state: EditorState) => state.doc.lineAt(state.selection.main.head);

const oneCursor = ({ selection }: EditorState) =>
  selection.ranges.length === 1 && selection.main.empty;

const stored = (state: EditorState) => state.field(classicLine, false) ?? null;

/**
 * The element of a line as it's drawn: the stored one on the cursor's line, a lone name while its
 * Dialogue is pending under the cursor (§4.3), and otherwise the parser's. An empty line is null,
 * as are the title page, a note, and a boneyard.
 */
export function lineKindAt(state: EditorState, line: Line): ClassicKind | null {
  const here = cursorLine(state);
  if (blocked(state, line.from) && !isBlankScript(state, line)) return null;
  if (line.from === here.from) {
    const own = stored(state);
    if (own) return own.kind;
  }
  const found = blockAt(state.field(parsedDoc), line.from);
  if (!found) return null;
  if (
    found.block.kind === 'action' &&
    line.number === here.number - 1 &&
    oneCursor(state) &&
    stored(state)?.kind === 'dialogue' &&
    isEmpty(state, here) &&
    underSpeech(state, here.from)
  ) {
    return 'character';
  }
  return readKind(state, found.block);
}

/** The element at the main cursor, or null with a selection or several cursors. */
export function elementAt(state: EditorState): ClassicElement | null {
  if (!oneCursor(state)) return null;
  const line = cursorLine(state);
  const blank = isBlankScript(state, line);
  const where = blank ? null : blocked(state, line.from);
  const doc = state.field(parsedDoc);
  if (where) {
    const kind =
      where === 'title page'
        ? 'title_page'
        : (regionAt(doc, line.from)?.kind ??
          (blockAt(doc, line.from)?.block.kind === 'note' ? 'note' : 'boneyard'));
    return { kind, pending: false, soft: false, enter: null, tab: null };
  }
  const empty = isEmpty(state, line);
  const own = stored(state);
  const found = blank ? null : blockAt(doc, line.from);
  const kind = own?.kind ?? (found ? readKind(state, found.block) : pendingAt(state, line.from));
  const below = line.number < state.doc.lines ? state.doc.line(line.number + 1) : null;
  const { headings } = state.facet(elementStructure)();
  const { enter, tab } = nextFrom(kind, {
    headings,
    empty,
    lastOfSpeech: state.selection.main.head === line.to && (!below || isBlank(below.text)),
    inSpeech: underSpeech(state, line.from),
  });
  return { kind, pending: empty, soft: own?.soft ?? false, enter, tab };
}

/** A stored line for the cursor's line, if it's an empty line the cursor has arrived on. */
function arrival(state: EditorState): StoredLine | null {
  if (!oneCursor(state)) return null;
  const line = cursorLine(state);
  if (!isEmpty(state, line)) return null;
  const kind = pendingAt(state, line.from);
  const { headings } = state.facet(elementStructure)();
  return {
    from: line.from,
    kind,
    soft: kind === 'action' && headings,
    chosen: false,
    added: [],
    made: null,
    dismissed: false,
    beganEmpty: true,
    arrivedAs: kind,
  };
}

/** A span through a change, shrinking from both ends, or null when none of it is left. */
export function mapSpan({ from, to }: Span, changes: ChangeDesc): Span | null {
  const mapped = { from: changes.mapPos(from, 1), to: changes.mapPos(to, -1) };
  return mapped.from < mapped.to ? mapped : null;
}

/** A stored line through a change. */
function mapLine(line: StoredLine, changes: ChangeDesc): StoredLine {
  return {
    ...line,
    from: changes.mapPos(line.from, -1),
    added: line.added.flatMap((span) => mapSpan(span, changes) ?? []),
    made: line.made && mapSpan(line.made, changes),
    madeMark: line.madeMark && mapSpan(line.madeMark, changes),
  };
}

/** Whether every change stays within one line, so the line it's on is still that line. */
function staysOnLine(tr: Transaction): boolean {
  let stays = true;
  tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    if (inserted.lines > 1 || tr.startState.doc.lineAt(from).to < to) stays = false;
  });
  return stays;
}

/**
 * Whether a change is one the stored line outlives: Classic Mode's own, the writer's typing, or
 * the writer's delete inside the line, so a typo fixed in a name is still a name.
 */
const keepsLine = (tr: Transaction) =>
  !tr.annotation(appChange) &&
  (tr.annotation(classicEdit) === true ||
    tr.isUserEvent('input.type') ||
    (tr.isUserEvent('delete') && staysOnLine(tr)));

/**
 * Whether an element command made the line something else (it carries a plain `input` and isn't
 * Classic Mode's own), which may write nothing: what's stored about the line then no longer holds.
 */
const remade = (tr: Transaction) =>
  tr.annotation(Transaction.userEvent) === 'input' && !tr.annotation(classicEdit);

/** What the effects of a transaction make of the line, in the positions of the new text. */
function applyEffects(line: StoredLine | null, tr: Transaction): StoredLine | null {
  let next = line;
  for (const effect of tr.effects) {
    if (effect.is(restoreLine)) {
      next = effect.value;
    } else if (effect.is(setStored)) {
      const from = effect.value.from ?? tr.newDoc.lineAt(tr.newSelection.main.head).from;
      const base = next?.from === from ? next : null;
      next = {
        soft: false,
        chosen: false,
        added: [],
        made: null,
        dismissed: false,
        beganEmpty: isBlank(tr.newDoc.lineAt(from).text),
        ...base,
        ...effect.value,
        // Naming an element replaces what the line arrived as, unless the mark filter says so.
        arrivedAs: effect.value.arrivedAs ?? effect.value.kind,
        ...(effect.value.chosen ? { soft: false } : null),
        from,
      };
    } else if (effect.is(setDismissed) && next) {
      next = { ...next, dismissed: effect.value };
    }
  }
  return next;
}

/**
 * Keeps what can't be worked out in the undo history: a made line must be tidied after undo or redo
 * brings the cursor back to it, and a mark this stay wrote must still come off. Only a change adds
 * to the history, so a move or a row walk stays out of it.
 */
export const keepLineInHistory: Extension = invertedEffects.of((tr) => {
  const line = tr.docChanged ? tr.startState.field(classicLine, false) : null;
  return line && (line.made || line.added.length) ? [restoreLine.of(line)] : [];
});

/**
 * A redo that opens a line just before the cursor leaves the cursor past it, and history takes no
 * filter, so it can't be moved back. The line stays stored, and the next move or letter tidies it.
 */
const justPast = (line: StoredLine, tr: Transaction) =>
  tr.effects.some((effect) => effect.is(restoreLine)) &&
  tr.newSelection.main.head === tr.newDoc.lineAt(line.from).to + 1;

const isEmptied = (line: StoredLine, tr: Transaction) => isBlank(tr.newDoc.lineAt(line.from).text);

/** What Classic Mode remembers of the line being typed (§5). It's never saved. */
export const classicLine: StateField<StoredLine | null> = StateField.define<StoredLine | null>({
  create: arrival,
  update(value, tr) {
    if (remade(tr)) return applyEffects(null, tr) ?? arrival(tr.state);
    if (!tr.docChanged && !tr.selection && tr.effects.length === 0) return value;
    let line = value;
    if (line && tr.docChanged) {
      line = keepsLine(tr) ? mapLine(line, tr.changes) : null;
      if (line?.dismissed && tr.isUserEvent('input.type')) line = { ...line, dismissed: false };
    }
    line = applyEffects(line, tr);
    // Action deleted to nothing is an empty line now, as a click would find it. Any other element
    // stays that element, for the words that replace them.
    if (
      line &&
      line.kind === 'action' &&
      !line.beganEmpty &&
      tr.isUserEvent('delete') &&
      isEmptied(line, tr)
    ) {
      line = null;
    }
    // Typed and deleted to nothing, the line is what it arrived as: a shape it took has gone.
    if (line?.beganEmpty && tr.isUserEvent('delete') && isEmptied(line, tr)) {
      line = { ...line, kind: line.arrivedAs };
    }
    if (line && line.from > tr.newDoc.length) line = null;
    if (
      line &&
      !justPast(line, tr) &&
      tr.newDoc.lineAt(tr.newSelection.main.head).from !== line.from
    ) {
      line = null;
    }
    return line ?? arrival(tr.state);
  },
});
