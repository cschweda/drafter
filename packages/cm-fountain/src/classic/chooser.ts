import {
  ChangeSet,
  type ChangeSpec,
  type EditorState,
  type Extension,
  Prec,
  type StateCommand,
  StateEffect,
  StateField,
  type TransactionSpec,
} from '@codemirror/state';
import {
  EditorView,
  type Rect,
  repositionTooltips,
  showTooltip,
  type Tooltip,
  tooltips,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import {
  blocked,
  type ElementStructure,
  elementStructure,
  insertPageBreak,
  isBlank,
  makeElement,
  underSpeech,
} from '../elements';
import { BOM } from '../keymap';
import { isBlankScript } from './hidden';
import { type Here, hereIn, key, onward, writeParens } from './keys';
import {
  type ClassicKind,
  classicLine,
  elementAt,
  parsedKindAt,
  setStored,
  showChooser,
  WRITES,
} from './line';
import { classicSay } from './offer';

export { openChooser } from './keys';

// The list Enter opens on an empty line (design §9.1). It's a list of its own, not the completion
// list, as that filters on text in the document and nothing here goes in the document. Focus stays
// in the text box the whole time, so there's nothing to give back: the box points at the row.

export interface ChooserItem {
  kind: ClassicKind;
  label: string;
  /** Picks the item at once: lower case, and in the label. */
  letter: string;
}

type Wanted = Omit<ChooserItem, 'letter'> & { wanted: string };

/** A `#` line is a section only where the template doesn't take that depth for an act or a scene. */
const sectionOwner = ({ actDepth, sceneDepth }: ElementStructure): ClassicKind | null =>
  actDepth === 1 ? 'act' : sceneDepth === 1 ? 'scene_heading' : null;

/** The list for a template, in the order of §9.1, from what the template has. */
function wantedItems(structure: ElementStructure): Wanted[] {
  const { actDepth, headings, sceneDepth, stageDirections, transitions } = structure;
  const item = (kind: ClassicKind, label: string, wanted: string): Wanted[] => [
    { kind, label, wanted },
  ];
  return [
    ...(stageDirections ? item('action', 'Stage direction', 's') : item('action', 'Action', 'a')),
    ...(actDepth === null ? [] : item('act', 'Act', 'a')),
    ...(headings ? item('scene_heading', 'Scene heading', 's') : []),
    ...(!headings && sceneDepth !== null ? item('scene_heading', 'Scene', 'n') : []),
    ...item('character', 'Character', 'c'),
    ...(transitions ? item('transition', 'Transition', 't') : []),
    ...item('centered', 'Centered', 'e'),
    ...item('lyric', 'Lyric', 'l'),
    ...(sectionOwner(structure) ? [] : item('section', 'Section', 'i')),
    ...item('synopsis', 'Synopsis', 'y'),
    ...item('page_break', 'Page break', 'b'),
  ];
}

const SPEECH: Wanted[] = [
  { kind: 'dialogue', label: 'Dialogue', wanted: 'd' },
  { kind: 'parenthetical', label: 'Parenthetical', wanted: 'p' },
];

/**
 * The rows for a template. Each row takes the letter it's meant to have, and only then does a row
 * that lost its letter to another (in a custom template) take a free one from its label.
 */
export function chooserItems(structure: ElementStructure, inSpeech: boolean): ChooserItem[] {
  const wanted = [...wantedItems(structure), ...(inSpeech ? SPEECH : [])];
  const taken = new Set<string>();
  const letters = wanted.map(({ wanted: letter }) => {
    if (taken.has(letter)) return null;
    taken.add(letter);
    return letter;
  });
  return wanted.map(({ kind, label }, index) => {
    const letter =
      letters[index] ?? [...label.toLowerCase()].find((ch) => ch !== ' ' && !taken.has(ch));
    if (letter) taken.add(letter);
    return { kind, label, letter: letter ?? '' };
  });
}

/** A pick's text: nothing, or what a line above, a line below, and the element itself need. */
function apart(here: Here, kind: ClassicKind, insert = ''): TransactionSpec {
  const { state, line, head } = here;
  const { doc, lineBreak } = state;
  const made = state.field(classicLine)?.made ?? null;
  const above = line.number > 1 ? doc.line(line.number - 1) : null;
  const under = line.number < doc.lines ? doc.line(line.number + 1) : null;
  const inSpeech = underSpeech(state, line.from);
  const staysIn =
    insert === '' &&
    (inSpeech
      ? WRITES.by[kind] !== 'blank'
      : // A paragraph's next line, as Enter from Action or a lyric gives it (§6.1).
        (kind === 'action' || kind === 'lyric') && !!above && parsedKindAt(state, above) === kind);
  const breakAbove = !!above && !isBlank(above.text) && !staysIn;
  const breakUnder =
    !!under && !isBlank(under.text) && !blocked(state, under.from) && !(staysIn && inSpeech);
  if (!insert && !breakAbove && !breakUnder)
    return { effects: setStored.of({ kind, chosen: true }) };

  // The breaks go outside the line, so the stored line is still on it, and `made` can take them.
  const changes: ChangeSpec[] = [];
  if (breakAbove) changes.push({ from: line.from - 1, insert: lineBreak });
  if (insert) {
    const from = line.from + (line.text.startsWith(BOM) ? 1 : 0);
    changes.push({ from, to: line.to, insert });
  }
  if (breakUnder) changes.push({ from: line.to, insert: lineBreak });
  const start = line.from + (breakAbove ? 1 : 0) + (line.text.startsWith(BOM) ? 1 : 0);
  if (insert) return { changes, selection: { anchor: start + insert.length } };
  const at = head + (breakAbove ? 1 : 0);
  const from = made?.from ?? at - (breakAbove ? 1 : 0);
  const to = Math.max((made?.to ?? 0) + (breakAbove ? 1 : 0), at + (breakUnder ? 1 : 0));
  return {
    changes,
    selection: { anchor: at },
    effects: setStored.of({ kind, chosen: true, made: { from, to } }),
  };
}

/**
 * `===`, set apart, and the cursor on the Action line under it, as Enter goes from a page break: a
 * line drawn as a rule isn't a place to type. On a blank script the
 * block's two breaks go in too, as the cursor must stand clear of it.
 */
function pageBreak(here: Here): TransactionSpec {
  const { state, line } = here;
  const { lineBreak } = state;
  if (isBlankScript(state, line)) {
    const from = line.text.startsWith(BOM) ? 1 : 0;
    return {
      changes: { from, insert: `===${lineBreak.repeat(4)}` },
      selection: { anchor: from + 5 },
    };
  }
  const written = state.update({ ...apart(here, 'page_break', '==='), filter: false });
  const after = hereIn(written.state) as Here;
  const go = onward(after, 'action', 'enter');
  const more = ChangeSet.of(go.changes ?? [], written.newDoc.length, lineBreak);
  return { ...go, changes: written.changes.compose(more) };
}

/** What a pick on an empty line writes (§9.1). A parenthetical is its `()`, as nothing else makes one. */
const pick = (kind: ClassicKind): StateCommand =>
  key((state) => {
    const here = hereIn(state);
    if (!here?.element.pending) return null;
    if (kind === 'page_break') return pageBreak(here);
    if (kind === 'parenthetical') return writeParens(here);
    return isBlankScript(state, here.line)
      ? { effects: setStored.of({ kind, chosen: true }) }
      : apart(here, kind);
  });

/**
 * What a key for `kind` means on this empty line: its row, or the row that stands for it. Dialogue
 * off a speech starts with the name, as Dialogue does in Fountain Mode, and a play's `#` is its Act.
 */
function rowFor(state: EditorState, kind: ClassicKind): ClassicKind | null {
  const structure = state.facet(elementStructure)();
  const inSpeech = underSpeech(state, state.selection.main.head);
  if (chooserItems(structure, inSpeech).some((item) => item.kind === kind)) return kind;
  if (kind === 'dialogue') return 'character';
  return kind === 'section' ? sectionOwner(structure) : null;
}

/**
 * The element key on an empty line in Classic Mode, and false anywhere else, so that `Mod-Alt-1…7`
 * fall to Fountain's key, with its hints and its list.
 */
export const pendingElementKey =
  (kind: ClassicKind): StateCommand =>
  (target) => {
    const { state } = target;
    if (!state.field(classicLine, false) || !elementAt(state)?.pending) return false;
    const row = rowFor(state, kind);
    return !!row && pick(row)(target);
  };

/**
 * An element button or key: on an empty line in Classic Mode, the pending element, as the chooser
 * sets it; else `makeElement(kind)`. In Fountain Mode, exactly `makeElement(kind)`.
 */
export function elementCommand(kind: ClassicKind): StateCommand {
  const make = kind === 'page_break' ? insertPageBreak : makeElement(kind);
  const pending = pendingElementKey(kind);
  return (target) => pending(target) || make(target);
}

interface Open {
  items: readonly ChooserItem[];
  active: number;
  pos: number;
  /** The list's element id, new each time so two editors never share one. */
  id: string;
  structure: ElementStructure;
}

const moveTo = StateEffect.define<number>();
const closeChooser = StateEffect.define<null>();

let opened = 0;

function opening(state: EditorState): Open | null {
  const element = elementAt(state);
  if (!element) return null;
  const { head } = state.selection.main;
  const structure = state.facet(elementStructure)();
  const items = chooserItems(structure, underSpeech(state, head));
  const active = Math.max(
    items.findIndex((item) => item.kind === element.kind),
    0,
  );
  return { items, active, pos: head, id: `cm-chooser-${++opened}`, structure };
}

const rowId = ({ id, items }: Open, index: number) => `${id}-${items[index]?.kind}`;

/** The list while it's open. Anything that changes the place or the template closes it. */
const chooserState: StateField<Open | null> = StateField.define<Open | null>({
  create: () => null,
  update(value, tr) {
    let open = value;
    if (
      open &&
      (tr.docChanged ||
        tr.selection ||
        tr.reconfigured ||
        tr.state.facet(elementStructure)() !== open.structure)
    ) {
      open = null;
    }
    for (const effect of tr.effects) {
      if (effect.is(showChooser)) open = opening(tr.state);
      else if (effect.is(closeChooser) || effect.is(setStored)) open = null;
      else if (effect.is(moveTo) && open) open = { ...open, active: effect.value };
    }
    return open;
  },
});

/** A row's label, with its letter underlined. Fixed words, and text nodes all the same. */
function labelInto(row: HTMLElement, { label, letter }: ChooserItem): void {
  const at = label.toLowerCase().indexOf(letter);
  const mark = document.createElement('u');
  mark.textContent = label.slice(at, at + 1);
  // One piece inside the row, which is a flex box: WebKit would name each piece apart, "C haracter".
  const words = document.createElement('span');
  words.append(label.slice(0, at), mark, label.slice(at + 1));
  row.append(words);
}

const say = (view: EditorView, text: string) => view.state.facet(classicSay)?.(text);

function createChooser(view: EditorView) {
  const dom = document.createElement('div');
  dom.className = 'cm-chooser';
  const open = view.state.field(chooserState) as Open;
  const list = document.createElement('ul');
  list.id = open.id;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Choose an element');
  // A list that scrolls must be reachable. But in Tab mode the view hands Tab to the browser before
  // any handler, and focus landing on a list about to close would fall to the page. So it steps
  // out of the order in the capture phase, ahead of the view.
  list.tabIndex = 0;
  const onTab = (event: KeyboardEvent) => {
    if (event.key === 'Tab') list.tabIndex = -1;
  };
  view.contentDOM.addEventListener('keydown', onTab, true);
  const rows = open.items.map((item, index) => {
    const row = document.createElement('li');
    row.id = rowId(open, index);
    row.setAttribute('role', 'option');
    if (item.kind === 'centered') row.className = 'cm-chooser-group';
    labelInto(row, item);
    row.addEventListener('click', () => {
      pick(item.kind)(view);
      view.focus();
    });
    return row;
  });
  list.append(...rows);
  dom.append(list);
  // The press would take focus from the text box, and on a phone the keyboard with it.
  dom.addEventListener('mousedown', (event) => event.preventDefault());

  /** Only the list scrolls: the tooltip is off the page until it's measured. */
  const reveal = (active: number) => {
    const row = rows[active] as HTMLElement;
    const top = row.offsetTop - list.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  };
  const show = (active: number) => {
    rows.forEach((row, index) => {
      row.setAttribute('aria-selected', index === active ? 'true' : 'false');
    });
    reveal(active);
  };
  let shown = open.active;
  show(shown);
  say(view, `Choose an element, ${open.items.length} choices: ${open.items[shown]?.label}`);
  return {
    dom,
    // Only a list on the page has a height to scroll in.
    mount: () => reveal(shown),
    destroy: () => view.contentDOM.removeEventListener('keydown', onTab, true),
    update({ state }: ViewUpdate) {
      const next = state.field(chooserState);
      if (!next || next.active === shown) return;
      shown = next.active;
      show(shown);
      say(view, next.items[shown]?.label ?? '');
    },
  };
}

const tooltip = showTooltip.compute([chooserState], (state): Tooltip | null => {
  const open = state.field(chooserState);
  return open && { pos: open.pos, create: createChooser };
});

/** The open state, on the text box. `aria-expanded` isn't allowed on a text box, so it's `aria-haspopup`, as completion's is. */
const openAttributes = EditorView.contentAttributes.compute([chooserState], (state) => {
  const open = state.field(chooserState);
  if (!open) return {};
  return {
    'aria-haspopup': 'listbox',
    'aria-controls': open.id,
    'aria-activedescendant': rowId(open, open.active),
  };
});

const close = (view: EditorView) => view.dispatch({ effects: closeChooser.of(null) });

const MODIFIER = /^(?:Shift|Control|Alt|Meta|AltGraph|CapsLock|Fn|OS)$/;

/** Whether `event` is one key alone, with no Ctrl, Alt, or Command: Shift is a capital. */
const bare = ({ altKey, ctrlKey, metaKey }: KeyboardEvent) => !altKey && !ctrlKey && !metaKey;

/** The keys while it's open. True stops the key here: the view takes it for handled. */
function chooserKey(event: KeyboardEvent, view: EditorView): boolean {
  const open = view.state.field(chooserState);
  if (!open || MODIFIER.test(event.key)) return false;
  const { items, active } = open;
  if (bare(event) && !event.shiftKey) {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step) {
      const next = (active + step + items.length) % items.length;
      view.dispatch({ effects: moveTo.of(next) });
      return true;
    }
    if (event.key === 'Escape') {
      close(view);
      return true;
    }
    if (event.key === 'Enter') {
      if (!event.repeat) pick((items[active] as ChooserItem).kind)(view);
      return true;
    }
  }
  if (bare(event) && [...event.key].length === 1) {
    if (event.repeat) return true;
    const item = items.find(({ letter }) => letter === event.key.toLowerCase());
    if (item) pick(item.kind)(view);
    else close(view);
    return true;
  }
  close(view);
  return false;
}

/**
 * Where a tooltip may go: what the writer can see of the window, and of that only the editor's
 * height. On a phone the keyboard covers the bottom of the window and only the visual viewport is
 * seen, and CodeMirror places tooltips by the window, so the chooser and the autofill list would
 * open under the keyboard (§10); turned above the line instead, they'd go under the top bar, which
 * is drawn over the page. In the editor's height they go where there's room and stay in sight.
 */
export function seenSpace(view: EditorView): Rect {
  const win = view.dom.ownerDocument.defaultView;
  const viewport = win?.visualViewport;
  const root = view.dom.ownerDocument.documentElement;
  const seen = viewport
    ? {
        top: viewport.offsetTop,
        left: viewport.offsetLeft,
        right: viewport.offsetLeft + viewport.width,
        bottom: viewport.offsetTop + viewport.height,
      }
    : {
        top: 0,
        left: 0,
        right: root.clientWidth || (win?.innerWidth ?? 0),
        bottom: root.clientHeight || (win?.innerHeight ?? 0),
      };
  const box = view.dom.getBoundingClientRect();
  // A view not laid out (hidden, or no layout at all) has no height to keep to.
  if (box.height <= 0) return seen;
  const top = Math.max(seen.top, box.top);
  const bottom = Math.min(seen.bottom, box.bottom);
  return top < bottom ? { ...seen, top, bottom } : seen;
}

/** A keyboard that opens or closes changes what's seen, and not the window: the lists move with it. */
const followViewport = ViewPlugin.define((view) => {
  const viewport = view.dom.ownerDocument.defaultView?.visualViewport;
  const move = () => repositionTooltips(view);
  viewport?.addEventListener('resize', move);
  viewport?.addEventListener('scroll', move);
  return {
    destroy() {
      viewport?.removeEventListener('resize', move);
      viewport?.removeEventListener('scroll', move);
    },
  };
});

/** The list, ahead of every other key, so that nothing typed at it reaches the text. */
export const classicChooser: Extension = [
  tooltips({ tooltipSpace: seenSpace }),
  followViewport,
  chooserState,
  tooltip,
  openAttributes,
  Prec.highest(
    EditorView.domEventHandlers({
      keydown: chooserKey,
      // A press on the list is the list's own, and doesn't come here.
      mousedown(_event, view) {
        if (view.state.field(chooserState)) close(view);
      },
    }),
  ),
  EditorView.focusChangeEffect.of((state, focusing) =>
    !focusing && state.field(chooserState) ? closeChooser.of(null) : null,
  ),
];
