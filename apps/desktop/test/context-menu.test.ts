// context-menu.ts: what the editor's right-click menu holds, without Electron.
import { describe, expect, test, vi } from 'vitest';
import { type ContextParams, contextMenuTemplate } from '../src/context-menu';

const flags = { canCut: false, canCopy: false, canPaste: true, canSelectAll: true };
const params = (over: Partial<ContextParams> = {}): ContextParams => ({
  misspelledWord: '',
  dictionarySuggestions: [],
  isEditable: true,
  editFlags: { ...flags },
  ...over,
});
const actions = () => ({ replace: vi.fn(), addWord: vi.fn() });
const labels = (items: ReturnType<typeof contextMenuTemplate>) =>
  items.map((item) => (item.type === 'separator' ? '—' : (item.label ?? item.role)));

describe('contextMenuTemplate', () => {
  test('a misspelled word: its suggestions, Add to dictionary, then the edit items', () => {
    const act = actions();
    const items = contextMenuTemplate(
      params({ misspelledWord: 'quikc', dictionarySuggestions: ['quick', 'quirk'] }),
      act,
    );
    expect(labels(items)).toEqual([
      'quick',
      'quirk',
      'Add to Dictionary',
      '—',
      'cut',
      'copy',
      'paste',
      '—',
      'selectAll',
    ]);
    items[0]?.click?.({} as never, undefined, {} as never);
    expect(act.replace).toHaveBeenCalledWith('quick');
    items[2]?.click?.({} as never, undefined, {} as never);
    expect(act.addWord).toHaveBeenCalledWith('quikc');
  });

  test('a misspelled word with no suggestions says so', () => {
    const items = contextMenuTemplate(params({ misspelledWord: 'zxqv' }), actions());
    expect(items[0]).toMatchObject({ label: 'No Suggestions', enabled: false });
    expect(items[1]).toMatchObject({ label: 'Add to Dictionary' });
  });

  test('offers at most five suggestions', () => {
    const items = contextMenuTemplate(
      params({ misspelledWord: 'teh', dictionarySuggestions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
      actions(),
    );
    expect(labels(items).slice(0, 6)).toEqual(['a', 'b', 'c', 'd', 'e', 'Add to Dictionary']);
  });

  test('the edit items are enabled as the page says they can be', () => {
    const items = contextMenuTemplate(
      params({ editFlags: { canCut: true, canCopy: true, canPaste: false, canSelectAll: true } }),
      actions(),
    );
    const byRole = Object.fromEntries(items.filter((i) => i.role).map((i) => [i.role, i.enabled]));
    expect(byRole).toEqual({ cut: true, copy: true, paste: false, selectAll: true });
    expect(labels(items)[0]).toBe('cut');
  });

  test('outside an editable place: Copy and Select All only, or nothing to show', () => {
    const selected = contextMenuTemplate(
      params({
        isEditable: false,
        editFlags: { canCut: false, canCopy: true, canPaste: false, canSelectAll: true },
      }),
      actions(),
    );
    expect(labels(selected)).toEqual(['copy', '—', 'selectAll']);
    expect(
      contextMenuTemplate(
        params({
          isEditable: false,
          editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: true },
        }),
        actions(),
      ),
    ).toEqual([]);
  });
});
