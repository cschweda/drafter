// context-menu.ts: what the editor's right-click menu holds, without Electron.
import { describe, expect, test, vi } from 'vitest';
import { type ContextParams, contextMenuTemplate, speechAsker } from '../src/context-menu';

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

describe('Use and Never use in story map', () => {
  test('a speech under the click adds Use and Never use in story map above Cut', () => {
    const speech = { use: vi.fn(), never: vi.fn() };
    const items = contextMenuTemplate(params(), actions(), speech);
    expect(labels(items)).toEqual([
      'Use in story map',
      'Never use in story map',
      '—',
      'cut',
      'copy',
      'paste',
      '—',
      'selectAll',
    ]);
    items[0]?.click?.({} as never, undefined, {} as never);
    expect(speech.use).toHaveBeenCalledOnce();
    items[1]?.click?.({} as never, undefined, {} as never);
    expect(speech.never).toHaveBeenCalledOnce();
    // After the spelling items, when the word is misspelled too.
    const spelled = contextMenuTemplate(
      params({ misspelledWord: 'teh', dictionarySuggestions: ['the'] }),
      actions(),
      speech,
    );
    expect(labels(spelled).slice(0, 6)).toEqual([
      'the',
      'Add to Dictionary',
      '—',
      'Use in story map',
      'Never use in story map',
      '—',
    ]);
    // Not outside an editable place.
    expect(
      labels(
        contextMenuTemplate(
          params({ isEditable: false, editFlags: { ...flags, canCopy: true } }),
          actions(),
          speech,
        ),
      ),
    ).not.toContain('Use in story map');
  });

  test('no speech, no items', () => {
    expect(labels(contextMenuTemplate(params(), actions(), null))).not.toContain(
      'Use in story map',
    );
  });
});

describe('asking the page for the speech under a click', () => {
  test('answers the offset the page replies with', async () => {
    const sent: Array<[number, number, number]> = [];
    const asker = speechAsker((id, x, y) => sent.push([id, x, y]));
    const answer = asker.ask(10, 20);
    expect(sent).toHaveLength(1);
    const [id] = sent[0] as [number, number, number];
    asker.reply(id, 42);
    expect(await answer).toBe(42);
  });

  test('no answer in time, no items', async () => {
    vi.useFakeTimers();
    try {
      const asker = speechAsker(() => {}, 200);
      const answer = asker.ask(1, 1);
      vi.advanceTimersByTime(200);
      expect(await answer).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test('a reply that isn’t an offset, or isn’t to a question, is none', async () => {
    const sent: number[] = [];
    const asker = speechAsker((id) => sent.push(id));
    const answer = asker.ask(1, 1);
    asker.reply(999, 5);
    asker.reply(sent[0], '7');
    expect(await answer).toBeNull();
    const again = asker.ask(1, 1);
    asker.reply(sent[1], -3);
    expect(await again).toBeNull();
  });
});
