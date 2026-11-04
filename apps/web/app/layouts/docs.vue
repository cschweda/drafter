<script setup lang="ts">
import { HELP_PAGES, HELP_SECTIONS, helpHref } from '~/commands/data';
import { backToEditor } from '~/commands/help-back';

// The frame of a help page (Phase 1 design §4.5): a way back to the app, the other help pages, and the
// page itself. These pages are prerendered and read without JavaScript, so the links are plain links:
// the app is a page of its own, and going back to it is a full load. With JavaScript, Back in a tab
// that Help opened closes the tab instead, which is the way back to the editor it came from.
const route = useRoute();
const here = computed(() => route.path.replace(/\/$/, ''));

/**
 * The bar's dropdowns (the maintainer's request of 2026-11-04): Help, then Writing, Files, and
 * About, each a native `<details>`, so they open with no script, by keyboard, and on a phone. They
 * share a `name`, so opening one closes the other (a browser too old for that leaves both open).
 * The dropdown holding this page is marked as the page's link is.
 */
const sections = HELP_SECTIONS.map((section) => ({
  ...section,
  pages: HELP_PAGES.filter((page) => page.section === section.id),
}));
const holdsHere = (pages: readonly { path: string }[]) => pages.some((p) => p.path === here.value);

const nav = ref<HTMLElement>();
/** The open dropdowns, closed: by Escape (focus back on its summary) or a click outside them. */
function closeAll(refocus: boolean) {
  for (const open of nav.value?.querySelectorAll<HTMLDetailsElement>('details[open]') ?? []) {
    open.open = false;
    if (refocus && open.contains(document.activeElement)) open.querySelector('summary')?.focus();
  }
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeAll(true);
}
function onPointerdown(event: PointerEvent) {
  if (event.target instanceof Node && !nav.value?.contains(event.target)) closeAll(false);
}
onMounted(() => document.addEventListener('pointerdown', onPointerdown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerdown));

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
  // The desktop app's help pages are windows of their own: it brings the editor forward and closes this one.
  if (backToEditor(event)) return;
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
      <nav ref="nav" aria-label="Help pages" @keydown="onKeydown">
        <ul class="docs-nav">
          <li>
            <a class="docs-top" href="/docs/" :aria-current="here === '/docs' ? 'page' : undefined">Help</a>
          </li>
          <li v-for="section in sections" :key="section.id">
            <details class="docs-group" name="docs-nav">
              <summary :data-here="holdsHere(section.pages) || undefined">
                {{ section.title }}<span class="docs-chevron" aria-hidden="true" />
              </summary>
              <ul class="docs-menu">
                <li v-for="page in section.pages" :key="page.id">
                  <a
                    :href="helpHref(page)"
                    :aria-current="here === page.path ? 'page' : undefined"
                  >{{ page.title }}</a>
                </li>
              </ul>
            </details>
          </li>
        </ul>
      </nav>
    </header>
    <main class="docs-main">
      <slot />
    </main>
    <footer class="docs-foot">
      <MadeBy />
    </footer>
  </div>
</template>
