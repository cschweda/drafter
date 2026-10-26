<script setup lang="ts">
import { useScript } from '~/storage/script';

const { warning, dismissWarning } = useScript();
</script>

<template>
  <div v-if="warning" role="status" class="warning" :data-warning="warning">
    <p v-if="warning === 'unavailable'">
      Drafter can’t keep a recovery copy in this browser right now. Your changes exist only in
      memory until you save the script to a file.
    </p>
    <p v-else>
      This browser may clear your recovery copy. Save the script to a file to keep it safe, or
      install Drafter as an app.
    </p>
    <button v-if="warning === 'not-persistent'" type="button" class="dismiss" @click="dismissWarning">
      Dismiss
    </button>
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
