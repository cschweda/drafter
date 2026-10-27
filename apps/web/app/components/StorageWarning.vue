<script setup lang="ts">
import { installAdviceHere } from '~/storage/install-advice';
import { useScript } from '~/storage/script';

const { warning, dismissWarning } = useScript();
// What to say about installing depends on the browser (by feature, see install-advice.ts). Read
// only when the warning shows, which is in the browser: the site is generated without a window.
const advice = computed(() => (import.meta.client ? installAdviceHere() : ''));
</script>

<template>
  <div>
    <!--
      Both live regions stay in the page and only their contents change, so a screen reader hears
      what is put in them. Two regions, not one whose role changes: a region that turns into an
      alert is not announced. "Unavailable" matters most, so it goes in the alert.
    -->
    <div role="status" data-warning-region="status">
      <div v-if="warning === 'not-persistent'" class="warning" data-warning="not-persistent">
        <p>{{ advice }}</p>
        <button type="button" class="dismiss" @click="dismissWarning">Dismiss</button>
      </div>
    </div>
    <div role="alert" data-warning-region="alert">
      <div v-if="warning === 'unavailable'" class="warning" data-warning="unavailable">
        <p>
          Drafter can’t keep a recovery copy in this browser right now. Your changes exist only in
          memory until you save the script to a file.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.warning {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  padding: 6px 14px;
  background: var(--chrome-2);
  border-bottom: 1px solid var(--line);
  border-left: 3px solid var(--heading);
  color: var(--text);
  font-size: 13px;
}
p {
  flex: 1 1 24rem;
  margin: 0;
}
.dismiss {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.dismiss:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
</style>
