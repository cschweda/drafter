// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parsedDoc, type SpellMark, setSpellMarks, spellMarks } from '@drafter/cm-fountain';
import type { DropdownMenuItem } from '@nuxt/ui';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { watch } from 'vue';
import { onSpellContextMenu, openSpellMenu, spellMenu } from '../app/spell/menu';
import { type SpellMenuHooks, spellMenuItems } from '../app/spell/menu-items';

// The spelling menu (Plan D, Task 5): it opens on a marked word only, and lists the suggestions,
// then what can be done with the word, each off (with the reason) where it can't be done.

const TEXT = 'INT. HALL - DAY\n\nThe phnoe rings.\n';
const MARK: SpellMark = { from: 21, to: 26, word: 'phnoe' };

// jsdom has no layout; CodeMirror's measuring asks a range for its rectangles.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const views: EditorView[] = [];
function viewOf(text: string, marks: SpellMark[], cursor: number) {
  const view = new EditorView({
    state: EditorState.create({
      doc: text,
      selection: { anchor: cursor },
      extensions: [parsedDoc, spellMarks()],
    }),
  });
  document.body.append(view.dom);
  views.push(view);
  view.dispatch({ effects: setSpellMarks.of(marks) });
  return view;
}
beforeEach(() => {
  spellMenu.value = null;
});
afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.remove();
    view.destroy();
  }
});

const hooks = (): SpellMenuHooks & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    replace: (s) => calls.push(`replace ${s}`),
    addToScript: () => calls.push('script'),
    addToMine: () => calls.push('mine'),
    ignore: () => calls.push('ignore'),
  };
};
const labels = (group: DropdownMenuItem[] | undefined) => (group ?? []).map((i) => i.label);
const ACTIONS = ['Add to this script’s dictionary', 'Add to my dictionary', 'Ignore here'];

describe('the spelling menu', () => {
  test('opens only on a marked word', () => {
    expect(TEXT.slice(MARK.from, MARK.to)).toBe('phnoe');
    const plain = viewOf(TEXT, [MARK], 18);
    expect(openSpellMenu(plain)).toBe(false);
    expect(spellMenu.value).toBeNull();

    const inside = viewOf(TEXT, [MARK], 23);
    expect(openSpellMenu(inside, { left: 10, top: 20 })).toBe(true);
    expect(spellMenu.value).toEqual({ mark: MARK, at: { left: 10, top: 20 } });

    // At the end of the word, as after typing it; placed at the word when no place is given.
    spellMenu.value = null;
    const after = viewOf(TEXT, [MARK], 26);
    expect(openSpellMenu(after)).toBe(true);
    expect(spellMenu.value?.mark).toEqual(MARK);
    expect(typeof spellMenu.value?.at.left).toBe('number');

    // No marks (spellcheck off): nothing opens.
    spellMenu.value = null;
    const off = new EditorView({
      state: EditorState.create({ doc: TEXT, selection: { anchor: 23 } }),
    });
    views.push(off);
    expect(openSpellMenu(off)).toBe(false);
    expect(spellMenu.value).toBeNull();
  });

  test('a right-click opens it on a marked word, once the button is let go, and nowhere else', () => {
    const view = viewOf(TEXT, [MARK], 0);
    const click = (target: Element, buttons: number) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, buttons });
      Object.defineProperty(event, 'target', { value: target });
      return { event, opened: onSpellContextMenu(event, view) };
    };
    const line = view.contentDOM.querySelector('.cm-line') as Element;
    const plain = click(line, 0);
    expect(plain.opened).toBe(false);
    expect(plain.event.defaultPrevented).toBe(false);
    expect(spellMenu.value).toBeNull();

    const word = view.contentDOM.querySelector('.cm-misspelled') as Element;
    // Released already (Windows): it opens now.
    const released = click(word, 0);
    expect(released.opened).toBe(true);
    expect(released.event.defaultPrevented).toBe(true);
    expect(spellMenu.value?.mark).toEqual(MARK);

    // Still held (macOS, Linux; Ctrl+click on a Mac is the main button): it opens on the
    // release, not under the pointer before it.
    for (const buttons of [2, 1]) {
      spellMenu.value = null;
      const held = click(word, buttons);
      expect(held.event.defaultPrevented).toBe(true);
      expect(spellMenu.value).toBeNull();
      window.dispatchEvent(new Event('pointerup'));
      expect(spellMenu.value?.mark).toEqual(MARK);
      spellMenu.value = null;
      window.dispatchEvent(new Event('pointerup'));
      expect(spellMenu.value).toBeNull();
    }

    // One wait at a time: a second right-click replaces the first's.
    const other: SpellMark = { from: 12, to: 15, word: 'DAY' };
    view.dispatch({ effects: setSpellMarks.of([other, MARK]) });
    const day = view.contentDOM.querySelectorAll('.cm-misspelled')[0] as Element;
    const phnoe = view.contentDOM.querySelectorAll('.cm-misspelled')[1] as Element;
    click(day, 2);
    click(phnoe, 2);
    const seen: unknown[] = [];
    const stop = watch(spellMenu, (now) => seen.push(now?.mark.word), { flush: 'sync' });
    window.dispatchEvent(new Event('pointerup'));
    expect(seen).toEqual(['phnoe']);
    stop();

    // A key before the release cancels it.
    spellMenu.value = null;
    click(word, 2);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new Event('pointerup'));
    expect(spellMenu.value).toBeNull();

    // The word edited before the release: nothing opens.
    click(word, 2);
    view.dispatch({ changes: { from: MARK.from, insert: 'x' } });
    window.dispatchEvent(new Event('pointerup'));
    expect(spellMenu.value).toBeNull();
  });

  test('lists at most five suggestions, then the three actions', () => {
    const view = viewOf(TEXT, [MARK], 23);
    const h = hooks();
    const seven = ['phone', 'phony', 'phenol', 'pone', 'phoned', 'phones', 'phonic'];
    const groups = spellMenuItems(view, seven, 'fountain', null, h);
    expect(groups).toHaveLength(2);
    expect(labels(groups[0])).toEqual(seven.slice(0, 5));
    expect(labels(groups[1])).toEqual(ACTIONS);
    for (const item of groups.flat()) expect(item.disabled ?? false, item.label).toBe(false);
    groups[0]?.[1]?.onSelect?.(new Event('select'));
    for (const item of groups[1] ?? []) item.onSelect?.(new Event('select'));
    expect(h.calls).toEqual(['replace phony', 'script', 'mine', 'ignore']);

    // Until they come, and when there are none.
    const waiting = spellMenuItems(view, null, 'fountain', null, h);
    expect(waiting[0]).toEqual([{ type: 'label', label: 'Finding suggestions…' }]);
    expect(labels(waiting[1])).toEqual(ACTIONS);
    const none = spellMenuItems(view, [], 'fountain', null, h);
    expect(none[0]).toEqual([{ type: 'label', label: 'No suggestions' }]);
  });

  test('disables a suggestion and the script’s dictionary in a read-only tab, with the reason', () => {
    const view = viewOf(TEXT, [MARK], 23);
    const why = 'This script is open for editing in another tab.';
    const groups = spellMenuItems(view, ['phone', 'phony'], 'fountain', why, hooks());
    // The reason first, as the Outline's menu has it.
    expect(groups[0]).toEqual([{ type: 'label', label: why }]);
    for (const item of groups[1] ?? []) expect(item.disabled, item.label).toBe(true);
    const [script, mine, ignore] = groups[2] ?? [];
    expect(script).toMatchObject({ label: ACTIONS[0], disabled: true, description: why });
    expect(mine?.disabled ?? false).toBe(false);
    expect(ignore?.disabled ?? false).toBe(false);

    // A Markdown document: the suggestions work; its dictionary has nowhere to go.
    const md = spellMenuItems(view, ['phone'], 'markdown', null, hooks());
    expect(md[0]?.[0]?.disabled ?? false).toBe(false);
    expect(md[1]?.[0]).toMatchObject({
      disabled: true,
      description: expect.stringMatching(/Markdown/),
    });
  });
});
