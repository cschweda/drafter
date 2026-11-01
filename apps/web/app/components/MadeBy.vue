<script setup lang="ts">
import { MAKER } from '~/about/info';

// The credit line, in About and at the foot of every help page: plain links that open in a new
// tab (the desktop app hands them to the system browser), with no referrer and nothing to track.
</script>

<template>
  <!-- One line, so the spaces between the links stay. -->
  <p class="made-by" data-made-by>Made by {{ MAKER.name }} (<a :href="MAKER.handle.href" target="_blank" rel="noopener noreferrer">{{ MAKER.handle.label }}</a>) <span aria-hidden="true">·</span> <a :href="MAKER.site.href" target="_blank" rel="noopener noreferrer">{{ MAKER.site.label }}</a></p>
</template>

<style scoped>
.made-by {
  margin: 0;
  color: var(--muted);
}
.made-by a {
  color: var(--text);
  text-decoration: underline;
}
</style>
