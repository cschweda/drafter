import { codeFolding, foldService } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { blockAt, type Doc } from '@drafter/fountain';
import { parsedDoc } from './state';

// Folding by scene and section (technical design §3.5), read from the parse in the state. The
// fold of a heading is from the end of its line to the end of the last block that belongs to it.
// The blank lines before the next heading stay out of it, so scenes folded one after another
// still have a gap between them.

/**
 * For each block, where its fold ends, or -1 when it has none: a block that is no scene heading
 * or section, one with nothing under it, and the metadata block, which belongs to no scene.
 * One pass with a stack of the open folds, kept for each parse.
 */
const ends = new WeakMap<Doc, Int32Array>();

function foldEnds(doc: Doc): Int32Array {
  let found = ends.get(doc);
  if (found) return found;
  const { blocks } = doc;
  found = new Int32Array(blocks.length).fill(-1);
  // The metadata block, when there is one, is the last block, alone.
  const last = blocks.length - (doc.meta ? 2 : 1);
  /** The open section headings, shallowest first, and the open scene heading, if any. */
  const sections: number[] = [];
  let scene = -1;
  const close = (opener: number, before: number) => {
    const end = (blocks[before - 1] ?? blocks[opener])?.span.to ?? -1;
    (found as Int32Array)[opener] = end;
  };
  for (let i = 0; i <= last; i++) {
    const block = blocks[i];
    if (block?.kind !== 'scene_heading' && block?.kind !== 'section') continue;
    if (scene >= 0) close(scene, i);
    scene = -1;
    if (block.kind === 'section') {
      const depth = block.sem.depth;
      for (let top = sections.pop(); top !== undefined; top = sections.pop()) {
        const opener = blocks[top];
        if (opener?.kind === 'section' && opener.sem.depth < depth) {
          sections.push(top);
          break;
        }
        close(top, i);
      }
      sections.push(i);
    } else {
      scene = i;
    }
  }
  if (scene >= 0) close(scene, last + 1);
  for (const opener of sections) close(opener, last + 1);
  ends.set(doc, found);
  return found;
}

/** The fold of the heading on the line from `lineStart` to `lineEnd`, if it has one. */
function fold(state: EditorState, lineStart: number, lineEnd: number) {
  const doc = state.field(parsedDoc);
  const found = blockAt(doc, lineStart);
  if (!found) return null;
  const { block, index } = found;
  // Only the heading's own line folds, not the lines under it that the block may have.
  if (block.span.from < lineStart || block.span.from > lineEnd) return null;
  const end = foldEnds(doc)[index] ?? -1;
  return end > lineEnd ? { from: lineEnd, to: end } : null;
}

/**
 * What a folded scene shows after its heading: the text of the first synopsis inside it, or
 * nothing. A folded section shows its title and nothing more.
 */
function synopsisIn(state: EditorState, range: { from: number; to: number }): string {
  const doc = state.field(parsedDoc);
  const found = blockAt(doc, range.from);
  if (found?.block.kind !== 'scene_heading') return '';
  for (let i = found.index + 1; i < doc.blocks.length; i++) {
    const block = doc.blocks[i];
    if (!block || block.span.from >= range.to) break;
    if (block.kind === 'synopsis') return block.sem.text;
  }
  return '';
}

/** The folded range as the writer sees it: an ellipsis, and the scene's synopsis after it. */
function placeholder(
  view: { state: EditorState },
  onclick: (event: Event) => void,
  synopsis: string,
): HTMLElement {
  const element = document.createElement('span');
  element.textContent = synopsis ? `… ${synopsis}` : '…';
  element.setAttribute('aria-label', view.state.phrase('folded code'));
  element.title = view.state.phrase('unfold');
  element.className = 'cm-foldPlaceholder';
  element.onclick = onclick;
  return element;
}

/**
 * Folding by scene and section (technical design §3.5). A section folds to the next section of
 * equal or shallower depth, and a scene to the next scene heading or section; the fold runs from
 * the end of the heading to the end of the last block before that. A folded scene shows its
 * heading and the first synopsis inside it, which is what "condense to outline" means in the
 * Source pane, and a folded section shows its title.
 *
 * It brings `parsedDoc` and `codeFolding` with its placeholder, so an app adds no `codeFolding` of
 * its own. The fold gutter and the fold keys are the app's to add.
 */
export function fountainFolding(): Extension {
  return [
    parsedDoc,
    foldService.of(fold),
    codeFolding({ preparePlaceholder: synopsisIn, placeholderDOM: placeholder }),
  ];
}
