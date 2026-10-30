import type { EditorState } from '@codemirror/state';
import { parsedDoc } from '@drafter/cm-fountain';
import type { PageMarks } from '@drafter/compare';
import type { Layout } from '@drafter/layout';
import type { Template } from '@drafter/templates';
import {
  type ComputedRef,
  computed,
  effectScope,
  type Ref,
  ref,
  type ShallowRef,
  shallowRef,
  watch,
} from 'vue';
import { createLayoutClient, type LayoutClient } from './layout-client';
import { blockIndexAt, type PagePosition, pageOf } from './pages';
import { useEditor } from './session';

export interface LayoutSession {
  layout: Readonly<ShallowRef<Layout | null>>;
  /** The template `layout` was made with, which may lag the editor's by a moment. */
  layoutTemplate: Readonly<ShallowRef<Template | null>>;
  /** The number of the request `layout` answers; 0 before the first layout. */
  shownSeq: Readonly<ShallowRef<number>>;
  /** The number of the newest request made so far. */
  requestedSeq(): number;
  /** True while the newest request hasn't come back. */
  updating: Readonly<Ref<boolean>>;
  /** The worker couldn't be made or has failed, and no layout has come since. */
  failed: Readonly<Ref<boolean>>;
  /**
   * The page holding the cursor's block, and the last page's number; null before the first layout.
   * `layout.index[i].page` is a page *number* (0 is the title page), not an index into
   * `layout.pages`, so pages are looked up by `number`. A blank line, which is no block, keeps the
   * page the cursor was last on.
   */
  page: Readonly<ComputedRef<PagePosition | null>>;
  /** The block holding the cursor, or before it on a blank line; -1 for the title page. */
  cursorBlock: Readonly<ShallowRef<number>>;
  /**
   * Show changes' marks (version-history design §4.2): those of the layout shown (`seq` is
   * `shownSeq`), which the worker answers after it; null while off. Marks of an older layout are
   * never kept, so they always fit the pages drawn.
   */
  marks: Readonly<ShallowRef<{ seq: number; marks: PageMarks } | null>>;
  /** Show changes' baseline, which every request carries while it is set; null turns the marks off. */
  setBaseline(baseline: { id: number; text: string } | null): void;
}

let session: LayoutSession | undefined;

function create(): LayoutSession {
  const { view, doc, template, kind, onState } = useEditor();
  const layout = shallowRef<Layout | null>(null);
  const layoutTemplate = shallowRef<Template | null>(null);
  const shownSeq = shallowRef(0);
  const updating = ref(false);
  const failed = ref(false);
  const cursorBlock = shallowRef(-1);
  const marks = shallowRef<{ seq: number; marks: PageMarks } | null>(null);
  const baseline = shallowRef<{ id: number; text: string } | null>(null);

  // The template each pending request was made with, so a layout is drawn with its own.
  const templates = new Map<number, Template>();
  let newest = 0;

  // A browser without module workers, or one that blocks them, throws here: the editor goes on.
  const make = (): LayoutClient | null => {
    try {
      return createLayoutClient(
        new Worker(new URL('../workers/layout.worker.ts', import.meta.url), { type: 'module' }),
        (next, seq) => {
          layout.value = next;
          layoutTemplate.value = templates.get(seq) ?? null;
          shownSeq.value = seq;
          failed.value = false;
          for (const key of templates.keys()) if (key <= seq) templates.delete(key);
          if (seq >= newest) updating.value = false;
        },
        (message, seq) => {
          // The last layout stays on screen.
          console.error(`Layout failed: ${message}`);
          failed.value = true;
          if (seq >= newest) updating.value = false;
        },
        (found, seq) => {
          // Only the shown layout's, and only while Show changes is on.
          if (seq === shownSeq.value && baseline.value) marks.value = { seq, marks: found };
        },
      );
    } catch (error) {
      console.error(`Layout failed: ${error instanceof Error ? error.message : String(error)}`);
      failed.value = true;
      return null;
    }
  };
  const client = make();

  // The session lives for the visit, so its watchers belong to no component.
  effectScope(true).run(() => {
    watch(
      [doc, template, kind, baseline],
      () => {
        // A Markdown document has no pages: the worker is left alone until it is Fountain again.
        if (!client || kind.value === 'markdown') return;
        newest = client.request(
          view.state.doc.toString(),
          template.value,
          baseline.value ?? undefined,
        );
        templates.set(newest, template.value);
        updating.value = true;
      },
      { immediate: true },
    );
  });

  // The block holding the cursor, or before it on a blank line (the editor's element is null there).
  const track = (state: EditorState) => {
    const block = blockIndexAt(state.field(parsedDoc), state.selection.main.head);
    if (block !== cursorBlock.value) cursorBlock.value = block;
  };
  track(view.state);
  onState(track);

  return {
    layout,
    layoutTemplate,
    shownSeq,
    requestedSeq: () => newest,
    updating,
    failed,
    cursorBlock,
    page: computed(() => pageOf(layout.value, cursorBlock.value)),
    marks,
    setBaseline(next) {
      if (next === null) marks.value = null;
      baseline.value = next;
    },
  };
}

/** The layout of the editor's text, made in a worker: created on first use in the browser and kept for the visit. */
export function useLayout(): LayoutSession {
  session ??= create();
  return session;
}
