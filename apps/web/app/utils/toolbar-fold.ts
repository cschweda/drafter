/** A top-bar button that can fold into More actions below 1024px (AppToolbar.vue, Task 9). */
export type ToolbarItem =
  | 'contrast'
  | 'theme'
  | 'focus'
  | 'about'
  | 'modules'
  | 'export'
  | 'save'
  | 'open';

/**
 * The order they fold in, first to last: Contrast first (Settings has it too), Open last. About
 * (2026-11-09) folds before anything a writer uses while writing, so on a phone File stays.
 */
export const TOOLBAR_FOLD_ORDER: readonly ToolbarItem[] = [
  'contrast',
  'theme',
  'focus',
  'about',
  'modules',
  'export',
  'save',
  'open',
];

/** The buttons folded into More actions just now, shared with the tour (AppTour.vue). */
export function useToolbarFolded() {
  return useState<ToolbarItem[]>('toolbar-folded', () => []);
}
