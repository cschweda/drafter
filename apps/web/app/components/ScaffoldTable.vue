<script setup lang="ts">
import { keepFocusOnRemoval } from '~/scaffold/go';

// A table of a Scaffold page (seeing-the-script design §5.7): a real table whose caption is the
// section's heading too (`h3`), so the heading list finds it, in its own scrolling region on a
// narrow screen, which is a Tab stop and a named region only while it scrolls sideways. A row taken
// away with focus in it leaves focus on the caption.

const props = defineProps<{ headingId: string; caption: string }>();
const region = ref<HTMLElement>();
const scrolls = useScrollsSideways(region);
keepFocusOnRemoval(region, () => document.getElementById(props.headingId));
</script>

<template>
  <div
    ref="region"
    class="scaffold-scroll"
    :role="scrolls ? 'region' : undefined"
    :aria-labelledby="scrolls ? props.headingId : undefined"
    :tabindex="scrolls ? 0 : undefined"
  >
    <table class="scaffold-table">
      <caption>
        <h3 :id="props.headingId" tabindex="-1">{{ props.caption }}</h3>
      </caption>
      <slot />
    </table>
  </div>
</template>
