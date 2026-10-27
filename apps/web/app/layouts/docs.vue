<script setup lang="ts">
import { HELP_PAGES, helpHref } from '~/commands/data';

// The frame of a help page (Phase 1 design §4.5): a way back to the app, the other help pages, and the
// page itself. These pages are prerendered and read without JavaScript, so the links are plain links:
// the app is a page of its own, and going back to it is a full load.
const route = useRoute();
const here = computed(() => route.path.replace(/\/$/, ''));
</script>

<template>
  <div class="docs">
    <header class="docs-bar">
      <a class="docs-back" href="/">
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
