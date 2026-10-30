import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import type { MarkdownRequest } from '../app/markdown/compute';

// The editor, as far as the Markdown session reads it. Each test gets new refs (beforeEach), so a
// session made by an earlier test never sees this one's edits.
const editor = vi.hoisted(() => ({
  text: '',
  refs: {} as Record<'doc' | 'kind' | 'loaded', unknown>,
}));
vi.mock('../app/editor/session', () => {
  return {
    useEditor: () => ({
      ...editor.refs,
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

// The main thread's parser: the real one, except that a text with DEEP in it runs out of stack.
vi.mock('../app/markdown/parse', async (importOriginal) => {
  const real = await importOriginal<typeof import('../app/markdown/parse')>();
  return {
    parseMarkdown: (source: string) => {
      if (source.includes('DEEP')) throw new RangeError('Maximum call stack size exceeded');
      return real.parseMarkdown(source);
    },
  };
});

const posted: MarkdownRequest[] = [];
const listeners: Array<(event: unknown) => void> = [];
const failures: Array<(event: unknown) => void> = [];
let made = 0;
class FakeWorker {
  constructor() {
    made++;
  }
  postMessage(message: MarkdownRequest) {
    posted.push(message);
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    if (type === 'message') listeners.push(listener);
    if (type === 'error') failures.push(listener);
  }
  terminate() {}
}

beforeEach(async () => {
  vi.resetModules();
  const { shallowRef } = await import('vue');
  editor.refs = { doc: shallowRef({}), kind: shallowRef('markdown'), loaded: shallowRef(0) };
  posted.length = 0;
  listeners.length = 0;
  failures.length = 0;
  made = 0;
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

  /** The session on a long document, with its editor's `doc` to poke as an edit. */
  async function longSession(text: string) {
    const { useEditor } = await import('../app/editor/session');
    const { useMarkdown } = await import('../app/markdown/use-markdown');
    const e = useEditor() as unknown as { doc: { value: object } };
    editor.text = text;
    e.doc.value = {};
    const md = useMarkdown();
    vi.advanceTimersByTime(300);
    const edit = async (next: string) => {
      editor.text = next;
      e.doc.value = {};
      await nextTick();
      vi.advanceTimersByTime(300);
    };
    return { md, edit };
  }
  const crash = () => {
    for (const l of [...failures]) l({});
    failures.length = 0;
  };

  test('keeps the worker after one text it couldn’t parse, and shows the next edit from it', async () => {
    const { md, edit } = await longSession(LONG('# One'));
    expect(posted).toHaveLength(1);
    // The worker couldn't parse this text: the main thread draws it instead, this once.
    for (const l of listeners) l({ data: { seq: posted[0]?.seq, error: 'Something odd' } });
    await vi.waitFor(() => expect(md.tree.value?.children?.[0]?.type).toBe('heading'));
    expect(md.problem.value).toBeNull();
    await edit(LONG('# Two'));
    expect(posted).toHaveLength(2);
    expect(made).toBe(1);
    reply(posted[1]?.seq as number, 'two');
    expect(md.tree.value).toMatchObject({ marker: 'two' });
  });

  test('says a text is nested too deeply when neither the worker nor the page can parse it', async () => {
    const { md, edit } = await longSession(LONG('DEEP'));
    for (const l of listeners)
      l({ data: { seq: posted[0]?.seq, error: 'Maximum call stack size exceeded' } });
    await vi.waitFor(() => expect(md.problem.value).toBe('deep'));
    expect(md.tree.value).toBeNull();
    expect(md.updating.value).toBe(false);
    // The next text that parses clears it.
    await edit(LONG('# Fine'));
    reply(posted[1]?.seq as number, 'fine');
    expect(md.problem.value).toBeNull();
    expect(md.tree.value).toMatchObject({ marker: 'fine' });
  });

  test('says a text is nested too deeply when the worker says so, without parsing it again', async () => {
    // The page could parse this text, but the worker ran out of stack on it: parsing it again on
    // the main thread would only freeze the page for longer, so the Preview says why at once.
    const { md } = await longSession(LONG('# Nested'));
    for (const l of listeners)
      l({ data: { seq: posted[0]?.seq, error: 'Maximum call stack size exceeded' } });
    await vi.dynamicImportSettled();
    expect(md.problem.value).toBe('deep');
    expect(md.tree.value).toBeNull();
    // Its words are counted as plain text, the `#` with them: 2 and the 2,500.
    expect(md.words.value).toBe(2_502);
    expect(md.updating.value).toBe(false);
  });

  test('makes the worker again after it fails, three times at most in a visit', async () => {
    const { md, edit } = await longSession(LONG('# One'));
    expect(made).toBe(1);
    crash();
    // The failed request is drawn on the main thread; the next edit gets a new worker.
    await vi.waitFor(() => expect(md.tree.value?.children?.[0]?.type).toBe('heading'));
    await edit(LONG('# Two'));
    expect(made).toBe(2);
    expect(posted.at(-1)?.source).toBe(LONG('# Two'));
    crash();
    await edit(LONG('# Three'));
    expect(made).toBe(3);
    crash();
    // A third failure: the rest of the visit parses on the main thread, after the same pause.
    await edit(LONG('# Four'));
    expect(made).toBe(3);
    await vi.waitFor(() => expect(md.tree.value?.children?.[0]?.children?.[0]?.value).toBe('Four'));
  });

  test('a short document that can’t be parsed says so, and never throws', async () => {
    const { useEditor } = await import('../app/editor/session');
    const { useMarkdown } = await import('../app/markdown/use-markdown');
    const e = useEditor() as unknown as { doc: { value: object } };
    editor.text = 'DEEP';
    e.doc.value = {};
    const md = useMarkdown();
    await vi.waitFor(() => expect(md.problem.value).toBe('deep'));
    expect(md.tree.value).toBeNull();
    expect(md.words.value).toBe(1);
    expect(posted).toHaveLength(0);
  });
});
