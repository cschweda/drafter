import type { Strip, StripBlock } from '@drafter/outline';

// The Structure strip's keys (structure strip design §4, Call 12), as a pure function of the
// strip: Left and Right along a row, Up and Down to the row above or below, Home and End. The
// strip is one Tab stop; its view moves the roving tabindex to the place this gives.

export interface StripPlace {
  row: number;
  index: number;
}

/** How far `at` is from the block: 0 inside it, else to its nearer end. */
const distance = (block: StripBlock, at: number) => Math.max(block.from - at, at - block.to, 0);

/**
 * The block in `blocks` covering `at` (from its start up to its end, so a point where one block
 * ends and the next starts is the next one's; a tick covers its own place), else the nearest.
 */
function blockAt(blocks: readonly StripBlock[], at: number): number {
  const covering = blocks.findIndex(
    (block) =>
      (block.from <= at && at < block.to) || (block.from === block.to && at === block.from),
  );
  if (covering >= 0) return covering;
  let best = 0;
  for (let i = 1; i < blocks.length; i++) {
    if (distance(blocks[i] as StripBlock, at) < distance(blocks[best] as StripBlock, at)) best = i;
  }
  return best;
}

/**
 * Left/Right along a row (stopping at its ends), Up/Down to the block in the next row covering
 * the focused block's middle (else the nearest by distance), Home/End within the row; null for
 * any other key or no move.
 */
export function stripKey(strip: Strip, at: StripPlace, key: string): StripPlace | null {
  const row = strip.rows[at.row];
  const focused = row?.blocks[at.index];
  if (!row || !focused) return null;
  const last = row.blocks.length - 1;
  const along = (index: number) =>
    index >= 0 && index <= last && index !== at.index ? { row: at.row, index } : null;
  switch (key) {
    case 'ArrowLeft':
      return along(at.index - 1);
    case 'ArrowRight':
      return along(at.index + 1);
    case 'Home':
      return along(0);
    case 'End':
      return along(last);
    case 'ArrowUp':
    case 'ArrowDown': {
      const next = at.row + (key === 'ArrowUp' ? -1 : 1);
      const blocks = strip.rows[next]?.blocks;
      if (!blocks?.length) return null;
      return { row: next, index: blockAt(blocks, (focused.from + focused.to) / 2) };
    }
    default:
      return null;
  }
}

/**
 * Whether a key opens the focused block's menu (version-history design §6.2, Call 31): the
 * context-menu key, or Shift+F10, with no other modifier.
 */
export function opensMenu(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>,
): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
}
