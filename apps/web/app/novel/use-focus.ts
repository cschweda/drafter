import type { NovelNode } from '@drafter/novel';
import { type ComputedRef, computed, effectScope, type Ref, shallowRef, watch } from 'vue';
import { useEditor } from '../editor/session';
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

/** The bar's sentence for `node`, numbered `n`. */
export function passageLabel(node: NovelNode, n: number): string {
  return node.kind === 'section'
    ? `Section ${n} · ${titleOf(node)} — showing this section.`
    : `Chapter ${n} · ${titleOf(node)} — showing this chapter.`;
}

function create(): PassageFocusSession {
  const editor = useEditor();
  const novel = useNovel();
  return effectScope(true).run(() => {
    const passage = shallowRef<Passage | null>(focusedPassage(editor.view.state));
    const read = () => {
      const next = focusedPassage(editor.view.state);
      if (next !== passage.value) passage.value = next;
    };
    editor.onState(read);
    editor.onUpdate(read);

    // A document that stops being a novel (or Markdown) shows all of itself.
    watch([editor.kind, editor.novel], ([kind, isNovel]) => {
      if ((kind !== 'markdown' || !isNovel) && passage.value) focusPassage(editor.view, null);
    });

    const id = computed(() => passage.value?.id ?? null);
    const node = computed(() => {
      const tree = novel.tree.value;
      return tree && id.value ? find(tree.nodes, id.value) : null;
    });
    const label = computed(() => {
      const tree = novel.tree.value;
      const found = node.value;
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
