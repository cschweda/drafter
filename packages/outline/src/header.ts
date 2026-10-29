import type { Block, Doc, TextChange } from '@drafter/fountain';
import {
  contentEnd,
  hasStrayBoneyard,
  isLineBreak,
  lineBreakOf,
  removeLine,
  type SceneColor,
  safeLine,
} from '@drafter/notes';
import type { Scene } from './types';

// A scene's header (Phase 2 design §5.4): the synopsis and note lines right under the heading's
// blank line, synopses first, then one note per field, each on its own line. Every line of it is
// transparent or a synopsis, so the pages don't change (§1, item 2).

/** The blocks of the scene's header: synopses and notes right after the heading, one line apart. */
function headerOf(doc: Doc, scene: Scene): number[] {
  const out: number[] = [];
  for (let i = scene.block + 1; i < doc.blocks.length; i++) {
    const block = doc.blocks[i] as Block;
    if (block.span.from >= scene.span.to) break;
    if (block.kind !== 'synopsis' && block.kind !== 'note') break;
    if (out.length > 0 && !isLineBreak(block.leading)) break;
    out.push(i);
  }
  return out;
}

const endOf = (doc: Doc, block: Block) => contentEnd(doc.source, block.span.to);

/**
 * The changes that make `text` the scene's first synopsis: its text replaced in place, or a new
 * `= text` line at the top of the header. Empty text removes the first synopsis's line. The text is
 * written on one line, and can't open a note or a boneyard.
 */
export function setSynopsis(doc: Doc, scene: Scene, text: string): TextChange[] {
  if (hasStrayBoneyard(doc)) return [];
  const words = safeLine(text);
  const nl = lineBreakOf(doc.source);
  const first = scene.synopses[0];
  if (first) {
    const block = doc.blocks[first.block] as Block;
    const line = block.lines[0];
    if (!line) return [];
    if (words === '') {
      const removal = removeLine(doc, first.block, 0);
      return removal ? [removal] : [];
    }
    // The text runs to the first note on the line, if one follows it there.
    const lineEnd = contentEnd(doc.source, line.span.to);
    const note = doc.regions.find((r) => r.span.from > line.span.from && r.span.from < lineEnd);
    const to = note ? note.span.from : lineEnd;
    const insert = `= ${words}${note ? ' ' : ''}`;
    if (doc.source.slice(line.span.from, to) === insert) return [];
    return [{ from: line.span.from, to, insert }];
  }
  if (words === '') return [];
  const header = headerOf(doc, scene);
  const top = header[0];
  if (top !== undefined) {
    const at = (doc.blocks[top] as Block).span.from;
    return [{ from: at, to: at, insert: `= ${words}${nl}` }];
  }
  const at = endOf(doc, doc.blocks[scene.block] as Block);
  return [{ from: at, to: at, insert: `${nl}${nl}= ${words}` }];
}

/**
 * The changes that give the scene `color` (design §5.4): its color note changed in place, or
 * `[[Color: blue]]` added to the header after the synopses and before other notes. Null takes the
 * color away, with its line when it is alone on one; beside other text only the note goes. A script
 * with an unclosed `/*` gets no changes.
 */
export function setColor(doc: Doc, scene: Scene, color: SceneColor | null): TextChange[] {
  if (hasStrayBoneyard(doc)) return [];
  const nl = lineBreakOf(doc.source);
  const note = `[[Color: ${color}]]`;
  const existing = scene.color;
  if (existing) {
    if (color !== null) {
      if (doc.source.slice(existing.span.from, existing.span.to) === note) return [];
      return [{ ...existing.span, insert: note }];
    }
    // Alone on its line: the line goes. Beside other text: the note and the spaces before it.
    for (let i = scene.block; i < doc.blocks.length; i++) {
      const block = doc.blocks[i] as Block;
      if (block.span.from > existing.span.from) break;
      const line = block.lines.findIndex(
        (l) => l.span.from <= existing.span.from && existing.span.to <= l.span.to,
      );
      const found = block.lines[line];
      if (!found) continue;
      const raw = doc.source.slice(found.span.from, contentEnd(doc.source, found.span.to));
      if (raw.trim() === doc.source.slice(existing.span.from, existing.span.to)) {
        const removal = removeLine(doc, i, line);
        return removal ? [removal] : [];
      }
      // Beside other text, only the note goes: the spaces around it stay, so the line prints
      // exactly as it did (a note prints nothing, and its neighbours' spaces do).
      return [{ ...existing.span, insert: '' }];
    }
    return [{ ...existing.span, insert: '' }];
  }
  if (color === null) return [];
  const header = headerOf(doc, scene);
  const firstNote = header.find((i) => doc.blocks[i]?.kind === 'note');
  if (firstNote !== undefined) {
    const at = (doc.blocks[firstNote] as Block).span.from;
    return [{ from: at, to: at, insert: `${note}${nl}` }];
  }
  const last = header[header.length - 1];
  if (last !== undefined) {
    const at = endOf(doc, doc.blocks[last] as Block);
    return [{ from: at, to: at, insert: `${nl}${note}` }];
  }
  const at = endOf(doc, doc.blocks[scene.block] as Block);
  return [{ from: at, to: at, insert: `${nl}${nl}${note}` }];
}
