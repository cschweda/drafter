<script setup lang="ts">
import { useBeside } from '~/beside/use-beside';

// Where the Drafts and Cuts lists' drafts and cuts are kept, never silent (drafts-and-cuts design
// §4.1): "Saved beside Boca.fountain." or "In this browser only.", with Keep next to Boca.fountain…
// where the folder can be asked for (Chromium), and Export drafts and cuts in every browser.

const beside = useBeside();
const { where, line, canAsk, file } = beside;
</script>

<template>
  <div class="beside-line">
    <p class="where" :class="{ only: where === 'browser' }">{{ line }}</p>
    <div class="beside-buttons">
      <DButton v-if="canAsk" variant="borderless" class="beside-act" @click="beside.showOffer()">
        <UIcon name="i-lucide-folder-open" aria-hidden="true" />Keep next to {{ file }}…
      </DButton>
      <DButton variant="borderless" class="beside-act" @click="beside.exportZip()">
        <UIcon name="i-lucide-download" aria-hidden="true" />Export drafts and cuts
      </DButton>
    </div>
  </div>
</template>

<style scoped>
.beside-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
}
.where {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.beside-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.beside-act {
  min-height: 24px;
  font-size: 12px;
}
</style>
