<script setup lang="ts">
// The one dialog (fresh-look design §5): a native <dialog> opened with showModal(), so the browser
// gives it the top layer, a backdrop, a focus trap, and Escape. It is drawn on --raised, radius 12,
// 24px padding, a large shadow, a title of 18/600 (`d-dialog-title` on the heading), and a footer
// (`d-dialog-footer`) of secondary buttons, then the primary one. Three widths: sm 440 (a question,
// the welcome), md 560 (a form), lg 760 (Settings). It fades in as it rises 4px (the one motion),
// with none under reduced motion.
//
// Its ref is a stand-in for the element: `open`, `showModal()`, `close()`, `focus()`, and `el` for anything
// else. Attributes and listeners (aria-labelledby, @close, @cancel) go on the <dialog> itself.
// When it closes, focus goes back to what had it when it opened, unless something else has taken
// it by then (a dialog that sends focus elsewhere on purpose still does).
const props = withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' });

const el = ref<HTMLDialogElement>();
/** What had focus when the dialog opened. */
let opener: HTMLElement | null = null;

function showModal() {
  const dialog = el.value;
  if (!dialog || dialog.open) return;
  const active = document.activeElement;
  opener = active instanceof HTMLElement && active !== document.body ? active : null;
  dialog.showModal();
}

function close(value?: string) {
  el.value?.close(value);
}

// The browser puts focus back itself, as a rule; this catches the case where it can't (focus was
// left on nothing), after the dialog's own close listeners have had their turn.
function onClose() {
  const back = opener;
  setTimeout(() => {
    if (el.value?.open || !back) return;
    const active = document.activeElement;
    if (active && active !== document.body && !el.value?.contains(active)) return;
    if (back.isConnected && back.getClientRects().length > 0) back.focus();
  });
}

defineExpose({
  el,
  showModal,
  close,
  /** Focus on the dialog itself (a dialog with `tabindex="-1"` that holds focus while it loads). */
  focus: (options?: FocusOptions) => el.value?.focus(options),
  /** Whether the dialog is open, as the element's own `open`. */
  get open(): boolean {
    return el.value?.open ?? false;
  },
});
</script>

<template>
  <dialog ref="el" class="d-dialog" :class="`d-dialog--${props.size}`" @close="onClose">
    <slot />
  </dialog>
</template>

<style>
/* Unscoped: the title and the footer are the caller's elements, in the slot. A caller's own scoped
   rule on the dialog (a height, a flex layout, a wider width for a side-by-side view) wins over
   these, which are one class each. */
.d-dialog {
  box-sizing: border-box;
  max-width: calc(100vw - 32px);
  max-height: calc(100dvh - 32px);
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--raised);
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
  box-shadow:
    0 2px 6px rgb(0 0 0 / 0.18),
    0 24px 64px rgb(0 0 0 / 0.38);
  overflow: auto;
}
/* `backwards`, not `both`: a transform left on the dialog after the motion would make it the
   containing block of a menu drawn inside it (History's row menus), and put that menu in the wrong
   place. */
.d-dialog[open] {
  animation: motion-in var(--dur) var(--ease) backwards;
}
.d-dialog::backdrop {
  background: rgb(0 0 0 / 0.5);
}
.d-dialog[open]::backdrop {
  animation: d-dialog-backdrop var(--dur) var(--ease) both;
}
.light .d-dialog::backdrop {
  background: rgb(0 0 0 / 0.25);
}
@keyframes d-dialog-backdrop {
  from {
    opacity: 0;
  }
}
.d-dialog--sm {
  width: min(440px, calc(100vw - 32px));
}
.d-dialog--md {
  width: min(560px, calc(100vw - 32px));
}
.d-dialog--lg {
  width: min(760px, calc(100vw - 32px));
}
.d-dialog-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  line-height: 24px;
}
/* The buttons at the foot: secondary ones, then the primary one, at the right. */
.d-dialog-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
@media (prefers-reduced-motion: reduce) {
  .d-dialog[open],
  .d-dialog[open]::backdrop {
    animation: none;
  }
}
</style>
