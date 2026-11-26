import type { DropdownMenuItem } from '@nuxt/ui';
import type { ThreadEditMode } from './dialogs';

// A thread's own menu where the Lanes draw it (threads design §7.3): its row header's, the
// table's, and the phone list's. Rename thread…, Name…, Color…, Remove from every scene (or
// passage)…, each off with the reason shown when nothing can be changed. `pick` runs the edit; the
// view says when (once the menu has closed) and where focus goes back.

export function threadMenuItems(
  noun: 'scene' | 'passage',
  why: string | null,
  pick: (mode: ThreadEditMode) => void,
): DropdownMenuItem[][] {
  const off = why !== null;
  return [
    ...(why ? [[{ type: 'label' as const, label: why }]] : []),
    [
      {
        label: 'Rename thread…',
        icon: 'i-lucide-pencil',
        disabled: off,
        onSelect: () => pick('rename'),
      },
      { label: 'Name…', icon: 'i-lucide-text-cursor', disabled: off, onSelect: () => pick('name') },
      { label: 'Color…', icon: 'i-lucide-palette', disabled: off, onSelect: () => pick('color') },
    ],
    [
      {
        label: `Remove from every ${noun}…`,
        icon: 'i-lucide-trash-2',
        disabled: off,
        onSelect: () => pick('remove'),
      },
    ],
  ];
}
