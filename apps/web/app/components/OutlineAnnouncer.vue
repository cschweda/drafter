<script setup lang="ts">
import { outlineNotice } from '~/outline/notice';

// The Outline's live region: moves, colors, and bulk changes say what happened here, once.
</script>

<template>
  <div class="sr-only outline-announcer" role="status" aria-live="polite" aria-atomic="true">{{ outlineNotice }}</div>
</template>
