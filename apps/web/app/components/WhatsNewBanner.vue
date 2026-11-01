<script setup lang="ts">
import { HELP_PAGES, helpHref } from '~/commands/data';
import { commandById } from '~/commands/registry';
import { useFocusMode } from '~/composables/useFocusMode';
import { isFirstVisit, useScript } from '~/storage/script';
import { tourShowing } from '~/tour/state';
import { clear, later } from '~/update/prompt';
import { needRefresh } from '~/update/state';
import { justUpdated } from '~/update/updated';
import {
  bannerEntries,
  bannerEntry,
  dismissedWith,
  readSeen,
  rememberSeen,
} from '~/whats-new/banner';
import { WHATS_NEW } from '~/whats-new/entries';

// What's new, in one line at the top of the writing screen (docs/DECISIONS.md, What's new): after
// a big change or a security update, the newest such entry, until it is dismissed. Its kind, its
// title, a What's new link, and ✕. Not on a first visit (the welcome covers that, and the first
// visit marks every entry seen), not in focus mode (it sits in `.top`, which focus mode takes
// away), not while the tour is up, and not while the update prompt or its "up to date" note shows:
// it waits, so the two never stack. A row in the page's flow, never over the editor's text, that
// takes no focus. The region stays in the page and only its contents change, so a screen reader
// hears it once, politely, when it appears. ✕, or Escape inside it, dismisses it for good.
const { ready } = useScript();
const focus = useFocusMode();
const page = HELP_PAGES.find((p) => p.id === 'help-whats-new');

const seen = ref<Set<string>>(new Set());
const banner = ref<HTMLElement>();

// The first visit marks every entry seen; a later one reads what this browser remembers.
watch(
  ready,
  (now) => {
    if (!now) return;
    if (isFirstVisit()) rememberSeen(bannerEntries(WHATS_NEW).map((entry) => entry.id));
    seen.value = readSeen();
  },
  { immediate: true },
);

const updateShowing = computed(
  () => (needRefresh.value && clear.value && !later.value) || justUpdated.value,
);

const entry = computed(() =>
  ready.value
    ? bannerEntry(WHATS_NEW, {
        seen: seen.value,
        firstVisit: isFirstVisit(),
        focus: focus.on.value,
        updateShowing: updateShowing.value,
        tourShowing: tourShowing.value,
      })
    : null,
);

/** Puts it away for good. Focus that was in it goes to the editor, not to the page's body. */
function dismiss() {
  const shown = entry.value;
  if (!shown) return;
  const hadFocus = !!banner.value?.contains(document.activeElement);
  rememberSeen(dismissedWith(WHATS_NEW, shown.id));
  seen.value = readSeen();
  if (hadFocus) document.querySelector<HTMLElement>('.cm-content')?.focus();
}

/** What's new opens as the Help menu's item does (a new tab; a window of its own on the desktop), and counts as seen. */
function openPage() {
  if (page) void commandById(page.id)?.run();
  dismiss();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  dismiss();
}
</script>

<template>
  <div role="status" data-whats-new-region>
    <Transition name="whats-new">
      <section
        v-if="entry"
        ref="banner"
        class="whats-new"
        aria-label="What’s new"
        :data-whats-new="entry.id"
        @keydown="onKeydown"
      >
        <span class="kind" :data-kind="entry.kind">{{ entry.kind }}</span>
        <span class="sr-only">: </span>
        <span class="title">{{ entry.title }}.</span>
        <a
          v-if="page"
          class="link"
          :href="`${helpHref(page)}#${entry.id}`"
          target="_blank"
          @click.prevent="openPage"
          >What’s new</a
        >
        <button
          type="button"
          class="dismiss"
          :aria-label="`Dismiss: ${entry.title}`"
          title="Dismiss"
          @click="dismiss"
        >
          <UIcon name="i-lucide-x" aria-hidden="true" />
        </button>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.whats-new {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
  padding: 0 4px 0 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  line-height: 1.3;
}
/* The kind, as a chip: its word says which, not a color. */
.kind {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  font-size: 12px;
  font-weight: 600;
}
/* One line: a long title ends in an ellipsis, and its whole text is still read. */
.title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.link {
  flex: none;
  margin-left: auto;
  color: var(--accent-text);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  white-space: nowrap;
}
.dismiss {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.dismiss:hover {
  background: var(--raised);
  color: var(--text);
}
.whats-new-enter-active {
  transition: opacity var(--dur) var(--ease);
}
.whats-new-enter-from {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .whats-new-enter-active {
    transition: none;
  }
}
</style>
