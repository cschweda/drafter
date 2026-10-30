<script setup lang="ts">
import type { ScaffoldPage } from '~/scaffold/session';
import { goScaffold, SCAFFOLD_HEADING_ID } from '~/scaffold/show';

// A link to another Scaffold page (seeing-the-script design §5.7): a real link, so a screen
// reader's list of links has it, which opens the page in the tab (pushing Back) and puts focus on
// its heading, or on `focus`.
const props = defineProps<{ to: ScaffoldPage; focus?: string }>();
</script>

<template>
  <a
    :href="`#${props.focus ?? SCAFFOLD_HEADING_ID}`"
    class="scaffold-link"
    @click.prevent="goScaffold(props.to, props.focus)"
  >
    <slot />
  </a>
</template>
