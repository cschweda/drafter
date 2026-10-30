import type { EditorView } from '@codemirror/view';
import type { DropdownMenuItem } from '@nuxt/ui';
import type { DocumentKind } from '../markdown/kind';
import { whyNot } from './actions';

// What the spelling menu lists (Plan D, Task 5 and Call 19), apart from `menu.ts` so that the
// editor's extensions, which open the menu, don't import the actions.

export interface SpellMenuHooks {
  replace(suggestion: string): void;
  addToScript(): void;
  addToMine(): void;
  ignore(): void;
}

/** Suggestions shown at most; the checker gives no more than this either. */
const SHOWN = 5;

/**
 * The menu for a marked word: its suggestions (null while they're coming), then Add to this script's
 * dictionary, Add to my dictionary, and Ignore here. What edits the file is off in a read-only tab,
 * with the reason first, as the Outline's menu has it; the script's dictionary says why it's off.
 */
export function spellMenuItems(
  view: EditorView,
  suggestions: readonly string[] | null,
  kind: DocumentKind,
  readOnly: string | null,
  hooks: SpellMenuHooks,
): DropdownMenuItem[][] {
  const replaceWhy = whyNot(view, 'replace', kind, readOnly);
  const scriptWhy = whyNot(view, 'add-to-script', kind, readOnly);
  const groups: DropdownMenuItem[][] = [];
  if (replaceWhy) groups.push([{ type: 'label', label: replaceWhy }]);
  if (suggestions === null) groups.push([{ type: 'label', label: 'Finding suggestions…' }]);
  else if (suggestions.length === 0) groups.push([{ type: 'label', label: 'No suggestions' }]);
  else {
    groups.push(
      suggestions.slice(0, SHOWN).map(
        (suggestion): DropdownMenuItem => ({
          label: suggestion,
          disabled: replaceWhy !== null,
          onSelect: () => hooks.replace(suggestion),
        }),
      ),
    );
  }
  groups.push([
    {
      label: 'Add to this script’s dictionary',
      icon: 'i-lucide-book-plus',
      disabled: scriptWhy !== null,
      ...(scriptWhy && { description: scriptWhy }),
      onSelect: hooks.addToScript,
    },
    {
      label: 'Add to my dictionary',
      icon: 'i-lucide-book-user',
      disabled: false,
      onSelect: hooks.addToMine,
    },
    { label: 'Ignore here', icon: 'i-lucide-eye-off', disabled: false, onSelect: hooks.ignore },
  ]);
  return groups;
}
