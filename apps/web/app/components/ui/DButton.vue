<script setup lang="ts">
// The one button system (fresh-look design §5): four variants, and nothing else.
// - primary: the accent fill with --on-accent text, one per dialog or form (the action it is for);
// - secondary: a fill a step up from the surface it sits on, with no border;
// - borderless: no fill until hovered;
// - icon: borderless, 30 by 30, with its name in `aria-label` (and a tooltip where it helps).
// `danger` on a primary button draws it in the danger tone: the confirm of something that can't
// be taken back (Replace, Remove, Delete), so it never looks like an everyday OK. Its dialog's
// Cancel keeps the first focus.
// The segmented control, for either/or choices, is DSegmented. Attributes (`autofocus`,
// `aria-label`, `disabled`) and listeners go on the <button>.
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'borderless' | 'icon';
    type?: 'button' | 'submit' | 'reset';
    danger?: boolean;
  }>(),
  { variant: 'secondary', type: 'button', danger: false },
);
</script>

<template>
  <button
    :type="props.type"
    class="d-btn"
    :class="[`d-btn--${props.variant}`, { 'd-btn--danger': props.danger }]"
  >
    <slot />
  </button>
</template>

<style>
/* Unscoped, one class deep, so a caller's scoped rule (a width, a margin) wins. */
.d-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
  min-height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--r-sm);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--dur) var(--ease),
    color var(--dur) var(--ease);
}
.d-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.d-btn--primary {
  background: var(--accent);
  color: var(--on-accent);
}
.d-btn--primary:hover:not(:disabled),
.d-btn--primary:active:not(:disabled) {
  background: var(--accent-hover);
}
.d-btn--primary.d-btn--danger {
  background: var(--danger);
  color: var(--on-danger);
}
.d-btn--primary.d-btn--danger:hover:not(:disabled),
.d-btn--primary.d-btn--danger:active:not(:disabled) {
  background: var(--danger-fill-hover);
}
.d-btn--secondary {
  background: var(--overlay);
  color: var(--text);
}
.d-btn--secondary:hover:not(:disabled) {
  background: var(--highlight);
}
.d-btn--borderless {
  background: transparent;
  color: var(--text);
}
.d-btn--icon {
  width: 30px;
  height: 30px;
  min-height: 0;
  padding: 0;
  background: transparent;
  color: var(--muted);
}
.d-btn--borderless:hover:not(:disabled),
.d-btn--icon:hover:not(:disabled) {
  background: var(--overlay);
  color: var(--text);
}
/* Forced colors: a button is drawn as the system draws one. */
@media (forced-colors: active) {
  .d-btn {
    border: 1px solid ButtonText;
  }
}
@media (prefers-reduced-motion: reduce) {
  .d-btn {
    transition: none;
  }
}
</style>
