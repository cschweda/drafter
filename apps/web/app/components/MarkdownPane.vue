<script setup lang="ts">
import { domPane, type SyncPane } from '~/editor/scroll-sync';
import { useEditor } from '~/editor/session';
import { useScrollSync } from '~/editor/use-scroll-sync';
import { PREVIEW_PROBLEMS, type PreviewProblem, previewProblem } from '~/markdown/preview';
import { renderMarkdown } from '~/markdown/render';
import { useMarkdown } from '~/markdown/use-markdown';

// The Preview (Plan 4 Task 6): the Markdown document as headings, paragraphs, emphasis, lists,
// quotes, and code, in one column, with its footnotes listed at the end. It is built as DOM from the parsed tree by `renderMarkdown`,
// which makes elements and sets text and nothing else: no HTML string is ever parsed.
const { tree, updating, problem } = useMarkdown();
const content = ref<HTMLElement>();
const article = ref<HTMLElement>();
const { view } = useEditor();
const sync = useScrollSync();
// Scroll sync reads the blocks' offsets (`data-from`, from the tree) and where they stand.
let syncPane: (SyncPane & { invalidate(): void }) | undefined;
let detachSync: (() => void) | undefined;
const empty = computed(() => !!tree.value && tree.value.children?.length === 0);
// A long document's first drawing waits for the worker.
const preparing = computed(() => !tree.value && updating.value);
// A tree the drawing couldn't build (nested thousands deep, which the drawing recurses through).
const drawProblem = ref<PreviewProblem | null>(null);
// The parse's problem, or the drawing's: said calmly in the pane, in place of the document.
const trouble = computed(() => {
  const which = problem.value ?? drawProblem.value;
  return which ? PREVIEW_PROBLEMS[which] : null;
});

function draw() {
  if (!content.value) return;
  let drawn: DocumentFragment | string = '';
  drawProblem.value = null;
  if (tree.value) {
    try {
      drawn = renderMarkdown(tree.value, document);
    } catch (error) {
      drawProblem.value = previewProblem(error);
    }
  }
  content.value.replaceChildren(drawn);
  // A new drawing moves the blocks: the Preview is put back in step with the Source.
  syncPane?.invalidate();
  sync.placeView();
}

onMounted(() => {
  if (article.value) {
    syncPane = domPane(article.value, '[data-from]', () => view.state.doc.length);
    detachSync = sync.attachView(syncPane);
  }
  draw();
});
onBeforeUnmount(() => detachSync?.());
watch(tree, draw);
</script>

<template>
  <article ref="article" class="preview" tabindex="0" aria-label="Preview">
    <div class="sheet">
      <p v-if="trouble" class="nothing" role="status">{{ trouble }}</p>
      <p v-else-if="empty" class="nothing">Nothing to preview yet.</p>
      <p v-else-if="preparing" class="nothing" role="status">Preparing the preview…</p>
      <div ref="content" class="body" />
    </div>
  </article>
</template>

<style scoped>
.preview {
  height: 100%;
  box-sizing: border-box;
  padding: 16px;
  overflow: auto;
  background: var(--desk);
}
.preview:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: -2px;
}
/* One flowing column at page width: the six inches of text on a letter page. */
.sheet {
  box-sizing: border-box;
  width: min(100%, 38rem);
  margin: 0 auto;
  padding: 28px 32px;
  background: var(--page);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: calc(15px * var(--text-scale, 1));
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.nothing {
  margin: 0;
  color: var(--ink-muted);
}
.body :deep(:is(h1, h2, h3, h4, h5, h6)) {
  margin: 1.4em 0 0.5em;
  line-height: 1.25;
}
.body :deep(h1) {
  font-size: 1.7em;
}
.body :deep(h2) {
  font-size: 1.4em;
}
.body :deep(h3) {
  font-size: 1.2em;
}
.body :deep(:is(h4, h5, h6)) {
  font-size: 1em;
}
.body :deep(> :first-child) {
  margin-top: 0;
}
.body :deep(p),
.body :deep(ul),
.body :deep(ol),
.body :deep(blockquote),
.body :deep(pre) {
  margin: 0 0 1em;
}
.body :deep(:is(ul, ol)) {
  padding-left: 1.6em;
  /* The app's base styles take lists' marks off; a document's lists keep theirs. */
  list-style: revert;
}
.body :deep(blockquote) {
  padding-left: 1em;
  border-left: 3px solid var(--ink-muted);
  color: var(--ink-muted);
}
.body :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.body :deep(pre) {
  padding: 10px 12px;
  border-radius: 5px;
  background: var(--desk);
  /* Wraps, so the box never scrolls on its own. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.body :deep(hr) {
  margin: 1.5em 0;
  border: 0;
  border-top: 1px solid var(--ink-muted);
}
.body :deep(.md-raw) {
  white-space: pre-wrap;
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.body :deep(.md-image) {
  color: var(--ink-muted);
  font-style: italic;
}
/* A footnote's reference: its number, raised, a button that goes to the note. */
.body :deep(.md-fnref) {
  line-height: 0;
}
.body :deep(:is(.md-fnref-button, .md-note-back)) {
  padding: 0 0.15em;
  border: 0;
  border-radius: 3px;
  background: none;
  color: var(--heading);
  font: inherit;
  /* The raised number keeps its line's height (the sup has none), but the button needs its own. */
  line-height: 1;
  cursor: pointer;
}
.body :deep(:is(.md-fnref-button, .md-note-back):focus) {
  outline: 2px solid var(--heading);
  outline-offset: 1px;
}
/* The notes at the end, smaller, after a short rule. */
.body :deep(.md-notes) {
  margin-top: 2em;
  font-size: 0.9em;
}
.body :deep(.md-notes-rule) {
  width: 6em;
  margin: 0 0 0.75em;
}
.body :deep(.md-notes-heading) {
  margin: 0 0 0.5em;
  font-size: 0.85em;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
.body :deep(.md-notes li) {
  border-radius: 3px;
}
/* Where a click on a reference or a note's button took focus: outlined, and lit for a moment
   (the code panel's background, which the text reads on in both themes). */
.body :deep(.md-notes li:focus) {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.body :deep(:is(.md-notes li, .md-fnref-button):focus) {
  animation: md-arrived 1.2s ease-out;
}
@keyframes md-arrived {
  from {
    background: var(--desk);
  }
}
@media (prefers-reduced-motion: reduce) {
  .body :deep(:is(.md-notes li, .md-fnref-button):focus) {
    animation: none;
  }
}
.body :deep(.md-note-text > :last-child) {
  margin-bottom: 0.5em;
}
@media (forced-colors: active) {
  .body :deep(blockquote) {
    border-left-color: CanvasText;
  }
}
</style>
