// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import { classicNotice } from '../app/editor/element-notice';
import { classicIsOn } from '../app/editor/extensions';
import { useEditor } from '../app/editor/session';
import { CLASSIC_NOTICE, FOUNTAIN_NOTICE, setWritingMode } from '../app/editor/writing-mode';
import { useSettings } from '../app/settings/settings';

// The switch's one action, on the real editor; only the panes, which are Nuxt state, are stood in for.
vi.mock('~/composables/usePanes', async () => {
  const { ref } = await import('vue');
  const tabs = ref({ left: 'source', right: 'script' });
  const phoneTab = ref('script');
  return { usePanes: () => ({ tabs, phoneTab }) };
});

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const SCRIPT = 'INT. HALL - DAY\n\nShe waits.\n';

beforeEach(() => {
  const editor = useEditor();
  document.body.append(editor.view.dom);
  editor.load(SCRIPT);
});
afterEach(async () => {
  setWritingMode('fountain');
  await nextTick();
});

describe('setWritingMode', () => {
  test('a switch sets the setting and the editor', () => {
    setWritingMode('classic');
    expect(useSettings().settings.value.writingMode).toBe('classic');
    expect(classicIsOn(useEditor().view.state)).toBe(true);
  });

  test('a switch says its notice', async () => {
    setWritingMode('classic');
    await nextTick();
    await nextTick();
    expect(classicNotice.value).toBe(CLASSIC_NOTICE);
    setWritingMode('fountain');
    await nextTick();
    await nextTick();
    expect(classicNotice.value).toBe(FOUNTAIN_NOTICE);
    expect(CLASSIC_NOTICE).toBe('Classic Mode. Enter and Tab move between elements.');
    expect(FOUNTAIN_NOTICE).toBe('Fountain Mode. You type the marks.');
  });

  test('a switch gives focus to the editor', () => {
    const focus = vi.spyOn(useEditor().view, 'focus');
    setWritingMode('classic');
    expect(focus).toHaveBeenCalled();
  });

  test('the reconfiguring dispatch holds the scroll', () => {
    const { view } = useEditor();
    const snapshot = vi.spyOn(view, 'scrollSnapshot');
    setWritingMode('classic');
    expect(snapshot).toHaveBeenCalled();
  });

  test('the file is never touched', () => {
    const editor = useEditor();
    const heard: unknown[] = [];
    const stop = editor.onChange((changes) => void heard.push(changes));
    setWritingMode('classic');
    setWritingMode('fountain');
    setWritingMode('classic');
    stop();
    expect(heard).toEqual([]);
    expect(editor.view.state.doc.toString()).toBe(SCRIPT);
  });

  test('a say from inside a view update waits until the update is over', async () => {
    const { view } = useEditor();
    setWritingMode('classic');
    await nextTick();
    await nextTick();
    // A sentence said in an update must not touch the page in the update.
    const say = view.state.facet((await import('@drafter/cm-fountain')).classicSay);
    classicNotice.value = '';
    say?.('From an update.');
    expect(classicNotice.value).toBe('');
    await nextTick();
    await Promise.resolve();
    await nextTick();
    expect(classicNotice.value).toBe('From an update.');
  });
});
