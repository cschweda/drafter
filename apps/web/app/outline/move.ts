import { sceneMoved } from '@drafter/cm-fountain';
import { type MoveTarget, moveItem, type OutlineItem, type SceneIndex } from '@drafter/outline';
import { useEditor } from '../editor/session';
import { sayOutline } from './notice';
import { useOutline } from './use-outline';

// Running a move (Phase 2 design §6.2): one transaction, annotated so the moved scene keeps its
// id, and one sentence in the live region saying where it went.

const nameOf = (item: OutlineItem) =>
  (item.kind === 'scene' ? item.heading : item.title) || 'the untitled one';

/** "Moved INT. HALL to scene 4 of 32, in Act Two." */
export function movedMessage(index: SceneIndex, item: OutlineItem): string {
  const total = index.scenes.length;
  if (item.kind === 'scene') {
    const section = item.sections[item.sections.length - 1];
    const within = index.sections.find((s) => s.block === section);
    return `Moved ${nameOf(item)} to scene ${item.ordinal} of ${total}${within ? `, in ${nameOf(within)}` : ''}.`;
  }
  const first = index.scenes.find(
    (s) => s.span.from >= item.span.from && s.span.from < item.span.to,
  );
  return first
    ? `Moved ${nameOf(item)}. It starts at scene ${first.ordinal} of ${total}.`
    : `Moved ${nameOf(item)}.`;
}

/**
 * Moves the scene or section at block `block` to `target`. With `keepCursor`, a cursor inside it
 * moves with it (the Source pane's commands). Returns the moved item's id, or null when nothing
 * moved (and says why, when a writer would wonder).
 */
export function runMove(
  block: number,
  target: MoveTarget | null,
  options: { keepCursor?: boolean; direction?: 'up' | 'down' } = {},
): string | null {
  const outline = useOutline();
  const editor = useEditor();
  const index = outline.index.value;
  const item = index.items.find((i) => i.block === block);
  if (!item) return null;
  if (outline.readOnly.value) {
    void sayOutline(outline.readOnly.value);
    return null;
  }
  const move = target && moveItem(editor.doc.value, index, block, target);
  if (!move) {
    if (options.direction) {
      void sayOutline(`${nameOf(item)} can’t move further ${options.direction}.`);
    }
    return null;
  }
  const head = editor.view.state.selection.main.head;
  const inside = head >= item.span.from && head <= item.span.to;
  const done = outline.apply(move.changes, {
    annotations: [sceneMoved.of(move.moved)],
    ...(options.keepCursor &&
      inside && { selection: { anchor: move.at + (head - item.span.from) } }),
  });
  if (!done) return null;
  const after = outline.index.value;
  const moved = after.items.find((i) => i.span.from === move.at);
  if (!moved) return null;
  void sayOutline(movedMessage(after, moved));
  return outline.idOf(moved);
}
