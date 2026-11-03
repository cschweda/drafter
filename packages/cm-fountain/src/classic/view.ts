import type { EditorState, Extension, Line, Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { type Block, blockAt, metadataSpan, parse } from '@drafter/fountain';
import { resolveRole, type Template } from '@drafter/templates';
import { elementStructure, elementTemplate } from '../elements';
import { wholeLines } from '../highlight';
import { parsedDoc } from '../state';
import { type HiddenSpan, hiddenSpans } from './hidden';
import { type ClassicKind, classicLine, lineKindAt } from './line';

// How the left pane looks in Classic Mode (design §8): decorations only, so nothing is written to
// the text. Marks are taken out of the drawn line, and each line takes its element's indent from
// the template, through CSS variables on the editor.

/** A role's name goes in a class and a variable's name, so it's only let through as a plain word. */
const PLAIN_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** `--c-<role>-indent`, `-width`, as whole numbers; a role whose numbers aren't integers is left out. */
export function roleVariables(template: Template): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, { indent, width }] of Object.entries(template.roles)) {
    if (!PLAIN_NAME.test(role) || !Number.isInteger(indent) || !Number.isInteger(width)) continue;
    out[`--c-${role}-indent`] = String(indent);
    out[`--c-${role}-width`] = String(width);
  }
  return out;
}

/** One block of each kind, for asking a template's role map. */
const SAMPLE = (() => {
  const { blocks } = parse(
    '# A\n\n## B\n\n### C\n\nINT. D\n\nE.\n\nF\n(g)\nh\n\n~i\n\n> j <\n\nCUT TO:\n\n= k',
  );
  const sample = (kind: Block['kind']) => blocks.find((block) => block.kind === kind) as Block;
  return {
    sections: blocks.filter((block) => block.kind === 'section'),
    sample,
    kinds: [
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'lyric',
      'centered',
      'transition',
      'scene_heading',
      'section',
      'synopsis',
    ] as const,
  };
})();

/** The classes of each element in a template. */
type ElementClasses = Partial<Record<ClassicKind, string>>;

const CLASSES = new WeakMap<Template, ElementClasses>();

/** `cm-c-<role>`, and what the role's style and alignment add, for an element and its block. */
function classesOf(template: Template, kind: ClassicKind, block: Block): string {
  const role = resolveRole(template, block, null);
  const style = template.roles[role];
  // What a template omits or turns off has no style of its own, and is named for what it is.
  const name = style && PLAIN_NAME.test(role) ? role : kind;
  const out = [`cm-c-${name}`];
  if (style?.align === 'center' || style?.align === 'right') out.push(`cm-c-${style.align}`);
  if (style?.style?.italic) out.push('cm-c-italic');
  if (style?.style?.bold) out.push('cm-c-bold');
  if (style?.style?.underline) out.push('cm-c-underline');
  return out.join(' ');
}

function classesFor(template: Template, state: EditorState): ElementClasses {
  const known = CLASSES.get(template);
  if (known) return known;
  const out: ElementClasses = { page_break: 'cm-c-page_break' };
  for (const kind of SAMPLE.kinds) out[kind] = classesOf(template, kind, SAMPLE.sample(kind));
  const { actDepth, sceneDepth, headings } = state.facet(elementStructure)();
  const section = (depth: number | null) => (depth ? SAMPLE.sections[depth - 1] : undefined);
  const act = section(actDepth);
  const scene = section(sceneDepth);
  if (act) out.act = classesOf(template, 'act', act);
  if (scene && !headings) out.scene_heading = classesOf(template, 'scene_heading', scene);
  CLASSES.set(template, out);
  return out;
}

/** `cm-c-<role>` for the cursor's line (stored) and every other line (the parser). */
export function lineClassOf(state: EditorState, line: Line): string | null {
  const kind = lineKindAt(state, line);
  if (!kind) return null;
  const template = state.facet(elementTemplate)?.();
  const classes = (template && classesFor(template, state)[kind]) || `cm-c-${kind}`;
  if (kind !== 'section') return classes;
  const block = blockAt(state.field(parsedDoc), line.from)?.block;
  return block?.kind === 'section' ? `${classes} cm-c-depth-${block.sem.depth}` : classes;
}

/** A thin rule at each end of a note or a cut. It's there to be seen, so a reader isn't told. */
class EndRule extends WidgetType {
  constructor(readonly name: string) {
    super();
  }

  toDOM(): HTMLElement {
    const rule = document.createElement('span');
    rule.className = this.name;
    rule.setAttribute('aria-hidden', 'true');
    return rule;
  }
}

/** Fixed words in place of a mark. */
class Words extends WidgetType {
  constructor(
    readonly name: string,
    readonly words: string,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const tag = document.createElement('span');
    tag.className = this.name;
    tag.textContent = this.words;
    return tag;
  }
}

const HIDE = Decoration.replace({});
const NOTE_RULE = Decoration.replace({ widget: new EndRule('cm-c-note-rule') });
const BONEYARD_RULE = Decoration.replace({ widget: new EndRule('cm-c-boneyard-rule') });
const PAGE_BREAK = Decoration.replace({ widget: new Words('cm-c-page-break', 'Page break') });
const DUAL_TAG = Decoration.replace({ widget: new Words('cm-c-dual', 'dual') });

const PAGE_BREAK_MARK = /^={3,}$/;

function hiding(state: EditorState, span: HiddenSpan): Decoration {
  switch (span.kind) {
    case 'note':
      return NOTE_RULE;
    case 'boneyard':
      return BONEYARD_RULE;
    case 'dual':
      return DUAL_TAG;
    case 'lead':
      return span.to - span.from >= 3 && PAGE_BREAK_MARK.test(state.sliceDoc(span.from, span.to))
        ? PAGE_BREAK
        : HIDE;
    default:
      return HIDE;
  }
}

const LINE_DECORATIONS = new Map<string, Decoration>();

function lineDecoration(name: string): Decoration {
  let decoration = LINE_DECORATIONS.get(name);
  if (!decoration) {
    decoration = Decoration.line({ class: name });
    LINE_DECORATIONS.set(name, decoration);
  }
  return decoration;
}

type Stretch = { from: number; to: number };

/**
 * What's seen in `ranges`. Each line's spans come from `hiddenSpans`, the list the caret reads, by
 * search and not a walk of the blocks. CodeMirror leaves the unseen middle of a very long line out
 * of the ranges, and its marks are left out here too, so the cost follows what's on the screen. A
 * mark across the edge of a range goes as well: a replace that starts before CodeMirror's gap would
 * swallow the gap, and the whole line would be drawn.
 */
export function classicDecorations(state: EditorState, ranges: readonly Stretch[]) {
  const { doc } = state;
  const block = metadataSpan(state.field(parsedDoc));
  const hidden: Range<Decoration>[] = [];
  const lines: Range<Decoration>[] = [];
  for (const { from, to } of wholeLines(doc, ranges)) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      const name = lineClassOf(state, line);
      if (name) lines.push(lineDecoration(name).range(line.from));
      // The block's lines are `metadataHidden`'s, whole, and a mark inside would break its replace.
      const own = block && line.to >= block.from && line.from <= block.to;
      const seen = own
        ? []
        : ranges.filter((range) => range.from <= line.to && range.to >= line.from);
      for (const span of hiddenSpans(state, line)) {
        if (seen.some((range) => span.from >= range.from && span.to <= range.to)) {
          hidden.push(hiding(state, span).range(span.from, span.to));
        }
      }
      pos = line.to + 1;
    }
  }
  return { hidden: Decoration.set(hidden, true), lines: Decoration.set(lines) };
}

const templateOf = (state: EditorState) => state.facet(elementTemplate)?.() ?? null;

const painter = ViewPlugin.fromClass(
  class {
    hidden: DecorationSet;
    lines: DecorationSet;
    template: Template | null;

    constructor(view: EditorView) {
      const { hidden, lines } = classicDecorations(view.state, view.visibleRanges);
      this.hidden = hidden;
      this.lines = lines;
      this.template = templateOf(view.state);
    }

    update(update: ViewUpdate) {
      const template = templateOf(update.state);
      if (
        update.docChanged ||
        update.viewportChanged ||
        template !== this.template ||
        update.state.field(classicLine, false) !== update.startState.field(classicLine, false)
      ) {
        this.template = template;
        const next = classicDecorations(update.state, update.view.visibleRanges);
        this.hidden = next.hidden;
        this.lines = next.lines;
      }
    }
  },
  {
    provide: (plugin) => [
      EditorView.decorations.of((view) => view.plugin(plugin)?.hidden ?? Decoration.none),
      EditorView.decorations.of((view) => view.plugin(plugin)?.lines ?? Decoration.none),
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.hidden ?? Decoration.none),
    ],
  },
);

type Attributes = Record<string, string>;

const BARE: Attributes = { class: 'cm-classic' };
const ATTRIBUTES = new WeakMap<Template, Attributes>();

/** The editor's class and variables, kept for each template, so a keystroke costs a lookup. */
function attributesOf(view: EditorView): Attributes {
  const template = templateOf(view.state);
  if (!template) return BARE;
  let attributes = ATTRIBUTES.get(template);
  if (!attributes) {
    const variables = Object.entries(roleVariables(template));
    const style = variables.map(([name, value]) => `${name}: ${value}`).join('; ');
    attributes = { class: 'cm-classic', style };
    ATTRIBUTES.set(template, attributes);
  }
  return attributes;
}

/** The left pane in Classic Mode: marks hidden, and each line where it goes on the page. */
export const classicView: Extension = [painter, EditorView.editorAttributes.of(attributesOf)];
