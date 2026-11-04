import type { NovelNode } from '@drafter/novel';
import { type ComputedRef, computed, effectScope, type Ref, shallowRef, watch } from 'vue';
import { useEditor } from '../editor/session';
import { sayOutline } from '../outline/notice';
import { structureOf } from './carry';
import { focusedPassage, focusPassage, type Passage, passageNumber } from './focus';
import { titleOf } from './labels';
import { useNovel } from './use-novel';

// The focused passage as the page sees it (Novel plan, Task 7): the bar over the Source, the
// Preview, and the commands read it. The editor's state holds the focus (`focus.ts`); this follows it.

export interface PassageFocusSession {
  /** The focused passage, with its offsets now; null while the whole book shows. */
  passage: Readonly<Ref<Passage | null>>;
  /** The focused chapter or section in the book's tree, or null. */
  node: Readonly<ComputedRef<NovelNode | null>>;
  /** "Chapter 3 · The Night Watch — showing this chapter.", or '' while the whole book shows. */
  label: Readonly<ComputedRef<string>>;
  /** Focuses on node `id`, or shows the whole book (null). */
  focus(id: string | null): void;
}

let session: PassageFocusSession | undefined;

function find(list: NovelNode[], id: string): NovelNode | null {
  for (const node of list) {
    if (node.id === id) return node;
    const found = find(node.children, id);
    if (found) return found;
  }
  return null;
}

/** The passage's name, numbered `n`: "Chapter 3 · The Night Watch", "Section 1 · Scene break". */
export function passageTitle(node: NovelNode, n: number): string {
  return `${node.kind === 'section' ? 'Section' : 'Chapter'} ${n} · ${titleOf(node)}`;
}

/** The bar's sentence for `node`, numbered `n`. */
export function passageLabel(node: NovelNode, n: number): string {
  return `${passageTitle(node, n)} — showing this ${node.kind === 'section' ? 'section' : 'chapter'}.`;
}

/** What is said when the focus starts, or ends (`node` null). */
export function focusNotice(node: NovelNode | null, n: number): string {
  return node ? `Showing ${passageTitle(node, n)}.` : 'Showing the whole book.';
}

function create(): PassageFocusSession {
  const editor = useEditor();
  const novel = useNovel();
  return effectScope(true).run(() => {
    const passage = shallowRef<Passage | null>(focusedPassage(editor.view.state));
    /** The script read last: a focus that ends because another one was loaded isn't announced. */
    let loadedSeen = editor.loaded.value;
    const read = () => {
      const next = focusedPassage(editor.view.state);
      const before = passage.value;
      const loaded = editor.loaded.value !== loadedSeen;
      loadedSeen = editor.loaded.value;
      if (next === before) return;
      passage.value = next;
      if (loaded) return;
      // Said when it starts, when it widens or narrows, and every time it ends, however it ends:
      // Show the whole book, a search match elsewhere, Go to, a deleted heading, an undo.
      if (!next) {
        if (before) void sayOutline(focusNotice(null, 0));
      } else if (!before || before.kind !== next.kind) {
        const tree = structureOf(editor.view.state.doc, editor.view.state.doc.toString());
        const found = find(tree.nodes, next.id);
        if (found) void sayOutline(focusNotice(found, passageNumber(tree, found.id) ?? 1));
      }
    };
    editor.onState(read);
    editor.onUpdate(read);

    // A document that stops being a novel (or Markdown) shows all of itself.
    watch([editor.kind, editor.novel], ([kind, isNovel]) => {
      if ((kind !== 'markdown' || !isNovel) && passage.value) focusPassage(editor.view, null);
    });

    // While a passage is focused, the bar and the Preview show its node, so the book's tree is held
    // fresh; while the whole book shows, focus reads none of it.
    let release: (() => void) | null = null;
    watch(
      () => passage.value !== null,
      (focused) => {
        if (focused && !release) release = novel.hold();
        if (!focused && release) {
          release();
          release = null;
        }
      },
      { immediate: true },
    );

    const id = computed(() => passage.value?.id ?? null);
    const node = computed(() => {
      if (!id.value) return null;
      const tree = novel.tree.value;
      return tree ? find(tree.nodes, id.value) : null;
    });
    const label = computed(() => {
      const found = node.value;
      const tree = found ? novel.tree.value : null;
      if (!tree || !found) return '';
      return passageLabel(found, passageNumber(tree, found.id) ?? 1);
    });
    const focus = (next: string | null) => focusPassage(editor.view, next);
    return { passage, node, label, focus } satisfies PassageFocusSession;
  }) as PassageFocusSession;
}

/** The passage focus, made on first use in the browser and kept for the visit. */
export function usePassageFocus(): PassageFocusSession {
  session ??= create();
  return session;
}
