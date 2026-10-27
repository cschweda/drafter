<script setup lang="ts">
import { HELP_PAGES, helpHref } from '~/commands/data';

// The frame of a help page (Phase 1 design §4.5): a way back to the app, the other help pages, and the
// page itself. These pages are prerendered and read without JavaScript, so the links are plain links:
// the app is a page of its own, and going back to it is a full load. With JavaScript, Back in a tab
// that Help opened closes the tab instead, which is the way back to the editor it came from.
const route = useRoute();
const here = computed(() => route.path.replace(/\/$/, ''));

/**
 * The editor tab that opened this one (Help opens the pages in a new tab, with an opener): the
 * app, same-origin, still open. Null for a page loaded any other way, whose Back is the link.
 */
function appOpener(): Window | null {
  try {
    const opener = window.opener as Window | null;
    if (!opener || opener === window || opener.closed) return null;
    const { origin, pathname } = opener.location;
    return origin === window.location.origin && pathname === '/' ? opener : null;
  } catch {
    // Another origin's window: not the app.
    return null;
  }
}

/**
 * Back to the editor this tab was opened from: this tab closes, rather than open a second editor,
 * which the two-tab guard would make read-only. A browser that won't close it follows the link.
 */
function onBack(event: MouseEvent) {
  // A new tab or window asked for with a modifier, or a middle click, is the browser's to do.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  const opener = appOpener();
  if (!opener) return;
  event.preventDefault();
  try {
    opener.focus();
  } catch {
    // The browser decides which tab is in front.
  }
  window.close();
  if (!window.closed) window.location.assign('/');
}
</script>

<template>
  <div class="docs">
    <header class="docs-bar">
      <a class="docs-back" href="/" @click="onBack">
        <span aria-hidden="true">←</span> Back to Drafter
      </a>
      <nav aria-label="Help pages">
        <ul class="docs-nav">
          <li>
            <a href="/docs/" :aria-current="here === '/docs' ? 'page' : undefined">Help</a>
          </li>
          <li v-for="page in HELP_PAGES" :key="page.id">
            <a
              :href="helpHref(page)"
              :aria-current="here === page.path ? 'page' : undefined"
            >{{ page.title }}</a>
          </li>
        </ul>
      </nav>
    </header>
    <main class="docs-main">
      <slot />
    </main>
  </div>
</template>
