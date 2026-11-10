import { type EditorState, type Extension, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { parsedDoc } from '@drafter/cm-fountain';
import type { Block } from '@drafter/fountain';
import { lockedSceneNumbers } from '@drafter/production';

// A locked screenplay's new scenes (production design §7.1): a heading with no number written shows
// the A-number it will have, dimmed, after the heading, until Write new scene numbers (or the next
// revision, or a lock) writes it. A widget, drawn and never in the text, so neither mode changes the
// file for it; read out with the heading as "will be scene 5A".

/**
 * The numbers the lock has issued, which a new scene's number never reuses; null when the script
 * isn't a locked screenplay, and nothing is drawn.
 */
export const setProvisionalIssued = StateEffect.define<readonly string[] | null>();

class ProvisionalNumber extends WidgetType {
  constructor(readonly number: string) {
    super();
  }
  override eq(other: ProvisionalNumber): boolean {
    return other.number === this.number;
  }
  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-provisional-number';
    span.dataset.provisional = this.number;
    span.title = `Scene ${this.number} once its number is written`;
    // The number on screen, and the words a screen reader says in its place.
    const shown = document.createElement('span');
    shown.setAttribute('aria-hidden', 'true');
    shown.textContent = `#${this.number}#`;
    const said = document.createElement('span');
    said.className = 'cm-provisional-said';
    said.textContent = `, will be scene ${this.number}`;
    span.append(shown, said);
    return span;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

type Heading = Extract<Block, { kind: 'scene_heading' }>;

/** The widgets for the unnumbered headings of `state`'s text, given the issued numbers. */
function widgetsOf(state: EditorState, issued: readonly string[]): DecorationSet {
  const { blocks } = state.field(parsedDoc);
  if (!blocks.some((b) => b.kind === 'scene_heading' && b.sem.number === null)) {
    return Decoration.none;
  }
  // The numbers every export prints and the Script pane shows (`lockedSceneNumbers`).
  const ranges = [];
  for (const [i, number] of lockedSceneNumbers(blocks, issued)) {
    const heading = blocks[i] as Heading;
    if (heading.sem.number !== null) continue;
    const end = state.doc.lineAt(heading.span.from).to;
    ranges.push(Decoration.widget({ widget: new ProvisionalNumber(number), side: 1 }).range(end));
  }
  return Decoration.set(ranges, true);
}

interface Provisional {
  issued: readonly string[] | null;
  marks: DecorationSet;
}

const provisionalField = StateField.define<Provisional>({
  create: () => ({ issued: null, marks: Decoration.none }),
  update(value, tr) {
    let { issued } = value;
    let changed = false;
    for (const effect of tr.effects) {
      if (effect.is(setProvisionalIssued)) {
        issued = effect.value;
        changed = true;
      }
    }
    if (issued === null) return value.issued === null ? value : { issued, marks: Decoration.none };
    if (!changed && !tr.docChanged) return value;
    return { issued, marks: widgetsOf(tr.state, issued) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.marks),
});

/** The provisional numbers, off until `setProvisionalIssued` gives the issued numbers. */
export const provisionalNumbersExtension: Extension = [
  provisionalField,
  EditorView.baseTheme({
    '.cm-provisional-number': { marginLeft: '1ch', color: 'var(--muted)' },
    '.cm-provisional-said': {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap',
    },
  }),
];

/** The numbers drawn now, in order, for tests. */
export function provisionalShown(state: EditorState): string[] {
  const out: string[] = [];
  state.field(provisionalField, false)?.marks.between(0, state.doc.length, (_f, _t, deco) => {
    const widget = deco.spec.widget as ProvisionalNumber | undefined;
    if (widget) out.push(widget.number);
  });
  return out;
}
