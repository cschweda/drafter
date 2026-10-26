import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import type { MarkdownRequest } from '../app/markdown/compute';

// The editor, as far as the Markdown session reads it.
const editor = vi.hoisted(() => ({ text: '' }));
vi.mock('../app/editor/session', async () => {
  const { shallowRef } = await import('vue');
  const doc = shallowRef({});
  const kind = shallowRef<'fountain' | 'markdown'>('markdown');
  const loaded = shallowRef(0);
  return {
    useEditor: () => ({
      doc,
      kind,
      loaded,
      view: {
        state: {
          doc: {
            get length() {
              return editor.text.length;
            },
            toString: () => editor.text,
          },
        },
      },
    }),
  };
});

const posted: MarkdownRequest[] = [];
const listeners: Array<(event: unknown) => void> = [];
class FakeWorker {
  postMessage(message: MarkdownRequest) {
    posted.push(message);
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    if (type === 'message') listeners.push(listener);
  }
  terminate() {}
}

beforeEach(() => {
  vi.resetModules();
  posted.length = 0;
  listeners.length = 0;
  vi.stubGlobal('Worker', FakeWorker);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const LONG = (marker: string) => `${marker}\n\n${'word '.repeat(2_500)}`;
const reply = (seq: number, marker: string) => {
  for (const l of listeners) l({ data: { seq, tree: { type: 'root', marker }, words: 7 } });
};

describe('the Markdown session', () => {
  test('shows nothing of the last script while a long one is still being parsed', async () => {
    const { useEditor } = await import('../app/editor/session');
    const { useMarkdown } = await import('../app/markdown/use-markdown');
    const e = useEditor() as unknown as {
      doc: { value: object };
      loaded: { value: number };
    };
    editor.text = LONG('# First');
    e.doc.value = {};
    const md = useMarkdown();
    vi.advanceTimersByTime(300);
    expect(posted).toHaveLength(1);
    reply(posted[0]?.seq as number, 'first');
    expect(md.tree.value).toMatchObject({ marker: 'first' });
    expect(md.words.value).toBe(7);

    // Another script is loaded: its parse is on the way, and the first one's is gone.
    editor.text = LONG('# Second');
    e.loaded.value++;
    e.doc.value = {};
    await nextTick();
    expect(md.tree.value).toBeNull();
    expect(md.words.value).toBe(0);
    expect(md.updating.value).toBe(true);
    vi.advanceTimersByTime(300);
    reply(posted[1]?.seq as number, 'second');
    expect(md.tree.value).toMatchObject({ marker: 'second' });
    expect(md.updating.value).toBe(false);
  });
});
