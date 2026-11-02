<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { writeClipboard } from '~/utils/clipboard';

// A block of text to copy on a help page, such as a configuration to paste into another app: the
// text, which reads and selects without JavaScript (the pages are prerendered), and a Copy button,
// which appears once the page's script runs, since it can't work without it. What it did is said
// in a status line beside it, which a screen reader reads.
const props = defineProps<{
  /** The text, exactly as it is copied. */
  text: string;
  /** What it is, for the block's name and the button's ("Claude Desktop's configuration"). */
  label: string;
}>();

const ready = ref(false);
const said = ref('');
onMounted(() => {
  ready.value = true;
});

async function copy() {
  const ok = await writeClipboard(props.text);
  said.value = ok ? 'Copied.' : 'Couldn’t copy. Select the text and copy it.';
}
</script>

<template>
  <div class="docs-copy">
    <!-- Wider than a phone, it scrolls sideways, so a keyboard can reach it too. -->
    <pre role="group" tabindex="0" :aria-label="props.label"><code>{{ props.text }}</code></pre>
    <div v-if="ready" class="docs-copy-bar">
      <DButton :aria-label="`Copy ${props.label}`" @click="copy">Copy</DButton>
      <span role="status" class="docs-copy-said">{{ said }}</span>
    </div>
  </div>
</template>

<style scoped>
.docs-copy {
  margin: 0 0 16px;
}
pre {
  margin: 0;
  padding: 10px 12px;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--raised);
  font: 13px/1.5 var(--font-mono, monospace);
}
pre:focus-visible {
  outline: 2px solid var(--accent-text);
  outline-offset: 2px;
}
.docs-copy-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
}
.docs-copy-said {
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
