import {
  downTarget,
  type OutlineItem,
  SCENE_COLORS,
  type SceneColor,
  upTarget,
} from '@drafter/outline';
import { numbersScenes } from '@drafter/production';
import type { DropdownMenuItem } from '@nuxt/ui';
import { useEditor } from '../editor/session';
import { useProductionActions } from '../production/use-commands';
import { openSceneDetails } from './scene-details';
import { useOutline } from './use-outline';

// One menu for a scene or section, wherever it is drawn: an Outline row's, and a card's (Phase 2
// design §6.1, §7). The view says what its actions do to focus and when they run (`hooks`); the
// menu says what there is, what is off and why, and makes the edits that need no view (a color).

export interface SceneMenuHooks {
  go(id: string): void;
  /** Edit synopsis, in the view. */
  edit(id: string): void;
  moveUp(id: string): void;
  moveDown(id: string): void;
  moveTo(id: string): void;
  /** Focus back on the item's row or card: after a color, and when Scene details closes. */
  focus(id: string): void;
  /** History of this scene…, once the menu has closed (the row or card is the dialog's opener). */
  history(id: string): void;
  /** Scaffold for this scene, once the menu has closed: the Scaffold tab, on this scene, pinned. */
  scaffold(id: string): void;
}

/**
 * The menu for the item with this id: Go to; the moves; for a scene, its synopsis, color, details,
 * History of this scene…, and Scaffold for this scene (seeing-the-script design §5.6).
 */
export function sceneMenuItems(
  id: string,
  item: OutlineItem,
  hooks: SceneMenuHooks,
): DropdownMenuItem[][] {
  const outline = useOutline();
  const why = outline.readOnly.value;
  const off = why !== null;
  const index = outline.index.value;
  const what = item.kind === 'scene' ? 'scene' : 'section';
  const groups: DropdownMenuItem[][] = [];
  if (why) groups.push([{ type: 'label', label: why }]);
  groups.push([{ label: 'Go to', icon: 'i-lucide-arrow-right', onSelect: () => hooks.go(id) }]);
  groups.push([
    {
      label: `Move ${what} up`,
      icon: 'i-lucide-arrow-up',
      disabled: off || upTarget(index, item.block) === null,
      onSelect: () => hooks.moveUp(id),
    },
    {
      label: `Move ${what} down`,
      icon: 'i-lucide-arrow-down',
      disabled: off || downTarget(index, item.block) === null,
      onSelect: () => hooks.moveDown(id),
    },
    {
      label: `Move ${what} to…`,
      icon: 'i-lucide-move',
      disabled: off,
      onSelect: () => hooks.moveTo(id),
    },
  ]);
  if (item.kind === 'scene') {
    const current = item.color?.value ?? null;
    const pick = (color: SceneColor | null): DropdownMenuItem => ({
      type: 'checkbox',
      label: color ?? 'No color',
      checked: current === color,
      onSelect: () => {
        // The scene as it is now, never offsets from when the menu opened.
        const scene = outline.itemById(id);
        if (scene?.kind === 'scene') outline.setColor(scene, color);
        hooks.focus(id);
      },
    });
    groups.push([
      {
        label: 'Edit synopsis',
        icon: 'i-lucide-pencil',
        disabled: off,
        onSelect: () => hooks.edit(id),
      },
      {
        label: 'Color…',
        icon: 'i-lucide-palette',
        disabled: off,
        children: [SCENE_COLORS.map(pick), [pick(null)]],
      },
      {
        // In a read-only tab it opens read-only: everything shows, and Save says why it can't.
        label: 'Scene details…',
        icon: 'i-lucide-notebook-pen',
        onSelect: () => openSceneDetails(id, () => hooks.focus(id)),
      },
      {
        // Read-only too: versions are listed and compared, and Use this version says why it is off.
        label: 'History of this scene…',
        icon: 'i-lucide-history',
        onSelect: () => hooks.history(id),
      },
      {
        label: 'Scaffold for this scene',
        icon: 'i-lucide-users',
        onSelect: () => hooks.scaffold(id),
      },
    ]);
    // Omit scene (production design §7.1): a locked screenplay's numbered scene becomes OMITTED.
    const omit = omitItem(id, item);
    if (omit) groups.push([omit]);
  }
  return groups;
}

/** The scene heading at `from`, as its index among the script's headings; -1 when none is there. */
function headingIndex(from: number): number {
  return useEditor()
    .doc.value.blocks.filter((b) => b.kind === 'scene_heading')
    .findIndex((b) => b.span.from === from);
}

/** Omit scene for a scene of a locked screenplay, or null where it doesn't apply. */
function omitItem(id: string, item: OutlineItem): DropdownMenuItem | null {
  const actions = useProductionActions();
  const editor = useEditor();
  if (!actions.read().production || !numbersScenes(editor.template.value)) return null;
  const index = headingIndex(item.span.from);
  if (index < 0) return null;
  return {
    label: 'Omit scene',
    icon: 'i-lucide-square-dashed',
    disabled: !actions.canOmit(index),
    onSelect: () => {
      // The scene as it is now, never offsets from when the menu opened.
      const scene = useOutline().itemById(id);
      const now = scene ? headingIndex(scene.span.from) : -1;
      if (now >= 0) void actions.omit(now);
    },
  };
}
