import { downTarget, type Scene, upTarget } from '@drafter/outline';
import type { DropdownMenuItem } from '@nuxt/ui';
import { openSceneHistory } from '../history/scene-history';
import { runMove } from '../outline/move';
import { openSceneDetails } from '../outline/scene-details';
import { sceneMenuItems } from '../outline/scene-menu';
import { useOutline } from '../outline/use-outline';
import { showScaffold } from '../scaffold/show';
import { openThreads } from './dialogs';
import { useThreads } from './use-threads';

// A Lanes block's menu (threads design §7.3): a scene's is the menu the Outline tree and the cards
// use (`sceneMenuItems`); a passage's has Go to and Threads…, the novel Outline's actions that need
// no tree. Every action runs once the menu has closed (`later`); `focus` puts focus back on the
// block, and `moved` is told when a move changes the lanes under it.

export interface BlockMenuHooks {
  /** Runs `act` once the menu has closed and given focus back. */
  later(act: () => void): void;
  /** Focus back on the block the menu was for. */
  focus(): void;
  /** Move to…: the view shows its dialog for the scene with this outline id. */
  moveTo(id: string): void;
  /** A move was made: the block may be elsewhere once the lanes catch up. */
  moved(): void;
}

/** The scene a script's lane unit stands for (`scene:<block>`), now. */
export function sceneOfUnit(unitId: string): Scene | undefined {
  const block = Number(unitId.slice('scene:'.length));
  return useOutline().index.value.scenes.find((s) => s.block === block);
}

export function blockMenuItems(
  unitId: string,
  noun: 'scene' | 'passage',
  hooks: BlockMenuHooks,
): DropdownMenuItem[][] {
  const threads = useThreads();
  if (noun === 'passage') {
    const why = threads.readOnly();
    return [
      ...(why ? [[{ type: 'label' as const, label: why }]] : []),
      [
        {
          label: 'Go to',
          icon: 'i-lucide-arrow-right',
          onSelect: () => hooks.later(() => threads.go(unitId)),
        },
      ],
      [
        {
          label: 'Threads…',
          icon: 'i-lucide-git-branch',
          onSelect: () => hooks.later(() => openThreads(unitId, hooks.focus)),
        },
      ],
    ];
  }
  const outline = useOutline();
  const scene = sceneOfUnit(unitId);
  if (!scene) return [];
  const id = outline.idOf(scene);
  /** The scene as it is when the action runs, never offsets from when the menu opened. */
  const now = () => outline.itemById(id);
  const move = (direction: 'up' | 'down') =>
    hooks.later(() => {
      const item = now();
      if (!item) return;
      const index = outline.index.value;
      const target =
        direction === 'up' ? upTarget(index, item.block) : downTarget(index, item.block);
      runMove(item.block, target, { direction });
      hooks.moved();
    });
  return sceneMenuItems(id, scene, {
    go: () => hooks.later(() => threads.go(unitId)),
    edit: () => hooks.later(() => openSceneDetails(id, hooks.focus)),
    moveUp: () => move('up'),
    moveDown: () => move('down'),
    moveTo: () => hooks.later(() => hooks.moveTo(id)),
    focus: () => hooks.focus(),
    history: () =>
      hooks.later(() => {
        const item = now();
        if (item?.kind !== 'scene') return;
        hooks.focus();
        openSceneHistory({ id, from: item.span.from, to: item.span.to, heading: item.heading });
      }),
    scaffold: () => hooks.later(() => showScaffold({ kind: 'scene', pinned: id })),
    threads: () => hooks.later(() => openThreads(id, hooks.focus)),
  });
}
