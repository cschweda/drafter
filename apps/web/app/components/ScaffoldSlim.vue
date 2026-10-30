<script setup lang="ts">
import { useScaffold } from '~/scaffold/session';

// Scaffold's slim bar (seeing-the-script design §5.1, §5.2): Follow the cursor, a toggle, on the
// scene page. On (the default at every visit), the page is the cursor's scene; off, it keeps the
// scene it shows. Task 7 adds Back and the menu of pages.
const { follow, page } = useScaffold();
</script>

<template>
  <div v-if="page.kind === 'scene'" class="zoom">
    <button
      type="button"
      class="zoom-button"
      :aria-pressed="follow ? 'true' : 'false'"
      @click="follow = !follow"
    >
      Follow the cursor
    </button>
  </div>
</template>
