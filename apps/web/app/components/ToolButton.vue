<script setup lang="ts">
import { TOOLS_COMPACT } from '~/utils/tools';

// A view's tool in the Inspector's header (fresh-look design §3.3, Call 15): an icon and a label.
// When the header is too narrow, tools with an icon go icon-only first (AppPane's measure), before
// any folds into "⋯": the label is hidden, and stays the button's name and its tooltip. Attributes
// and listeners (aria-pressed, aria-describedby, @click) go to the button.
defineOptions({ inheritAttrs: false });
const props = defineProps<{ icon: string; label: string }>();
const compact = inject(TOOLS_COMPACT, ref(false));
const attrs = useAttrs();
const name = computed(() => (attrs['aria-label'] as string | undefined) ?? props.label);
</script>

<template>
  <UTooltip :text="name" :disabled="!compact" :delay-duration="400">
    <button type="button" v-bind="attrs" :aria-label="name" class="tool-button" data-tool-icon>
      <UIcon :name="props.icon" class="tool-icon" aria-hidden="true" /><span class="tool-label">{{
        props.label
      }}</span><slot />
    </button>
  </UTooltip>
</template>

<style scoped>
.tool-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.tool-icon {
  flex: none;
  width: 14px;
  height: 14px;
}
</style>
