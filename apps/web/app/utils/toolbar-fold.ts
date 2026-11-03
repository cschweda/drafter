/** A top-bar button that can fold into More actions below 1024px (AppToolbar.vue, Task 9). */
export type ToolbarItem = 'contrast' | 'theme' | 'focus' | 'modules' | 'export' | 'save' | 'open';

/** The order they fold in, first to last: Contrast first (Settings has it too), Open last. */
export const TOOLBAR_FOLD_ORDER: readonly ToolbarItem[] = [
  'contrast',
  'theme',
  'focus',
  'modules',
  'export',
  'save',
  'open',
];

/** The buttons folded into More actions just now, shared with the tour (AppTour.vue). */
export function useToolbarFolded() {
  return useState<ToolbarItem[]>('toolbar-folded', () => []);
}
