import { startCompletion } from '@codemirror/autocomplete';
import {
  type ChangeSpec,
  EditorSelection,
  type EditorState,
  type Line,
  type StateCommand,
  StateEffect,
  type Transaction,
  type TransactionSpec,
} from '@codemirror/state';
import type { Command } from '@codemirror/view';
import { type Block, blockAt, type Doc, reparse } from '@drafter/fountain';
import { startBarCue, startCue } from './input';
import { BOM, command, cueIndex, readsAsCue, unmarked } from './keymap';
import { insideRegion, parsedDoc } from './state';

// The element bar's commands (docs/drafter-element-bar-design.md §4). Each makes the cursor's line
// an element for a writer who doesn't know Fountain's marks yet, so it writes natural Fountain
// where it can, and a forcing mark only where the line would otherwise read as something else:
// `MARGARET`, not `@MARGARET`. `forceKind` (Mod-Alt-1…7) is the other way, for a writer who wants
// the mark. Each is one transaction, so one undo step, and none acts in a read-only editor, on the
// title page, or in a note or boneyard.

/** The kinds the element bar makes a line. A page break is `insertPageBreak`. */
export type ElementKind =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'centered'
  | 'lyric'
  | 'section'
  | 'synopsis';

/** Sent by a command that leaves the cursor where completion has something to offer. */
const askCompletion = StateEffect.define<null>();

/** Whether a transaction asks for the completion list: a heading, cue, or transition just begun. */
export const opensCompletion = (tr: Transaction): boolean =>
  tr.effects.some((effect) => effect.is(askCompletion) || effect.is(startCue));

/**
 * The view command for a state command, which also opens the completion list when the command's
 * transaction asks for it (`INT. ` written on an empty line, a cue begun). A state command can't
 * open it: the list is the view's.
 */
export function withCompletion(run: StateCommand): Command {
  return (view) => {
    let open = false;
    const handled = run({
      state: view.state,
      dispatch(transaction) {
        open ||= opensCompletion(transaction);
        view.dispatch(transaction);
      },
    });
    if (open) startCompletion(view);
    return handled;
  };
}

/** The parser's start of a scene heading (rule 11): a prefix, then a dot or a space. */
const HEADING_START = /^(?:INT\.?\/EXT|INT|EXT|EST|I\/E)[. ]/i;

/**
 * The headings that name no place, which get `.` and not `INT. `: a whole line of one of these
 * words, which mark a scene by what happens rather than where. A short list on purpose; any other
 * text, `DREAM HOUSE` included, is taken for a place, and the writer can change `INT.` to `EXT.`.
 */
const NOT_A_PLACE =
  /^(?:(?:END\s+)?(?:FLASHBACK|MONTAGE|SERIES OF SHOTS|DREAM SEQUENCE)|INTERCUT|BACK TO SCENE|(?:MOMENTS\s+)?LATER|CONTINUOUS)$/;

/** A blank line as the parser reads one: only white space, but not the two spaces of a speech. */
const isBlank = (text: string) => text !== '  ' && /^\s*$/.test(text);

/** What a command knows about one line. */
interface Here {
  state: EditorState;
  doc: Doc;
  line: Line;
  /** The line's text, after a byte-order mark at the start of the file. */
  text: string;
  /** Where `text` starts. */
  from: number;
  found: { block: Block; index: number } | null;
}

/** Where no command acts: the title page, and a note or boneyard. */
function blocked(state: EditorState, pos: number): 'title page' | 'region' | null {
  const doc = state.field(parsedDoc);
  const line = state.doc.lineAt(pos);
  const { titlePage } = doc;
  if (titlePage && line.from >= titlePage.span.from && line.from <= titlePage.span.to) {
    return 'title page';
  }
  const kind = blockAt(doc, line.from)?.block.kind;
  if (kind === 'note' || kind === 'boneyard' || insideRegion(doc, line.from)) return 'region';
  return null;
}

/** The line at `pos`, or null where no command acts. */
function here(state: EditorState, pos: number): Here | null {
  if (blocked(state, pos)) return null;
  const doc = state.field(parsedDoc);
  const line = state.doc.lineAt(pos);
  const found = blockAt(doc, line.from);
  const bom = line.text.startsWith(BOM) ? 1 : 0;
  return { state, doc, line, text: line.text.slice(bom), from: line.from + bom, found };
}

const lineAbove = ({ state, line }: Here) =>
  line.number > 1 ? state.doc.line(line.number - 1) : null;
const lineBelow = ({ state, line }: Here) =>
  line.number < state.doc.lines ? state.doc.line(line.number + 1) : null;
const blankAbove = (h: Here) => isBlank(lineAbove(h)?.text ?? '');
const blankBelow = (h: Here) => isBlank(lineBelow(h)?.text ?? '');

/** The cue line of a cue block. */
const isCueLine = (h: Here) =>
  h.found?.block.kind === 'character' && h.found.block.span.from === h.line.from;

/** A line of a speech: a parenthetical, a line of dialogue, or a lyric under a cue. */
const inSpeech = (h: Here) =>
  !!h.found && !isCueLine(h) && cueIndex(h.doc.blocks, h.found.index) >= 0;

/**
 * A cue the writer has typed with no speech under it yet: one line of action, after a blank line,
 * that the parser would read as a cue with a line under it.
 */
function isLoneCue(h: Here): boolean {
  const block = h.found?.block;
  return (
    block?.kind === 'action' &&
    block.lines.length === 1 &&
    blankAbove(h) &&
    readsAsCue(h.text.trim())
  );
}

/** Whether the line above an empty line is a cue or a line of a speech, so the line continues it. */
function speechAbove(h: Here): boolean {
  const above = lineAbove(h);
  if (!above || isBlank(above.text)) return false;
  const up = here(h.state, above.from);
  return !!up && (isCueLine(up) || inSpeech(up) || isLoneCue(up));
}

/**
 * The words of a line without the marks that make it an element: a forcing mark or wrapper (as
 * `forceKind` reads them), a section's `#`s, or a synopsis's `=`. A page break has none.
 */
function bodyOf(text: string): string {
  const trimmed = text.trim();
  if (/^={3,}$/.test(trimmed)) return '';
  const lead = /^(?:#+|=)\s*/.exec(trimmed);
  if (lead) return trimmed.slice(lead[0].length).trimEnd();
  return unmarked(text).body;
}

/** A note or a boneyard within a line, closed or running to the line's end. */
const REGION = /\[\[[\s\S]*?(?:\]\]|$)|\/\*[\s\S]*?(?:\*\/|$)/g;

/** The text in capitals, but for the notes and boneyard in it: those are the writer's own words. */
const upper = (text: string) =>
  text
    .split(/(\[\[[\s\S]*?(?:\]\]|$)|\/\*[\s\S]*?(?:\*\/|$))/)
    .map((part, i) => (i % 2 ? part : part.toUpperCase()))
    .join('');

/** The text without its notes and boneyard, for reading what the line says. */
const words = (text: string) => text.replace(REGION, '').trim();

/** The kind the parse gives `pos` once `text` replaces the line, with a blank line above or not. */
function kindWith(h: Here, text: string, blank: boolean): Block['kind'] | undefined {
  const insert = (blank ? '\n' : '') + text;
  const doc = reparse(h.doc, [{ from: h.from, to: h.line.to, insert }]);
  return blockAt(doc, h.from + (blank ? 1 : 0))?.block.kind;
}

/** A line's new text, what goes around it, and where the cursor goes. */
interface LineEdit {
  text: string;
  /** Put a blank line above the line, or below it, where there is none. */
  above?: boolean;
  below?: boolean;
  /** The cursor's place in `text`; its end when left out. */
  cursor?: number;
  effects?: StateEffect<unknown>[];
}

/**
 * A command for a kind of line. With a selection of several lines it makes each line with text
 * that kind and keeps the selection; otherwise the cursor's line, and the cursor goes where the
 * edit says. A line the rule leaves as it was keeps the cursor where it is.
 */
function lineCommand(rule: (h: Here) => LineEdit | null, firstOnly = false): StateCommand {
  return command((state) => {
    const { main } = state.selection;
    const first = state.doc.lineAt(main.from);
    let last = state.doc.lineAt(main.to);
    // A selection of whole lines (a triple click, Mod-L) ends at the start of the next line, which
    // isn't selected.
    if (last.number > first.number && main.to === last.from) last = state.doc.line(last.number - 1);
    if (firstOnly) last = first;
    const many = last.number > first.number;
    const changes: ChangeSpec[] = [];
    const effects: StateEffect<unknown>[] = [];
    let cursor: number | null = null;
    let acted = false;
    let brokeBelow = false;
    for (let n = first.number; n <= last.number; n++) {
      const line = state.doc.line(n);
      if (many && isBlank(line.text)) {
        brokeBelow = false;
        continue;
      }
      const h = here(state, line.from);
      const edit = h && rule(h);
      if (!h || !edit) continue;
      acted = true;
      const above = !!edit.above && !brokeBelow && line.number > 1 && !blankAbove(h);
      const below = !!edit.below && line.number < state.doc.lines && !blankBelow(h);
      brokeBelow = below;
      if (edit.effects) effects.push(...edit.effects);
      if (!above && !below && edit.text === h.text) continue;
      const lineBreak = state.lineBreak;
      changes.push({
        from: h.from,
        to: line.to,
        insert: (above ? lineBreak : '') + edit.text + (below ? lineBreak : ''),
      });
      // One line, so this is the only change before the cursor, and a break is one position.
      cursor = h.from + (above ? 1 : 0) + (edit.cursor ?? edit.text.length);
    }
    if (!acted) return null;
    if (changes.length === 0) return effects.length ? { effects } : {};
    const set = state.changes(changes);
    const selection =
      many || cursor === null || (firstOnly && !main.empty)
        ? state.selection.map(set)
        : EditorSelection.cursor(cursor);
    return { changes: set, selection, effects };
  });
}

// The rules, one for each kind ----------------------------------------------------------------

const ask = () => askCompletion.of(null);

function sceneHeading(h: Here): LineEdit {
  const edge = { above: true, below: true };
  if (isBlank(h.text)) return { ...edge, text: 'INT. ', effects: [ask()] };
  const body = bodyOf(h.text);
  const block = h.found?.block;
  if (block?.kind === 'scene_heading') {
    // A heading already: a `.` it doesn't need comes off, and one typed in lower case (which
    // the parser allows) is upper-cased. A forced heading keeps its case.
    if (!block.forced) return { ...edge, text: upper(h.text.trim()) };
    return { ...edge, text: HEADING_START.test(body) ? body : h.text };
  }
  const heading = upper(body);
  if (HEADING_START.test(heading)) return { ...edge, text: heading };
  return { ...edge, text: NOT_A_PLACE.test(words(heading)) ? `.${heading}` : `INT. ${heading}` };
}

function character(h: Here): LineEdit {
  if (isBlank(h.text)) {
    // As Tab does: an `@`, and cue mode upper-cases the name as it is typed. The `@` comes off
    // when the cursor leaves the line, if the name doesn't need it (`startBarCue`).
    return { text: '@', above: true, effects: [startCue.of(null), startBarCue.of(null), ask()] };
  }
  if (isCueLine(h)) {
    // A cue already: an `@` it doesn't need comes off.
    const name = h.text.trim();
    const bare = name.slice(1).trimStart();
    return { text: name.startsWith('@') && readsAsCue(bare) ? bare : h.text, above: true };
  }
  const body = bodyOf(h.text);
  // A capital inside a word (`McDONALD`, `McDonald`) is the writer's spelling, and is kept.
  const name = /\p{Ll}\p{Lu}/u.test(words(body)) ? body : upper(body);
  return { text: readsAsCue(name) ? name : `@${name}`, above: true };
}

function action(h: Here): LineEdit | null {
  if (isBlank(h.text)) {
    // Under a speech an empty line would continue it, so it is set apart.
    return speechAbove(h) ? { text: '', above: true } : { text: h.text };
  }
  const block = h.found?.block;
  // An unforced action line is one already, and a page break has no words to make one of.
  if ((block?.kind === 'action' && !block.forced) || block?.kind === 'page_break') {
    return { text: h.text };
  }
  const body = bodyOf(h.text);
  const apart = inSpeech(h) && !blankAbove(h);
  const text = kindWith(h, body, apart) === 'action' ? body : `!${body}`;
  return { text, above: apart };
}

function transition(h: Here): LineEdit {
  const edge = { above: true, below: true };
  if (isBlank(h.text)) return { ...edge, text: '>', effects: [ask()] };
  const body = bodyOf(h.text);
  const block = h.found?.block;
  if (block?.kind === 'transition') {
    return { ...edge, text: block.forced && words(body).endsWith('TO:') ? body : h.text };
  }
  const line = upper(body);
  return { ...edge, text: words(line).endsWith('TO:') ? line : `>${line}` };
}

function centered(h: Here): LineEdit {
  if (h.found?.block.kind === 'centered') return { text: h.text, above: true };
  const body = bodyOf(h.text);
  return { text: `>${body}<`, cursor: 1 + body.length, above: true };
}

function lyric(h: Here): LineEdit {
  const speech = isBlank(h.text) ? speechAbove(h) : inSpeech(h);
  if (h.found?.block.kind === 'lyric') return { text: h.text, above: !speech };
  return { text: `~${bodyOf(h.text)}`, above: !speech };
}

/** A line that begins with `mark` and a space: a section or a synopsis, which need no blank line. */
const leading =
  (kind: Block['kind'], mark: string) =>
  (h: Here): LineEdit => {
    if (h.found?.block.kind === kind) return { text: h.text };
    return { text: `${mark} ${bodyOf(h.text)}` };
  };

// Dialogue and parentheticals, which look at the lines around them ------------------------------

/**
 * A new cue line above the line, which becomes the speech: the writer names the speaker. On an
 * empty line the cue is the line itself.
 */
function cueAbove(h: Here): TransactionSpec {
  const { state, line } = h;
  const blank = line.number > 1 && !blankAbove(h);
  const lineBreak = state.lineBreak;
  const body = bodyOf(h.text);
  const insert = `${blank ? lineBreak : ''}@${body ? lineBreak + body : ''}`;
  return {
    changes: { from: h.from, to: line.to, insert },
    selection: { anchor: h.from + (blank ? 1 : 0) + 1 },
    effects: [startCue.of(null), startBarCue.of(null), ask()],
  };
}

function dialogue(h: Here): TransactionSpec | null {
  const { state, line, found } = h;
  const block = found?.block;
  const lineBreak = state.lineBreak;
  // On a cue, the speech goes under it: to the speech it has, or to a new line for one.
  if (isCueLine(h) || isLoneCue(h)) {
    const next = lineBelow(h);
    if (next && !isBlank(next.text) && isCueLine(h)) return { selection: { anchor: next.to } };
    return {
      changes: { from: line.to, insert: lineBreak },
      selection: { anchor: line.to + 1 },
    };
  }
  if (block?.kind === 'dialogue') return {};
  if (inSpeech(h)) {
    // A parenthetical or a lyric in a speech: its mark comes off.
    const body = bodyOf(h.text);
    return {
      changes: { from: h.from, to: line.to, insert: body },
      selection: { anchor: h.from + state.toText(body).length },
    };
  }
  if (isBlank(h.text)) return speechAbove(h) ? {} : cueAbove(h);
  // Action just under a cue, with blank lines between: they go.
  if (block?.kind === 'action' && block.span.from === line.from) {
    let n = line.number - 1;
    while (n >= 1 && isBlank(state.doc.line(n).text)) n--;
    const cue = n >= 1 && n < line.number - 1 ? here(state, state.doc.line(n).from) : null;
    const lone = cue?.found?.block.kind === 'character' && cue.found.block.lines.length === 1;
    if (cue && (isLoneCue(cue) || lone)) {
      const body = bodyOf(h.text);
      const set = state.changes([
        { from: cue.line.to, to: line.from - 1 },
        { from: h.from, to: line.to, insert: body },
      ]);
      return { changes: set, selection: { anchor: set.mapPos(line.to) } };
    }
  }
  return cueAbove(h);
}

/** A parenthetical goes under a cue or in a speech, and nowhere else. */
function parenthetical(h: Here): TransactionSpec | null {
  const { state, line } = h;
  const lineBreak = state.lineBreak;
  if (isCueLine(h) || isLoneCue(h)) {
    const next = here(state, lineBelow(h)?.from ?? line.from);
    if (next && next.line !== line && next.found?.block.kind === 'parenthetical') return {};
    return {
      changes: { from: line.to, insert: `${lineBreak}()` },
      selection: { anchor: line.to + 2 },
    };
  }
  if (isBlank(h.text)) {
    if (!speechAbove(h)) return null;
    return {
      changes: { from: h.from, to: line.to, insert: '()' },
      selection: { anchor: h.from + 1 },
    };
  }
  if (!inSpeech(h)) return null;
  if (h.found?.block.kind === 'parenthetical') return {};
  const body = bodyOf(h.text);
  const insert = `(${body})`;
  return {
    changes: { from: h.from, to: line.to, insert },
    selection: { anchor: h.from + state.toText(insert).length - 1 },
  };
}

/** A command that works out its own transaction for the cursor's line. */
const atCursor = (spec: (h: Here) => TransactionSpec | null): StateCommand =>
  command((state) => {
    const h = here(state, state.selection.main.head);
    return h && spec(h);
  });

/** Whether Parenthetical applies at the cursor: under a cue or in a speech. */
export function canMakeParenthetical(state: EditorState): boolean {
  const h = here(state, state.selection.main.head);
  return !!h && parenthetical(h) !== null;
}

const COMMANDS: Record<ElementKind, StateCommand> = {
  scene_heading: lineCommand(sceneHeading),
  action: lineCommand(action),
  character: lineCommand(character, true),
  dialogue: atCursor(dialogue),
  parenthetical: atCursor(parenthetical),
  transition: lineCommand(transition),
  centered: lineCommand(centered),
  lyric: lineCommand(lyric),
  section: lineCommand(leading('section', '#')),
  synopsis: lineCommand(leading('synopsis', '=')),
};

/**
 * Makes the cursor's line an element of `kind`, writing natural Fountain where it can (the design,
 * §4): a heading is upper-cased and gets `INT. `, a name is upper-cased, a transition that ends in
 * `TO:` is left bare, and a forcing mark goes on only where the line would otherwise read as
 * something else. A line that is that kind already loses a forcing mark it doesn't need, and else
 * stays as it is.
 */
export const makeElement = (kind: ElementKind): StateCommand => COMMANDS[kind];

/**
 * A page break, `===`, on a line of its own with blank lines around it: on the cursor's line if
 * it is empty, else under it.
 */
export const insertPageBreak: StateCommand = command((state) => {
  const h = here(state, state.selection.main.head);
  if (!h) return null;
  if (h.found?.block.kind === 'page_break') return {};
  if (isBlank(h.text)) return pageBreakOnLine(h);
  const lineBreak = state.lineBreak;
  const after = lineBelow(h) && !blankBelow(h) ? lineBreak : '';
  const insert = `${lineBreak}${lineBreak}===${after}`;
  return {
    changes: { from: h.line.to, insert },
    selection: { anchor: h.line.to + 2 + 3 },
  };
});

function pageBreakOnLine(h: Here): TransactionSpec {
  const { state, line } = h;
  const above = line.number > 1 && !blankAbove(h);
  const below = line.number < state.doc.lines && !blankBelow(h);
  const lineBreak = state.lineBreak;
  return {
    changes: {
      from: h.from,
      to: line.to,
      insert: `${above ? lineBreak : ''}===${below ? lineBreak : ''}`,
    },
    selection: { anchor: h.from + (above ? 1 : 0) + 3 },
  };
}

/**
 * Whether the cursor's line is a name with no speech under it yet: the parser reads it as action
 * (a cue needs a line after it), but it is a cue to the writer, and to the element bar.
 */
export function readsAsName(state: EditorState): boolean {
  const h = here(state, state.selection.main.head);
  return !!h && !isBlank(h.text) && isLoneCue(h);
}

/** What the element bar says when Parenthetical doesn't apply. */
export const PARENTHETICAL_HINT =
  'A parenthetical goes under a character name or in their dialogue. Put the cursor there first.';

/**
 * Why the command for `kind` would do nothing at the cursor, in a sentence for the writer, or null
 * where it acts (or does something that needs no explaining).
 */
export function elementHint(kind: ElementKind | 'page_break', state: EditorState): string | null {
  const { head } = state.selection.main;
  const where = blocked(state, head);
  if (where === 'title page') {
    return 'This is the title page: Key: value lines at the top. Elements go after the blank line under it.';
  }
  if (where === 'region') return 'This line is inside a note or a boneyard, which never prints.';
  const h = here(state, head);
  if (!h) return null;
  const block = h.found?.block;
  if (kind === 'dialogue') {
    if (block?.kind === 'dialogue') return 'This line is already dialogue.';
    if (isBlank(h.text) && speechAbove(h)) {
      return 'This line is already dialogue: type what they say here.';
    }
  }
  if (kind === 'parenthetical' && parenthetical(h) === null) return PARENTHETICAL_HINT;
  if (kind === 'action' && block?.kind === 'page_break') {
    return 'A page break has no words to make action of.';
  }
  return null;
}
